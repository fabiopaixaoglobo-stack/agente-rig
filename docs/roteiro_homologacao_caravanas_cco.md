# Roteiro de Homologação Assistida: Acompanhamento de Caravanas (CCO)
## Casos de Teste CT-16 a CT-30 — CHECKPOINT 5.2

---

### 1. Instruções Gerais de Homologação

Este roteiro estabelece o protocolo de testes assistidos específico para o módulo **ACOMPANHAMENTO DE CARAVANAS** (Caravanas — Projeção de Chegada). A condução deve ser realizada conjuntamente pelo operador do CCO e pela equipe técnica.

> [!IMPORTANT]
> **PREMISSA INEGOCIÁVEL**:
> O módulo opera **sem telemetria GPS**. A rota projetada e a chegada projetada não representam a posição física do ônibus. Toda a massa de dados é estritamente sintética (`isSynthetic: true`).

---

### 2. Matriz Detalhada de Testes (CT-16 a CT-30)

| ID | Caso de Teste | Ação do Operador / Passos | Resultado Esperado | Evidência / Captura | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **CT-16** | **Abertura da Aba Caravanas** | Clicar na aba *"Caravanas — Projeção de Chegada"* no Cockpit de Homologação. | Tela carrega sem travamentos, com banners obrigatórios de "DADOS SINTÉTICOS" e "SEM RASTREAMENTO GPS". | `caravanas_desktop.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-17** | **Exibição da Grade Planejada** | Inspecionar a listagem de cards operacionais. | Exibição das 4 caravanas sintéticas (Norte, Baixada, Leste e Oeste) com horários e janelas. | `caravanas_desktop.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-18** | **Filtragem por Programa** | Selecionar *"Domingão Especial"* no dropdown de programas. | O feed filtra imediatamente exibindo apenas a Caravana Demonstração Norte. | Teste de UI Interativo | [ ] Aprovado<br>[ ] Reprovado |
| **CT-19** | **Filtragem por Situação** | Selecionar *"ATENÇÃO"* no dropdown de situações. | O feed exibe apenas as caravanas com ocorrência no trajeto ou margem curta. | Teste de UI Interativo | [ ] Aprovado<br>[ ] Reprovado |
| **CT-20** | **Busca Textual Dinâmica** | Digitar *"Baixada"* no campo de pesquisa rápida. | Lista filtra em tempo real (<300ms) sem necessidade de recarregar a página. | Teste de UI Interativo | [ ] Aprovado<br>[ ] Reprovado |
| **CT-21** | **Abertura do Drawer Tático** | Clicar em *"Ver Projeção & Rota ↗"* em um card. | Drawer lateral abre sobrepondo a tela com planejamento, tempos e ocorrências. | `caravanas_drawer.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-22** | **Cálculo da Rota Projetada** | Inspecionar o mapa tático da rota. | Linha da rota traçada de forma contínua do ponto de saída até os Estúdios Globo. | `caravanas_desktop.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-23** | **Ocorrência na Rota** | Selecionar a Caravana Norte (Pavuna). | Segmento crítico em vermelho na Linha Vermelha (Km 12) com acréscimo de +25 min. | `caravanas_rota_critica.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-24** | **Atualização da Projeção** | Clicar no botão *"Recalcular Projeção"*. | O carimbo de atualização é renovado e o status é reprocessado sem erro. | Teste de UI Interativo | [ ] Aprovado<br>[ ] Reprovado |
| **CT-25** | **Fonte de Trânsito Indisponível** | Alternar o simulador para *"Fonte Indisponível"*. | Degradação graciosa para `FONTE INDISPONÍVEL` mantendo a duração-base histórica. | `caravanas_fonte_indisponivel.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-26** | **Tratamento de Endereço Inválido** | Avaliar caravana sem coordenadas de origem. | Sistema define status `DADOS INCOMPLETOS` e exibe orientação no Drawer. | Suíte Automatizada | [ ] Aprovado<br>[ ] Reprovado |
| **CT-27** | **Tratamento de Horário Ausente** | Avaliar caravana sem horário planejado de saída. | Sistema define status `DADOS INCOMPLETOS` impedindo projeção arbitrária. | Suíte Automatizada | [ ] Aprovado<br>[ ] Reprovado |
| **CT-28** | **Ausência de Telemetria GPS** | Inspecionar a interface e o tráfego de rede. | **Zero** marcadores móveis de ônibus; presença obrigatória do selo "SEM GPS". | `caravanas_desktop.png` | [ ] Aprovado<br>[ ] Reprovado |
| **CT-29** | **Auditoria de Console DevTools F12** | Abrir F12 e inspecionar Console e Network. | **Zero erros** de console; **zero dados pessoais** trafegados na rede. | Log DevTools Limpo | [ ] Aprovado<br>[ ] Reprovado |
| **CT-30** | **Responsividade e Acessibilidade** | Redimensionar viewport para 1366×768 e pressionar tecla ESC. | Sem scroll horizontal; tecla ESC fecha o Drawer com retorno suave do foco. | `caravanas_notebook.png` | [ ] Aprovado<br>[ ] Reprovado |

---

### 3. Termo de Homologação do Módulo

- **Data da Homologação**: ____/____/________
- **Operador CCO**: __________________________________________________
- **Validador Técnico**: ______________________________________________
- **Parecer Operacional**:
  - [ ] **APROVADO**: Solução atende aos critérios operacionais sem uso de GPS.
  - [ ] **REJEITADO**: Descrever inconformidade identificada: _______________________
