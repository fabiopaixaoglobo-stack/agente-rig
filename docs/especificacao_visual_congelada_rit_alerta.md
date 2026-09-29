# Especificação Visual e Operacional Congelada: RIT ALERTA
## Documento de Congelamento de Desenho de Interface (Baseline Homologada)

---

### Termo de Congelamento Formal

> [!IMPORTANT]
> **STATUS: DESENHO CONGELADO E APROVADO PARA IMPLEMENTAÇÃO**  
> Data de Congelamento: **28 de Setembro de 2026**  
> Versão do Baseline: **v1.0 (Freeze)**  
> Módulo: **RIT ALERTA — Inteligência Autônoma de Trânsito**  
> Finalidade: Garantir que a implantação em homologação corporativa e os testes assistidos do CCO executem sobre uma especificação visual e comportamental estável, sem desvios ou alterações incrementais não homologadas.

---

### 1. Matriz de Componentes e Especificações Congeladas

| Componente | Especificação Aprovada | Regra de Negócio / Comportamento |
| :--- | :--- | :--- |
| **1.1 Layout Desktop** | **1920 × 1080 px** | Padrão Command Center; divisão operacional fixa 40/60; rolagem vertical independente no feed mantendo mapa e KPIs sempre visíveis. |
| **1.2 Layout Notebook** | **1366 × 768 px** | Responsividade compacta com redução proporcional de paddings e fontes; preservação da densidade de dados; proibição de rolagem horizontal. |
| **1.3 Divisão Operacional** | **Split 40% (Feed) / 60% (Mapa)** | Coluna esquerda com 40% de largura contendo a barra de filtros e a listagem de incidentes; coluna direita com 60% contendo o mapa tático Leaflet. |
| **1.4 KPIs do Topo** | **5 Cards Executivos** | 1) Ocorrências Ativas; 2) Corredores Bloqueados; 3) Lentidão Crítica; 4) Provedores Públicos (X/3 Online); 5) Carimbo de Último Sync. |
| **1.5 Filtros Operacionais** | **Corredor, Severidade e Busca** | - Dropdown de Corredores (Todos, Linha Vermelha, Av. Brasil, Linha Amarela, etc.);<br>- Dropdown de Severidade (Todas, Crítico, Alto, Médio, Baixo);<br>- Campo de busca textual por logradouro, via ou bairro com debounce de 300ms. |
| **1.6 Cards de Incidentes** | **Card Canônico com 15 Atributos** | Título, via, sentido, bairro, severidade, nível de confiança, completude (%), faixas bloqueadas, atraso estimado e botão *"Analisar Ocorrência ↗"*. |
| **1.7 Alerta de Divergência** | **Caixa de Destaque Âmbar** | Exibida obrigatoriamente quando fontes oficiais divergem (ex.: CET-Rio reporta lentidão moderada vs TomTom reporta retenção severa). |
| **1.8 Mapa Tático Leaflet** | **Tema Dark Georreferenciado** | Centralizado no Rio de Janeiro; renderização de marcadores pulsantes por severidade; zoom e recentralização automática ao selecionar ocorrência; sem rotas de veículos privados. |
| **1.9 Classificação de Câmeras** | **4 Status Auditáveis** | Nomenclatura estrita:<br>- `🟢 DISPONÍVEL`<br>- `🔴 OFFLINE`<br>- `🟡 DESATUALIZADA`<br>- `⚪ STATUS NÃO VALIDADO`<br>Carimbo obrigatório: `CONSULTA NA FONTE ORIGINAL` (termo *"Ao Vivo"* terminantemente vedado sem telemetria de frame). |
| **1.10 Painel de Recomendações** | **Tom Estritamente Consultivo** | Redação obrigatória: *"Alternativa para avaliação: [Corredor]"* acompanhada de metadados: horário da consulta, provedor de referência, ressalva de veículos pesados/ônibus não confirmada e orientação de confirmação local. |
| **1.11 Estados de Contingência** | **Degradação Graciosa** | - Estado Sem Ocorrências: feed limpo com radar verde amigável;<br>- Fontes Indisponíveis (HTTP 503): banner institucional vermelho/âmbar com fixtures **100% desligadas** por segurança. |

---

### 2. Mockups de Referência Congelados

#### 2.1 Versão Desktop 1920×1080
- **Identificador de Imagem**: `mockup_desktop_final_1790615865345.jpg`
- **Componentes Visíveis**: Header do Agente RIT, Ribbon de 5 KPIs, barra de filtros, feed com cartões detalhados e alertas de divergência, mapa tático de tráfego do Rio de Janeiro e Drawer lateral aberto com 4 câmeras e recomendações consultivas.

#### 2.2 Versão Notebook 1366×768
- **Identificador de Imagem**: `mockup_notebook_final_1790615909453.jpg`
- **Componentes Visíveis**: Adaptação compacta em viewport 1366x768 mantendo a integridade visual dos 5 KPIs e o Split 40/60 sem quebras de layout.

---

### 3. Governança de Alterações de Interface

A partir da publicação deste documento:
1. **Nenhuma alteração de layout, cores, tipografia, estrutura de containers ou inclusão de novos campos será permitida** até a conclusão da homologação assistida do CCO.
2. Qualquer ajuste solicitado durante os testes assistidos do CCO deverá ser registrado como item de backlog para ciclos futuros, preservando a estabilidade da release candidata de homologação.
3. A integridade do código que materializa este desenho é assegurada pelos testes automatizados em `test/traffic-alert/frontend-integration.test.js`.
