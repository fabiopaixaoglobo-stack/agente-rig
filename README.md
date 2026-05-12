# RIT — Rota Inteligente de Transportes
**Centro de Comando e Monitoramento · Agente RIG**

Sistema operacional de logística urbana para gestão de frota, planejamento de rotas, monitoramento de trânsito em tempo real e consulta a normas de transporte.

---

## Arquitetura

```
Agente RIG/
├── public/               # Frontend estático servido pelo Express
│   ├── index.html        # SPA principal (7 abas)
│   ├── style.css         # Design system (dark mode, clamp(), glassmorphism)
│   ├── js/
│   │   ├── main.js           # Entry point — inicializa todos os módulos
│   │   ├── map-service.js    # Wrapper Leaflet (main, planner, transito)
│   │   ├── ui-controller.js  # Lógica de UI, roteamento, Waze, geocodificação
│   │   ├── chat-service.js   # Chat IA (Groq) — Consultor Normativo
│   │   ├── data-service.js   # Importação XLSX e geocodificação de atendimentos
│   │   ├── MonitoramentoGrupos.js  # Abre WhatsApp Web em nova aba
│   │   ├── config.js         # Constantes (center, zoom, endpoints)
│   │   └── utils.js          # showToast, escapeHtml
│   └── assets/           # Imagens, JSONs de normas e contratos
├── server/
│   ├── server.js         # Express — serve /public e proxy para Groq API
│   ├── geocode.js        # Geocodificação via Nominatim
│   └── data/             # JSONs de contratos e normas
├── package.json
└── .env.example
```

## Abas e funcionalidades

| Aba | Conteúdo | Mapa |
|-----|----------|------|
| **Monitoramento** | KPIs, fila de atendimentos, filtros | Leaflet + OpenStreetMap |
| **Planejador** | Origem/destino → rota OSRM → Google Maps / 🚗 Waze | Leaflet + OSRM |
| **Trânsito Real** | Rota geocodificada em tempo real, distância, tempo | Leaflet + OSRM |
| **Rede Credenciada** | Mapa Ticket Log (iframe externo) | GoodCard/TicketLog |
| **Eventos** | Mapas My Maps por evento | Google My Maps embed |
| **Consultor Normativo** | Chat IA com contexto de normas e contratos | — |
| **Monitoramento de Grupos** | Botão que abre WhatsApp Web em nova aba | — |

## Dependências

### Backend (Node.js ≥ 18)
```json
"cors": "^2.8.5",
"dotenv": "^16.4.5",
"express": "^4.18.2",
"express-rate-limit": "^7.4.1",
"groq-sdk": "^0.3.3",
"node-fetch": "^2.6.7"
```

### Frontend (CDN — sem build step)
- **Leaflet 1.9.4** — mapas interativos (OpenStreetMap)
- **XLSX 0.18.5** — importação de planilhas Excel
- **Nominatim** (OSM) — geocodificação gratuita
- **OSRM** — roteamento de código aberto

> Nenhum pacote npm frontend é necessário. Tudo via CDN em `index.html`.

## Instalação e execução

```bash
# 1. Clonar
git clone <repo-url>
cd "Agente RIG"

# 2. Instalar dependências do backend
npm install

# 3. Configurar variáveis de ambiente
cp .env.example server/.env
# Edite server/.env e preencha GROQ_API_KEY

# 4. Iniciar servidor local
npm start
# Acesse http://localhost:3000
```

## Branch de desenvolvimento

```bash
# Trabalhar na branch de correções de UI
git checkout fix/maps-and-ui
npm start
```

---

## Checklist de testes (branch fix/maps-and-ui)

### Abas com mapa
- [ ] **Monitoramento**: mapa Leaflet carrega centralizado no RJ; sem WhatsApp
- [ ] **Planejador**: inserir origem + destino → rota traçada; botão 🚗 Waze abre `waze.com/ul?q=...`
- [ ] **Trânsito Real**: "MAPA LIVE" geocodifica e traça rota; "ABRIR NO WAZE" abre com coordenadas exatas; sem iframe do Waze embed
- [ ] **Rede Credenciada**: iframe TicketLog carrega; sem mensagem de WhatsApp
- [ ] **Eventos**: clicar em evento carrega My Maps; botão "Abrir no Google Maps" funciona

### Monitoramento de Grupos
- [ ] Exibe texto: *"Para monitoramento e controle de mensagens nos Grupos de Transporte, clique no link abaixo."*
- [ ] Botão "ABRIR WHATSAPP WEB" abre `https://web.whatsapp.com/` em nova aba
- [ ] **Nenhum iframe** apontando para `web.whatsapp.com` no DOM

### Tipografia
- [ ] Textos menores e legíveis em 1366×768
- [ ] Textos escalados adequadamente em 1920×1080
- [ ] Fontes do Consultor Normativo e Rede Credenciada legíveis e proporcionais

### Segurança
- [ ] `document.querySelectorAll('iframe[src*="web.whatsapp.com"]').length === 0` no console

### Cross-browser
- [ ] Chrome / Edge
- [ ] Firefox

---

## Deploy (Render)

```bash
# Build command
npm install

# Start command
node server/server.js

# Environment variables
GROQ_API_KEY=<sua-chave>
PORT=10000
```

---

## Decisões técnicas

| Decisão | Motivo |
|---------|--------|
| **Leaflet + OpenStreetMap** | Gratuito, sem chave de API, tiles rápidos |
| **OSRM** | Roteamento open-source, sem custos |
| **Nominatim** | Geocodificação gratuita (OSM) |
| **WhatsApp via nova aba** | `web.whatsapp.com` bloqueia X-Frame-Options — iframe impossível |
| **Sem build step** | Frontend vanilla JS ES modules + CDN = deploy direto |
