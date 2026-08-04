# Plano do FazenDados V1

## Promessa

Permitir que o agrônomo registre com segurança os fatos leiteiros hoje mantidos
em papel ou memória, confira o entendimento do Assistente e transforme medições
em uma visão confiável da evolução da Fazenda e de cada Animal.

## Resultado esperado

- Registro frequente sem depender de planilhas ou memória.
- Menos de um minuto entre abrir o app e confirmar um fato simples.
- Origem, autor, horário e alterações de cada registro compreensíveis.
- Visualizações úteis sem misturar medição, estimativa e inferência.
- Progresso/regressão da Produção diária visível por períodos comparáveis.
- Desempenho leiteiro individual comparável com período e Cobertura de dados
  explícitos.
- Operação diagnosticável por logs, métricas, traces e auditoria.

## Escopo do V1

### Núcleo

1. Usuário, sessão e Fazenda.
2. Animais, lotes e histórico de lotação.
3. Mapa com pastos, ocupações e instalações.
4. Produção diária, Controle leiteiro e Coleta.
5. Alimentos, entradas, Tratos e saldo derivado.
6. Receitas, Despesas, Liquidações e Resultado de caixa.
7. Assistente com Captura → Proposta → Revisão → Confirmação.
8. Busca, linhas do tempo e visualizações simples.
9. Auditoria e observabilidade desde o primeiro comando.

### Fora do V1

- Plantio e colheita.
- Mastite ou prontuário sanitário.
- Peso e outras medições corporais.
- Cio, cobertura, gestação, parto ou cadastro/análise genética.
- Relações de parentesco entre animais.
- Genealogia, genômica ou cálculo de mérito genético.
- Vários Usuários na mesma Fazenda.
- Diagnóstico, recomendação ou confirmação automática por IA.
- Contabilidade formal, conciliação bancária ou custo econômico completo.
- Acoplamento automático compra → estoque → despesa.
- Liquidação parcial de lançamentos financeiros.

## Guidelines de UX

As decisões de UI/UX foram tomadas por protótipo validado (D-013 encerrada) e
estão registradas em `docs/UI_UX_DECISIONS.md`. Os princípios abaixo continuam
vigentes:

- Uso mobile-first em iPhone, com desktop responsivo.
- Priorizar legibilidade, acessibilidade, baixa carga cognitiva e ações seguras
  no ambiente do sítio; o público tem afinidade tecnológica média/baixa, então a
  linguagem simples é requisito.
- O Assistente é atalho central, não único caminho: todo fato confirmado pode
  ser criado e corrigido por um fluxo manual.
- Revisão segue: origem → contexto → fatos → consequências → confirmação única.
- A pessoa sempre sabe se está vendo Captura, Proposta ou Registro confirmado.
- Não exigir interação precisa ou digitação repetitiva para tarefas frequentes.
- O Mapa da Fazenda facilita localização e manejo; não esconde funções em uma
  metáfora de jogo.
- Loading, vazio, erro+retry, sucesso e alterações não salvas são estados
  obrigatórios em todo fluxo principal.

## Sequência de entrega

### Marco 0 — Contrato do domínio leiteiro

- Fechar decisões pendentes em `docs/DECISIONS.md`. **Concluído:** modelo
  leiteiro (D-018 a D-022), financeiro (D-029), mapa (D-030) e identidade do
  Animal (D-025) confirmados.
- Definir contratos de dados e critérios comparáveis dos três fluxos leiteiros.
- Validar exemplos reais do caderno e as consultas que apoiarão decisões.

### Marco 1 — Fundação

- Criar monólito modular, PostgreSQL, migrations e ambientes.
- Implementar Usuário, Fazenda, sessão e isolamento por `farm_id`.
- Implementar envelope de comando, erros tipados, auditoria, logs, métricas e
  traces.

**Status:** stack decidida (D-031) e backend já implementado em `fazendados/app`
— monólito Hono + PostgreSQL + Drizzle, frontend Vite + React 19 + Tailwind,
Docker (docker-compose: db `postgres:17` + app), auth por senha (`APP_PASSWORD`)
com sessão em cookie, seed manipulável (`pnpm db:seed`). O plano de execução da
implementação está em `docs/IMPLEMENTATION_PLAN.md`.

### Marco 2 — Rebanho mínimo

- Animais, lotes e Lotação datada.

### Marco 3 — Núcleo leiteiro manual

- Produção diária, Controle leiteiro, Medições individuais e Coleta.
- Correção auditada e consultas factuais por período.

### Marco 4 — Análise produtiva

- Evolução agregada, desempenho individual e Cobertura de dados.
- Cálculos reproduzíveis sem transformar ausência em zero.

### Marco 5 — Assistente

- Captura por texto primeiro; áudio e imagem entram sobre o mesmo pipeline.
- Revisão, correção e Confirmação idempotente.

### Marco 6 — Mapa

- Limite da Fazenda, Pastos, Instalações e Ocupação temporal.
- Interface decidida (D-030): visualizar, mover Lote entre Pastos e
  desenhar/editar polígonos de Pastos e pontos de Instalações sobre satélite.
- Geometria migra de JSONB para PostGIS neste marco (D-016/D-031).

### Marco 7 — Trato e estoque

- Catálogo de Alimentos, Entradas, Tratos e saldo derivado.
- Alertas factuais de saldo sem bloquear registro real.

### Marco 8 — Financeiro

- Receitas, Despesas e Liquidações.
- Resultado de caixa e vínculos explícitos com compras/coletas quando aplicável.

### Marco 9 — Migração e piloto

- Mapear dados válidos do MVP antigo para a nova ontologia.
- Migrar com relatório de aceitos, pendentes e rejeitados; nunca completar
  lacunas por inferência.
- Rodar piloto com dados reais, medir tempo de registro e corrigir atritos.

O detalhamento de dados, comandos, observabilidade e critérios de saída está em
`docs/DELIVERY_PLAN.md`.

## Métricas de produto

- Tempo mediano Captura → Confirmação.
- Percentual de Propostas confirmadas sem correção e com correção.
- Taxa de abandono por etapa da Revisão.
- Registros confirmados por semana, por tipo.
- Tempo para localizar um Registro ou histórico de Animal.
- Erros e retries por comando, separados de rejeições de validação.
- Percentual de dias com Produção diária registrada.
- Percentual de Animais elegíveis cobertos por cada Controle leiteiro.
- Percentual de comparações individuais que atingem a cobertura mínima definida.

## Critério de pronto do V1

O V1 está pronto quando os fluxos principais funcionarem com dados reais,
isolamento entre Fazendas for comprovado, toda mutação relevante possuir
auditoria, as metas de UX forem medidas em celular e a migração puder ser
executada e revertida de forma reproduzível.
