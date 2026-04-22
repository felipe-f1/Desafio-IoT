# Roteiro para o Vídeo de Demonstração

Este roteiro foi pensado para um vídeo curto, objetivo e fácil de avaliar.

## 1. Apresentar a proposta

Mostre rapidamente a estrutura do projeto:

```bash
dir
```

Destaque:

- `edge/`: sensor virtual.
- `backend/`: API FastAPI.
- `frontend/`: dashboard.
- `docker-compose.yml`: orquestração completa.

## 2. Subir a stack

Com o Docker Desktop aberto:

```bash
docker compose up -d --build
```

Depois:

```bash
docker compose ps
```

Mostre os serviços `db`, `broker`, `backend`, `frontend`, `proxy` e `edge` ativos.

## 3. Mostrar logs do sensor

```bash
docker compose logs -f edge
```

Mostre:

- Sensor conectado ao broker MQTT.
- Configuração aplicada.
- Outliers simulados.
- Queda de conexão simulada, se aparecer durante a gravação.

## 4. Abrir o dashboard

Acesse:

```text
http://localhost:8080
```

Mostre:

- Potência ativa.
- Tensão.
- Corrente.
- Custo estimado.
- Gráfico de linha atualizando em tempo real.

## 5. Demonstrar API e JWT

Acesse:

```text
http://localhost:8080/docs
```

No Swagger:

1. Chame `POST /api/auth/token`.
2. Use `admin` e `admin`.
3. Autorize com o token retornado.
4. Chame `GET /api/consumption`.
5. Chame `POST /api/sensor/config`.

Payload sugerido:

```json
{
  "interval_ms": 500,
  "moving_average_window": 5
}
```

## 6. Confirmar persistência no banco

```bash
docker compose exec db psql -U postgres -d iot_dashboard -c "SELECT count(*) AS total_readings, max(time) AS latest_reading FROM sensor_data;"
```

Mostre que as leituras foram salvas.

## 7. Encerrar

Comente que o projeto entrega:

- Edge com ruído, queda e média móvel.
- Backend escalável com FastAPI e TimescaleDB.
- Endpoint de consumo kWh.
- JWT em rota protegida.
- Dashboard com throttling.
- Infra completa com Docker Compose e Nginx.
