import asyncio
import json
import logging
import os
from typing import Any

import aiomqtt
import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field

from database import (
    close_db,
    get_consumption,
    get_recent_readings,
    init_db,
    insert_sensor_data,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("iot-dashboard")

SECRET_KEY = os.getenv("SECRET_KEY", "minha_chave_super_secreta_jwt")
ALGORITHM = "HS256"
MQTT_BROKER_URL = os.getenv("MQTT_BROKER_URL", "localhost")
MQTT_SENSOR_TOPIC = os.getenv("MQTT_SENSOR_TOPIC", "iot/sensor/data")
MQTT_CONFIG_TOPIC = os.getenv("MQTT_CONFIG_TOPIC", "iot/sensor/config")

app = FastAPI(
    title="IoT Energy Dashboard API",
    description="Backend FastAPI para ingestao IoT, WebSocket em tempo real e calculo de consumo acumulado.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
mqtt_task: asyncio.Task[None] | None = None
sensor_config = {"interval_ms": 500, "moving_average_window": 5}


def dump_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


class SensorData(BaseModel):
    timestamp: int | None = None
    voltage: float = Field(gt=0)
    current: float = Field(ge=0)
    power: float = Field(ge=0)


class ConfigUpdate(BaseModel):
    interval_ms: int = Field(ge=100, le=5000)
    moving_average_window: int = Field(default=5, ge=1, le=30)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        stale_connections: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                stale_connections.append(connection)

        for connection in stale_connections:
            self.disconnect(connection)


manager = ConnectionManager()


async def publish_sensor_config(config: dict[str, int]) -> None:
    try:
        async with aiomqtt.Client(MQTT_BROKER_URL) as client:
            await client.publish(MQTT_CONFIG_TOPIC, payload=json.dumps(config), qos=1, retain=True)
    except aiomqtt.MqttError as exc:
        logger.warning("Could not publish sensor config to MQTT: %s", exc)


async def mqtt_listener_task() -> None:
    logger.info("Connecting to MQTT broker at %s", MQTT_BROKER_URL)
    while True:
        try:
            async with aiomqtt.Client(MQTT_BROKER_URL) as client:
                await client.subscribe(MQTT_SENSOR_TOPIC)
                logger.info("Subscribed to %s", MQTT_SENSOR_TOPIC)

                async for message in client.messages:
                    try:
                        payload = json.loads(message.payload.decode())
                        sample = SensorData(**payload)
                        normalized_sample = dump_model(sample)

                        await insert_sensor_data(
                            voltage=sample.voltage,
                            current=sample.current,
                            power=sample.power,
                            timestamp_ms=sample.timestamp,
                        )
                        await manager.broadcast(normalized_sample)
                    except Exception as exc:
                        logger.warning("Invalid MQTT sensor message ignored: %s", exc)
        except aiomqtt.MqttError as exc:
            logger.warning("MQTT broker unavailable (%s); retrying in 5 seconds", exc)
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Unexpected MQTT listener error: %s", exc)
            await asyncio.sleep(5)


@app.on_event("startup")
async def startup_event() -> None:
    await init_db()
    global mqtt_task
    mqtt_task = asyncio.create_task(mqtt_listener_task())
    await publish_sensor_config(sensor_config)


@app.on_event("shutdown")
async def shutdown_event() -> None:
    if mqtt_task is not None:
        mqtt_task.cancel()
    await close_db()


@app.get("/health", tags=["System"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/token", tags=["Authentication"], summary="Autenticar e obter token JWT")
async def login(form_data: OAuth2PasswordRequestForm = Depends()) -> dict[str, str]:
    if form_data.username == "admin" and form_data.password == "admin":
        token = jwt.encode({"sub": form_data.username}, SECRET_KEY, algorithm=ALGORITHM)
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=400, detail="Incorrect username or password")


def verify_token(token: str = Depends(oauth2_scheme)) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return dict(payload)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc


@app.post("/api/sensor/config", tags=["Configuration"], summary="Atualizar configuracao do sensor")
async def update_sensor_config(
    config: ConfigUpdate,
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    sensor_config.update(dump_model(config))
    await publish_sensor_config(sensor_config)
    return {
        "message": "Configuracao atualizada com sucesso",
        "config": sensor_config,
        "updated_by": user.get("sub"),
    }


@app.get("/api/consumption", tags=["Analytics"], summary="Calcular consumo acumulado em kWh")
async def get_total_consumption(
    since_minutes: int | None = Query(default=None, ge=1, le=1440),
    user: dict[str, Any] = Depends(verify_token),
) -> dict[str, Any]:
    return await get_consumption(since_minutes=since_minutes)


@app.get("/api/readings", tags=["Analytics"], summary="Listar leituras recentes")
async def list_recent_readings(limit: int = 240) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 1000))
    return {"data": await get_recent_readings(safe_limit)}


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
