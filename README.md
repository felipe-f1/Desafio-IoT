# ⚡ IoT Energy Dashboard Challenge

Bem-vindo ao repositório do **IoT Energy Dashboard**, uma solução arquitetônica robusta e completa para monitoramento energético em tempo real, abrangendo desde a simulação do microcontrolador (Edge) até o Frontend com gráficos dinâmicos.

## 🏗️ Arquitetura do Sistema

A arquitetura do projeto é dividida em três pilares principais, com foco absoluto em **alta performance**, **processamento assíncrono** e **resiliência** contra falhas de rede.

- **`Edge (Sensor Virtual)`**: Um script desenvolvido puramente em Python assíncrono (`asyncio`) que simula leituras elétricas. Implementa cálculos de Média Móvel numa janela (buffer) para suavizar a curva de tensão/corrente, enviando pacotes ao Backend a cada 500ms via WebSockets (nativo, sem necessidade de poling HTTP). O script também injeta `outliers` (ruídos de rede) inteligentemente e simula instabilidades fechando conexões ativas para testar a resiliência de todo o ecossistema.
- **`Backend (FastAPI)`**: Um núcleo assíncrono central escrito em Python 3 utilizando ASGI. Este componente faz a ponte central da arquitetura:
  - Ingestão massiva no PostgreSQL com `asyncpg` (driver hyper-performático) garantindo um pool de conexão saudável.
  - Servidor de autorização baseado em **JWT** (JSON Web Tokens) na rota `/auth/token`.
  - Exposição de consumo exato usando uma função baseada em Somatória de Riemann, garantindo que "buracos" e perdas de comunicação na conexão WS não inviabilizem o cálculo financeiro em kWh.
  - Documentação estendida pelo **Swagger UI** com suporte interativo a Security Schemes (OAuth2Bearer) no endpoint `/docs`.
- **`Frontend (Next.js & React)`**: Dashboard reativo desenhado de ponta a ponta com interface de alto padrão, garantindo efeitos fluidos. Uma camada rigorosa de `throttle` foi adicionada para interceptar as taxas ultra-rápidas do WebSocket, mitigando gargalos no Event Loop do browser, alimentando a biblioteca gráfica nativamente sem congelar a tela.

## 🚀 Como Executar Localmente

Você não precisa instalar dependências separadas no seu sistema. O setup inteiro é orquestrado via Docker e Docker Compose.

### Pré-Requisitos
- Ter o [Docker](https://www.docker.com/products/docker-desktop/) e o **Docker Compose** instalados na máquina.

### Executando em 1 Comando

Na raiz do projeto (onde está o arquivo `docker-compose.yml`), modifique todos os serviços usando o comando:

```bash
docker-compose up -d --build
```

O primeiro build criará a imagem Frontend Next.js e compilará as do Python, aguarde alguns instantes.
Verifique e acompanhe os logs com:

```bash
docker-compose logs -f
```

### URLs de Acesso

Assim que rodar, os seguintes serviços estarão expostos em seu `localhost`:

* **Dashboard em Tempo Real (Next.js):** [http://localhost:3000](http://localhost:3000)
  *(A interface faz o auto-login seguro com as credenciais padrão no backend via JWT e abre a conexão WebSockets)*
* **Visualização da API Swagger UI (FastAPI):** [http://localhost:8080/docs](http://localhost:8080/docs)
  *(Na interface gráfica, role até o botão superior "Authorize", insira **admin** e **admin** como credenciais e teste os endpoints protegidos, como a rota `GET /api/consumption`)*

---

## 🔥 Features de Destaque

- [x] **Média Móvel**: Sensor estabilizando leituras localmente via buffers limitados, absorvendo transientes.
- [x] **Tratamento de Queda de Conexão**: Edge intencionalmente quebra a conexão em ciclos variados simulando 3G em zonas isoladas, provocando rotinas de reconexão.
- [x] **Throttle Client-Side Control (Otimização UI)**: Eventos de repetição rápida sofrem throttle visual, economizando ciclos de processamento no browser.
- [x] **Cálculo de Tarifação Real**: Algoritmos no painel trazem estimativas por Horário de Ponta.
- [x] **Segurança Integrada**: Requisito de desafio completo com o endpoint JWT protegendo relatórios.
- [x] **Precisão Estatística**: A query em banco não assume que existe taxa constante de chegada. Ela calcula o delta absoluto de tempo gerando o `duration_sec`, que permite que o consumo seja preciso ainda que os pacotes cheguem fora de ordem ou haja delay.

*Construído e desenhado como uma arquitetura state-of-the-art.*
