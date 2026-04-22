import logging
import os
from typing import Any

import asyncpg

logger = logging.getLogger("iot-dashboard")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:rootpassword@localhost:5432/iot_dashboard",
)

pool: asyncpg.Pool | None = None


async def init_db() -> None:
    global pool
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    logger.info("Connected to PostgreSQL/TimescaleDB")


async def close_db() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
        logger.info("Database connection closed")


async def insert_sensor_data(
    voltage: float,
    current: float,
    power: float,
    timestamp_ms: int | None = None,
) -> None:
    if pool is None:
        logger.warning("Database pool is not initialized; dropping sensor sample")
        return

    query = """
        INSERT INTO sensor_data (time, voltage, current, power)
        VALUES (
            COALESCE(to_timestamp($1::double precision / 1000.0), now()),
            $2,
            $3,
            $4
        )
    """
    async with pool.acquire() as connection:
        await connection.execute(query, timestamp_ms, voltage, current, power)


async def get_recent_readings(limit: int = 240) -> list[dict[str, Any]]:
    if pool is None:
        return []

    query = """
        SELECT
            (EXTRACT(EPOCH FROM time) * 1000)::bigint AS timestamp,
            voltage,
            current,
            power
        FROM sensor_data
        ORDER BY time DESC
        LIMIT $1
    """
    async with pool.acquire() as connection:
        records = await connection.fetch(query, limit)
        return [dict(record) for record in reversed(records)]


async def get_consumption() -> dict[str, Any]:
    if pool is None:
        return {"data": [], "total_kwh": 0.0, "estimated_cost_brl": 0.0}

    query = """
        WITH ordered AS (
            SELECT
                time,
                power,
                LAG(time) OVER (ORDER BY time) AS previous_time
            FROM sensor_data
        ),
        energy AS (
            SELECT
                CASE
                    WHEN EXTRACT(HOUR FROM time AT TIME ZONE 'America/Sao_Paulo') >= 18
                     AND EXTRACT(HOUR FROM time AT TIME ZONE 'America/Sao_Paulo') < 21
                    THEN 'Ponta'
                    ELSE 'Normal'
                END AS tariff_type,
                CASE
                    WHEN EXTRACT(HOUR FROM time AT TIME ZONE 'America/Sao_Paulo') >= 18
                     AND EXTRACT(HOUR FROM time AT TIME ZONE 'America/Sao_Paulo') < 21
                    THEN 0.90
                    ELSE 0.50
                END AS rate_brl_per_kwh,
                power
                    * GREATEST(
                        0,
                        LEAST(
                            COALESCE(EXTRACT(EPOCH FROM (time - previous_time)), 0),
                            60
                        )
                    )
                    / 3600.0
                    / 1000.0 AS consumption_kwh
            FROM ordered
        )
        SELECT
            tariff_type,
            rate_brl_per_kwh,
            COALESCE(SUM(consumption_kwh), 0)::double precision AS consumption_kwh,
            COALESCE(SUM(consumption_kwh * rate_brl_per_kwh), 0)::double precision AS estimated_cost_brl
        FROM energy
        GROUP BY tariff_type, rate_brl_per_kwh
        ORDER BY tariff_type
    """
    async with pool.acquire() as connection:
        records = await connection.fetch(query)

    data = [dict(record) for record in records]
    total_kwh = sum(float(record["consumption_kwh"]) for record in data)
    estimated_cost = sum(float(record["estimated_cost_brl"]) for record in data)

    return {
        "data": data,
        "total_kwh": total_kwh,
        "estimated_cost_brl": estimated_cost,
    }
