# Knowledge Agent

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-light.svg">
    <img src="docs/images/logo-dark.svg" alt="Knowledge Agent" width="300">
  </picture>
</p>

<p align="center"><b>Pergunte aos documentos da sua empresa e veja de onde veio cada resposta.</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Redis-FF4438?style=for-the-badge&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/Celery-37814A?style=for-the-badge&logo=celery&logoColor=white" alt="Celery">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
</p>

O Knowledge Agent é uma base de conhecimento para empresas. Cada organização envia seus documentos em PDF, DOCX ou TXT e faz perguntas a um assistente que responde só com o que está nesses arquivos, mostrando o trecho e a página de onde tirou cada informação. Quando os documentos não trazem a resposta, ele diz que não encontrou em vez de inventar.

**Aplicação:** [knowledge-agent-pi-three.vercel.app](https://knowledge-agent-pi-three.vercel.app) · **Documentação da API:** [Swagger](https://p01--knowledge-agent-api--2wfdcdcs9r7w.code.run/docs)

<p align="center">
  <img src="docs/images/banner.jpg" alt="Telas do Knowledge Agent: chat no celular, resposta com fontes no computador e tema escuro" width="100%">
</p>

## Funcionalidades

**Documentos**

- Envio de PDF, DOCX e TXT de até 10 MB, vários de uma vez, pelo botão ou arrastando para a tela.
- Processamento em segundo plano, com o status de cada arquivo atualizado sozinho: na fila, processando, pronto ou falhou (com o motivo).

**Chat**

- Respostas com as fontes ao lado: arquivo, página e o trecho original.
- Memória da conversa para perguntas de acompanhamento, como "e se eu usar meu carro próprio?".
- Resposta no idioma da pergunta, mesmo que os documentos estejam em outra língua.
- Conversa salva: ao recarregar a página, o histórico volta.

**Conta e interface**

- Cada conta tem sua própria organização, e uma organização nunca vê os dados de outra.
- Interface em português, inglês e alemão, com tema claro e escuro e layout adaptado ao celular.

<table>
  <tr>
    <td align="center"><img src="docs/images/screens/login.png" width="280" alt="Login"><br><sub>Login</sub></td>
    <td align="center"><img src="docs/images/screens/documentos-na-fila.png" width="280" alt="Documentos na fila"><br><sub>Documentos na fila</sub></td>
    <td align="center"><img src="docs/images/screens/resposta-com-fontes.png" width="280" alt="Resposta com fontes"><br><sub>Resposta com fontes</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/screens/acompanhamento-e-recusa.png" width="280" alt="Pergunta de acompanhamento e recusa"><br><sub>Acompanhamento e recusa</sub></td>
    <td align="center"><img src="docs/images/screens/interface-em-alemao.png" width="280" alt="Interface em alemão"><br><sub>Interface em alemão</sub></td>
    <td align="center"><img src="docs/images/screens/tema-escuro.png" width="280" alt="Tema escuro"><br><sub>Tema escuro</sub></td>
  </tr>
</table>

## Tecnologias

| Parte | Principais ferramentas |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, i18next |
| **API e worker** | Python 3.13, FastAPI, SQLAlchemy assíncrono, Pydantic, Alembic, Celery, `pypdf`, `python-docx` |
| **Dados** | PostgreSQL 17 com pgvector, Redis como fila, storage compatível com S3 (MinIO local, Cloudflare R2 em produção) |
| **IA** | OpenAI: `text-embedding-3-small` para embeddings e `gpt-5-mini` para as respostas |
| **Qualidade** | Pytest, Vitest, Ruff, Oxlint, GitHub Actions |

Em produção, o frontend roda na Vercel; API, worker e banco no Northflank; o Redis na Upstash.

## Fluxograma

<p align="center">
  <img src="docs/images/fluxograma.png" alt="Fluxograma do Knowledge Agent: navegador, API, Redis, worker, PostgreSQL, storage e OpenAI, com o ciclo de um documento e de uma pergunta" width="100%">
</p>

O frontend só conversa com a API. No upload, a API guarda o arquivo, coloca o documento na fila e responde na hora; o worker extrai o texto, divide em trechos, gera os embeddings e salva tudo no PostgreSQL, apagando o arquivo original no fim. No chat, a própria API busca os trechos mais próximos da pergunta e chama o modelo na mesma requisição.

## Decisões importantes

- **A organização vem sempre do token**, nunca do pedido, e entra como filtro da própria busca vetorial. Recurso de outra organização responde `404`.
- **O modelo só escolhe quais trechos usou.** O texto da citação é montado pelo backend a partir do banco, então a fonte exibida é sempre o conteúdo real do documento.
- **Sem evidência, sem resposta.** Trechos distantes demais da pergunta nem chegam ao modelo, e uma resposta que cita fontes inexistentes é descartada.
- **O conteúdo dos documentos é tratado como dado.** Instruções escritas dentro de um arquivo não mudam o comportamento do assistente.
- **Falhas passageiras não viram erro.** Se a OpenAI cair durante o processamento, o documento volta para a fila e é tentado de novo com espera crescente.
- **Embeddings no próprio PostgreSQL.** Um banco a menos para manter, ao custo de escalar pior do que um banco vetorial dedicado em volumes muito grandes.

## Modelagem de dados

<p align="center">
  <img src="docs/images/modelagem.png" alt="Modelagem de dados do Knowledge Agent" width="100%">
</p>

De um lado ficam usuários, organizações e a associação entre eles; do outro, o que cada organização produz: documentos com seus trechos e conversas com suas mensagens. Cada trecho guarda o embedding de 1536 dimensões e aponta para o documento pela chave composta `(document_id, organization_id)`, o que impede no próprio banco que um trecho fique ligado a outra organização. As citações de cada resposta são copiadas para `messages.sources`, então o histórico continua completo mesmo se o documento for excluído.

## Estrutura do projeto

```
knowledge-agent/
├── docker-compose.yml   # ambiente completo: banco, fila, storage, API, worker e frontend
├── backend/
│   ├── alembic/         # migrações
│   ├── routes/          # rotas HTTP
│   ├── services/        # regras de negócio: ingestão, busca e chat
│   ├── tasks/           # worker Celery
│   └── tests/
└── frontend/
    └── src/             # telas, componentes, chamadas à API e traduções
```

## Como rodar localmente

Você precisa de Docker com Docker Compose e de uma chave da API da OpenAI.

```bash
cp backend/.env.example backend/.env
```

No `backend/.env`, preencha `JWT_SECRET_KEY` (gere com `openssl rand -base64 48`) e `OPENAI_API_KEY`. O resto já vem pronto para o ambiente local. Depois:

```bash
docker compose up --build
```

A aplicação abre em `http://localhost:3000`. As migrações rodam sozinhas antes da API subir. Se a porta 5432 já estiver em uso, use `POSTGRES_PORT=55432 docker compose up --build`.

### Desenvolvimento

Para editar com recarga automática, suba só a infraestrutura no Docker e rode o resto com [uv](https://docs.astral.sh/uv/) e Node.js 24, cada comando em um terminal:

```bash
docker compose up -d db redis minio

# em backend
uv sync && uv run alembic upgrade head
uv run uvicorn main:app --reload
uv run celery -A tasks.celery_app worker --loglevel=info

# em frontend
npm ci && npm run dev
```

O frontend abre em `http://localhost:5173` e o Swagger em `http://localhost:8000/docs`.

### Testes

```bash
# em backend (o banco de testes precisa terminar em _test)
docker compose exec db createdb -U app knowledge_agent_test
TEST_DATABASE_URL=postgresql+asyncpg://app:app@localhost:5432/knowledge_agent_test uv run pytest -q

# em frontend
npm run test:run
```

São 215 testes no backend, rodando contra um PostgreSQL real, e 35 no frontend. Nenhum deles consome créditos da OpenAI. O GitHub Actions roda lint, testes e o build das imagens Docker a cada push.
