# Logs, auditoria e observabilidade

## Objetivos

1. Responder rapidamente “o que falhou, para quem, onde e por quê”.
2. Reconstruir toda mutação relevante sem tratar logs como fonte oficial.
3. Medir fluidez dos fluxos sem registrar conteúdo sensível.
4. Diferenciar rejeição válida, falha de dependência e defeito interno.

## Três trilhas distintas

| Trilha | Finalidade | Persistência |
| --- | --- | --- |
| Log técnico | Diagnóstico de execução | Plataforma de logs |
| Audit event | Histórico imutável de mutação | PostgreSQL, mesma transação |
| Métrica/trace | Saúde, latência e jornada | Backend OpenTelemetry |

Um log técnico pode expirar. Um `audit_event` continua vinculado ao fato do
negócio. Nenhum dos dois substitui a tabela de domínio.

## Envelope padrão de log

Todos os logs são JSON e carregam, quando disponíveis:

```json
{
  "timestamp": "2026-08-04T12:00:00.000Z",
  "level": "info",
  "service": "fazendados-api",
  "environment": "production",
  "event": "command.completed",
  "message": "RecordDailyMilkProduction completed",
  "request_id": "req_...",
  "trace_id": "...",
  "operation_id": "op_...",
  "command": "RecordDailyMilkProduction",
  "user_id": "usr_...",
  "farm_id": "frm_...",
  "entity_type": "daily_milk_production",
  "entity_id": "dmp_...",
  "outcome": "success",
  "duration_ms": 84
}
```

`event` é estável e pesquisável; `message` é legível. Nunca depender de parsing
da mensagem para dashboards.

## Eventos técnicos mínimos

- `http.request.completed`
- `command.started`
- `command.completed`
- `command.rejected`
- `command.failed`
- `transaction.rolled_back`
- `dependency.call.completed`
- `assistant.interpretation.completed`
- `assistant.confirmation.completed`
- `job.completed`
- `security.cross_farm_access_denied`

Não emitir um log por linha de banco nem duplicar o mesmo erro em todas as
camadas. A borda do comando é dona do evento final.

## Auditoria

`audit_events` contém:

- `id`, `occurred_at`, `farm_id`, `actor_type` e `actor_user_id` nullable para
  operações de sistema/migração;
- `operation_id`, `action`;
- `entity_type`, `entity_id`;
- `before_version`, `after_version` quando aplicável;
- `changed_fields` e `metadata` mínimos;
- origem `manual`, `assistant_confirmation`, `migration` ou `system`.

Gravar auditoria na mesma transação da mudança. Não armazenar senha, token,
conteúdo binário, prompt de sistema ou documento integral. Valores brutos
necessários ao domínio permanecem nas tabelas próprias com política de acesso.

## Assistente

Medir cada etapa separadamente:

- duração e resultado de upload/transcrição/interpretação;
- provider e versão do modelo;
- tokens e custo quando disponíveis;
- tipos e quantidade de Propostas;
- issues de validação por código;
- correções humanas por campo, sem enviar o valor sensível para métricas;
- tempo Captura → Confirmação;
- idempotência e IDs dos Registros gerados.

Não registrar áudio, imagem, documento, texto integral da Captura ou resposta
integral do modelo no stream geral de logs.

## Métricas

### RED técnico

- taxa de requests/comandos;
- taxa de erros por código e comando;
- duração p50/p95/p99 por comando e dependência.

### Banco e infraestrutura

- conexões usadas/espera;
- duração e rollback de transações;
- queries lentas;
- fila e idade de jobs/outbox, se existirem;
- erros e latência do storage e do LLM.

### Produto

- Capturas, Propostas e Confirmações por tipo;
- taxa de correção e abandono da Revisão;
- tempo mediano e p95 até Confirmação;
- retries e duplicatas evitadas por idempotência.

Evitar cardinalidade ilimitada: IDs aparecem em logs/traces, não como labels de
métrica.

## Tracing

Instrumentar com OpenTelemetry desde HTTP até PostgreSQL e dependências. Criar
spans explícitos para comando, transação, interpretação e Confirmação. Propagar
`trace_id`, `request_id` e `operation_id`.

## Alertas iniciais

- aumento sustentado de `INTERNAL_ERROR`;
- p95 de comandos críticos acima do orçamento definido;
- indisponibilidade de PostgreSQL, storage ou autenticação;
- falha elevada do pipeline do Assistente;
- qualquer acesso negado entre Fazendas;
- ausência completa de telemetria em produção.

Rejeições de validação do usuário viram métrica de UX, não pager.

## Privacidade e segurança

- Redação central de chaves sensíveis.
- Allowlist de campos logáveis, não blocklist.
- Acesso a logs e auditoria por menor privilégio.
- Ambientes não compartilham datasets de telemetria.
- Retenção e anonimização serão fechadas antes do piloto real.
