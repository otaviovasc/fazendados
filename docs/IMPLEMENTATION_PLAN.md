# Plano de implementação — V1

Plano definitivo de execução para o swarm de implementação. Reflete o estado
atual do repositório: o protótipo está aprovado (decisões em
`docs/UI_UX_DECISIONS.md` e `docs/DECISIONS.md`) e o backend já existe.

## Estado atual

**Já existe (não reconstruir):**

- Backend completo em `fazendados/app`: monólito Hono + PostgreSQL + Drizzle,
  22 tabelas, `/api/bootstrap` (carga inicial) e `/api/commands` (mutações com
  idempotência e auditoria transacional), auth por senha (`APP_PASSWORD`) com
  sessão em cookie, seed manipulável (`pnpm db:seed`) e `docker-compose.yml`
  somente para o banco PostGIS 17 (`fazendados-db`). A API e o frontend rodam
  por comandos no terminal.
- Frontend do protótipo (`fazendados/app/src`): os 8 módulos navegáveis
  (`inicio`, `rebanho`, `leite`, `mapa`, `estoque`, `financeiro`, `assistente`,
  `analise`) com a UX aprovada, hoje alimentados por mocks
  (`src/mocks/data.ts`) e store local (`src/state/store.tsx`).

**Não tocar:** o modelo de dados e os comandos do backend já refletem as
decisões locked (produção diária única, sessão Lote+data+turno, litros/dia
derivado). Divergência encontrada durante o rewiring é bug a reportar, não
decisão a improvisar.

## W1 — Rewiring do frontend à API

Substituir mocks pela API real, mantendo a UX aprovada.

Arquivos-alvo:

- `src/state/store.tsx` — tornar API-backed: estado inicial via `/api/bootstrap`;
  mutações via `/api/commands` com chave de idempotência por operação.
- `src/mocks/data.ts` — remover após o rewiring (manter apenas o que o seed
  cobre; o dado de demonstração passa a vir de `pnpm db:seed`).
- `src/server/auth.ts` (contrato) + tela de login — autenticação por senha com
  sessão em cookie; rota protegida e redirecionamento.
- Fila de comandos no cliente: envio serializado, retry com a mesma chave de
  idempotência, erro tipado com retry manual.
- `CorrectOperationalFact` — fluxo **data-only**: correção edita fatos, nunca
  entidades de cadastro; motivo obrigatório e antes/depois no histórico (D-026).
- Adaptações de domínio no frontend: assistente (Revisão conforme D-023/D-024) e
  leite (sessão por Lote+data+turno, produção diária única) alinhados aos
  comandos reais.

Critérios de aceite:

- Nenhum módulo importa `src/mocks/data.ts` (`grep -r "mocks/data" src/` vazio
  fora do seed).
- Recarregar a página preserva os dados (persistência real, não estado local).
- Repetir uma mutação após falha de rede não duplica fatos.
- Sessão expirada leva ao login; `farm_id` nunca vem do cliente.

Verificação:

```bash
pnpm typecheck
pnpm build
pnpm db:setup
pnpm dev
curl -s -c /tmp/fd.jar -X POST localhost:3001/api/login -d '{"password":"..."}' -H 'content-type: application/json'
curl -s -b /tmp/fd.jar localhost:3001/api/bootstrap | head -c 400
curl -s -b /tmp/fd.jar -X POST localhost:3001/api/commands -H 'content-type: application/json' \
  -d '{"idempotencyKey":"smoke-1","command":"RecordDailyMilkProduction","payload":{"date":"2026-08-04","liters":312.5}}'
```

## W2 — Polimento de UI/UX

Prioridades: controle individual (cartão do dia) e matching na Revisão.

Arquivos-alvo:

- `src/modules/leite/` — cartão do dia por Lote com colunas manhã/tarde; lacuna
  em linguagem simples com resolução em um toque; ausência nunca vira zero;
  litros com 1 casa decimal.
- `src/modules/assistente/` — confirmação única, ack gating (média/baixa
  bloqueia; alta pré-aceita), selo “editado por você” com valor original
  tachado, queue mode com toast compacto, matching fuzzy (nome/brinco,
  caixa/acentos) com vínculo em um toque e cadastro inline; linha sem vínculo
  bloqueia a Confirmação.
- Todos os módulos — estados obrigatórios (loading, vazio, erro+retry, sucesso,
  alterações não salvas) em cada fluxo principal.
- Checagem responsiva em 390px e desktop; bottom-bar no mobile, sidebar no
  desktop; números tabulares; âmbar só em Revisões.

Critérios de aceite:

- Checklist de `docs/UI_UX_DECISIONS.md` verificado item a item.
- Todo fluxo principal demonstra os cinco estados obrigatórios.
- Nenhuma regressão visual em 390px.

Verificação:

```bash
pnpm typecheck && pnpm build
# smoke manual: controle de um dia completo (2 turnos, lacuna resolvida em 1 toque)
# e importação de caderno pelo assistente com 1 rótulo não reconhecido
```

## W3 — Verificação E2E

Critérios de aceite:

- `pnpm db:reset` recria o banco Docker, `pnpm db:seed` é reexecutável e
  `pnpm dev` sobe API e frontend no terminal.
- Smoke de todos os fluxos: login → bootstrap → produção diária → controle (2
  turnos) → coleta → trato → financeiro (previsto/liquidado) → correção com
  motivo → assistente (captura → revisão → confirmação) → auditoria visível.
- Auditoria de terminologia: `grep -rn "Fazenda[D]ados" fazendados`
  sem ocorrências fora de código legado intencional; termos fora do V1 (peso,
  cio, mastite, plantio, reprodução, parentesco, lucro, liquidação parcial)
  ausentes da UI.

Verificação:

```bash
pnpm db:reset
pnpm dev
curl -s localhost:3001/api/ready
grep -rn "Fazenda[D]ados" . --exclude-dir=node_modules --exclude-dir=.git
```

## W4 — Marcos seguintes do DELIVERY_PLAN

Na ordem, após W1–W3 estáveis:

1. **Mapa real** (Marco 6): perímetro oficial, desenho/edição de polígonos de
   Pastos e pontos de Instalações persistidos, mover Lote entre Pastos (1:1 por
   vez, D-028), Leaflet + satélite ESRI. O seed real do sitio-cafezinho traz o
   perímetro e 14 Pastos; Instalações e Ocupações ficam para registro manual.
2. **PostGIS**: concluído na migration `0001_postgis_real_map`, convertendo
   JSONB para `geometry` com SRID 4326, validação e índices GiST; GeoJSON fica
   só no transporte.
3. **Assistente real**: concluído com endpoint autenticado que chama OpenRouter
   via Chat Completions fora da transação, injeta contexto de rótulos da
   Fazenda, valida intents com schema, tenta reparar JSON inválido e converte
   ações múltiplas em Propostas. O contrato Captura → Proposta → Revisão →
   Confirmação permanece, assim como a Captura imutável, confiança por campo e
   execução pelos comandos existentes.

## Regras do swarm

- Uma wave só começa com a anterior verde (typecheck + build + smoke).
- Mudança de domínio exige atualizar `UBIQUITOUS_LANGUAGE.md`,
  `docs/ONTOLOGY.md` e `docs/DECISIONS.md` no mesmo PR.
- Funcionalidade fora do escopo (D-032) não entra sem nova decisão registrada.
- `pnpm typecheck` e `pnpm build` limpos são condição de qualquer entrega.
