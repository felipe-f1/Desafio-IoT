# IoT Energy Dashboard Challenge

Protótipo funcional para capturar dados de um sensor virtual de borda, processar as leituras em um backend escalável e exibir indicadores em um dashboard Next.js.

## O que está incluído

- Edge em Python publicando leituras a cada 500 ms via MQTT.
- Filtro de média móvel no sensor antes do envio.
- Simulação de outliers e quedas de conexão no sensor.
- Backend FastAPI dockerizado.
- Ingestão em PostgreSQL com TimescaleDB.
- Tabela temporal com índice por timestamp.
- Endpoint protegido por JWT para configuração do sensor.
- Endpoint de consumo acumulado em kWh calculado por integração das leituras de potência.
- Frontend React/Next.js com gráfico de linha em tempo real e throttling.
- Cálculo de custo estimado com tarifa normal e horário de ponta.
- Proxy reverso Nginx roteando frontend, API, docs e WebSocket.

## Arquitetura

```text
edge/sensor.py -> MQTT broker -> backend FastAPI -> TimescaleDB
                                      |
                                      +-> WebSocket -> frontend Next.js

Nginx proxy:
  /        -> frontend
  /api/*   -> backend
  /ws/*    -> backend WebSocket
  /docs    -> Swagger UI
```

## Como executar

Pré-requisito: Docker Desktop com Docker Compose.

Na raiz do projeto:

```bash
docker compose up -d --build
```

Acompanhe os logs:

```bash
docker compose logs -f backend edge frontend proxy
```

URLs:

- Dashboard: [http://localhost:8080](http://localhost:8080)
- Swagger/FastAPI: [http://localhost:8080/docs](http://localhost:8080/docs)
- Health check: [http://localhost:8080/health](http://localhost:8080/health)

Credenciais de demonstração:

- Usuário: `admin`
- Senha: `admin`

## Endpoints principais

- `POST /api/auth/token`: gera token JWT.
- `POST /api/sensor/config`: rota protegida por JWT para alterar `interval_ms` e `moving_average_window` do sensor.
- `GET /api/consumption`: rota protegida por JWT que retorna consumo acumulado em kWh e custo estimado.
- `GET /api/readings`: retorna leituras recentes para inicializar o gráfico.
- `WS /ws/stream`: envia leituras em tempo real para o dashboard.

## Banco de dados

O arquivo `init.sql` cria:

- Extensão TimescaleDB.
- Tabela `sensor_data`.
- Hypertable particionada por `time`.
- Índice `idx_sensor_data_time_desc` para consultas rápidas por timestamp.

Para conferir registros:

```bash
docker compose exec db psql -U postgres -d iot_dashboard -c "SELECT time, voltage, current, power FROM sensor_data ORDER BY time DESC LIMIT 5;"
```

## Roteiro sugerido para o vídeo

1. Mostrar o comando `docker compose up -d --build`.
2. Mostrar `docker compose ps` com `db`, `backend`, `frontend`, `proxy`, `broker` e `edge` ativos.
3. Abrir [http://localhost:8080](http://localhost:8080) e mostrar o gráfico recebendo dados em tempo real.
4. Mostrar logs do `edge` indicando outliers e quedas de conexão simuladas.
5. Abrir [http://localhost:8080/docs](http://localhost:8080/docs), autenticar com `admin/admin` e chamar `POST /api/sensor/config`.
6. Chamar `GET /api/consumption` e mostrar o consumo acumulado em kWh e custo em reais.
7. Mostrar uma consulta no banco confirmando as leituras salvas.

## Desenvolvimento local

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest -v
```

Frontend:

```bash
cd frontend
npm install
npm run build
```
