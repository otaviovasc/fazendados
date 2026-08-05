# Registro de decisões

## Confirmadas

### D-001 — Fronteira do produto

O V1 é o caderno operacional inteligente de uma fazenda leiteira, não um ERP
rural genérico.

### D-002 — Escopo funcional

Permanecem animais, lotes, leite, coleta, trato, financeiro e mapa com pastos e
instalações. Saem plantio, mastite, cio, reprodução e parentesco animal.

### D-003 — Propriedade dos dados

A Fazenda é proprietária dos dados. Toda consulta e mutação operacional é
obrigatoriamente escopada por `farm_id`.

### D-004 — Identidade no V1

Cada Usuário pertence a uma Fazenda e cada Fazenda possui um único Usuário. O
modelo não oferece colaboração dentro da mesma Fazenda no V1.

### D-005 — IA propõe, pessoa confirma

Capturas originais e interpretações são preservadas. O Assistente produz
Propostas revisáveis; nenhuma Proposta se torna fato sem Confirmação humana.

### D-006 — Simplicidade arquitetural

Adotar monólito modular, PostgreSQL como fonte oficial, casos de uso explícitos
e uma transação local por comando.

### D-007 — Observabilidade como requisito de produto

Logs estruturados, auditoria persistente, métricas e rastreamento fazem parte da
fundação, não de uma fase posterior.

### D-008 — Implementação greenfield

O FazenDados será um sistema novo, construído do zero em `fazendados`. O MVP
antigo serve como fonte de aprendizado, regras válidas e eventual migração de
dados, não como base a ser refatorada incrementalmente.

### D-009 — Persona principal

A persona principal é o agrônomo responsável pelo controle da operação
produtiva da Fazenda. O uso ocorre no sítio, em iPhone e desktop.

### D-010 — Fluxos prioritários

Os três fluxos de maior frequência e valor são Controle leiteiro individual,
Produção diária agregada e Coleta do laticínio.

### D-011 — Resultado de produto

O produto deve tornar visível progresso ou regressão da produção e permitir
comparar o desempenho leiteiro medido de cada Animal para apoiar decisões de
manutenção ou descarte do rebanho.

### D-012 — Fonte atual dos dados

Os dados hoje vivem principalmente em folhas de caderno e na memória. A entrada
do sistema deve respeitar esse vocabulário e permitir transcrição/conferência
sem inventar lacunas.

### D-013 — Limite da etapa de planejamento

Esta etapa define requisitos, dados, regras, comandos, qualidade e guidelines de
UX. Navegação, layouts, componentes, identidade visual e interações específicas
foram decididos na etapa seguinte, por protótipo validado. **Atualização:** as
decisões de UI/UX já foram tomadas via protótipo aprovado e estão registradas em
`docs/UI_UX_DECISIONS.md`; esta decisão está encerrada.

### D-014 — Seleção somente por desempenho no V1

“Melhorar a genética” significa, no escopo atual, apoiar a seleção humana com
base no Desempenho leiteiro confirmado. A V1 não registra genealogia, genômica
ou mérito genético e não transforma desempenho em recomendação automática.

### D-015 — Lotes, permanência em Pastos e satélite

A V1 preserva Lotes, Lotação de Animais e Ocupação temporal dos Lotes nos
Pastos. O Mapa da Fazenda usa imagem de satélite como camada de referência para
visualizar Pastos, Instalações e ocupações; as geometrias e os períodos
confirmados continuam sendo os fatos oficiais.

### D-016 — Geometria espacial no PostgreSQL

Limites da Fazenda e Pastos são polígonos; Instalações começam como pontos. A
persistência usa tipos `geometry` do PostGIS, e GeoJSON fica restrito ao
transporte na API. Isso permite validar, indexar e consultar geometrias sem
esconder estrutura espacial em JSONB. A migration `0001_postgis_real_map`
converte as geometrias legadas, valida SRID 4326 e cria índices GiST; qualquer
geometria inválida aborta a migration.

### D-017 — Nome do produto

O produto chama-se **FazenDados** (não FazenDados). O nome vale para UI,
documentação e comunicação; identificadores técnicos já criados não precisam ser
renomeados por motivo cosmético.

### D-018 — Produção diária é um valor único da Fazenda

A Produção diária é um único volume por data, sempre no escopo da Fazenda. Não
existe divisão manhã/tarde nem escopo por Lote neste fato; a granularidade por
Lote vem do Controle leiteiro. Unicidade: uma Produção diária por data.

### D-019 — Controle leiteiro é sessão por Lote, data e Turno

Um Controle leiteiro corresponde a uma página do caderno: um Lote, uma data e um
Turno ∈ {manhã, tarde, única}. Unicidade: uma sessão por combinação
Lote + data + Turno. A identificação dos Animais no caderno mistura nome e
brinco; o matching aceita os dois, tolerante a caixa e acentos.

### D-020 — Ordenhas por dia é propriedade do Lote

O Lote declara `milkingsPerDay` (1 ou 2 ordenhas/dia). Lotes de uma ordenha
usam sempre o Turno única; lotes de duas ordenhas usam manhã e tarde.

### D-021 — Métrica individual é litros/dia com cobertura explícita (P-009)

A Medição individual registra os litros daquela Ordenha, com 1 casa decimal. A
métrica de análise individual é **litros/dia**: soma das Ordenhas do Animal na
data (em Lote de uma ordenha, a própria ordenha única). O critério comparável
para progresso e ranking é litros/dia acompanhado de **cobertura** = dias
medidos / dias com Controle leiteiro no período. Comparações sem cobertura
suficiente não recebem conclusão.

### D-022 — Cruzamento manhã/tarde no cartão do dia

Quando um Animal tem Medição em um Turno e não no outro (Lote de duas
ordenhas), a UI apresenta tudo junto num “cartão do dia” por Lote (colunas
manhã/tarde por Animal), com a lacuna destacada em linguagem simples
(“Mimosa — sem medição na tarde”) e resolução em um toque. Ausência não é zero.
O público tem afinidade tecnológica média/baixa: simplicidade é requisito.

### D-023 — Revisão do Assistente: confirmação única com ack gating

A Revisão de uma Proposta segue quatro regras fixas:

1. **Confirmação única** por Proposta (não por linha): a pessoa revisa tudo,
   edita inline e uma única Confirmação cria todos os fatos.
2. **Ack gating:** campos/linhas com confiança média ou baixa bloqueiam a
   Confirmação até serem editados ou conferidos explicitamente (um toque). Alta
   confiança é pré-aceita.
3. **Edit tracking:** campo editado mostra o selo “editado por você” e o valor
   original da IA visível (tachado).
4. **Queue mode:** após Confirmar, um toast compacto de sucesso é exibido e a UI
   avança automaticamente para a próxima Proposta pendente.

### D-024 — Matching de Animais na Revisão

Rótulo não reconhecido (ex.: “Brinco 300”) oferece (a) sugestões por semelhança
(fuzzy, nome e brinco, tolerante a caixa/acentos) com vínculo em um toque e
(b) cadastro rápido inline, sem sair da Revisão. Linha sem vínculo bloqueia a
Confirmação.

### D-025 — Identidade mínima do Animal (P-002)

No V1, o Animal tem apenas nome/brinco e status (ativo/arquivado). Nenhum campo
adicional entra sem nova decisão registrada.

### D-026 — Correção de fato confirmado exige motivo

Corrigir um fato confirmado exige motivo obrigatório; o histórico mostra o valor
anterior e o posterior (antes/depois), com autoria e data.

### D-027 — Coleta: retiradas com volume e horário, sem fusão automática

A Coleta é registrada por retirada, com volume e horário; o horário varia e pode
haver mais de uma retirada por dia. O sistema avisa sobre possível duplicata,
mas nunca funde registros automaticamente.

### D-028 — Cardinalidade Lote ↔ Pasto é 1:1 por vez (P-010)

Um Lote ocupa no máximo um Pasto por vez e um Pasto abriga no máximo um Lote por
vez. A regra é definitiva para o V1, não provisória.

### D-029 — Modelo financeiro: previsto e liquidado, sem parcial (P-003)

Lançamentos financeiros têm estado previsto ou liquidado; **não existe
liquidação parcial** no V1. O Resultado de caixa considera somente liquidados e
nunca é chamado de lucro.

### D-030 — Experiência do mapa (P-005)

O Mapa da Fazenda é uma ferramenta operacional: visualizar a situação, mover
Lote entre Pastos e desenhar/editar polígonos de Pastos e pontos de Instalações,
sobre imagem de satélite. Sem gamificação no V1.

### D-031 — Stack, autenticação e empacotamento

Monólito Hono + PostgreSQL + Drizzle; frontend Vite + React 19 + Tailwind;
Docker via docker-compose apenas para o banco PostGIS 17; a aplicação roda por
comando no terminal; autenticação por senha
(`APP_PASSWORD`) com sessão em cookie (resolve P-006); seed manipulável
(`pnpm db:seed`). O banco usa PostGIS com `geometry(Polygon,4326)` para
Perímetro/Pastos e `geometry(Point,4326)` para Instalações; GeoJSON fica apenas
no transporte. O backend já está implementado em `fazendados/app` (23 tabelas, API
`/api/bootstrap` + `/api/commands` com idempotência e auditoria transacional).

> A parte de autenticação desta decisão foi substituída por D-035; as demais
> escolhas de stack continuam vigentes.

### D-032 — Descontinuados no V1

Além do já decidido em D-002, ficam definitivamente fora do V1: Peso, Cio,
Mastite, Plantio, Reprodução, Parentesco, genealogia e genômica. O vínculo
automático compra → estoque → despesa também está fora do V1 (P-004 resolvido:
não se aplica).

### D-033 — Provider do Assistente e fronteira de interpretação

O Assistente usa OpenRouter via Chat Completions, com modelo configurável por
ambiente. O provider recebe a Captura e contexto somente de rótulos atuais da
Fazenda; devolve intents JSON validadas e pode fazer uma segunda tentativa de
reparo quando o formato vier inválido. A conversão para Propostas é
determinística, pode gerar várias Propostas para uma Captura e nunca envia IDs
internos ao modelo. LLM, Captura, Proposta, Revisão e Confirmação permanecem
separados; a Confirmação continua sendo a única etapa que cria fatos.

### D-034 — Anexos multimodais da Captura são metadados privados

Uma Captura pode conter texto, áudio, imagem ou documento, inclusive combinar
texto com vários Anexos. O PostgreSQL armazena apenas metadados mínimos e uma
`storage_key` privada por Anexo; bytes não são persistidos no banco. Texto
extraído por OCR ou transcrição é literal e fica separado do texto original da
Captura: extração não é interpretação. Cada Anexo carrega `farm_id` e referencia
a Captura por uma FK composta para impedir associação entre Fazendas.
Interpretar mídia pode gerar Propostas, mas não muda o contrato Captura →
Proposta → Revisão → Confirmação nem cria fatos antes da Confirmação humana.

### D-035 — Contas por Usuário com escopo de Fazenda

Cada conta possui `username` normalizado e único e um `password_hash` gerado
com scrypt; senha em texto puro não é persistida. Uma conta continua pertencendo
a exatamente uma Fazenda no V1, portanto a sessão resolve um único `farm_id`.
Contas legadas sem hash não são autenticáveis até uma redefinição explícita de
senha; a migration não inventa nem reprocessa a antiga `APP_PASSWORD`.

## Pendentes

| ID | Decisão | Recomendação atual |
| --- | --- | --- |
| P-007 | Retenção de logs e auditoria | Logs técnicos por 30 dias; auditoria por prazo maior |

## Resolvidas

| ID | Resultado | Registro |
| --- | --- | --- |
| P-002 | Identidade mínima = nome/brinco + status | D-025 |
| P-003 | Previsto/liquidado, sem parcial, nunca “lucro” | D-029 |
| P-004 | Fora do V1: sem acoplamento compra → estoque → despesa | D-032 |
| P-005 | Visualizar, mover Lote, desenhar Pastos e Instalações | D-030 |
| P-006 | Senha (`APP_PASSWORD`) com sessão em cookie | D-031 |
| P-009 | Litros/dia + cobertura dias medidos/dias com controle | D-021 |
| P-010 | Lote ↔ Pasto 1:1 por vez | D-028 |
