import os
import asyncpg
import logging

logger = logging.getLogger("api")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:rootpassword@localhost:5432/iot_dashboard")

pool = None

async def init_db():
    global pool
    try:
        pool = await asyncpg.create_pool(DATABASE_URL)
        logger.info("Connected to TimescaleDB!")
    except Exception as e:
        logger.error(f"Error connecting to database: {e}")
        raise e

async def close_db():
    global pool
    if pool:
        await pool.close()
        logger.info("Database connection closed.")

async def insert_sensor_data(voltage: float, current: float, power: float):
    global pool
    if pool is None:
        return
    query = """
        INSERT INTO sensor_data (time, voltage, current, power)
        VALUES (now(), $1, $2, $3)
    """
    async with pool.acquire() as connection:
        await connection.execute(query, voltage, current, power)

async def get_consumption():
    global pool
    if pool is None:
        return []
    # Simplified calculation since data comes in 500ms intervals = 0.5 sec
    # Power (W) to Energy (kWh) in 0.5s: Energy_kWh = Power_W * (0.5 / 3600) / 1000
    # For cost estimation based on time: 18h-21h is Ponta, else Normal.
    # Usamos o método físico de Integral (soma de Riemann) utilizando LAG para encontrar a exata diferença de segundos entre os pacotes do sensor (cobertura dos drops).
    # LEAST(duration, 60) garante que se o sensor ficar off por dias não exploda o cálculo.
    query = """
        WITH deltas AS (
            SELECT 
                time,
                power,
                COALESCE(EXTRACT(EPOCH FROM (time - LAG(time) OVER (ORDER BY time))), 0.5) as duration_sec
            FROM sensor_data
        )
        SELECT 
            CASE WHEN EXTRACT(HOUR FROM time AT TIME ZONE 'America/Sao_Paulo') >= 18 AND EXTRACT(HOUR FROM time AT TIME ZONE 'America/Sao_Paulo') < 21 THEN 'Ponta' ELSE 'Normal' END as tariff_type,
            SUM(power * LEAST(duration_sec, 60) / 3600.0 / 1000.0) as consumption_kwh
        FROM deltas
        GROUP BY tariff_type
    """
    async with pool.acquire() as connection:
        records = await connection.fetch(query)
        return [dict(record) for record in records]
