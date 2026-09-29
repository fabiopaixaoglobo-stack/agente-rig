# Roteiro de Homologação Assistida: CCO & Operadores
## Módulo RIT ALERTA — Inteligência Autônoma de Trânsito

---

### 1. Objetivo e Escopo da Homologação Assistida

Este documento estabelece o roteiro prático e padronizado para condução dos testes de aceitação operacional do **RIT ALERTA** em ambiente corporativo de homologação.

O processo de teste assistido deve ser realizado conjuntamente por:
- **Operadores do CCO (Centro de Controle Operacional)**
- **Analistas de Transporte e Logística**
- **Equipe Técnica de Engenharia / Validação**

> [!IMPORTANT]
> **Princípio de Operação**: O RIT ALERTA é uma plataforma de **suporte à decisão operacional** baseada exclusivamente em dados públicos oficiais. O sistema não substitui o julgamento humano do operador nem emite ordens imperativas de trajeto.

---

### 2. Matriz de Cenários de Teste Operacional: RIT ALERTA (CT-01 a CT-15)

| ID do Teste | Cenário Operacional | Ação do Validador | Resultado Esperado | Status (CCO) |
| :--- | :--- | :--- | :--- | :--- |
| **CT-01** | **Conferência Visual Desktop** | Abrir a aba RIT ALERTA em monitor 1920×1080 | Tela com Split 40/60 nítido, 5 cards de KPI no topo, sem rolagem horizontal | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-02** | **Conferência Visual Notebook** | Abrir a aba RIT ALERTA em notebook 1366×768 | Layout compacto perfeitamente legível, feed rolável independente do mapa | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-03** | **Validação dos KPIs de Topo** | Inspecionar os 5 indicadores no topo | Total de Ativas, Bloqueios e Lentidão coerentes com a listagem de ocorrências | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-04** | **Filtragem por Corredor** | Selecionar "Linha Vermelha" no dropdown | Feed exibe apenas ocorrências vinculadas à Linha Vermelha; mapa reflete a seleção | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-05** | **Filtragem por Severidade** | Selecionar "CRÍTICO" no dropdown | Feed filtra imediatamente cartões de alta criticidade com borda e badge vermelha | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-06** | **Busca Textual Dinâmica** | Digitar nome de bairro (ex: "Bonsucesso") | Lista filtra em tempo real (<300ms) sem recarregar a página | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-07** | **Seleção de Ocorrência & Mapa** | Clicar em um card de incidente | Card recebe destaque ciano (`.ta-selected`) e o mapa Leaflet dá zoom na ocorrência com pulso | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-08** | **Abertura do Drawer de Análise** | Clicar em *"Analisar Ocorrência ↗"* | Drawer lateral desliza sobrepondo a tela sem trocar de página nem perder o mapa | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-09** | **Classificação das Câmeras** | Verificar o grid de 4 câmeras no Drawer | Câmeras exibem status auditáveis: "Disponível", "Desatualizada" ou "Offline", com carimbo "Consulta na Fonte Original" | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-10** | **Recomendações Consultivas** | Ler o bloco de recomendações | Texto com redação *"Alternativa para avaliação: [Corredor]"*, metadados de consulta, alerta de veículos pesados e sem ordens impositivas | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-11** | **Fechamento do Drawer (Acessibilidade)** | Pressionar a tecla `ESC` ou botão `✕` | Drawer fecha suavemente e o foco do teclado retorna ao card correspondente | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-12** | **Alerta de Divergência de Fontes** | Localizar ocorrência com fontes conflitantes | Presença de caixa âmbar destacando discrepância entre fontes oficiais (ex: CET-Rio vs TomTom) | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-13** | **Auditoria de Console F12** | Abrir DevTools (F12) e inspecionar Console | **Zero erros** originados pelo RIT ALERTA (`traffic-alert-*.js`) | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-14** | **Auditoria de Tráfego de Rede** | Inspecionar a aba Network do DevTools | Requisições HTTP 200 para `/api/traffic-alert/*`; **Zero** requisições para GPS ou frotas privadas | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-15** | **Integridade da Aba Bloqueada** | Verificar a aba `Monitoramento 🔒` | Permanece com cadeado visual e acesso estritamente bloqueado | [ ] Aprovado<br>[ ] Rejeitado |

---

### 3. Matriz de Cenários de Teste Operacional: Acompanhamento de Caravanas (CT-16 a CT-30)

| ID do Teste | Cenário Operacional | Ação do Validador | Resultado Esperado | Status (CCO) |
| :--- | :--- | :--- | :--- | :--- |
| **CT-16** | **Abertura da Aba Caravanas** | Clicar na aba *"Caravanas — Projeção de Chegada"* no Cockpit de Homologação | Tela carrega sem travamentos com banners obrigatórios de "DADOS SINTÉTICOS" e "SEM RASTREAMENTO GPS" | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-17** | **Exibição da Grade Planejada** | Inspecionar a listagem de cards operacionais | Exibição das 4 caravanas sintéticas (Norte, Baixada, Leste e Oeste) com horários e janelas | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-18** | **Filtragem por Programa** | Selecionar *"Domingão Especial"* no dropdown de programas | O feed filtra imediatamente exibindo apenas a Caravana Demonstração Norte | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-19** | **Filtragem por Situação** | Selecionar *"ATENÇÃO"* no dropdown de situações | O feed exibe apenas as caravanas com ocorrência no trajeto ou margem curta | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-20** | **Busca Textual Dinâmica** | Digitar *"Baixada"* no campo de pesquisa rápida | Lista filtra em tempo real (<300ms) sem necessidade de recarregar a página | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-21** | **Abertura do Drawer Tático** | Clicar em *"Ver Projeção & Rota ↗"* em um card | Drawer lateral abre sobrepondo a tela com planejamento, tempos e ocorrências | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-22** | **Cálculo da Rota Projetada** | Inspecionar o mapa tático da rota | Linha da rota traçada de forma contínua do ponto de saída até os Estúdios Globo | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-23** | **Ocorrência na Rota** | Selecionar a Caravana Norte (Pavuna) | Segmento crítico em vermelho na Linha Vermelha (Km 12) com acréscimo de +25 min | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-24** | **Atualização da Projeção** | Clicar no botão *"Recalcular Projeção"* | O carimbo de atualização é renovado e o status é reprocessado sem erro | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-25** | **Fonte de Trânsito Indisponível** | Alternar o simulador para *"Fonte Indisponível"* | Degradação graciosa para `FONTE INDISPONÍVEL` mantendo a duração-base histórica | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-26** | **Tratamento de Endereço Inválido** | Avaliar caravana sem coordenadas de origem | Sistema define status `DADOS INCOMPLETOS` e exibe orientação no Drawer | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-27** | **Tratamento de Horário Ausente** | Avaliar caravana sem horário planejado de saída | Sistema define status `DADOS INCOMPLETOS` impedindo projeção arbitrária | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-28** | **Ausência de Telemetria GPS** | Inspecionar a interface e o tráfego de rede | **Zero** marcadores móveis de ônibus; presença obrigatória do selo "SEM GPS" | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-29** | **Auditoria de Console DevTools F12** | Abrir F12 e inspecionar Console e Network | **Zero erros** de console; **zero dados pessoais** trafegados na rede | [ ] Aprovado<br>[ ] Rejeitado |
| **CT-30** | **Responsividade e Acessibilidade** | Redimensionar viewport para 1366×768 e pressionar tecla ESC | Sem scroll horizontal; tecla ESC fecha o Drawer com retorno suave do foco | [ ] Aprovado<br>[ ] Rejeitado |

---

### 4. Formulário de Registro de Aceite e Divergências Observadas

#### Identificação da Sessão de Testes
- **Data da Homologação**: ____/____/________
- **Versão / Commit**: _________________________________________________
- **Nome do Operador CCO**: ___________________________________________
- **Nome do Validador Técnico**: _______________________________________

#### Registro de Ocorrências / Divergências Identificadas
*(Registrar abaixo qualquer anomalia de layout, latência perceptível ou inconsistência informativa)*

1. _________________________________________________________________________________
2. _________________________________________________________________________________
3. _________________________________________________________________________________

#### Parecer Final da Operação CCO (30 Casos de Teste)
- [ ] **HOMOLOGADO SEM RESSALVAS**: Solução visual e funcionalmente apta para a rotina do CCO (30/30 conformes).
- [ ] **HOMOLOGADO COM RESSALVAS**: Pequenos ajustes cosméticos registrados para ciclos futuros.
- [ ] **REJEITADO**: Anomalia impeditiva encontrada (descrever acima).

**Assinatura do Responsável Operacional**: _____________________________________
