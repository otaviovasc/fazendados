# Plano de construção da V1

## 1. Objetivo

Construir o FazenDados como um produto greenfield para transformar os registros produtivos
de uma fazenda, hoje mantidos em papel e memória, em fatos confiáveis, corrigíveis e
analisáveis.

A primeira prova de valor é leiteira:

1. registrar produção total do dia;
2. registrar produção individual por animal;
3. registrar coleta do laticínio;
4. comparar evolução da fazenda e desempenho dos animais com contexto suficiente para uma
   decisão humana.

Mapa, trato/estoque e financeiro pertencem à V1, mas entram depois que esse fluxo estiver
confiável de ponta a ponta.

## 2. Restrições e decisões vigentes

- Sistema novo; o MVP é fonte de aprendizado, não base arquitetural obrigatória.
- Um usuário pertence a uma fazenda na V1.
- A fazenda é proprietária de todos os dados operacionais.
- Arquitetura inicial: monólito modular com PostgreSQL.
- Um comando de negócio executa uma transação atômica.
- Auditoria é gravada na mesma transação do fato de negócio.
- A IA propõe dados tipados; somente confirmação explícita grava fatos.
- Registros produtivos confirmados não são apagados silenciosamente. Correções preservam
  autoria, motivo e histórico.
- Genealogia, genômica, parentesco, reprodução, cio, mastite, peso e plantio estão fora do
  escopo atual.
- Stack decidida (D-031): monólito Hono + PostgreSQL + Drizzle; frontend Vite + React 19 +
  Tailwind; Docker (docker-compose: db `postgres:17` + app); auth por senha (`APP_PASSWORD`)
  com sessão em cookie; seed manipulável (`pnpm db:seed`).
- Backend já implementado em `fazendados/app` (22 tabelas, `/api/bootstrap` e
  `/api/commands` com idempotência e auditoria transacional).
- As decisões de interface foram tomadas por protótipo validado e estão em
  `docs/UI_UX_DECISIONS.md`; a execução segue `docs/IMPLEMENTATION_PLAN.md`.

## 3. Princípios de execução

### 3.1 Fatos antes de dashboards

Uma visualização só entra quando os fatos, unidades, regras temporais, correções e cobertura
que a sustentam estiverem definidos e testados.

### 3.2 Fluxos verticais pequenos

Cada marco entrega captura, validação, persistência, auditoria, consulta, observabilidade e
teste de um caso real. Não haverá uma longa fase de infraestrutura desconectada do uso.

### 3.3 Manual antes de assistido

Cada fato deve poder ser registrado e corrigido sem IA. O assistente reutiliza os mesmos
comandos da aplicação e não possui uma rota paralela para escrever no banco.

### 3.4 Simplicidade explícita

- Identificadores opacos e estáveis.
- Dinheiro em centavos e moeda explícita.
- Quantidades com unidade e precisão definidas.
- Datas operacionais separadas de timestamps técnicos.
- Estados pequenos e enumerados.
- Restrições importantes aplicadas também no banco.
- Dados derivados calculados; não duplicados sem necessidade comprovada.

## 4. Caminho do sitio-cafezinho para o FazenDados

O FazenDados é baseado no conhecimento obtido com o MVP, não na sua forma
atual. O caminho é uma substituição controlada:

1. **Inventariar:** identificar fluxos usados, linguagem real, regras válidas e
   dados que existem no `sitio-cafezinho`.
2. **Classificar:** para cada capacidade e conjunto de dados, decidir entre
   preservar o significado, redesenhar, arquivar fora do escopo ou rejeitar.
3. **Modelar novamente:** implementar o significado preservado sobre a nova
   ontologia, sempre com Fazenda, comandos explícitos, transações, auditoria e
   observabilidade.
4. **Entregar verticalmente:** fechar primeiro Rebanho + núcleo leiteiro +
   análise; adicionar o Assistente sobre esses comandos; depois Mapa, Trato e
   Financeiro.
5. **Migrar com evidência:** importar apenas linhas com correspondência
   inequívoca. Casos ambíguos aguardam revisão; dados removidos ficam em arquivo
   histórico; lacunas nunca são inventadas.
6. **Pilotar e substituir:** operar a V1 com dados reais, reconciliar resultados
   e somente então encerrar o uso operacional do MVP.

### O que é herdado

- a necessidade real dos usuários;
- exemplos e vocabulário do campo;
- dados históricos que passem pelas regras de migração;
- regras de negócio confirmadas;
- aprendizados sobre atrito, erros e funcionalidades sem valor.

### O que não é herdado automaticamente

- tabelas, rotas, componentes ou arquitetura;
- campos sem uso ou significado comprovado;
- timestamps tratados como se fossem auditoria;
- acoplamentos entre domínios;
- interpretações flexíveis da IA gravadas como fatos;
- funcionalidades fora do escopo da V1.

### Tradução dos domínios

| No MVP | No FazenDados V1 |
| --- | --- |
| Cadastro amplo de Animal | Identidade mínima e estado operacional |
| Grupo atual | Lote + Lotação datada |
| Localização atual | Ocupação temporal do Lote no Pasto |
| Mapa | Geometrias oficiais sobre uma camada de imagem de satélite |
| Registros leiteiros misturados | Produção diária, Controle e Coleta independentes |
| Ações flexíveis da IA | Captura → Proposta tipada → Revisão → Confirmação |
| Estoque editável | Saldo derivado de movimentos |
| Financeiro genérico | Caixa simples com fatos auditáveis |
| Plantio, mastite, cio e parentesco | Arquivo histórico, fora do produto operacional |

## 5. Guidelines de UX

As decisões de UI/UX foram tomadas por protótipo validado (D-013 encerrada) e estão
registradas em `docs/UI_UX_DECISIONS.md`: mobile-first iPhone com desktop responsivo,
navegação bottom-bar/sidebar, direção visual definida, regras da Revisão e estados
obrigatórios. Os princípios abaixo continuam vigentes:

- Projetar para uso competente em iPhone e desktop.
- Minimizar digitação repetitiva e permitir lançamentos em sequência.
- Preservar a entrada do usuário diante de erro, perda de sessão ou falha de rede.
- Tornar unidade, data operacional, animal e status de confirmação inequívocos.
- Permitir revisão e correção sem esconder o valor anterior.
- Diferenciar claramente Captura, Proposta e Registro confirmado.
- Não apresentar inferência como fato nem comparação como recomendação automática.
- Exibir período, amostra e cobertura junto de qualquer comparação produtiva.
- Usar linguagem do sítio; o público tem afinidade tecnológica média/baixa e a
  simplicidade é requisito.
- Atender acessibilidade, áreas de toque adequadas e legibilidade em ambiente externo.
- Loading, vazio, erro+retry, sucesso e alterações não salvas são estados obrigatórios
  em todo fluxo principal.
- Validar o comportamento em conectividade real antes de decidir uma estratégia offline.

## 6. Modelo operacional mínimo

### 5.1 Contexto e identidade

- `User`
- `Farm`
- vínculo `UserFarm`, mantido mesmo que a V1 limite uma associação
- `CommandContext`: usuário, fazenda, origem, correlação e chave de idempotência

### 5.2 Rebanho

- `Animal` — identidade mínima no V1: nome/brinco + status (ativo/arquivado)
- `HerdGroup` — inclui `milkingsPerDay` (1 ou 2 ordenhas/dia)
- `AnimalGroupAssignment`, com vigência temporal

O cadastro inicial do animal contém apenas identificação e status. Novos campos só entram
ligados a uma regra, consulta ou decisão real.

### 5.3 Produção leiteira

- `DailyMilkProduction`: volume único produzido pela Fazenda em uma data operacional,
  sem turno e sem escopo de Lote; no máximo um por data
- `MilkControlSession`: sessão de controle individual por Lote + data + turno
  (manhã, tarde ou única); no máximo uma por combinação
- `IndividualMilkMeasurement`: litros daquela ordenha (1 casa decimal) de um animal
  dentro da sessão
- litros/dia: métrica derivada (soma das ordenhas do animal na data), nunca persistida
  como medição; cobertura = dias medidos / dias com controle no período
- `MilkCollection`: volume e horário de cada retirada do laticínio; aviso de possível
  duplicata, sem fusão automática

Produção diária, soma dos controles individuais e coleta são fatos distintos. Eles não
devem ser forçados a coincidir: podem representar horários, subconjuntos e perdas
diferentes.

### 5.4 Assistente

- `AssistantCapture`
- `AssistantInterpretation`
- `AssistantProposal`
- vínculo entre proposta e cada fato confirmado

### 5.5 Espaço

- `FarmBoundary`
- `Pasture`
- `Installation`
- `HerdGroupOccupancy`

### 5.6 Alimentação e estoque

- `FeedItem`
- `FeedMovement`
- `FeedingEvent`

### 5.7 Financeiro

- `FinancialEntry` — estados previsto e liquidado, sem liquidação parcial
- `Settlement`
- `Counterparty`
- referência opcional ao fato operacional originador (sem acoplamento automático
  compra → estoque → despesa no V1)

## 7. Contrato das análises leiteiras

As análises são projeções derivadas, não rankings persistidos.

Toda comparação entre animais deve informar:

- período inicial e final;
- unidade (litros/dia);
- número de dias com controle no período;
- número de dias medidos;
- cobertura de dados (dias medidos / dias com controle);
- média, total e tendência calculada;
- filtros aplicados;
- versão da regra de cálculo.

Não preencher dias ausentes com zero. "Sem medição" é diferente de "produção zero".

O sistema pode ordenar animais por uma métrica escolhida pelo usuário, mas não deve rotular
automaticamente "melhor", "pior", "descartar" ou "manter". Também não pode converter
desempenho leiteiro em conclusão genética.

## 8. Padrão de comandos e transações

Cada caso de uso segue:

1. autenticar usuário e resolver fazenda;
2. validar chave de idempotência;
3. carregar somente os dados necessários;
4. verificar escopo da fazenda e invariantes;
5. gravar fato e auditoria em uma única transação;
6. confirmar a transação;
7. publicar efeitos externos de forma recuperável após o commit.

Comandos iniciais:

- `RegisterAnimal`
- `UpdateAnimalIdentification`
- `ArchiveAnimal`
- `CreateHerdGroup`
- `AssignAnimalToGroup`
- `RecordDailyMilkProduction`
- `StartMilkControlSession`
- `RecordIndividualMilkMeasurement`
- `CompleteMilkControlSession`
- `RecordMilkCollection`
- `CorrectOperationalFact`
- `CreateAssistantCapture`
- `InterpretAssistantCapture`
- `ConfirmAssistantProposal`
- `DismissAssistantProposal`
- `SetFarmBoundary`
- `RegisterPasture`
- `RegisterInstallation`
- `MoveHerdGroup`
- `RegisterFeedItem`
- `RecordFeedMovement`
- `RecordFeedingEvent`
- `RecordFinancialEntry`
- `SettleFinancialEntry`
- `CancelFinancialEntry`

Repetir um comando com a mesma chave de idempotência e o mesmo conteúdo devolve o mesmo
resultado. A mesma chave com conteúdo diferente é rejeitada e observada como conflito.

## 9. Marcos de entrega

### Marco 0 — contrato do domínio leiteiro

**Objetivo:** eliminar ambiguidades antes de codificar os fatos centrais.

Entregas:

- glossário validado com o agrônomo;
- definição de data operacional, horários, turnos, unidades e precisão;
- regras para animal ativo/inativo e elegível ao controle;
- relação semântica entre produção total, controle individual e coleta;
- política de correção e divergência;
- exemplos reais anonimizados de pelo menos 30 dias de caderno;
- consultas de decisão descritas com exemplos de saída.

Critério de saída:

- o mesmo exemplo de caderno é interpretado da mesma forma por produto, domínio e
  implementação;
- nenhuma análise depende de um campo sem origem definida.

### Marco 1 — fundação executável

**Objetivo:** provar isolamento, transação, auditoria e observabilidade com um fato simples.

Entregas:

- repositório e pipeline de integração;
- aplicação modular e banco versionado por migrations;
- autenticação, resolução de fazenda e isolamento em todas as consultas;
- `CommandContext`, idempotência e envelope de erro;
- audit trail transacional;
- logs estruturados, métricas, traces e correlação;
- política de backup, restauração e retenção;
- primeiro tracer bullet com criação da fazenda e cadastro de animal.

Critério de saída:

- teste automatizado prova que um usuário não acessa dados de outra fazenda;
- repetição de comando não duplica fatos;
- fato e auditoria confirmam ou revertem juntos;
- uma requisição pode ser seguida do início ao commit pelos sinais de observabilidade;
- restauração do banco é ensaiada.

### Marco 2 — rebanho mínimo

**Objetivo:** manter a identidade operacional dos animais sem inflar o cadastro.

Entregas:

- registro, alteração de identificação e arquivamento de animal;
- grupos de rebanho e histórico de alocação;
- busca por identificadores usados no campo;
- regras de unicidade por fazenda;
- histórico suficiente para interpretar controles antigos.

Critério de saída:

- um animal arquivado continua presente em fatos históricos;
- mudança de grupo não reescreve o passado;
- identificadores ambíguos produzem erro tratável, nunca associação silenciosa.

### Marco 3 — núcleo leiteiro manual

**Objetivo:** substituir o caderno para os três registros prioritários.

Entregas:

- produção diária única da Fazenda (um valor por data);
- sessões de controle por Lote + data + turno e medidas individuais;
- coleta do laticínio;
- correção auditada;
- importação assistida de dados iniciais em formato tabular, se necessária;
- consultas diárias e por período;
- reconciliação informativa entre fatos, sem exigir igualdade.

Critério de saída:

- agrônomo registra e corrige um dia completo sem IA;
- nenhum lançamento confirmado desaparece;
- duplicidades operacionais são impedidas ou explicitamente resolvidas;
- produção ausente não é interpretada como zero;
- divergências exibem fatos e contexto, sem inventar explicação.

### Marco 4 — análise produtiva

**Objetivo:** entregar a primeira decisão apoiada por dados.

Entregas:

- evolução da produção total;
- evolução individual;
- comparação entre animais por período e métrica;
- cobertura e qualidade dos dados;
- explicação da fórmula e filtros;
- exportação dos fatos e resultados derivados.

Critério de saída:

- todos os valores apresentados são reproduzíveis a partir dos fatos;
- período, amostra e cobertura acompanham toda comparação;
- testes cobrem dias ausentes, animal arquivado, mudança de grupo e correções;
- nenhuma saída afirma mérito genético ou recomenda descarte.

### Marco 5 — assistente de registro

**Objetivo:** reduzir esforço de lançamento sem reduzir confiança.

Ordem de entrada:

1. texto;
2. áudio;
3. imagem de papel, somente após medir a qualidade necessária.

Entregas:

- captura imutável;
- interpretação tipada e versionada;
- proposta revisável;
- confirmação explícita;
- execução pelos mesmos comandos manuais;
- confiança por campo e pedido de esclarecimento para ambiguidades;
- vínculo auditável da captura aos fatos gerados;
- proteção contra replay e confirmação duplicada.

Critério de saída:

- nenhum modelo de IA escreve diretamente em tabela de negócio;
- falha do provedor não perde a captura;
- uma confirmação produz exatamente o conjunto revisado de fatos;
- custo, latência, taxa de correção e taxa de abandono são medidos;
- o fluxo manual continua funcional.

### Marco 6 — mapa operacional

**Objetivo:** representar o espaço da fazenda e a localização operacional do rebanho.

Entregas:

- limite da fazenda;
- pastos e instalações como geometrias distintas;
- imagem de satélite como camada cartográfica de referência;
- ocupação temporal de Lote em Pasto;
- validação geométrica e isolamento por fazenda;
- histórico de alterações espaciais.

Critério de saída:

- geometrias inválidas são rejeitadas com causa;
- movimentação atual não apaga ocupações anteriores;
- consultas espaciais possuem limites e métricas de custo;
- o modelo não exige localização individual de cada animal.

### Marco 7 — trato e estoque

**Objetivo:** relacionar alimentação planejada, realizada e disponibilidade.

Entregas:

- itens de alimentação e unidades;
- entradas, saídas e ajustes de estoque;
- trato realizado por grupo;
- vínculo opcional entre compra financeira e entrada de estoque;
- saldo derivado de movimentos.

Critério de saída:

- nenhuma edição direta de saldo;
- ajuste exige motivo e autoria;
- unidades incompatíveis não são somadas;
- fato financeiro e fato de estoque podem reconciliar sem serem a mesma entidade.

### Marco 8 — financeiro essencial

**Objetivo:** controlar entradas e saídas sem construir contabilidade completa.

Entregas:

- receita, despesa, vencimento, liquidação e cancelamento;
- categorias pequenas e configuráveis somente quando necessário;
- contraparte;
- vínculo opcional com coleta, compra ou outro fato operacional;
- visão de realizado versus pendente e fluxo por período.

Critério de saída:

- valores usam centavos e moeda;
- liquidação e cancelamento são eventos auditáveis;
- totais financeiros são reproduzíveis;
- alteração de um fato operacional não reescreve silenciosamente o financeiro.

### Marco 9 — piloto e consolidação

**Objetivo:** validar a V1 em operação real antes de ampliar escopo.

Entregas:

- migração controlada dos dados necessários;
- treinamento curto e material de contingência;
- piloto com rotina paralela temporária;
- revisão de termos, regras e fricções;
- metas operacionais e de confiabilidade;
- runbooks de incidente e restauração.

Critério de saída:

- período acordado operado sem perda de fatos;
- divergências com o caderno são classificadas;
- tarefas prioritárias atingem qualidade e tempo aceitáveis;
- alertas relevantes são acionáveis;
- backlog pós-V1 é separado de correções obrigatórias.

## 10. Observabilidade por padrão

Todo comando emite sinais com:

- `request_id`
- `correlation_id`
- `command_name`
- `user_id`
- `farm_id`
- `entity_type` e `entity_id`, quando existirem
- resultado, duração e código de erro
- chave de idempotência em forma protegida

Nunca registrar em logs:

- tokens, senhas ou segredos;
- áudio, imagem ou texto bruto do assistente por padrão;
- payload financeiro integral;
- dados pessoais desnecessários.

Indicadores mínimos:

- taxa de sucesso e latência por comando;
- conflitos de idempotência;
- falhas de isolamento/autorização;
- falhas e duração de transações;
- atraso de efeitos pós-commit;
- completude dos controles individuais;
- frequência de correções por tipo de fato;
- divergência entre fatos leiteiros, como indicador e não erro automático;
- latência, custo, confiança e taxa de edição das propostas da IA;
- sucesso de backup e ensaio de restauração.

Alertas devem apontar impacto e ação. Logs abundantes sem hipótese operacional não contam
como observabilidade.

## 11. Estratégia de testes

- **Domínio:** unidades, datas, estados, vigências e invariantes.
- **Aplicação:** cada comando, autorização, idempotência e correção.
- **Banco:** constraints, migrations, concorrência e rollback de fato com auditoria.
- **Contratos:** schemas versionados do assistente e APIs.
- **Integração:** fluxos verticais reais por fazenda.
- **Análises:** datasets conhecidos, ausência de dados e reprodutibilidade.
- **Segurança:** isolamento entre fazendas e proteção de conteúdo sensível.
- **Resiliência:** indisponibilidade da IA, retries e efeitos pós-commit.
- **Experiência:** testes de tarefa no iPhone e desktop, sem cristalizar a interface antes da
  prototipação.

## 12. Riscos que o plano deve controlar

1. **Dados esparsos:** comparação injusta entre animais com coberturas diferentes.
2. **Falsa precisão:** tendência calculada com poucos controles.
3. **Confusão entre fatos:** tratar coleta ou soma individual como produção total.
4. **Conclusão genética indevida:** atribuir desempenho observado à genética sem evidência.
5. **Automação prematura:** IA rápida, mas difícil de corrigir ou auditar.
6. **Escopo horizontal:** começar mapa, trato e financeiro antes de fechar o fluxo leiteiro.
7. **Cadastro excessivo:** reproduzir formulários do MVP sem valor operacional.
8. **Conectividade presumida:** definir experiência offline antes de observar o campo.
9. **Auditoria cosmética:** timestamps sem autoria, motivo e valor anterior.
10. **Observabilidade sensível:** vazar conteúdo do produtor em logs.

## 13. Sequência de decisão imediata

Respondida na fase de protótipo; registro em `docs/DECISIONS.md`:

1. ~~cardinalidade simultânea entre Lote e Pasto~~ — **respondido:** 1:1 por vez (D-028);
2. ~~rotina exata dos três registros leiteiros~~ — **respondido:** produção diária única da
   Fazenda; controle = sessão Lote + data + turno; coleta por retirada (D-018, D-019, D-027);
3. ~~regras de data, turno, unidade e precisão~~ — **respondido:** turnos manhã/tarde/única,
   litros com 1 casa decimal (D-019, D-020, D-021);
4. ~~identidade mínima do animal~~ — **respondido:** nome/brinco + status (D-025);
5. ~~política de correção e divergência~~ — **respondido:** motivo obrigatório e antes/depois
   no histórico (D-026); divergência exibida como Diferença observada;
6. conectividade no local — **ainda aberta**; validar em campo antes de qualquer estratégia
   offline;
7. ~~consultas e critérios para manter ou descartar um animal~~ — **respondido:** litros/dia
   com cobertura explícita (D-021);
8. ~~prototipar alternativas de UI~~ — **concluído:** decisões em `docs/UI_UX_DECISIONS.md`.
