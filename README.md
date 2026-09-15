# FazenDados

A dairy-farm operations system built around an AI assistant as the primary
data-entry surface — with a hard rule: **AI-proposed data is never a confirmed
fact until a human confirms it.** It is the V2 of
[sitio-cafezinho](https://github.com/otaviovasc/sitio-cafezinho), a simpler
internal app built for the same family farm.

> Versão em português no final deste arquivo.

## What it is

FazenDados lets the person running a family dairy farm record, query, and
understand the operation — milk production, milking sessions, dairy pickups,
animals and groups, pastures and facilities, feeding, and simple finances —
from an iPhone in the field (also usable on desktop). The assistant accepts
text, audio, images, and documents, interprets them into structured
**proposals**, and only a human **confirmation** turns a proposal into
persisted domain records.

## Why it exists

The farm's facts today live on paper or in memory. The goal is frequent,
trustworthy recording — under a minute from opening the app to confirming a
simple fact — with origin, author, timestamp, and change history for every
record, and visualizations that never mix measurement, estimate, and
inference.

## Key product & engineering ideas

- **AI-assisted entry with human confirmation.** The assistant flow is
  Captura → Proposta → Revisão → Confirmação (capture → proposal → review →
  confirmation). The original input is always preserved; estimates and
  absences are never turned into measurements.
- **Farm-scoped data ownership.** Every operational entity carries `farm_id`,
  resolved from the authenticated session — never from the client payload.
- **Ubiquitous language / DDD.** The domain vocabulary (Farm, Animal, Lot,
  Milking session, Pickup, Proposal, Confirmation…) is canonical and lives in
  [`UBIQUITOUS_LANGUAGE.md`](UBIQUITOUS_LANGUAGE.md), applied consistently in
  code, UI, and docs.
- **Auditability.** Small models, explicit commands, one PostgreSQL
  transaction per use case, and the audit log of each mutation written in the
  same transaction as the changed data. Observability (structured logs,
  metrics, traces) from the first command.
- **Mobile-first.** A flow must work very well on a phone before it earns
  desktop variations.

## Tech overview

- TypeScript end to end, Node.js ≥ 22, pnpm.
- **Backend:** Hono server, PostgreSQL with Drizzle ORM, Zod validation.
- **Frontend:** React 19 + Vite, React Router, Tailwind CSS, Leaflet (farm
  map), Recharts, PWA support for field use.
- **Database:** PostgreSQL via Docker Compose for local development.

## How to run

From the `app/` directory:

```bash
pnpm install
pnpm db:setup   # starts PostgreSQL (Docker), runs migrations and seed
pnpm dev        # api + web together
```

Useful scripts: `pnpm db:reset`, `pnpm typecheck`, `pnpm check`
(typecheck + production build), `pnpm start` (serve the production build).

## Status

V1 in active development. Scope: identity & farm, animals and lots, farm map
(pastures, facilities, occupancies), milk production/milking/pickup, feeding
with derived stock, simple finances, the assistant, search and timelines,
audit, and observability. Explicitly out of V1: planting, mastitis, heat,
weight, reproduction, pedigree/genomics, multi-user collaboration, and any
automation that confirms facts without a person.

More detail: [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md),
[`AGENTS.md`](AGENTS.md).

---

## Versão em português

O FazenDados é um sistema para registrar, consultar e entender a operação de
uma fazenda leiteira familiar, com uso de campo no iPhone e o assistente como
principal porta de entrada de dados. A regra central: **proposta de IA nunca é
fato confirmado sem confirmação humana** — a captura original é preservada e
cada registro tem origem, autor e histórico compreensíveis.

- Dados pertencem à Fazenda: `farm_id` vem da sessão autenticada, nunca do
  cliente.
- Linguagem ubíqua e DDD (`UBIQUITOUS_LANGUAGE.md`), modelos pequenos,
  comandos explícitos, uma transação PostgreSQL por caso de uso, auditoria na
  mesma transação.
- Stack: TypeScript, Hono + PostgreSQL (Drizzle) no backend, React 19 + Vite +
  Tailwind + PWA no frontend, mobile-first.
- Para rodar: `cd app && pnpm install && pnpm db:setup && pnpm dev`.

Status: V1 em desenvolvimento ativo; o escopo e as regras centrais estão em
[`AGENTS.md`](AGENTS.md) e [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md).
