import asyncio
import json
import random
import time
from collections import deque
import websockets
import os

WS_SERVER_URL = os.getenv("WS_SERVER_URL", "ws://localhost:8000/ws/ingest")

async def sensor_loop():
    buffer_v = deque(maxlen=5)
    buffer_i = deque(maxlen=5)
    
    print(f"Virtual Sensor started, connecting to {WS_SERVER_URL}...")
    
    while True:
        try:
            async with websockets.connect(WS_SERVER_URL) as ws:
                print("Connected to server.")
                count = 0
                while True:
                    # Generate base values
                    v = random.uniform(215.0, 225.0)
                    i = random.uniform(8.0, 12.0)
                    
                    # Outliers/Noise every ~100 iterations
                    count += 1
                    if count % 100 == 0:
                        v *= random.choice([0.1, 5.0]) # Surge or drop
                        print("Generated noise outlier!")
                        
                    # Simulate Connection Drops (Wait to trigger timeout logic in backend/frontend, although NextJS keeps WS alive)
                    # We simply sleep longer to simulate drop
                    if count % 300 == 0:
                        print("Simulating connection drop...")
                        await asyncio.sleep(5)
                    
                    # Moving Average Filter
                    buffer_v.append(v)
                    buffer_i.append(i)
                    
                    avg_v = sum(buffer_v) / len(buffer_v)
                    avg_i = sum(buffer_i) / len(buffer_i)
                    avg_p = avg_v * avg_i  # Power in W
                    
                    payload = {
                        "timestamp": int(time.time() * 1000),
                        "voltage": round(avg_v, 2),
                        "current": round(avg_i, 2),
                        "power": round(avg_p, 2)
                    }
                    
                    await ws.send(json.dumps(payload))
                    await asyncio.sleep(0.5)  # 500ms specification
                    
        except websockets.ConnectionClosed:
            print("WS Connection Closed, retrying in 2 seconds...")
            await asyncio.sleep(2)
        except Exception as e:
            print(f"Error in sensor: {e}")
            await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(sensor_loop())
