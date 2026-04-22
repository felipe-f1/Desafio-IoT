CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE TABLE IF NOT EXISTS sensor_data (
    time        TIMESTAMPTZ       NOT NULL,
    voltage     DOUBLE PRECISION  NOT NULL,
    current     DOUBLE PRECISION  NOT NULL,
    power       DOUBLE PRECISION  NOT NULL
);

SELECT create_hypertable('sensor_data', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_sensor_data_time_desc
    ON sensor_data (time DESC);
