# Arquitetura de Segurança - Agente RIT

Este documento detalha os controles, mecanismos e a arquitetura de segurança implementados no **Agente RIT** (Rota Inteligente de Transporte) para garantir a integridade, confidencialidade e disponibilidade das informações dos colaboradores da Globo.

---

## 1. Visão Geral

O sistema Agente RIT foi projetado seguindo as melhores práticas de desenvolvimento seguro, com foco na proteção de dados sensíveis e prevenção contra acessos indevidos. A arquitetura contempla múltiplas camadas de defesa, desde o frontend até a comunicação com o banco de dados e a integração com a base oficial de colaboradores (Excel).

## 2. Autenticação e Controle de Acesso

### 2.1 Validação Cruzada Estrita (Matrícula e E-mail Corporativo)
Um dos principais pilares de segurança implementados é a **Validação Conjunta e Estrita** durante o acesso e cadastro.
Para evitar falsidade ideológica, duplicidade ou cruzamento de homônimos:
- O sistema exige que a **Matrícula** E o **E-mail Corporativo** (`@g.globo` ou `@globo.com`) informados pelo usuário correspondam exatamente ao mesmo registro na base oficial de RH/Normas.
- A validação não é baseada em uma lógica permissiva (OU). Ambas as credenciais corporativas são confrontadas simultaneamente contra a mesma linha da base de dados oficial. Caso apenas uma bata ou haja divergência, o acesso/cadastro é imediatamente bloqueado.

### 2.2 Política de Senhas Fortes e Hash (Criptografia)
- **Hash com Salt (`bcryptjs`)**: As senhas dos usuários nunca são armazenadas em texto claro no banco de dados. O sistema utiliza a biblioteca `bcryptjs` com um *cost factor* seguro (fator 10) para gerar o hash da senha, impossibilitando a leitura reversa em caso de vazamento do banco.
- **Complexidade Exigida**: Durante o registro, o sistema impõe uma validação estrita com Expressões Regulares (Regex) garantindo que a senha possua:
  - Mínimo de 8 caracteres.
  - Pelo menos uma letra maiúscula.
  - Pelo menos uma letra minúscula.
  - Pelo menos um número.
  - Pelo menos um caractere especial (símbolos).

### 2.3 JSON Web Tokens (JWT) para Sessão
- Após o login bem-sucedido, a sessão do usuário é gerenciada via **JWT** assinado digitalmente com uma chave secreta (`JWT_SECRET`) armazenada de forma segura nas variáveis de ambiente.
- Os tokens têm expiração definida (12 horas) e contêm apenas o identificador e a permissão (role/função) do usuário, sem expor dados sensíveis.
- O Token JWT deve ser enviado pelo cliente via *Header* HTTP (`Authorization: Bearer <token>`) em todas as rotas protegidas (ex: `/api/audit`), sendo validado em middleware dedicado.

## 3. Rastreabilidade e Auditoria Contínua

O sistema possui uma camada nativa de auditoria que documenta as interações críticas de segurança:
- **Tabela de Auditoria (`auditoria`)**: Cada tentativa de login bem-sucedida gera um registro imutável no banco de dados.
- **Dados Capturados**:
  - `id_usuario`
  - `data_hora_login` e `data_hora_logout`
  - `tempo_sessao` (calculado em segundos/minutos)
  - `ip_origem`: Captura do endereço IP do solicitante para rastrear a origem geográfica ou de rede em caso de investigação.
- A área de segurança pode visualizar esses acessos monitorados em tempo real através da interface `/audit.html`.

## 4. Segurança no Banco de Dados (PostgreSQL)

O sistema foi blindado contra injeções e ataques de banco de dados:
- **Prevenção de SQL Injection (Consultas Parametrizadas)**: Todas as chamadas ao banco utilizam o driver `pg` da biblioteca `pool.query` do Node.js com parâmetros `$1, $2, $3`, garantindo a separação entre código e dados. Em nenhum momento ocorrem concatenações de strings fornecidas pelo usuário em queries SQL.
- **Validação de Duplicidade (Unique Constraints)**: O cadastro valida via sistema e via banco se a matrícula ou o e-mail já possuem cadastro ativo, evitando anomalias ou usuários sobrepostos.

## 5. Recuperação Segura de Conta (Anti-Enumeração e SMTP Seguro)

- Ao solicitar a recuperação de senha, o sistema não confirma ao usuário não autenticado se o e-mail existe ou não, mitigando ataques de **Enumeração de Usuários**. Uma resposta padrão de sucesso é sempre exibida.
- O e-mail de recuperação é enviado apenas se o solicitante estiver presente na base corporativa Globo e utilizar e-mail válido.
- A comunicação com o servidor SMTP é feita via porta 587 (com TLS) ou 465 (SSL), garantindo que os dados de envio não sejam interceptados.
- Ao invés de enviar links fracos de redefinição, a arquitetura de segurança optou por forçar um novo recadastramento cruzado, obrigando o usuário a provar novamente que possui a Matrícula e E-mail correspondentes na base oficial.

## 6. Conclusão

Com a recente atualização para **Validação Conjunta da Matrícula e E-mail**, o Agente RIT adicionou uma forte barreira contra impersonificação. Aliado às políticas de auditoria avançada (captura de IP), proteção contra injeções SQL e criptografia padrão da indústria (Bcrypt e JWT), o sistema está preparado e seguro para adoção interna no ambiente corporativo da Globo, cumprindo rigorosos requisitos de segurança da informação.
