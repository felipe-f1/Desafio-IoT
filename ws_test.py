import asyncio
import websockets

async def test():
    async with websockets.connect('ws://localhost:8080/ws/stream') as ws:
        for _ in range(3):
            msg = await ws.recv()
            print("Received:", msg)

asyncio.run(test())
