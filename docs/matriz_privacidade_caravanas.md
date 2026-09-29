# Matriz de Privacidade e Governança de Dados
## Módulo: Acompanhamento Projetado de Caravanas
**Referência Normativa:** LGPD (Lei 13.709/2018) | Diretrizes Corporativas de Segurança e Privacidade  
**Classificação da Informação:** USO RESTRITO — HOMOLOGAÇÃO COM DADOS SINTÉTICOS  
**Versão:** 1.0 (Checkpoint 5.2)  

---

### 1. Declaração Fundamental de Arquitetura

O módulo de **Acompanhamento de Caravanas** do Sistema Agente RIT foi desenhado sob o princípio de **Privacy by Design & Default**, eliminando na origem qualquer possibilidade de rastreamento de indivíduos, monitoramento de condutores ou processamento de dados pessoais identificáveis.

> [!CAUTION]
> **DIRETRIZ CORPORATIVA PERMANENTE**:
> O módulo opera **sem qualquer uso de GPS, sem telemetria veicular e sem rastreamento em tempo real**. O sistema realiza exclusivamente projeções estimadas com base em horários e pontos de partida planejados confrontados com dados públicos de tráfego urbano.

---

### 2. Matriz de Dados: Permitido vs. Bloqueado

| Categoria de Dado | Campo / Atributo | Tratamento no Módulo | Justificativa / Mecanismo de Controle |
| :--- | :--- | :---: | :--- |
| **Identificação Pessoal** | Nome de passageiro, CPF, e-mail | 🚫 **TOTALMENTE BLOQUEADO** | Não existe campo no modelo de dados; rejeição estática no DTO. |
| **Identificação de Condutor** | Nome do motorista, CNH, telefone | 🚫 **TOTALMENTE BLOQUEADO** | Inexistência estrutural na arquitetura. |
| **Identificação do Veículo** | Placa do ônibus, chassi, prefixo | 🚫 **TOTALMENTE BLOQUEADO** | O módulo acompanha o *planejamento da caravana* e não o veículo físico. |
| **Telemetria / Localização** | Posição GPS em tempo real, velocidade | 🚫 **TOTALMENTE BLOQUEADO** | Vetada qualquer integração com provedores de rastreamento veicular. |
| **Planejamento Operacional** | Ponto de partida (bairro/região) | ✅ **PERMITIDO (SINTÉTICO)** | Apenas coordenadas agregadas do ponto de encontro planejado. |
| **Destino Operacional** | Ponto de chegada (Estúdios Globo) | ✅ **PERMITIDO (SINTÉTICO)** | Coordenadas padronizadas do portão de acesso de plateia. |
| **Grade Horária** | Horário de saída planejado | ✅ **PERMITIDO (SINTÉTICO)** | Horário de início do deslocamento previsto na escala. |
| **Janela Operacional** | Horário limite de recepção | ✅ **PERMITIDO (SINTÉTICO)** | Tolerância estipulada pela produção do programa. |
| **Condições de Tráfego** | Ocorrências públicas de trânsito | ✅ **PERMITIDO (PÚBLICO)** | Dados abertos do COR-Rio / CET-Rio sobre incidentes viários. |

---

### 3. Vocabulário Controlado e Comunicação com o Operador

Para mitigar qualquer ambiguidade de interpretação pelos operadores do CCO ou usuários da plataforma, o sistema adota vocabulário rigidamente auditado:

| Termos Permitidos e Auditados | Termos Estritamente Proibidos (Bloqueio no CI/CD) |
| :--- | :--- |
| *Rota projetada* | ❌ *Ônibus está no local* |
| *Partida planejada* | ❌ *Posição atual do veículo* |
| *Chegada projetada* | ❌ *Veículo em tempo real* |
| *Impacto estimado* | ❌ *Motorista está parado* |
| *Situação da rota* | ❌ *Caravana está passando por* |
| *Última atualização da projeção* | ❌ *Em viagem / Em trânsito físico* |
| *Sem rastreamento por GPS* | ❌ *Rastreando caravana* |

*Nota: O script de teste automatizado `smoke-test-homologacao.js` (Check ST-08) varre os fontes do frontend e do backend, reprovando o build caso qualquer termo proibido seja identificado.*

---

### 4. Salvaguardas Técnicas Implementadas

1. **DTO Canônico Imutável (`caravan-dto.js`):**
   - Todos os objetos de caravana passam pela fábrica `createCaravanDTO()`.
   - Propriedades `isGpsBased: false` e `isSynthetic: true` são congeladas (`Object.freeze`).
   - Tentativas de injeção de campos não autorizados (ex: `driverName`, `plate`, `lat_actual`) são descartadas e logadas como anomalia.

2. **Aviso Legal Permanente (Disclaimer):**
   - Todas as interfaces (tabelas, cards, drawers e relatórios) exibem em destaque visual:  
     `“PROJEÇÃO OPERACIONAL BASEADA NO ENDEREÇO E HORÁRIO PLANEJADOS. NÃO REPRESENTA A LOCALIZAÇÃO REAL DO ÔNIBUS.”`

3. **Segregação do Módulo `Monitoramento 🔒`:**
   - O módulo original de monitoramento com dados sensíveis continua travado em código (`ui-controller.js` e `server.js`), inacessível na interface e nas rotas.

---

### 5. Condicionantes para Futura Carga de Dados Reais

A transição dos dados sintéticos atuais (`isSynthetic: true`) para o carregamento de endereços de coleta e horários operacionais reais fornecidos pela Coordenação Transporte RJ fica **expressamente condicionada** às seguintes etapas de governança corporativa:

1. **Parecer Jurídico e de DPO:** Validação formal da base legal da LGPD para tratamento do endereço de coleta de grupos de plateia.
2. **Ambiente de Hospedagem Homologado:** Migração definitiva do servidor para nuvem corporativa homologada (ex: AWS/GCP sob governança interna), com criptografia em trânsito (TLS 1.3) e em repouso (AES-256).
3. **Autenticação Corporativa (SSO / SAML / OAuth2):** Implantação de login único integrado ao Active Directory corporativo com controle de acesso baseado em papéis (RBAC).
4. **Acordo de Nível de Serviço (SLA) com Transporte RJ:** Definição das responsabilidades operacionais pelo input e atualização da grade de caravanas.
