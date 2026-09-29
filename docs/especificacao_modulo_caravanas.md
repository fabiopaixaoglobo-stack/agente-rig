# Especificação Funcional e Arquitetural: Acompanhamento de Caravanas
## Módulo do Agente RIT — CHECKPOINT 5.2 (Homologação Assistida)

---

### 1. Resumo Executivo e Regra Central de Governança

O módulo **ACOMPANHAMENTO DE CARAVANAS** (Caravanas — Projeção de Chegada) foi concebido para atender à demanda da Coordenação Transporte RJ e dos operadores do Centro de Controle Operacional (CCO) no acompanhamento do planejamento logístico de ônibus que transportam caravanas de plateia aos Estúdios Globo.

> [!IMPORTANT]
> **REGRA CENTRAL DE GOVERNANÇA E PRIVACIDADE (PRIVACY BY DESIGN)**:
> - O sistema opera **estritamente sem telemetria GPS**, sem localização em tempo real do veículo, sem dados de passageiros, sem dados de motoristas, sem placas e sem telefones.
> - Toda e qualquer análise é declarada de forma permanente e inequívoca como:
>   `“PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS. NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS.”`
> - Todo o ambiente atual de homologação é populado exclusivamente por **massa sintética fictícia de demonstração** (`isSynthetic: true`), sendo terminantemente vedado o uso silencioso de dados reais.

---

### 2. Taxonomia e Nomenclatura Estrita

Para evitar qualquer ilusão de rastreamento físico ou imperatividade de tráfego, fica padronizada a seguinte taxonomia:

| Termo Obrigatório / Permitido | Termo Terminantemente Proibido | Justificativa Técnica / Governança |
| :--- | :--- | :--- |
| **Rota Projetada** | *Rota Real / Posição do Ônibus* | Não há confirmação de que o veículo adotará fisicamente o trajeto geométrico. |
| **Partida Planejada** | *Partida Confirmada / Em Viagem* | Sem telemetria, não é possível aferir o momento exato em que as rodas se movimentam. |
| **Chegada Projetada** | *Chegada Estimada por GPS / Hora Real* | Trata-se de uma projeção temporal calculada a partir de dados públicos de trânsito. |
| **Impacto Estimado** | *Atraso Obrigatório / Veículo Retido* | O impacto decorre de ocorrências públicas no corredor, sem certeza de retenção do ônibus. |
| **Situação da Rota** | *Situação do Motorista / Do Veículo* | A avaliação qualifica a malha viária do trajeto, não a condução física. |
| **Sem Rastreamento por GPS** | *Rastreamento em Tempo Real / Ao Vivo* | Requisito categórico da diretriz de Privacidade e Segurança do Agente RIT. |

#### Status Projetados Permitidos
- `PLANEJADA`: Caravana agendada com endereço e horário definidos, aguardando início do ciclo de cálculo.
- `DENTRO DA JANELA`: Chegada projetada com folga superior a 15 minutos em relação ao encerramento da janela do programa.
- `ATENÇÃO`: Ocorrência pública ativa intersectando o corredor ou margem de folga inferior a 15 minutos.
- `RISCO DE ATRASO`: Chegada projetada calculada após o horário limite da janela de entrada da plateia.
- `FONTE INDISPONÍVEL`: Provedores públicos de trânsito inalcançáveis; cálculo recai sobre a duração-base histórica.
- `AGUARDANDO CÁLCULO`: Operação recém-cadastrada aguardando primeira varredura do motor geoespacial.
- `DADOS INCOMPLETOS`: Ausência de horário de saída ou de coordenadas de origem geocodificadas.

---

### 3. Modelo Canônico de Dados (DTO)

O contrato de dados canônico (`server/traffic-alert/types/caravan-dto.js`) implementa imutabilidade via `Object.freeze`:

```json
{
  "caravanId": "caravan-01",
  "caravanName": "Caravana Demonstração Norte",
  "programName": "Domingão Especial",
  "originLabel": "Ponto de Encontro - Pavuna (Demonstração)",
  "originAddress": "Praça Central da Pavuna, Pavuna, Rio de Janeiro - RJ (Fictício)",
  "originCoords": [-22.8090, -43.3640],
  "plannedDepartureAt": "2026-09-28T13:45:00.000Z",
  "destinationLabel": "ESTÚDIOS GLOBO — PONTO DE CHEGADA HOMOLOGAÇÃO",
  "destinationAddress": "Acesso Portaria de Homologação — Curicica, Rio de Janeiro - RJ",
  "destinationCoords": [-22.9550, -43.4100],
  "baseDistanceKm": 32.5,
  "baseDurationMinutes": 48,
  "incidentImpactMinutes": 25,
  "unquantifiedIncidentsCount": 0,
  "projectedDurationMinutes": 73,
  "projectedArrivalAt": "2026-09-28T14:58:00.000Z",
  "operationalWindowStart": "2026-09-28T14:40:00.000Z",
  "operationalWindowEnd": "2026-09-28T15:15:00.000Z",
  "marginToWindowMinutes": 17,
  "projectedStatus": "ATENÇÃO",
  "incidents": [
    {
      "canonicalId": "RIT-INC-01",
      "title": "Colisão com tombamento na Linha Vermelha (Km 12)",
      "severity": "CRITICO",
      "corridor": "LINHA_VERMELHA",
      "distanceToRouteMeters": 140,
      "impactMinutes": 25,
      "impactLabel": "+25 min",
      "sourceUrl": "https://cor.rio/",
      "provider": "COR_RIO"
    }
  ],
  "routeGeometry": [[-22.8090, -43.3640], "...", [-22.9550, -43.4100]],
  "criticalSegments": [{"segmentIndex": 4, "severity": "CRITICO"}],
  "consultativeRecommendations": [
    "Recomenda-se antecipar a conferência operacional junto ao responsável da caravana.",
    "Ocorrência pública grave na Linha Vermelha. Avaliar alternativa via Av. Brasil ou Transolímpica.",
    "Projeção consultiva baseada exclusivamente em dados públicos. Sem telemetria ou rastreamento físico de veículos."
  ],
  "sourceStatus": "ACTIVE",
  "calculatedAt": "2026-09-28T15:35:00.000Z",
  "expiresAt": "2026-09-28T15:50:00.000Z",
  "isGpsBased": false,
  "isSynthetic": true,
  "disclaimer": "PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS. NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS."
}
```

---

### 4. Motor de Projeção Geoespacial e Temporal

O serviço `CaravanRouteProjectionService` executa as seguintes etapas:
1. **Varredura de Ocorrências no Corredor (Buffer 1.200m)**:
   - Para cada ocorrência pública oficial, calcula a distância ortogonal euclidiana esférica (`pointToSegmentDistanceMeters`) até os nós da polilinha da rota.
   - Ocorrências com distância `<= 1.200 metros` são anexadas à lista de incidentes relevantes.
2. **Quantificação do Impacto**:
   - Se a fonte oficial (COR-Rio / CET-Rio / Concessionária) informar atraso explícito, utiliza o valor numérico.
   - Se for uma ocorrência crítica não quantificada numericamente, aplica heurística padrão (Crítico = 25 min, Alto = 15 min, Médio = 5 min) ou sinaliza como "não quantificado pela fonte" exigindo conferência visual por câmeras.
3. **Cálculo da Chegada e Margem da Janela**:
   $$\text{Duração Total Projetada} = \text{Duração Base} + \sum \text{Impacto dos Incidentes}$$
   $$\text{Chegada Projetada} = \text{Partida Planejada} + \text{Duração Total Projetada}$$
   $$\text{Margem da Janela} = \text{Fim da Janela Operacional} - \text{Chegada Projetada}$$
4. **Degradação Graciosa**:
   - Em caso de falha de conexão ou resposta em HTML das APIs de trânsito, a política anti-scraping é preservada e o status degrada para `FONTE INDISPONÍVEL`, mantendo a duração-base histórica e alertando o CCO.

---

### 5. Arquitetura de Componentes da Interface

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COCKPIT DE CARAVANAS                            │
├────────────────────────────────────────────────────────────────────────┤
│ 1. BANNER OBRIGATÓRIO: Dados Sintéticos | Sem Rastreamento por GPS     │
├────────────────────────────────────────────────────────────────────────┤
│ 2. RIBBON DE 6 KPIS:                                                   │
│ [Planejadas] [Na Janela] [Atenção] [Risco Atraso] [Ocorrências] [Sync] │
├────────────────────────────────────┬───────────────────────────────────┤
│ 3. FEED DE CARAVANAS (40%)         │ 4. MAPA TÁTICO DA ROTA (60%)      │
│ - Filtros: Programa, Status, Busca │ - Marcador Origem                 │
│ - Cards Operacionais com Janela    │ - Marcador Destino Homologação    │
│ - Abertura do Drawer Tático        │ - Rota Ciano + Segmento Crítico   │
│                                    │ - Selo Permanente "SEM GPS"       │
├────────────────────────────────────┴───────────────────────────────────┤
│ 5. DRAWER TÁTICO: Identificação, Tempos, Ocorrências e Recomendações   │
└────────────────────────────────────────────────────────────────────────┘
```
