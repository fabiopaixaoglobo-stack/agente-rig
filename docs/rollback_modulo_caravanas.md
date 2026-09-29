# Procedimento Operacional Padrão: Rollback do Módulo Caravanas
## Sistema Agente RIT — Rotas Inteligentes de Transportes
**Alvo do Rollback:** Módulo Acompanhamento de Caravanas (CHECKPOINT 5.2)  
**Tempo Máximo de Execução:** Menos de 10 segundos  
**Tipo de Mecanismo:** Feature Flag em Nível de Configuração / Hot-Switch  

---

### 1. Critérios de Disparo do Rollback

O rollback emergencial ou controlado do módulo de caravanas deve ser acionado caso ocorra qualquer uma das seguintes situações durante a homologação assistida:

1. Identificação de qualquer dado pessoal ou tentativa de exposição de telemetria GPS.
2. Inconsistência impeditiva na renderização das abas principais do RIT ALERTA ou Painel Operacional.
3. Degradação de desempenho com consumo excessivo de memória no servidor Node.js.
4. Solicitação formal da Coordenação de Transporte RJ, CCO ou Segurança da Informação.

---

### 2. Procedimento de Execução (Passo a Passo)

#### Opção A: Desativação via Arquivo de Ambiente (.env) — Recomendado

1. Abra o arquivo de configuração de ambiente `.env` na raiz da aplicação:
   ```env
   # Localizar a variável de controle:
   CARAVAN_MONITORING_ENABLED=true
   ```

2. Altere o valor para `false`:
   ```env
   CARAVAN_MONITORING_ENABLED=false
   ```

3. Reinicie o serviço Node.js (ou recarregue as variáveis):
   ```powershell
   # Em ambiente de homologação:
   npm run start
   ```

*Tempo total estimado: 8 segundos.*

---

#### Opção B: Desativação a Quente via Variável de Processo (Docker / PM2)

Caso a aplicação esteja rodando sob gerenciador de processos corporativo (PM2 / Kubernetes / Docker):

```bash
# PM2
pm2 set agente-rit:CARAVAN_MONITORING_ENABLED false
pm2 restart agente-rit --update-env

# Docker / Container
docker exec -i agente-rit sh -c "export CARAVAN_MONITORING_ENABLED=false"
```

---

### 3. Comportamento do Sistema Pós-Rollback

Assim que `CARAVAN_MONITORING_ENABLED=false` é aplicado:

1. **Camada Backend (API REST):**
   - Requisições para `/api/traffic-alert/caravans/*` retornam imediatamente código HTTP `404 Not Found` com payload:
     ```json
     {
       "error": "Módulo de acompanhamento de caravanas desativado por configuração",
       "featureFlag": "CARAVAN_MONITORING_ENABLED",
       "enabled": false
     }
     ```
   - O motor de projeção (`caravan-projection-service.js`) cessa qualquer processamento de buffers e rotas em memória.

2. **Camada Frontend (Cockpit de Homologação):**
   - O seletor de abas esconde automaticamente o botão *"Caravanas — Projeção de Chegada"* ou o exibe como inativo/desabilitado.
   - O sistema direciona o operador exclusivamente para a visualização das abas primárias do RIT ALERTA (Painel Operacional 40/60).
   - O Drawer lateral de caravanas é desvinculado e não responde a eventos.

3. **Demais Módulos do Sistema:**
   - O RIT ALERTA (incidentes públicos de trânsito, feed 40/60, mapa tático, câmeras e recomendações) **permanece 100% operacional**, sem qualquer interferência ou perda de dados.
   - A aba `Monitoramento 🔒` permanece inalterada e bloqueada conforme diretrizes de privacidade.

---

### 4. Checklist de Verificação Pós-Rollback

Após aplicar o rollback, a equipe técnica deve executar a checagem rápida:

```powershell
# 1. Executar a suíte de testes de regressão:
npm test

# 2. Verificar resposta da API de Caravanas (deve responder 404):
Invoke-RestMethod -Uri "http://localhost:3000/api/traffic-alert/caravans" -Method Get -SkipHttpErrorCheck

# 3. Verificar resposta da API do RIT ALERTA (deve responder 200 OK):
Invoke-RestMethod -Uri "http://localhost:3000/api/traffic-alert/incidents" -Method Get
```

**Critério de Sucesso do Rollback:**  
- API de Caravanas desativada (404).  
- RIT ALERTA funcionando normalmente (200).  
- Zero exceções ou travamentos nos logs da aplicação.
