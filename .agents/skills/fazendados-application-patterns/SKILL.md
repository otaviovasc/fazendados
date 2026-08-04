---
name: fazendados-application-patterns
description: Implementar ou revisar casos de uso, transações PostgreSQL, isolamento por Fazenda, idempotência, erros, auditoria, logs, métricas e tracing do FazenDados. Usar em rotas, comandos, repositórios, jobs, integrações, autenticação e persistência.
---

# Padrões de aplicação do FazenDados

Ler `../../../docs/APPLICATION_PATTERNS.md`,
`../../../docs/OBSERVABILITY.md`, `../../../docs/DATA_MODEL.md` e
`../../../docs/DECISIONS.md`.

Para cada mutação:

1. Nomear um comando no vocabulário do domínio.
2. Resolver `userId` e `farmId` pela Sessão; nunca confiar no payload.
3. Validar antes de abrir a transação quando não houver leitura consistente.
4. Executar leitura, regra, escrita e `audit_event` em uma transação curta.
5. Tornar Confirmações do Assistente e operações com retry idempotentes.
6. Executar LLM, storage e outras dependências fora da transação.
7. Emitir um resultado estruturado na borda do comando, sem logs duplicados.
8. Propagar `request_id`, `operation_id` e `trace_id`.
9. Não registrar payload sensível nem IDs como labels de métrica.
10. Cobrir sucesso, rejeição, rollback, retry e acesso entre Fazendas em testes.

Preferir monólito modular e comunicação síncrona interna. Adicionar outbox,
fila ou controle otimista somente diante de uma necessidade concreta.

