
# Arquitetura de Segurança - Agente RIT

Este documento detalha os controles, mecanismos e a arquitetura de segurança implementados no **Agente RIT** (Rota Inteligente de Transporte) para garantir a integridade, confidencialidade e disponibilidade das informações dos colaboradores da Globo.

---

## 1. Visão Geral

O sistema Agente RIT foi projetado seguindo as melhores práticas de desenvolvimento seguro, com foco na proteção de dados sensíveis e prevenção contra acessos indevidos. A arquitetura contempla múltiplas camadas de defesa, desde o frontend até a comunicação com o banco de dados e a integração com a base oficial de colaboradores (Excel).

## 2. Autenticação e Controle de Acesso

### 2.1 Validação Cruzada Estrita (Matrícula e E-mail Corporativo)

Um dos principais pilares de segurança implementados é a **Validação Conjunta e Estrita** durante o acesso e cadastro.
Para evitar falsidade ideológica, duplicidade ou cruzamento de homônimos:

* O sistema exige que a **Matrícula** E o **E-mail Corporativo** (`@g.globo` ou `@globo.com`) informados pelo usuário correspondam exatamente ao mesmo registro na base oficial de RH/Normas.
* A validação não é baseada em uma lógica permissiva (OU). Ambas as credenciais corporativas são confrontadas simultaneamente contra a mesma linha da base de dados oficial. Caso apenas uma bata ou haja divergência, o acesso/cadastro é imediatamente bloqueado.

### 2.2 Normalização e Comparação Segura de Credenciais (Atualização Junho/2026)

Para evitar falsos positivos de "dados divergentes" e garantir robustez no fluxo de recadastramento e redefinição de senha, foram implementadas as seguintes melhorias de normalização:

* **Normalização de E-mail (Case-Insensitive):** Todos os e-mails são convertidos para **minúsculas** (`toLowerCase()`) e removidos espaços extras (`trim()`) antes de qualquer operação de comparação ou armazenamento no banco de dados. Isso impede que variações de capitalização (ex: `Juliana.MCaldas@g.globo` vs `juliana.mcaldas@g.globo`) causem erros de validação.
* **Normalização de Matrícula:** A matrícula é convertida explicitamente para **string** (`String()`) e sanitizada com `trim()` para eliminar inconsistências de tipo ou espaços.
* **Comparação Normalizada no PostgreSQL:** As queries de verificação de duplicidade utilizam `LOWER(TRIM(email))` diretamente no SQL, garantindo que a comparação no banco também seja case-insensitive.
* **Análise Multi-Registro:** A verificação de duplicatas agora analisa **todos os registros retornados** pela query (em vez de apenas o primeiro), utilizando `Array.find()` para localizar correspondências exatas (matrícula + e-mail no mesmo registro) e correspondências parciais separadamente, garantindo diagnóstico preciso de cada cenário.
* **Logging de Auditoria no Registro:** Todas as operações de redefinição de senha e detecção de dados divergentes geram logs estruturados no console do servidor (`[REGISTER]`), facilitando investigações de segurança e troubleshooting.

### 2.3 Política de Senhas Fortes e Hash (Criptografia)

* **Hash com Salt (`bcryptjs`)**: As senhas dos usuários nunca são armazenadas em texto claro no banco de dados. O sistema utiliza a biblioteca `bcryptjs` com um *cost factor* seguro (fator 10) para gerar o hash da senha, impossibilitando a leitura reversa em caso de vazamento do banco.
* **Complexidade Exigida**: Durante o registro, o sistema impõe uma validação estrita com Expressões Regulares (Regex) garantindo que a senha possua:
* Mínimo de 8 caracteres.
* Pelo menos uma letra maiúscula.
* Pelo menos uma letra minúscula.
* Pelo menos um número.
* Pelo menos um caractere especial (símbolos).



### 2.4 JSON Web Tokens (JWT) para Sessão

* Após o login bem-sucedido, a sessão do usuário é gerenciada via **JWT** assinado digitalmente com uma chave secreta (`JWT_SECRET`) armazenada de forma segura nas variáveis de ambiente.
* Os tokens têm expiração definida (12 horas) e contêm apenas o identificador e a permissão (role/função) do usuário, sem expor dados sensíveis.
* O Token JWT deve ser enviado pelo cliente via *Header* HTTP (`Authorization: Bearer <token>`) in todas as rotas protegidas (ex: `/api/audit`), sendo validado em middleware dedicado.

## 3. Rastreabilidade e Auditoria Contínua

O sistema possui uma camada nativa de auditoria que documenta as interações críticas de segurança:

* **Tabela de Auditoria (`auditoria`)**: Cada tentativa de login bem-sucedida gera um registro imutável no banco de dados.
* **Dados Capturados**:
* `id_usuario`
* `data_hora_login` e `data_hora_logout`
* `tempo_sessao` (calculado em segundos/minutos)
* `ip_origem`: Captura do endereço IP do solicitante para rastrear a origem geográfica ou de rede em caso de investigação.


* A área de segurança pode visualizar esses acessos monitorados em tempo real através da interface `/audit.html`.

## 4. Segurança no Banco de Dados (PostgreSQL)

O sistema foi blindado contra injeções e ataques de banco de dados:

* **Prevenção de SQL Injection (Consultas Parametrizadas)**: Todas as chamadas ao banco utilizam o driver `pg` da biblioteca `pool.query` do Node.js com parâmetros `$1, $2, $3`, garantindo a separação entre código e dados. Em nenhum momento ocorrem concatenações de strings fornecidas pelo usuário em queries SQL.
* **Validação de Duplicidade (Unique Constraints)**: O cadastro valida via sistema e via banco se a matrícula ou o e-mail já possuem cadastro ativo, evitando anomalias ou usuários sobrepostos.

## 5. Recuperação Segura de Conta (Anti-Enumeração e SMTP Seguro)

* Ao solicitar a recuperação de senha, o sistema não confirma ao usuário não autenticado se o e-mail existe ou não, mitigando ataques de **Enumeração de Usuários**. Uma resposta padrão de sucesso é sempre exibida.
* O e-mail de recuperação é enviado apenas se o solicitante estiver presente na base corporativa Globo e utilizar e-mail válido.
* A comunicação com o servidor SMTP é feita via porta 587 (com TLS) ou 465 (SSL), garantindo que os dados de envio não sejam interceptados.
* Ao invés de enviar links fracos de redefinição, a arquitetura de segurança optou por forçar um novo recadastramento cruzado, obrigando o usuário a provar novamente que possui a Matrícula e E-mail correspondentes na base oficial.

### 5.1 Fluxo de Redefinição de Senha — Tratamento de Cenários (Atualização Junho/2026)

O fluxo de recadastramento via `/api/register` foi aprimorado para tratar corretamente os seguintes cenários sem bloquear indevidamente o acesso legítimo:

| Cenário | Comportamento |
|---|---|
| Matrícula e e-mail correspondem ao mesmo registro existente | Senha é redefinida com sucesso (e-mail normalizado no banco) |
| Matrícula existe, e-mail é diferente (atualização legítima) | Senha redefinida + e-mail atualizado no cadastro |
| Matrícula e e-mail pertencem a registros **diferentes** | Bloqueio com mensagem "dados divergentes" (cenário real de divergência) |
| E-mail já associado a outra matrícula | Bloqueio com mensagem específica orientando verificação de matrícula |
| Nenhum registro existente | Novo cadastro criado normalmente |

Todas as operações de comparação utilizam normalização case-insensitive (`LOWER(TRIM())`) tanto no backend Node.js quanto nas queries PostgreSQL, eliminando falsos positivos causados por diferenças de capitalização nos e-mails dos colaboradores.

## 6. Governança de Inteligência Artificial e Privacidade de Dados

### 6.1 Uso Restrito ao Ciclo de Desenvolvimento (Engenharia de Código)

O uso de ferramentas e pacotes de Inteligência Artificial Generativa de mercado (incluindo modelos abertos e comerciais como Antigravity e Gemini) limitou-se única e exclusivamente à fase de ideação, arquitetura e engenharia de software. As IAs atuaram estritamente como assistentes de programação na cocriação de código-fonte local, refatoração de funções e validação estrutural. Nenhuma API ou dependência de inteligência artificial externa está integrada, consome ou executa chamadas em tempo real (runtime) nas rotas ou serviços do sistema implantado.

### 6.2 Prevenção contra Vazamento de Dados (Anti-Data Leakage)

Para garantir total conformidade com as políticas de Segurança da Informação corporativas e mitigar riscos de Shadow IT, foram adotadas as seguintes premissas rígidas de privacidade durante o ciclo de desenvolvimento:

* **Isolamento de Informações Confidenciais:** Em nenhuma etapa de refinamento de prompts ou testes foram submetidos dados reais de produção, credenciais válidas, chaves de ambiente ou bases históricas de RH de colaboradores da Globo.
* **Utilização de Dados Sintéticos:** Todas as simulações e validações lógicas estruturadas com apoio de IA foram baseadas estritamente em dados fictícios (*mockados*), criados em ambiente sandbox local e isolado.

### 6.3 Autonomia, Revisão Humana e Soberania do Artefato Final

O ecossistema final do Agente RIT é composto puramente por código proprietário e bibliotecas de mercado consolidadas executadas em infraestrutura interna. Como o código gerado passou por auditoria e validação manual contra injeções de SQL, criptografia de hashes e validações cruzadas, o uso instrumental de ferramentas de IA para sua escrita não introduz vulnerabilidades externas, dependências tecnológicas ou riscos de conformidade à infraestrutura corporativa.

## 7. Histórico de Atualizações de Segurança

| Data | Versão | Descrição da Alteração |
|---|---|---|
| Junho/2026 | 2.2 | Sistema de detecção automática de pedágios por geofencing (Haversine). Cadastro de praças de pedágio com coordenadas (Transolímpica R$9,95, Ponte Rio-Niterói R$6,60). Detalhamento de custos no simulador separando custo base e pedágios. Aplicado tanto no simulador individual quanto no processamento em lote. |
| Junho/2026 | 2.1 | Normalização case-insensitive de e-mails no cadastro e redefinição de senha. Correção do falso positivo "dados divergentes" no fluxo de recuperação. Análise multi-registro na verificação de duplicatas. Logging estruturado de auditoria no endpoint `/api/register`. Mensagens de erro diferenciadas por cenário de conflito. |
| — | 2.0 | Validação Conjunta Estrita (Matrícula + E-mail). Auditoria com captura de IP. Anti-enumeração no fluxo de recuperação. |
| — | 1.0 | Implementação inicial: JWT, bcrypt, consultas parametrizadas, base Excel. |

## 8. Conclusão

Com as atualizações v2.1 e **v2.2** (Junho/2026), o Agente RIT incorporou normalização segura de credenciais no fluxo de acesso e um sistema de **detecção automática de pedágios por geofencing** no simulador de transporte, garantindo que as estimativas de custo reflitam com maior precisão os custos reais de deslocamento, incluindo praças de pedágio no trajeto.

Aliado às políticas de auditoria avançada (captura de IP), proteção contra injeções SQL com consultas parametrizadas e criptografia padrão da indústria (Bcrypt e JWT), o sistema assegura uma arquitetura robusta e independente de fatores externos.

Adicionalmente, as políticas estritas de isolamento e o uso de IA limitado exclusivamente ao design de código — sem tráfego de dados de produção para o ecossistema externo — garantem que o sistema atenda integralmente e sem ressalvas aos rigorosos requisitos de segurança da informação e privacidade exigidos pelo ambiente corporativo da Globo.
