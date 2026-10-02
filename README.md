# AcessaMetrô API

API REST do AcessaMetrô. Ela centraliza autenticação e acesso a estações,
incidentes e avaliações para os clientes Web e mobile.

## Tecnologias

- Node.js 20 ou superior e TypeScript
- Express 5
- PostgreSQL e Prisma 5
- Zod para validação das requisições
- JWT para autenticação
- Swagger UI para consultar a documentação da API

## Requisitos

- Node.js 20 ou superior
- npm
- PostgreSQL acessível pela máquina ou por uma URL de conexão

## Executar localmente

Abra um terminal nesta pasta (`acessametro-api`) e instale as dependências:

```bash
npm install
```

Crie o arquivo `.env` copiando o modelo:

```powershell
Copy-Item .env.example .env
```

No macOS ou Linux, use `cp .env.example .env`. Edite o `.env` e ajuste os
valores para o seu ambiente:

```env
PORT=3333
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/acessametro"
JWT_SECRET="troque-por-um-segredo-longo-e-aleatorio"
```

Crie o banco indicado em `DATABASE_URL` no PostgreSQL. Em seguida, aplique as
migrações, gere o cliente Prisma e carregue os dados iniciais:

```bash
npx prisma migrate dev
npm run prisma:generate
npm run seed
```

Inicie a API em modo de desenvolvimento:

```bash
npm run dev
```

A API ficará disponível em `http://localhost:3333` (ou na porta definida por
`PORT`). Verifique se está ativa em `http://localhost:3333/api/health`.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Inicia o servidor com reinicialização durante o desenvolvimento. |
| `npm run build` | Gera o Prisma Client e compila TypeScript para `dist/`. |
| `npm start` | Inicia a versão compilada. Execute `npm run build` antes. |
| `npm run prisma:generate` | Gera o Prisma Client a partir do schema. |
| `npm run prisma:migrate` | Executa `prisma migrate dev` para desenvolvimento. |
| `npm run prisma:studio` | Abre a interface do Prisma Studio. |
| `npm run seed` | Cria o usuário administrador e as estações de exemplo. |

## Rotas disponíveis

As rotas que exigem autenticação recebem o token no cabeçalho:

```http
Authorization: Bearer <token>
```

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Público | Verifica se a API está ativa. |
| `POST` | `/api/auth/register` | Público | Registra um usuário. |
| `POST` | `/api/auth/login` | Público | Autentica e retorna um JWT. |
| `GET` | `/api/auth/me` | Autenticado | Retorna o perfil do usuário autenticado. |
| `GET` | `/api/stations` | Público | Lista estações; aceita o parâmetro `search`. |
| `GET` | `/api/stations/:id` | Público | Retorna uma estação com incidentes e avaliações. |
| `GET` | `/api/stations/:id/reviews` | Público | Lista avaliações de uma estação. |
| `POST` | `/api/stations` | Público | Cadastra uma estação. |
| `GET` | `/api/incidents` | Público | Lista incidentes. |
| `POST` | `/api/incidents` | Autenticado | Registra um incidente. |
| `PATCH` | `/api/incidents/:id/status` | Administrador | Altera o status de um incidente. |
| `GET` | `/api/reviews` | Público | Lista avaliações. |
| `POST` | `/api/reviews` | Autenticado | Cria uma avaliação. |
| `GET` | `/api-docs` | Público | Abre a documentação interativa do Swagger. |

Status de incidente aceitos: `PENDING`, `IN_PROGRESS`, `RESOLVED` e `REJECTED`.
Categorias aceitas: `ELEVATOR`, `ESCALATOR`, `ACCESSIBILITY`, `SAFETY` e
`OTHER`.

## Estrutura principal

```text
src/
	app.ts                 Configura Express, middlewares e rotas
	server.ts              Inicia o servidor HTTP local
	config/                Variáveis de ambiente e Swagger
	lib/prisma.ts          Cliente Prisma compartilhado
	middleware/            Autenticação, autorização e tratamento de erros
	routes/                Rotas de autenticação, estações, incidentes e avaliações
prisma/
	schema.prisma          Modelos e enums do banco
	migrations/            Histórico das migrações
	seed.ts                Dados iniciais de desenvolvimento
api/index.ts             Handler usado pela configuração do Vercel
```

## Observações de segurança e deploy

- Não publique o arquivo `.env` nem use o segredo de exemplo em produção.
- O seed contém credenciais de administrador destinadas somente ao ambiente
	local. Troque-as antes de qualquer uso real.
- A configuração para Vercel está incluída, mas ainda precisa ser validada em
	um deploy real. Configure `DATABASE_URL` e `JWT_SECRET` no ambiente do Vercel.
- O Web está no diretório irmão [`acessametro-web`](../acessametro-web/README.md).
	Clientes Web e mobile devem acessar os dados por esta API, nunca diretamente
	pelo PostgreSQL.
