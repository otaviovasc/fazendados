# Crítica do MVP e da proposta inicial

## Resumo

O MVP antigo contém boas regras factuais, mas acumulou produto, arquitetura e
interface demais antes de fixar uma fronteira clara. A nova direção é melhor,
porém o plano inicial do `fazendados` ainda estava abstrato demais em dados,
identificação animal, financeiro, migração e operação do Assistente.

## Problemas críticos do MVP antigo

### 1. Não existe Fazenda como fronteira de dados

O MVP usa autenticação por senha compartilhada e entidades globais. Nomes de
lote, brincos, pastos e datas possuem constraints globais. Isso impede
isolamento correto assim que houver mais de uma Fazenda.

**Correção:** introduzir `farms`, `users` e `farm_id` desde a primeira migration;
unicidades e referências devem ser locais à Fazenda.

### 2. “Audit columns” não são auditoria

`created_at` e `updated_at` não informam quem alterou, qual comando executou,
quais campos mudaram nem qual Captura originou a alteração.

**Correção:** `audit_events` imutável, gravado na mesma transação, com
`farm_id`, ator, operação, ação, entidade e campos alterados.

### 3. Superfícies concorrentes fragmentam o trabalho

Página tradicional, jogo, Caderno e folhas executam trabalhos semelhantes. O
usuário precisa aprender onde cada ação mora e a manutenção duplica fluxos.

**Correção:** cada capacidade deve ter um fluxo autoritativo, sem duplicações
funcionais. Navegação, layout e a relação visual entre mapa, Assistente e
consultas serão decididos apenas após protótipos.

### 3.1. A evidência visual atual não prova os fluxos centrais

Os screenshots disponíveis do último Playwright mostram apenas a tela de login,
embora o teste se chame “revisão individual”. O stub de sessão não sobreviveu à
navegação/reload e o teste terminou na autenticação. Portanto, hoje não há
evidência visual válida, no relatório existente, de que Assistente, revisão,
mapa ou Controle leiteiro sejam claros e responsivos.

A tela de login tem contraste, campos e alvos adequados no mobile, mas:

- comunica “senha compartilhada da família”, conceito incompatível com o novo
  modelo de Usuário;
- o botão desabilitado possui contraste muito discreto;
- no desktop, usa uma composição extremamente pequena no centro, aceitável para
  login, mas insuficiente como referência do sistema;
- não permite avaliar hierarquia, retorno, correção sem perda ou navegação dos
  fluxos que realmente importam.

**Correção:** a nova suíte visual precisa autenticar de forma determinística e
capturar, no mínimo, Captura/Revisão, Controle leiteiro, Animal, Mapa/rotação,
Trato e Financeiro em 390×844, 360×800 e desktop, incluindo erro, vazio e
validação.

### 4. Escopo virou arquitetura

Plantio, mastite, reprodução, pesagem, gamificação e financeiro detalhado
produziram enums, tabelas, rotas e componentes que aumentam o custo de cada
mudança central.

**Correção:** remover esses conceitos do novo modelo; exportar dados antigos
fora do escopo em vez de carregar estruturas sem uso.

### 5. Pipeline do Assistente é flexível, mas pouco contratual

`raw_intent`, `resolved_payload` e `issues` em JSONB são úteis, porém sem
versionamento explícito do schema. Uma ação proposta guarda apenas um
`committed_record_id`, embora um Controle leiteiro possa criar vários Registros.
Não há Confirmação própria nem idempotência persistida.

**Correção:** versionar payloads, separar Captura/Proposta/Confirmação e manter
uma tabela N:N dos Registros criados por cada Confirmação.

### 6. Não há estratégia forte de observabilidade

O schema preserva artefatos de IA, mas isso não equivale a logs estruturados,
métricas, tracing ou alertas. O campo textual `error` não oferece taxonomia
estável.

**Correção:** códigos de erro, envelopes estruturados, OpenTelemetry, métricas
RED e correlação `request_id`/`operation_id`/`trace_id`.

## Problemas de dados por domínio

### Rebanho

- O Animal carrega sexo, oito estados, mãe, pai e reprodução, apesar de boa
  parte disso sair do V1.
- Unicidade de brinco e alias é global.
- `updated_at` depende da aplicação e pode deixar de refletir a mudança.
- Exclusão em cascata pode apagar fatos históricos valiosos.

**Direção:** identificação mínima, estado operacional pequeno, arquivamento e
históricos datados; decidir explicitamente se sexo e lactação são necessários.

### Leite

- A separação entre Produção diária, Controle leiteiro e Coleta é correta e deve
  ser preservada.
- Os campos manhã/tarde/total se repetem e nem toda tabela garante consistência
  entre eles.
- O modelo mistura estado de revisão da IA com medição confirmada.
- Falta origem uniforme ligando Registros a Confirmações.

**Direção:** fatos confirmados no domínio; Propostas incompletas ficam no módulo
do Assistente. Usar constraints para garantir a forma dos períodos.

### Pastos e mapa

- Separar Pasto real de zona visual foi conceitualmente correto.
- Com plantio fora do V1, `map_zones` genérica e `style_variant` ficam como
  abstrações prematuras.
- Regras de instalações singleton são derivadas da experiência do jogo, não
  necessariamente da realidade.

**Direção:** Pasto guarda seu polígono; Instalação guarda seu ponto. O perímetro
fica na Fazenda. Tipos e cardinalidades serão definidos pela realidade.

### Trato e estoque

- Saldo derivado é uma boa decisão.
- Toda entrada exige uma Compra, o que não cobre estoque inicial, correção,
  devolução, perda ou alimento produzido na própria Fazenda.
- Contextos `MILKING`, `PASTURE` e `STATION` podem ser linguagem de UI, não
  conceitos essenciais.

**Direção:** manter Entradas, Tratos e Ajustes explícitos; decidir quais origens
existem na rotina real antes de fechar constraints.

### Financeiro

- Receitas e Compras possuem schemas e estados diferentes, dificultando uma
  visão uniforme de caixa.
- Muitos campos opcionais antecipam venda de animais, bônus, desconto e período.
- `PAID`/`RECEIVED` embutidos impedem liquidação parcial, mas uma tabela de
  Liquidação seria excesso se parcial não existir.

**Direção recomendada:** um `financial_entries` com direção Receita/Despesa,
valor, vencimento e estado; sem parcial no V1. Vínculos específicos ficam nas
entidades que originam o lançamento.

### Documentos

- Uma coluna FK por possível “pai” cresce a cada novo domínio.
- O check de pai único não expressa bem documento reutilizável.

**Direção:** adiar documentos gerais até definir casos reais. Capturas podem
usar `stored_files`; documentos de negócio ganham vínculo explícito somente
quando houver história prioritária.

## Crítica do plano inicial do FazenDados

### Pontos fortes

- Fronteira do V1 mais clara.
- Fazenda como dona dos dados.
- Monólito modular e transação local.
- Assistente com confirmação humana.
- Observabilidade tratada como fundação.

### Lacunas

1. “Animal mínimo” ainda não está definido.
2. O modelo financeiro ainda é recomendação, não decisão.
3. O Assistente precisa de contratos por intent e política de retenção.
4. Não há definição de edição/cancelamento de fatos confirmados.
5. Não há estratégia fechada para estoque inicial e ajustes.
6. A migração ainda não possui matriz campo-a-campo.
7. Metas de UX não possuem orçamento por fluxo.
8. Autenticação e recuperação de acesso continuam abertas.
9. Observabilidade precisa de fornecedor, retenção e responsáveis por alertas.
10. O mapa precisa ser validado como ferramenta, não apenas preservado por
    preferência.

## Riscos do modelo proposto

- Duplicar `farm_id` nos filhos melhora isolamento e índices, mas exige foreign
  keys compostas para não virar redundância inconsistente.
- `UNIQUE (users.farm_id)` implementa o V1 literalmente, porém precisará de
  migration quando colaboração existir; não espalhar a suposição “um usuário”
  dentro dos módulos de negócio.
- `financial_entries` unifica caixa, mas pode ficar genérico demais se compras
  precisarem de itens, impostos ou parcelamento; manter o V1 deliberadamente
  simples e revisar após histórias reais.
- O requisito confirmado agora inclui perímetro, Pastos, Instalações e
  permanência dos Lotes sobre mapa. Isso já exige validação e consulta espacial:
  persistir em PostGIS e usar GeoJSON somente no contrato da API.
- Payload de Proposta em JSONB pode virar schema invisível; exigir
  `schema_version`, validação e fixtures por intent.
- Auditoria com snapshots completos cresce rápido e pode copiar dados sensíveis;
  guardar campos alterados e referências, com allowlist.
- OpenTelemetry, métricas e logs podem virar plataforma excessiva antes do
  produto; começar com eventos e dashboards mínimos definidos em
  `OBSERVABILITY.md`.
- O catálogo de user stories ainda é hipótese. Uma story só é `MUST` depois de
  conectada à rotina e ao usuário real nas etapas de descoberta.

## Regra para a consolidação

Uma funcionalidade só entra no V1 se possuir:

1. uma user story ligada a uma rotina real;
2. conceito e invariantes na ontologia;
3. comando e transação definidos;
4. superfície mobile clara;
5. telemetria e auditoria proporcionais;
6. critério de aceite observável;
7. destino explícito para os dados antigos correspondentes.
