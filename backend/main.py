import asyncio
from datetime import timedelta
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import jwt

from database import init_db, close_db, insert_sensor_data, get_consumption

SECRET_KEY = "minha_chave_super_secreta_jwt"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

app = FastAPI(title="IoT Dashboard Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")

class ConfigUpdate(BaseModel):
    interval_ms: int

class SensorData(BaseModel):
    voltage: float
    current: float
    power: float

@app.on_event("startup")
async def startup_event():
    await init_db()

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()

# --- Auth ---
@app.post("/api/auth/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if form_data.username == "admin" and form_data.password == "admin":
        token = jwt.encode({"sub": form_data.username}, SECRET_KEY, algorithm=ALGORITHM)
        return {"access_token": token, "token_type": "bearer"}
    raise HTTPException(status_code=400, detail="Incorrect username or password")

def verify_token(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# --- Protected Config Route ---
@app.post("/api/sensor/config")
async def update_sensor_config(config: ConfigUpdate, user: dict = Depends(verify_token)):
    # Em um cenário real, isso enviaria um comando MQTT para o Edge
    return {"message": "Configuração atualizada com sucesso", "config": config.dict()}

# --- Consumption Route ---
@app.get("/api/consumption")
async def get_total_consumption():
    data = await get_consumption()
    return {"data": data}

# --- WebSockets ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.websocket("/ws/ingest")
async def websocket_ingest(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            # Retransmite para os frontends conectados
            await manager.broadcast(data)
            # Salva no banco de forma assíncrona
            asyncio.create_task(insert_sensor_data(data.get("voltage"), data.get("current"), data.get("power")))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Error WS server: {e}")

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mantém a conexão viva
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
