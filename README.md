# ⚡ Desafio IoT: Monitoramento de Energia em Tempo Real

Este projeto é uma solução completa para captar, processar e exibir dados em tempo real vindos de dispositivos IoT. A arquitetura end-to-end utiliza processamento hiperveloz assíncrono simulando um ambiente verdadeiramente industrial, onde perdas de conexão, ruídos de sensores e milhares de acessos devem ser prevenidos com maestria matemática e digital.

## 🏗️ Arquitetura de Ponta-a-Ponta

- **Micro-Node Edge (Sensor via Python):** Uma réplica de hardware programado em Python puro. Ao invés de inundar servidores com ruídos falsos e lixo digital, ele usa internamente um **Deque de Média Móvel**. Quando simulamos motores dando picos surtos irreais ou conexão falhando (`asyncio`), ele isola e filtra a leitura antes de enviar na via-expressa do WebSockets.
- **Backend Concorrente (FastAPI):** Uma porta giratória para WebSockets. Um gerenciador de eventos aceita os dados filtrados pela esquerda (Ingest) e, em frações de centésimos, pratica *Broadcast* massivo para a direita todos os UI logados.
- **Banco de Dados Temporal (TimescaleDB / Postgres):** Nada de persistência relacional inútil. Criamos um ecossistema colunar no Postgres ativado pelo `create_hypertable` próprio e enraizado matematicamente por Queries de _Integral de Riemann_ com recurso a Window Functions de Alta performance (`LAG`). Dessa forma, a nossa fatura em Dinheiro é perfeitamente elástica para cobrir segundos perdidos em desconexões físicas dos sensores.
- **O Motor de Vizualização (Next.js & Recharts):** Tudo operando sob a carapuça do SSG via proxy. Criamos uma restrição estrita via `lodash.throttle` que acumula os eventos do milissegundos internamente, preservando toda a CPU dos aparelhos e traçando relatórios apenas aos 60 fps da placa de vídeo.
- **Cofre (Nginx):** Roteador primário central. 

## 🚀 Como Executar Localmente

### 1. Pré-Requisitos
- Ter o **Docker** e o **Docker Compose** instalados na sua máquina.

### 2. Iniciar Ecossistema
Navegue até a pasta raiz e rode o build multi-fases nativo:
```bash
docker compose up --build -d
```

### 3. Acessar
- **Aplicação e Gráficos:** Acesse visulamente na interface em `http://localhost:8080/`
- Toda requisição passará pelo gateway central para o microsserviço devido!

## Funcionalidades Dinâmicas

- *Área Real-Time:* Veja o traçado subir com animação CSS Premium e Gradiente.
- *Fatura Comercial Dinâmica:* Picos calculamos o fuso em Zonas de Taxa Bandeira `Ponta/Normal`, subindo centavos reais no visor a cada mili-consumo da planta!

_Projeto desenvolvido com muito rigor técnico de arquitetura Escalável._
