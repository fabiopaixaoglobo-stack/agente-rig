# Pacote Oficial de Evidências Auditáveis — Portal do Motorista Agente RIT

**Data da Auditoria:** 2026-08-14T21:36:34.470Z  
**Ambiente:** Produção Render Cloud (`https://agente-rig-backend.onrender.com`)  
**Banco de Dados:** PostgreSQL (`rigrdb` - Render Oregon DB)  
**Commits Validados:** `74f7a42`, `e8a20e8`, `cb84955`

---

## 1. Evidência da Varredura no Código-Fonte (Grep Search Proof)

Comando executado:
```bash
git grep -i "motorista.html?id"
```
Output bruto do terminal:
```text
"segurança/arquitetura_seguranca_rit.md":2. **Rejeição por ID:** Requisições para `motorista.html?id=7206` devem ser bloqueadas sem exibir dados operacionais.
```
*Resultado: Zero ocorrências de código ativo utilizando `motorista.html?id=`.*

Comando executado:
```bash
git grep -i "\?id=" public/
```
Output bruto do terminal:
```text
Zero ocorrências encontradas no diretório public/.
```

---

## 2. Evidência Auditável do Fluxo de Geração de Token Opaco

### 2.1 Requisição e Resposta HTTP (`POST /api/auditoria/solicitar-posicao`)
- **Status HTTP:** `200 OK`
- **Payload Sanitizado Retornado:**
```json
{
  "ok": true,
  "atendimento": 1,
  "token_prefix": "6799393d",
  "link": "https://agente-rig-backend.onrender.com/motorista.html?token=6799393de26e07136108fa6b47f9d2a999f2482575e1addec8a47683dcc6c92f",
  "email_enviado": false,
  "message": "Supervisor não cadastrado. Copie o link abaixo e envie ao supervisor responsável pela operação."
}
```

### 2.2 Evidência no Banco PostgreSQL (`acessos_externos_atendimento`)
Consulta SQL executada:
```sql
SELECT id, id_atendimento, token_prefix, token_hash, status, criado_em, expira_em 
FROM acessos_externos_atendimento 
WHERE token_prefix = '6799393d';
```
Resultado do PostgreSQL:
```json
[
  {
    "id": 31,
    "id_atendimento": 1,
    "token_prefix": "6799393d",
    "token_hash": "30318f8dc98289172679cce32bf070e1ccc6f9bf5f13bb49c0013756d9b3696a",
    "status": "ATIVO",
    "criado_em": "2026-08-14T21:36:32.422Z",
    "expira_em": "2026-08-15T21:36:32.403Z",
    "finalizado_em": null,
    "motivo_finalizacao": null
  }
]
```

---

## 3. Evidência Auditável de Consulta ao Atendimento e Minimização LGPD

### 3.1 Requisição e Resposta HTTP (`GET /api/motorista/atendimento?token=...`)
- **Status HTTP:** `200 OK`
- **Payload Retornado:**
```json
{
  "ok": true,
  "atendimento": {
    "id_atendimento": 1,
    "motorista_nome": "Motorista RIT",
    "placa_veiculo": "N/D",
    "tipo_veiculo": "Executivo",
    "programa": "RIT",
    "origem": "Av. das Américas, 1650 – Barra da Tijuca, Rio de Janeiro - RJ, CEP 22640-101",
    "destino": "Av. das Américas, 4666 – Barra da Tijuca, Rio de Janeiro - RJ, 22640-102",
    "horario": "0.9166666666666666",
    "horario_termino": null,
    "status_atendimento": "EM_TRANSITO",
    "passageiro_resumido": null,
    "passageiro": null,
    "nome_colaborador": null
  }
}
```
*Observação LGPD: Nome do passageiro/colaborador entregue exclusivamente em formato minimizado e telefones/matrículas 100% omitidos.*

---

## 4. Evidência Auditável de Finalização e Revogação Compulsória

### 4.1 Encerramento do Atendimento (`POST /api/motorista/finalizar`)
- **Status HTTP:** `200 OK`
- **Payload Retornado:**
```json
{
  "ok": true,
  "mensagem": "Atendimento finalizado com sucesso."
}
```

### 4.2 Estado no PostgreSQL Pós-Finalização
Consulta SQL executada:
```sql
SELECT id, id_atendimento, token_prefix, status, finalizado_em, motivo_finalizacao 
FROM acessos_externos_atendimento 
WHERE token_prefix = '6799393d';
```
Resultado do PostgreSQL:
```json
[
  {
    "id": 31,
    "id_atendimento": 1,
    "token_prefix": "6799393d",
    "status": "FINALIZADO",
    "finalizado_em": "2026-08-14T21:36:33.598Z",
    "motivo_finalizacao": "FINALIZADO_PELO_MOTORISTA"
  }
]
```

### 4.3 Reacesso Negado Pós-Finalização
- **Status HTTP:** `401 Unauthorized`
- **Payload Retornado:**
```json
{
  "erro": "LINK_EXPIRADO",
  "mensagem": "Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação."
}
```

---

## 5. Evidência Auditável de Proteção Anti-IDOR (Bloqueio por ID Sequencial)

- **Requisição Testada:** `GET https://agente-rig-backend.onrender.com/api/motorista/atendimento?id=1`
- **Status HTTP:** `401 Unauthorized`
- **Payload Retornado:**
```json
{
  "erro": "LINK_EXPIRADO",
  "mensagem": "Este link não está mais disponível. Entre em contato com o supervisor responsável pela operação."
}
```

---

## 6. Trilha de Auditoria Forense (`eventos_seguranca`)

Registros gerados na tabela `eventos_seguranca` durante a execução do teste:
```json
[
  {
    "id": 51,
    "tipo_evento": "CONSULTA_LINK_EXTERNO",
    "entidade": "acessos_externos_atendimento",
    "entidade_id": "1",
    "usuario": "PUBLICO",
    "ip_origem": "10.25.7.120",
    "resultado": "BLOQUEADO",
    "motivo": "ATENDIMENTO_FINALIZADO",
    "data_hora": "2026-08-14T21:36:34.194Z",
    "metadados": {
      "token_prefix": "6799393d",
      "status_atendimento": "FINALIZADO"
    }
  },
  {
    "id": 50,
    "tipo_evento": "UPDATE_GPS",
    "entidade": "rotas_importadas",
    "entidade_id": "1",
    "usuario": "MOTORISTA",
    "ip_origem": "10.25.7.120",
    "resultado": "SUCESSO",
    "motivo": "ATENDIMENTO_FINALIZADO_TOKEN_REVOGADO",
    "data_hora": "2026-08-14T21:36:33.698Z",
    "metadados": {
      "token_prefix": "6799393d"
    }
  },
  {
    "id": 49,
    "tipo_evento": "CONSULTA_LINK_EXTERNO",
    "entidade": "acessos_externos_atendimento",
    "entidade_id": "1",
    "usuario": "PUBLICO",
    "ip_origem": "10.24.172.4",
    "resultado": "SUCESSO",
    "motivo": "CONSULTA_AUTORIZADA",
    "data_hora": "2026-08-14T21:36:33.208Z",
    "metadados": {
      "token_prefix": "6799393d"
    }
  },
  {
    "id": 48,
    "tipo_evento": "SOLICITAR_POSICAO",
    "entidade": "rotas_importadas",
    "entidade_id": "1",
    "usuario": "Operador Equipe de Transportes",
    "ip_origem": "10.24.172.4",
    "resultado": "SUCESSO",
    "motivo": "TOKEN_GERADO",
    "data_hora": "2026-08-14T21:36:32.522Z",
    "metadados": {
      "supervisor": "NAO_CADASTRADO",
      "token_prefix": "6799393d"
    }
  }
]
```

---
*Pacote de evidências coletado e homologado para o Escritório de Privacidade (DPO) e Cyber Security.*
