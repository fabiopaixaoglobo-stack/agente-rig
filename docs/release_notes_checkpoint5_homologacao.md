# Release Notes — Agente RIT (CHECKPOINT 5: Homologação Corporativa)

**Versão:** `v1.3.0-rc.1`  
**Branch:** `refactor/migracao-identidade-rig-para-rit`  
**Data:** 28 de Setembro de 2026  
**Status de Publicação:** ✅ AUTORIZADO PARA PUBLICAÇÃO CONTROLADA EM HOMOLOGAÇÃO  
**Ambiente:** Staging Corporativo Controlado / Local (`http://127.0.0.1:3005/dashboard.html`)  
**Status de Produção:** 🚫 NÃO AUTORIZADO PARA PRODUÇÃO DEFINITIVA (Condicionado à conclusão do Checkpoint 5)

---

## 1. Visão Geral da Versão

A versão `v1.3.0-rc.1` consolida a implantação do módulo **RIT ALERTA** (Inteligência Autônoma de Trânsito) em ambiente corporativo de homologação, atendendo a todos os requisitos de segregação arquitetural, governança de dados públicos e conformidade corporativa estabelecidos nos Checkpoints 1 a 4.1.

Esta entrega disponibiliza aos operadores do Centro de Controle Operacional (CCO) a interface operacional real, congelada sob a especificação v1.0, permitindo o acompanhamento de incidentes da malha viária do Rio de Janeiro em tempo real sem qualquer exposição de dados pessoais ou operacionais restritos.

---

## 2. Escopo Funcional Habilitado (RIT ALERTA)

### 2.1 Interface do Operador (Command Center)
- **Top 5 KPIs Operacionais:**
  1. *Ocorrências Ativas* (com contador dinâmico e severidade máxima)
  2. *Corredor Mais Crítico* (identificação automática via heurística)
  3. *Tempo Médio de Retenção* (estimativa baseada em fontes oficiais)
  4. *Câmeras Próximas Ativas* (status operacional agregado)
  5. *Estágio Operacional da Cidade* (alimentado pela API oficial do COR-Rio)
- **Layout Dividido 40/60 (Desktop 1920×1080) e Empilhamento Responsivo (Notebook 1366×768):**
  - **40% Lateral:** Feed de Ocorrências com busca por texto, filtro de severidade (Crítico, Alto, Médio, Baixo) e filtro por corredor estratégico.
  - **60% Principal:** Mapa Tático CartoDB Dark Matter com marcadores interativos de incidentes (pins coloridos com pulso e raio de impacto translúcido de 500m a 2000m).
- **Drawer Lateral de Detalhamento Tático (Off-canvas):**
  - Resumo executivo da ocorrência com timestamp de ingestão e fonte originária.
  - **Grid de Câmeras Públicas:** Nomenclatura e estados padronizados (`Disponível`, `Desatualizada`, `Offline`, `Consulta na Fonte Original`), com proibição estrita de termos enganosos como "Ao Vivo".
  - **Painel de Recomendações Consultivas:** Texto padronizado (*"Alternativa para avaliação: [Corredor]"*) contendo horário de consulta, fornecedor da informação e ressalvas obrigatórias de conferência in loco e restrição para veículos pesados.
- **Tratamento de Estados Especiais:**
  - Estado Vazio (*"Nenhuma ocorrência crítica ativa no momento"*).
  - Estado de Contingência de Fontes (*"Alerta de Contingência — Provedores Indisponíveis"* com opção de consulta manual).
  - Indicador de Divergência entre Fontes (*"Divergência detectada entre COR-Rio e Concessionária"*).

---

## 3. Salvaguardas de Privacidade e Governança

| Princípio | Implementação no Release v1.3.0-rc.1 | Evidência Técnica |
| :--- | :--- | :--- |
| **Aba Monitoramento 🔒** | Estritamente bloqueada na interface e no controller. Exibe aviso de segregação corporativa. | `public/js/ui-controller.js` (método `aplicarModoPrivacidadeMonitoramento`) |
| **Zero GPS / Telemetria** | Nenhuma chamada a `navigator.geolocation`, `getCurrentPosition` ou tabelas de rastreamento de veículos. | Teste estático automatizado (`test/traffic-alert/scope-isolation.test.js` e `smoke-test-homologacao.js`) |
| **Zero Dados Pessoais** | Nenhuma referência a motoristas, passageiros, frotas privadas ou itinerários individuais. | Varredura estática de código no pipeline |
| **Proibição de Web Scraping** | Provedor COR-Rio conecta-se exclusivamente a endpoints JSON documentados (`https://appcor.cor-rio.work/estagio_cidade`). Respostas em HTML degradam para `SOURCE_STATUS = UNSUPPORTED`. | Testes 38 e 39 aprovados (`cor-rio-provider.js`) |
| **Descarte de Payload Bruto** | Payload bruto não é persistido (`storeRawPayload = false`). Apenas hash criptográfico SHA-256 é armazenado para fins de auditoria de integridade. | Testes da suite 10 (`hash-policy.test.js`) |
| **Persistência Relacional Segura** | 5 tabelas em PostgreSQL padrão sem dependência de extensões complexas (PostGIS). Cálculos de raio por fórmula canônica de Haversine. | Script de migração idempotente `001_traffic_alert_schema.sql` e reversível `001_traffic_alert_schema.down.sql` |

---

## 4. Matriz de Testes e Validação Automatizada

- **Suíte de Testes Unitários e Integração:** 63 testes aprovados (0 falhas) em 14 suítes (`npm.cmd test`).
- **Smoke Test Automatizado de Homologação:** 5 verificações críticas aprovadas (`npm.cmd run smoke:homologacao`):
  1. `[ST-01]` Health check da API (`/api/traffic-alert/health`) com declaração de `persistenceMode`.
  2. `[ST-02]` Endpoint de incidentes (`/api/traffic-alert/incidents`) com validação de array canônico DTO.
  3. `[ST-03]` Integridade de templates no `dashboard.html` (presença da aba RIT ALERTA e trava do Monitoramento).
  4. `[ST-04]` Varredura estática contra vazamento de escopo/GPS em arquivos frontend e backend.
  5. `[ST-05]` Política anti-scraping com degradação graciosa para `UNSUPPORTED` (`isSynthetic: false`).

---

## 5. Instruções de Execução em Homologação

### 5.1 Pré-requisitos
- Node.js `>= 18.0.0`
- Configuração de variáveis em `.env` (baseado no `.env.example` higienizado):
  ```bash
  PORT=3005
  NODE_ENV=staging
  PERSISTENCE_MODE=MEMORY_STORE  # ou POSTGRESQL_RELATIONAL
  STORE_RAW_PAYLOAD=false
  DEDUPLICATION_ENABLED=true
  DEDUPLICATION_SPATIAL_RADIUS_KM=0.5
  DEDUPLICATION_TIME_WINDOW_MINUTES=30
  ```

### 5.2 Inicialização
```bash
# Executar suíte de testes de integridade
npm.cmd test

# Executar smoke test automatizado
npm.cmd run smoke:homologacao

# Iniciar servidor da aplicação
npm.cmd start
```

### 5.3 Acesso à Interface
Navegar para: `http://127.0.0.1:3005/dashboard.html`  
Acessar a aba **RIT ALERTA**.

---

## 6. Procedimento de Rollback e Contingência

Em caso de qualquer anomalia identificada durante as sessões de homologação assistida com o CCO:
1. **Desativação Imediata da Aba no Frontend:**  
   No arquivo `public/dashboard.html`, adicionar a classe `hidden` ao botão `#tab-btn-traffic-alert` ou restaurar o commit base anterior.
2. **Reversão de Esquema de Banco de Dados:**  
   Caso a persistência em PostgreSQL tenha sido executada em homologação, rodar o script de rollback:
   ```bash
   node scripts/migrate-traffic-alert.js --rollback
   # ou executar diretamente no psql: server/traffic-alert/migrations/001_traffic_alert_schema.down.sql
   ```
3. **Chave de Emergência no Backend:**  
   Definir no `.env`: `TRAFFIC_ALERT_ENABLED=false` para fazer o roteador retornar HTTP 503 com mensagem consultiva padrão.
