import asyncio
import contextlib
import json
import os
import random
import time
from collections import deque
from dataclasses import dataclass

import aiomqtt

if os.name == "nt":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

MQTT_BROKER_URL = os.getenv("MQTT_BROKER_URL", "localhost")
MQTT_SENSOR_TOPIC = os.getenv("MQTT_SENSOR_TOPIC", "iot/sensor/data")
MQTT_CONFIG_TOPIC = os.getenv("MQTT_CONFIG_TOPIC", "iot/sensor/config")


@dataclass
class SensorConfig:
    interval_ms: int = 500
    moving_average_window: int = 5


class VirtualPowerSensor:
    def __init__(self) -> None:
        self.config = SensorConfig()
        self.voltage_buffer: deque[float] = deque(maxlen=self.config.moving_average_window)
        self.current_buffer: deque[float] = deque(maxlen=self.config.moving_average_window)
        self.sequence = 0

    def apply_config(self, payload: dict[str, int]) -> None:
        interval_ms = int(payload.get("interval_ms", self.config.interval_ms))
        window = int(payload.get("moving_average_window", self.config.moving_average_window))

        self.config.interval_ms = min(max(interval_ms, 100), 5000)
        window = min(max(window, 1), 30)

        if window != self.config.moving_average_window:
            self.config.moving_average_window = window
            self.voltage_buffer = deque(self.voltage_buffer, maxlen=window)
            self.current_buffer = deque(self.current_buffer, maxlen=window)

        print(
            "Config applied: "
            f"interval_ms={self.config.interval_ms}, "
            f"moving_average_window={self.config.moving_average_window}"
        )

    def next_sample(self) -> dict[str, float | int]:
        self.sequence += 1

        voltage = random.uniform(216.0, 224.0)
        current = random.uniform(8.0, 12.0)
        power_factor = random.uniform(0.92, 0.99)

        if self.sequence % 80 == 0:
            voltage *= random.choice([0.35, 1.9])
            current *= random.choice([0.45, 1.8])
            print("Injected outlier noise")

        self.voltage_buffer.append(voltage)
        self.current_buffer.append(current)

        avg_voltage = sum(self.voltage_buffer) / len(self.voltage_buffer)
        avg_current = sum(self.current_buffer) / len(self.current_buffer)
        active_power = avg_voltage * avg_current * power_factor

        return {
            "timestamp": int(time.time() * 1000),
            "voltage": round(avg_voltage, 2),
            "current": round(avg_current, 2),
            "power": round(active_power, 2),
        }

    def should_drop_connection(self) -> bool:
        return self.sequence > 0 and self.sequence % 240 == 0


async def config_listener(client: aiomqtt.Client, sensor: VirtualPowerSensor) -> None:
    async for message in client.messages:
        if str(message.topic) != MQTT_CONFIG_TOPIC:
            continue

        try:
            payload = json.loads(message.payload.decode())
            sensor.apply_config(payload)
        except Exception as exc:
            print(f"Invalid config ignored: {exc}")


async def sensor_loop() -> None:
    sensor = VirtualPowerSensor()
    print(f"Virtual sensor connecting to MQTT broker at {MQTT_BROKER_URL}")

    while True:
        try:
            async with aiomqtt.Client(MQTT_BROKER_URL) as client:
                await client.subscribe(MQTT_CONFIG_TOPIC)
                listener_task = asyncio.create_task(config_listener(client, sensor))
                print("Connected to MQTT broker")

                try:
                    while True:
                        payload = sensor.next_sample()
                        await client.publish(
                            MQTT_SENSOR_TOPIC,
                            payload=json.dumps(payload),
                            qos=1,
                        )

                        if sensor.should_drop_connection():
                            print("Simulating connection drop")
                            break

                        await asyncio.sleep(sensor.config.interval_ms / 1000)
                finally:
                    listener_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await listener_task

        except aiomqtt.MqttError:
            print("MQTT connection error; retrying in 2 seconds")
            await asyncio.sleep(2)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"Sensor error: {exc}; retrying in 2 seconds")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(sensor_loop())
