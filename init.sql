CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS sensor_data (
    time        TIMESTAMPTZ       NOT NULL,
    voltage     DOUBLE PRECISION  NOT NULL,
    current     DOUBLE PRECISION  NOT NULL,
    power       DOUBLE PRECISION  NOT NULL
);

-- Create hypertable partitioned by time
SELECT create_hypertable('sensor_data', by_range('time'));

-- Create explicit index on time descending
CREATE INDEX IF NOT EXISTS idx_sensor_data_time ON sensor_data (time DESC);

-- Optional: Create Continuous Aggregate for 1-minute summaries for fast querying later if needed
-- CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_data_1m 
-- WITH (timescaledb.continuous) AS
-- SELECT time_bucket('1 minute', time) AS bucket,
--        avg(voltage) as avg_voltage,
--        avg(current) as avg_current,
--        avg(power) as avg_power,
--        sum(power * (1.0/3600.0) * (0.5)) as consumption_kwh -- assuming 500ms intervals? No, sum delta.
-- FROM sensor_data
-- GROUP BY bucket;
