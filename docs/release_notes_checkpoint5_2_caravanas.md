# Release Notes: CHECKPOINT 5.2 — Acompanhamento de Caravanas
## Sistema Agente RIT — Rotas Inteligentes de Transportes
**Versão:** `v1.3.0-rc.2`  
**Data da Release:** 28/09/2026  
**Ambiente:** Homologação Operacional / Cockpit CCO  
**Status de Homologação:** Pronto para Homologação Visual e Funcional com Dados Sintéticos  

---

### 1. Resumo Executivo da Versão

A versão `v1.3.0-rc.2` introduz o módulo **Acompanhamento de Caravanas** (denominado na interface como *“Caravanas — Projeção de Chegada”*), concebido para permitir que a Coordenação Transporte RJ e os operadores do CCO validem visual e funcionalmente o planejamento e o impacto de tráfego na rota de ônibus que transportam plateias para os Estúdios Globo.

Em estrita consonância com as diretrizes corporativas de Segurança, Privacidade e LGPD:
- **Zero GPS / Telemetria:** O módulo opera exclusivamente com **projeções matemáticas** baseadas em horários e pontos planejados e incidentes públicos de trânsito.
- **Zero Dados Pessoais:** Não há campos, tabelas, APIs ou fluxos com dados de motoristas, passageiros, placas de veículos ou números de telefone.
- **Ambiente de Homologação 100% Sintético:** Todas as caravanas demonstradas utilizam dados fictícios identificados por `isSynthetic: true`.
- **Disclaimer Obrigatório:** Fixado em todas as telas, cards e gavetas informando expressamente a natureza projetada da informação.

---

### 2. Principais Funcionalidades Entregues

1. **Aba Operacional "Caravanas — Projeção de Chegada":**
   - Ribbon com 6 KPIs executivos: *Planejadas*, *Na Janela*, *Atenção*, *Risco de Atraso*, *Ocorrências em Rotas* e *Última Atualização*.
   - Feed operacional com 4 caravanas sintéticas de demonstração (Norte/Pavuna, Baixada/Nova Iguaçu, Leste/Niterói, Oeste/Campo Grande).
   - Filtros dinâmicos por Programa, Situação Operacional e Busca Textual Instantânea (<300ms debounce).
   - Mapa Tático Leaflet com renderização de rota projetada contínua, realce de segmento crítico em vermelho (ex: Linha Vermelha Km 12) e selo permanente *"SEM GPS — ROTA PROJETADA"*.
   - Drawer Lateral de Análise de Caravana contendo cronograma de viagem (partida planejada, duração base, impacto estimado, chegada projetada, janela limite), detalhamento de ocorrências no corredor e recomendações consultivas de contingência.

2. **Motor de Projeção Geodésica e Amortecimento Operacional (`caravan-projection-service.js`):**
   - Interseção geométrica ponto-para-segmento com raio de amortecimento (*corridor buffer*) de 1.200 metros.
   - Cálculo determinístico de status: `PLANEJADA`, `DENTRO DA JANELA`, `ATENÇÃO`, `RISCO DE ATRASO`, `FONTE INDISPONÍVEL`, `DADOS INCOMPLETOS` e `AGUARDANDO CÁLCULO`.
   - Recomendações consultivas com diretrizes específicas para veículos pesados.

3. **Arquitetura de Contingência e Degradação Graciosa:**
   - Fallback automático para `FONTE INDISPONÍVEL` caso as APIs de trânsito público fiquem inacessíveis, preservando o tempo de viagem histórico e sinalizando ao operador.
   - Tratamento de `DADOS INCOMPLETOS` para rotas com coordenadas ou horários corrompidos/ausentes.

4. **Painel Interativo de Testes CCO (30 Casos de Teste CT-01 a CT-30):**
   - Roteiro integrado e gerador de folha de homologação assistida assinado pelo operador.

---

### 3. Matriz de Endpoints da API

| Método | Endpoint | Proteção / Flag | Descrição |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/traffic-alert/caravans` | `CARAVAN_MONITORING_ENABLED` | Retorna a lista de caravanas sintéticas e status projetado |
| `GET` | `/api/traffic-alert/caravans/kpis` | `CARAVAN_MONITORING_ENABLED` | Retorna o sumário dos 6 KPIs consolidados da grade |
| `GET` | `/api/traffic-alert/caravans/:id` | `CARAVAN_MONITORING_ENABLED` | Retorna os detalhes e geometria de uma caravana específica |
| `POST` | `/api/traffic-alert/caravans/:id/recalculate` | `CARAVAN_MONITORING_ENABLED` | Força o recálculo do impacto de trânsito para a rota informada |

*Caso o Feature Flag esteja desativado (`false`), todos os endpoints respondem imediatamente com HTTP 404 Feature Disabled.*

---

### 4. Cobertura de Testes Automatizados

- **Testes Unitários e de Integração:** 75 testes em 18 suítes (`npm test`), 100% de sucesso.
- **Suíte Dedicada de Caravanas (`caravan-projection.test.js`):** 12 testes validando cálculo de janelas, buffer geodésico de 1.200m, flags `isGpsBased: false` e `isSynthetic: true`, contingência de fonte indisponível e sanitização de dados.
- **Smoke Test de Homologação (`smoke-test-homologacao.js`):** 10 verificações ponta a ponta (ST-01 a ST-10), incluindo varredura estática de termos proibidos.

---

### 5. Procedimentos de Rollback

Em caso de qualquer inconformidade identificada durante a homologação assistida, o módulo conta com rollback instantâneo:
- **Tempo estimado:** Menos de 10 segundos.
- **Mecanismo:** Desativação da variável de ambiente `CARAVAN_MONITORING_ENABLED=false` no arquivo `.env`.
- **Efeito:** A aba Caravanas é ocultada do frontend, os seletores voltam ao estado da v1.3.0-rc.1 e as rotas da API retornam 404 sem afetar os demais módulos do RIT ALERTA.
