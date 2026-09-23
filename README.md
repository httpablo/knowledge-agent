# Knowledge Agent

Base de conhecimento multi-tenant: cada organização envia seus próprios documentos (PDF, TXT ou DOCX) e os usuários dessa organização conversam com um assistente que responde com base no conteúdo processado desses arquivos. As respostas indicam os trechos e páginas de onde vieram, e o assistente se recusa a responder quando não encontra evidência suficiente nos documentos. A interface está disponível em português, inglês e alemão.

## Sumário

- [Aplicação publicada](#aplicação-publicada)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Fluxo da aplicação](#fluxo-da-aplicação)
- [Decisões de arquitetura](#decisões-de-arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [RAG: recuperação e geração de respostas](#rag-recuperação-e-geração-de-respostas)
- [Processamento assíncrono](#processamento-assíncrono)
- [Multi-tenancy e segurança](#multi-tenancy-e-segurança)
- [Confiabilidade das respostas e tratamento de falhas](#confiabilidade-das-respostas-e-tratamento-de-falhas)
- [Tecnologias](#tecnologias)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Executando localmente](#executando-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [API](#api)
- [Testes e qualidade](#testes-e-qualidade)
- [Deploy](#deploy)

## Aplicação publicada

- **Aplicação:** https://knowledge-agent-pi-three.vercel.app
- **API:** https://p01--knowledge-agent-api--2wfdcdcs9r7w.code.run/api/v1
- **Documentação interativa da API (Swagger):** https://p01--knowledge-agent-api--2wfdcdcs9r7w.code.run/docs
- **Repositório:** https://github.com/httpablo/knowledge-agent

## Funcionalidades

- Cadastro e login com JWT; cada conta nova ganha automaticamente sua própria organização (workspace isolado dos demais).
- Upload de PDF, TXT (UTF-8) e DOCX, com limite de 10 MB por arquivo, processados em background.
- Status de processamento visível por documento (`Queued` → `Processing` → `Ready`/`Failed`), atualizado por polling a cada 2 segundos; erros de processamento aparecem traduzidos na interface.
- Exclusão de documentos (bloqueada enquanto o documento ainda está em fila ou em processamento).
- Chat com memória curta da conversa atual e respostas com citação de fontes (arquivo, página quando existe, trecho usado).
- Conversa persistida no backend; o `conversation_id` é mantido no navegador para restaurar o histórico ao recarregar a página.
- Recusa explícita de resposta quando os documentos não sustentam o que foi perguntado, em vez de inventar uma resposta.
- Interface em português, inglês e alemão, com seletor de idioma.
- Interface responsiva (colunas lado a lado no desktop, abas Documentos/Chat no mobile) e tema claro/escuro.

## Arquitetura

O frontend nunca acessa banco, fila ou storage diretamente — toda operação passa pela API FastAPI. Um upload é recebido, validado e armazenado temporariamente pela API, que devolve a resposta na hora e delega o trabalho pesado (extrair texto, gerar embeddings) a um worker Celery. No chat, é a própria API quem consulta o PostgreSQL com `pgvector` para recuperar evidência relevante antes de chamar o modelo da OpenAI.

`api` e `worker` são dois processos do mesmo backend — mesma imagem, mesmo código em `services/` — não serviços independentes. Isso mantém a API sempre responsiva, já que nenhuma requisição HTTP espera um documento inteiro ser processado, e permite escalar o worker à parte se o volume de upload crescer.

```mermaid
flowchart LR
    User(["Usuário"]) --> Frontend["React / Vite"]
    Frontend -->|"HTTPS · /api/*"| API["FastAPI"]

    API -->|enfileira| Queue[("Redis · broker da fila")]
    Queue -->|consumida por| Worker["Celery Worker"]

    API --> DB[("PostgreSQL + pgvector")]
    API --> Storage[("R2 / MinIO · storage temporário")]
    API --> LLM["OpenAI · embeddings + geração"]

    Worker --> DB
    Worker --> Storage
    Worker --> LLM

    subgraph Backend
        API
        Worker
    end
```

O frontend só conhece a API; PostgreSQL, Redis, storage e OpenAI ficam inteiramente atrás dela. Detalhes de deploy ficam na seção [Deploy](#deploy); o passo a passo de upload e de uma pergunta está a seguir.

## Fluxo da aplicação

### Ingestão de um documento

```mermaid
flowchart TD
    A["Upload multipart"] --> B["Validação: extensão, assinatura, tamanho"]
    B -->|inválido| R1["422 / 413"]
    B -->|válido| C["Storage: grava arquivo"]
    C --> D["Document = PENDING"]
    D --> E["Enfileira no Redis"]
    E -->|"202 Accepted"| F["Frontend acompanha via polling"]
    E --> G["Worker consome a fila"]
    G --> H["Extrai texto (PDF/TXT/DOCX)"]
    H -->|erro permanente| X["FAILED + código do erro"]
    H --> I["Chunking"]
    I --> J["Embeddings (lotes)"]
    J -->|erro transitório| RT["retry com backoff"] --> J
    J -->|erro permanente| X
    J --> K["Persiste no pgvector"]
    K --> L["Document = READY"]
    L --> M["Remove arquivo do storage"]
```

A API responde `202` assim que o upload é aceito — o processamento acontece depois, fora da requisição. O arquivo original só existe no storage entre o upload e o fim do processamento: uma vez extraído e indexado, ele é removido, e o Postgres passa a ser a única fonte de verdade sobre o conteúdo do documento.

### Uma pergunta no chat

```mermaid
flowchart TD
    A["Pergunta do usuário"] --> B["Resolve organization_id (JWT)"]
    B --> C["Embedding da pergunta"]
    C --> D["Busca no pgvector\n(filtrada por organization_id)"]
    D --> E{"Algum chunk\npróximo o bastante?"}
    E -->|não| F["answerable = false\n(LLM não é chamado)"]
    E -->|sim| G["Monta contexto\n(chunks + histórico)"]
    G --> H["LLM gera resposta estruturada"]
    H --> I{"Fontes citadas\nsão válidas?"}
    I -->|não, 1ª vez| H
    I -->|sim| J["Persiste pergunta e resposta"]
    F --> J
    J --> K["Frontend exibe resposta e fontes"]
```

O ponto que mais importa nesse fluxo para o isolamento multi-tenant é a ordem: `organization_id` entra **antes** da busca vetorial, como filtro da própria query — não como um filtro aplicado depois sobre um resultado já calculado. Um chunk de outra organização nunca chega a ser candidato, muito menos a aparecer no ranking de distância.

## Decisões de arquitetura

Nenhuma das escolhas abaixo é a única forma certa de resolver o problema — são as que fizeram mais sentido para o tamanho e os requisitos deste projeto, cada uma trocando alguma coisa por outra.

| Decisão | Por que faz sentido no projeto | Consequência |
| --- | --- | --- |
| Guardar os embeddings no mesmo PostgreSQL, usando pgvector | Evita manter dois bancos sincronizados, e o filtro por organização entra na mesma consulta que já busca os trechos mais parecidos com a pergunta — não é um passo separado | Para um volume de dados bem maior, um banco vetorial dedicado provavelmente escalaria melhor; aqui, ter tudo num só lugar valeu mais que essa especialização |
| Definir a organização do usuário sempre no backend, a partir do login | Ninguém consegue montar uma requisição pedindo dados de uma organização que não é a sua, nem por engano | Toda rota que lida com dado de uma organização precisa passar por esse contexto de autenticação; não existe atalho que pule essa checagem |
| Processar os documentos em uma fila separada (Celery + Redis), fora da requisição de upload | Documentos maiores podem demorar para processar, e isso não deveria travar a resposta do upload; se algo falhar por um problema passageiro, dá para tentar de novo sem o usuário perceber | É mais uma peça rodando (fila e worker) do que teria se tudo acontecesse dentro da própria requisição |
| Apagar o arquivo original do armazenamento assim que ele é processado com sucesso | A API e o worker não precisam compartilhar um sistema de arquivos, e o mesmo conteúdo não fica guardado duas vezes | Se o processamento de texto melhorar no futuro, não dá para reaproveitar arquivos antigos — seria preciso enviá-los de novo |
| Chamar a API da OpenAI diretamente, sem uma camada extra de orquestração por cima | O fluxo de busca e resposta é pequeno o suficiente para ficar todo visível no código de `services/`, o que facilita entender e ajustar cada etapa | Coisas como repetir uma chamada que falhou e validar a resposta são responsabilidade do próprio código, não vêm prontas de uma biblioteca |
| Fazer o modelo responder em um formato fixo, indicando só quais trechos usou — e montar a citação (arquivo, página, conteúdo) a partir do banco, nunca do texto gerado | O que aparece como "fonte" para o usuário é sempre exatamente o que está no banco, nunca algo escrito livremente | O contrato com o modelo fica mais rígido — a resposta só é aceita dentro desse formato —, mas em troca fica bem mais fácil de validar |
| Usar as últimas mensagens da conversa como contexto, mas nunca como prova de um fato | Evita que uma resposta anterior, já reformulada ou só vagamente relacionada, acabe "confirmando" algo que não está de fato nos documentos | Uma pergunta de acompanhamento muito vaga, que não repete nenhuma palavra da pergunta anterior, pode não recuperar os trechos certos |
| Extrair o texto dos PDFs preservando a posição de cada trecho na página, em vez de simplesmente concatenar tudo em sequência | Ajuda a manter tabelas simples e textos em colunas legíveis, em vez de embaralhados | Tabelas mais complexas não são reconstruídas de verdade — o texto sai na ordem espacial da página, não necessariamente na ordem lógica da tabela |

## Modelo de dados

| Tabela | Responsabilidade | Chave primária |
| --- | --- | --- |
| `users` | Conta autenticada (e-mail, hash de senha) | `id` |
| `organizations` | Tenant/workspace — unidade de isolamento dos dados | `id` |
| `organization_memberships` | Associação usuário-organização, com papel (`OWNER`/`MEMBER`) | `(user_id, organization_id)` |
| `documents` | Um arquivo enviado e seu status de processamento | `id` |
| `document_chunks` | Um trecho de documento com seu embedding vetorial | `id` |
| `conversations` | Uma thread de chat, presa a um usuário dentro de uma organização | `id` |
| `messages` | Uma mensagem (pergunta ou resposta) de uma conversa | `id` |

O modelo se divide em dois grupos naturais: quem tem acesso a quê (organizações, usuários e a associação entre eles), e o que cada organização produz dentro do sistema (documentos e conversas).

**Identidade e organização**

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERSHIPS : possui
    USERS ||--o{ ORGANIZATION_MEMBERSHIPS : possui

    ORGANIZATIONS {
        uuid id PK
        string name
    }
    USERS {
        uuid id PK
        string email UK
        string password_hash
    }
    ORGANIZATION_MEMBERSHIPS {
        uuid user_id PK,FK
        uuid organization_id PK,FK
        enum role
    }
```

**Documentos e conversas**

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ DOCUMENTS : possui
    ORGANIZATIONS ||--o{ CONVERSATIONS : possui
    USERS |o--o{ DOCUMENTS : envia
    USERS ||--o{ CONVERSATIONS : inicia
    DOCUMENTS ||--o{ DOCUMENT_CHUNKS : gera
    CONVERSATIONS ||--o{ MESSAGES : contém

    DOCUMENTS {
        uuid id PK
        uuid organization_id FK
        uuid uploaded_by FK "nullable"
        string filename
        enum status
        string storage_key "nullable, apagado após o processamento"
        string processing_error "nullable, código estável"
    }
    DOCUMENT_CHUNKS {
        uuid id PK
        uuid document_id FK
        uuid organization_id FK
        vector embedding "1536 dim, índice HNSW"
        int chunk_index
        int page_number "nullable"
    }
    CONVERSATIONS {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
    }
    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        enum role
        text content
        jsonb sources "nullable, snapshot das citações"
    }
```

`ORGANIZATIONS` e `USERS` aparecem de novo neste segundo diagrama só para mostrar como se conectam a `documents` e `conversations` — os campos de cada uma já estão no diagrama anterior. `uploaded_by` é opcional (`SET NULL` se o usuário for removido), por isso a cardinalidade de `users` para `documents` é zero-ou-um, não exatamente um.

Dois detalhes do schema não cabem em nenhum diagrama, mas fazem diferença: `document_chunks` referencia `documents` pela FK composta `(document_id, organization_id)` em vez de só `document_id` — combinada com `UNIQUE(id, organization_id)` em `documents`, isso torna impossível, a nível de banco, um chunk apontar para um documento de outra organização. E `messages.sources` guarda um *snapshot* JSONB da citação (arquivo, página, trecho) no momento da resposta, em vez de uma referência a `document_chunks`: se o documento original for depois excluído, o histórico da conversa continua mostrando o que foi citado.

## RAG: recuperação e geração de respostas

Um documento vira chunks, cada chunk vira um embedding, e os embeddings ficam no PostgreSQL com `pgvector`. Uma pergunta também vira embedding, busca os chunks mais próximos por similaridade, monta o contexto e vai para o modelo, que responde citando quais trechos usou.

| Etapa | Implementação |
| --- | --- |
| Extração | PDF em modo layout, TXT UTF-8 e DOCX |
| Chunking | até 1000 caracteres, sobreposição de 200 |
| Embeddings | `text-embedding-3-small`, 1536 dimensões |
| Persistência | PostgreSQL + pgvector |
| Índice | HNSW, distância de cosseno |
| Recuperação | até 35 candidatos + guardrails de distância |
| Geração | `gpt-5-mini` (configurável via `OPENAI_CHAT_MODEL`) |
| Memória | últimas 6 mensagens não vazias da conversa |

**Grounding e fontes.** O modelo responde em formato estruturado (`answerable`, `answer`, `source_ids`), nunca em texto livre. O backend valida a resposta antes de aceitá-la — todo `source_id` citado precisa existir entre os chunks enviados, e uma resposta `answerable=true` não pode vir vazia — e resolve `filename`, `page_number` e `content` de cada citação a partir do banco: o modelo só escolhe quais fontes usar, nunca preenche os dados delas.

**Memória.** As últimas mensagens da conversa entram no prompt para o modelo entender perguntas de acompanhamento, mas o prompt deixa explícito que esse histórico nunca é evidência — só as fontes recuperadas para a pergunta atual sustentam uma resposta. A busca usa a pergunta como foi recebida, sem reescrevê-la a partir do histórico.

## Processamento assíncrono

Uploads são aceitos pela API e processados fora da requisição. Redis atua como broker e o Celery worker executa parsing, chunking, geração de embeddings e persistência.

| Estado | Significado |
| --- | --- |
| `PENDING` | aguardando processamento |
| `PROCESSING` | worker processando |
| `READY` | indexado e disponível para consulta |
| `FAILED` | processamento terminou com erro |

O worker reivindica um documento por uma janela de tempo (*lease*): se ele morrer no meio do processamento, outro worker pode retomar o documento depois que a lease expira, sem lock distribuído. Falha transitória de embedding volta o documento para `PENDING` e é tentada de novo com backoff; falha permanente marca `FAILED` com um código de erro estável (ver [Modelo de dados](#modelo-de-dados)). Embeddings e persistência acontecem em lotes de 64 chunks, para documentos grandes não crescerem a transação nem a memória de uma vez só — e, como todo esse trabalho roda fora da requisição HTTP, um documento grande nunca bloqueia a API.

## Multi-tenancy e segurança

- JWT carrega só a identidade do usuário; a organização é sempre resolvida no backend a partir da membership, nunca aceita do cliente.
- Toda query tenant-scoped filtra por `organization_id`, incluindo a busca vetorial, que aplica esse filtro antes do ranking por distância.
- Recurso de outra organização, ou inexistente, responde `404`, sem revelar que o ID existe em outro tenant.
- Conversas são isoladas por organização **e** por usuário — nem outro membro da mesma organização enxerga a conversa de um colega.
- Senhas usam hash Argon2 (`pwdlib`).

## Confiabilidade das respostas e tratamento de falhas

| Situação | Comportamento |
| --- | --- |
| Sem evidência suficiente | `answerable=false` |
| OpenAI indisponível / timeout / rate limit | retries com backoff; `503` se persistir |
| Resposta excede limite de tokens | tratada como falha |
| `source_id` inválido na resposta | resposta rejeitada, nova tentativa de geração |
| Upload acima do limite | `413` |
| Arquivo inválido | `422` |
| Falha transitória na ingestão | retry do worker |
| Falha permanente na ingestão | documento `FAILED` |

A saída estruturada do modelo e a validação de `source_ids` (ver [RAG](#rag-recuperação-e-geração-de-respostas)) reduzem respostas sem suporte nos documentos — o histórico da conversa nunca conta como evidência, e o conteúdo dos documentos é tratado como dado não confiável: instruções embutidas em um chunk não têm efeito sobre o comportamento do modelo. Datas e horários que aparecem dentro de uma fonte descrevem o documento ou o evento a que se referem, nunca o momento presente; o sistema não assume que uma data encontrada em um chunk é "hoje".

## Tecnologias

| Camada | Tecnologias principais |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| API | Python, FastAPI, SQLAlchemy, Pydantic |
| Dados | PostgreSQL, pgvector |
| Processamento | Celery, Redis |
| Storage | S3-compatible (Cloudflare R2 em produção, MinIO em desenvolvimento) |
| Modelos | OpenAI |
| Testes | Pytest, Vitest, Testing Library |
| Qualidade | Ruff, Oxlint, TypeScript |
| Infra | Docker Compose, Nginx, GitHub Actions |

## Estrutura do projeto

```
backend/
├── core/          settings, conexão com o banco, segurança (JWT/hash), dependências do FastAPI
├── models/        entidades SQLAlchemy (base, users, organizations, documents, conversations)
├── schemas/       modelos Pydantic de entrada/saída (não são os models do banco)
├── routes/        endpoints HTTP, montados em /api/v1 — finos, delegam a services/
├── services/      regra de negócio: auth, documents, storage, parsing, chunking,
│                  embeddings, ingestion, retrieval, llm_client, chat
├── tasks/         Celery app e a task de ingestão (fina, delega a services/ingestion.py)
├── alembic/       migrations
└── tests/         suíte pytest + fixtures reais (pdf, docx, txt, pdf sem texto)

frontend/src/
├── api/           cliente HTTP e chamadas tipadas (auth, documents, chat)
├── components/
│   ├── acervo/    design system (Button, Field, Dropzone, StatusBadge, ...)
│   ├── auth/      guards de rota (RequireAuth, GuestOnlyRoute) e status de sessão
│   └── workspace/ telas de documentos e chat (colunas, upload, hooks useChat/useDocuments)
├── context/       AuthContext/AuthProvider (sessão, token)
├── i18n/          traduções (en, pt, de)
├── pages/         LoginPage, RegisterPage, WorkspacePage
└── styles/        tokens visuais e fontes do design system
```

## Executando localmente

Pré-requisitos: Docker e Docker Compose.

```bash
cp backend/.env.example backend/.env
# edite backend/.env e preencha JWT_SECRET_KEY, OPENAI_API_KEY e OPENAI_CHAT_MODEL

docker compose up --build
```

A aplicação sobe em `http://localhost:3000`. O Compose orquestra 7 serviços: `db` (Postgres/pgvector), `redis`, `minio`, `migrate` (roda as migrations do Alembic e termina antes dos demais), `api`, `worker` e `frontend` (Nginx servindo o build do Vite e fazendo proxy de `/api/`). Se a porta 5432 do host já estiver em uso, suba com `POSTGRES_PORT=55432 docker compose up --build`.

## Variáveis de ambiente

Definidas em `backend/.env` (veja `backend/.env.example`); o Compose já sobrescreve `DATABASE_URL`, `REDIS_URL` e as variáveis de `STORAGE_*` para apontar para os serviços do próprio Compose, então o `.env` só precisa fornecer o que não tem default de infraestrutura.

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | String de conexão assíncrona com o Postgres (`postgresql+asyncpg://...`) |
| `JWT_SECRET_KEY` | Segredo usado para assinar os tokens de acesso |
| `JWT_ALGORITHM` | Algoritmo do JWT (padrão `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Validade do token de acesso, em minutos (padrão 60) |
| `OPENAI_API_KEY` | Chave da API da OpenAI |
| `OPENAI_CHAT_MODEL` | Modelo de chat usado para gerar respostas |
| `OPENAI_EMBEDDING_MODEL` | Modelo de embeddings (padrão `text-embedding-3-small`) |
| `STORAGE_ENDPOINT_URL` | Endpoint S3-compatible (MinIO local ou um provedor real) |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | Credenciais do storage |
| `STORAGE_BUCKET` | Bucket usado para os arquivos enviados (padrão `documents`) |
| `STORAGE_REGION` | Região do storage (padrão `us-east-1`) |
| `STORAGE_AUTO_CREATE_BUCKET` | Cria o bucket automaticamente se não existir (só para dev) |
| `MAX_UPLOAD_SIZE_MB` | Tamanho máximo de upload, em MB (padrão 10) |
| `REDIS_URL` | URL de conexão do Redis, usada como broker do Celery |

## API

Todos os endpoints ficam sob `/api/v1`. A documentação interativa completa (schemas de entrada/saída, exemplos) está publicada em [`/docs`](https://p01--knowledge-agent-api--2wfdcdcs9r7w.code.run/docs).

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/auth/register` | Cria usuário + organização + retorna token (`201`) |
| `POST` | `/auth/login` | Autentica e retorna token |
| `GET` | `/auth/me` | Usuário e organização autenticados |
| `POST` | `/documents` | Upload de documento, processamento assíncrono (`202`) |
| `GET` | `/documents` | Lista os documentos da organização |
| `GET` | `/documents/{id}` | Detalhe de um documento |
| `DELETE` | `/documents/{id}` | Remove um documento (bloqueado durante processamento) |
| `POST` | `/chat` | Envia uma pergunta, cria ou continua uma conversa |
| `GET` | `/conversations/{id}/messages` | Histórico de mensagens de uma conversa |

## Testes e qualidade

### Backend
215 testes passando, 4 pulados, rodando com Pytest contra um PostgreSQL real com `pgvector`. `ruff check` e `ruff format --check` sem apontamentos.

### Frontend
35 testes passando (Vitest + Testing Library), `tsc --noEmit`, `oxlint` e `vite build` sem erros.

### Avaliação do RAG
`backend/tests/test_retrieval_evaluation.py` é opt-in (`RAG_EVALUATION=1`) e roda contra a API real da OpenAI, validando recuperação, grounding e fontes citadas em casos com respostas esperadas conhecidas.

### CI
O GitHub Actions (`.github/workflows/ci.yml`) valida backend, frontend e as duas imagens Docker a cada push e pull request.

```bash
# backend (com um Postgres _test disponível)
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://app:app@localhost:5432/knowledge_agent_test uv run pytest -q

# frontend
cd frontend
npm run test:run
```

## Deploy

| Componente | Produção |
| --- | --- |
| Frontend | Vercel |
| API FastAPI | Northflank |
| Celery Worker | Northflank |
| Migrations | Northflank |
| PostgreSQL + pgvector | Northflank |
| Redis | Upstash |
| Object Storage | Cloudflare R2 |
| Embeddings / geração | OpenAI |

O frontend chama `/api/*` como se fosse same-origin; o `vercel.json` reescreve essas chamadas para a API no Northflank, então o navegador nunca vê a API como uma origem diferente e não é preciso CORS no FastAPI. Localmente, o Nginx do container `frontend` cumpre esse mesmo papel.
