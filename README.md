# Agente RIG — Centro de comando RIT

Aplicação web (Express + front-end estático) para monitoramento em mapa, importação de bases em Excel, consulta normativa com IA (Groq) e planejamento de rotas.

## Requisitos

- [Node.js](https://nodejs.org/) **18 ou superior**
- Chave da API [Groq](https://console.groq.com/) para o chat normativo

## Configuração

1. Na raiz do repositório:

   ```bash
   npm install
   ```

2. Copie `.env.example` para `.env` e preencha `GROQ_API_KEY`.

3. Inicie o servidor:

   ```bash
   npm start
   ```

4. Abra `http://localhost:3000` (ou a porta definida em `PORT`).

### Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `GROQ_API_KEY` | Chave Groq (consultor de normas). |
| `PORT` | Porta HTTP (predefinido: 3000). |
| `ALLOWED_ORIGINS` | Origens CORS permitidas, separadas por vírgula. Se omitida, o CORS fica permissivo (adequado só a desenvolvimento). |

O script Python opcional `import folium.py` também usa `GROQ_API_KEY` no ambiente — **não coloque chaves em ficheiros versionados**.

## Estrutura

- `server/` — API Express (`/api/chat`, `/api/normas`, `/api/geocode`, ficheiros estáticos a partir de `public/`).
- `public/` — Interface (módulos em `public/js/`).
- `server/data/contratos.json` — Trechos de contrato usados como contexto do chat.
- `public/assets/normas_transporte.json` — Base de normas (resumo na API; texto completo no prompt no servidor).

## Segurança

- Se uma chave API tiver sido exposta em commits antigos, **revogue-a** no painel do fornecedor e crie outra.
- Em produção, defina `ALLOWED_ORIGINS` e sirva a aplicação atrás de HTTPS.

## Notas

- Geocodificação no servidor usa cache em `server/cache.json` (ignorado pelo Git) e a API pública Nominatim; respeite a [política de uso](https://operations.osmfoundation.org/policies/nominatim/).
- O planejador no browser usa OSRM público para demonstração; não use como única fonte para decisões operacionais críticas.

## Licença

Uso interno / conforme política da sua organização.
