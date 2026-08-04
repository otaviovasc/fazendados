# Padrões de aplicação

## Arquitetura

Adotar monólito modular. Separar por contexto de negócio, mantendo um único
deploy e um único PostgreSQL no V1.

```text
src/
  modules/
    identity/
    herd/
    space/
    milk/
    feeding/
    finance/
    assistant/
  platform/
    database/
    auth/
    observability/
    storage/
  web/
```

Cada módulo contém domínio puro, casos de uso, portas e adaptadores. Rotas
traduzem HTTP; não coordenam regras nem escrevem diretamente no banco.

## Padrão de comando

Cada mutação corresponde a um comando nomeado no vocabulário do produto:
`RegisterAnimal`, `RecordDailyMilkProduction`, `ConfirmAssistantProposal`.

Um handler:

1. recebe `CommandContext` resolvido pela autenticação;
2. valida o input;
3. abre uma transação PostgreSQL;
4. lê dados sempre por `farm_id`;
5. aplica invariantes;
6. persiste a mudança;
7. grava `audit_event` na mesma transação;
8. confirma a transação;
9. executa apenas efeitos externos pós-commit.

```ts
type CommandContext = {
  requestId: string
  operationId: string
  userId: string
  farmId: string
  idempotencyKey?: string
}
```

## Transações

- Uma transação local por comando.
- Não manter transação aberta durante chamada a LLM, storage ou serviço externo.
- Captura/interpretação e Confirmação são comandos separados.
- Usar constraint única como última defesa de idempotência.
- Efeito externo necessário após commit usa outbox somente quando existir um
  consumidor assíncrono real; não criar broker preventivamente.
- Não usar event sourcing no V1.
- Não criar Unit of Work genérica se a biblioteca de banco já expõe transação
  clara e tipada.

## Isolamento por Fazenda

- Resolver `farmId` no servidor a partir da Sessão.
- Proibir `farmId` em DTOs de mutação públicos.
- Repositórios exigem `farmId` em todo método operacional.
- Constraints compostas incluem `farm_id` quando a unicidade é local à Fazenda.
- Foreign keys entre entidades operacionais usam `(farm_id, parent_id)` para
  impedir referências cross-farm no próprio PostgreSQL.
- Testes de integração tentam ler e alterar IDs pertencentes a outra Fazenda.
- Considerar Row Level Security como defesa adicional, não substituta dos
  filtros explícitos.

## Dados e tempo

- IDs opacos e não sequenciais nas APIs.
- Datas civis da operação usam `date`; instantes técnicos usam `timestamptz`.
- Valores monetários usam centavos inteiros e moeda explícita.
- Quantidades usam decimal e unidade explícita.
- Preservar texto/valor bruto quando uma medição nasce de Captura.
- Exclusão física somente para rascunho sem referência; fatos confirmados usam
  cancelamento/inativação com auditoria.

## Concorrência e idempotência

- Exigir `Idempotency-Key` em Confirmações do Assistente e comandos suscetíveis
  a retry de rede.
- Persistir chave, hash do comando e resposta final.
- Mesma chave + mesmo hash retorna a resposta anterior.
- Mesma chave + hash diferente retorna conflito.
- Adicionar controle otimista de versão apenas onde edição concorrente puder
  causar perda real; não versionar todas as tabelas por padrão.

## Erros

Usar códigos estáveis e mensagens humanas:

- `VALIDATION_FAILED`
- `NOT_FOUND`
- `CONFLICT`
- `FORBIDDEN`
- `IDEMPOTENCY_CONFLICT`
- `DEPENDENCY_UNAVAILABLE`
- `INTERNAL_ERROR`

Erros esperados não geram alerta operacional. Falhas inesperadas preservam
`error_id` e `request_id` para suporte, sem vazar detalhes internos.

## Testes

- Domínio: unitários puros para invariantes e cálculos.
- Comandos: integração com PostgreSQL real para transação, constraints,
  idempotência e auditoria.
- HTTP: contrato, autenticação e isolamento entre Fazendas.
- Assistente: fixtures de Captura → Proposta; nunca depender de LLM real para a
  suíte determinística.
- UI: fluxos mobile críticos e estados de falha/retry.
