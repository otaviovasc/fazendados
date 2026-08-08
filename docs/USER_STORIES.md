# User stories do FazenDados V1 (v2)

## Atores

- **Agrônomo operador:** único Usuário do V1; controla a operação produtiva,
  registra, corrige e consulta.
- **Assistente:** sistema que propõe estruturas, nunca ator autorizado a
  confirmar fatos.
- **Operador técnico:** mantém o serviço e investiga falhas sem acessar conteúdo
  desnecessário.

Prioridades: `MUST` para V1, `SHOULD` após o fluxo central estar estável e
`LATER` fora do compromisso inicial.

## Identidade e Fazenda

### US-ID-01 — Criar acesso e Fazenda (`MUST`)

Como Agrônomo operador, quero criar meu acesso e a minha Fazenda juntos para começar sem
configuração administrativa.

**Aceite:** provisionamento atômico; email único; Fazenda associada; falha não
deixa registro órfão; evento de auditoria criado.

### US-ID-02 — Entrar e sair (`MUST`)

Como Agrônomo operador, quero autenticar e encerrar a sessão com segurança para acessar
somente os dados da minha Fazenda.

**Aceite:** sessão segura; expiração; logout revoga sessão; `farm_id` resolvido
no servidor.

### US-ID-03 — Isolamento entre Fazendas (`MUST`)

Como Agrônomo operador, quero que IDs de outra Fazenda pareçam inexistentes para que
nenhum dado atravesse a fronteira.

**Aceite:** leitura e mutação cross-farm bloqueadas; teste automatizado em cada
módulo; tentativa gera evento de segurança sem vazar existência.

## Assistente

### US-AI-07 — Organizar e reutilizar Anexos (`MUST`)

Como Agrônomo operador, quero encontrar fotos e documentos já enviados em uma
Galeria para visualizar, baixar, renomear, categorizar, remover e reutilizar
um arquivo em uma nova Captura.

**Aceite:** a Galeria respeita a Fazenda; imagens e PDFs são visualizáveis;
remoção é auditada e não apaga a Captura original; reutilização cria uma nova
Captura sem expor `storage_key`.

### US-AI-01 — Capturar por texto (`MUST`)

Como Agrônomo operador, quero descrever um fato em linguagem natural para receber uma
Proposta estruturada.

**Aceite:** Captura preservada; estado de processamento claro; falha permite
retry; Proposta não altera domínio.

### US-AI-02 — Capturar por áudio (`MUST`)

Como Agrônomo operador em campo, quero falar em vez de digitar para registrar com as mãos
ocupadas.

**Aceite:** permissão e gravação compreensíveis; transcrição revisável; áudio e
transcrição obedecem à política de retenção.

### US-AI-03 — Capturar foto/documento (`MUST`)

Como Agrônomo operador, quero fotografar uma anotação ou comprovante para evitar
redigitação.

**Aceite:** progresso de upload; arquivo preservado quando necessário; OCR
separado da interpretação; falha parcial recuperável.

### US-AI-04 — Revisar e corrigir Proposta (`MUST`)

Como Agrônomo operador, quero entender o que será salvo, corrigir qualquer campo
inline e confirmar a Proposta inteira de uma vez.

**Aceite:** origem → contexto → fatos → consequências; uma única Confirmação por
Proposta cria todos os fatos (não por linha); campos/linhas com confiança média
ou baixa bloqueiam a Confirmação até edição ou conferência explícita (um
toque); alta confiança é pré-aceita; campo editado mostra o selo “editado por
você” e o valor original da IA tachado; valores preservados após erro;
diferença entre Proposta e Registro evidente.

### US-AI-05 — Confirmar sem duplicar e seguir a fila (`MUST`)

Como Agrônomo operador, quero confirmar uma vez, poder repetir após falha de
rede sem criar duplicatas e seguir para a próxima Proposta sem atrito.

**Aceite:** idempotência persistida; auditoria na mesma transação; resposta
lista todos os Registros criados; após Confirmar, toast compacto de sucesso e
avanço automático para a próxima Proposta pendente (queue mode).

### US-AI-06 — Descartar Proposta (`MUST`)

Como Agrônomo operador, quero descartar uma interpretação incorreta sem criar fatos.

**Aceite:** motivo opcional; status final; nenhum indicador alterado.

## Rebanho

### US-HE-01 — Cadastrar Animal rapidamente (`MUST`)

Como Agrônomo operador, quero cadastrar um Animal com a menor informação realmente
necessária para associar futuras medições.

**Aceite:** identidade mínima = nome/brinco + status (ativo/arquivado); nenhum
campo adicional no V1; brinco repetido bloqueia cadastro; nome repetido
direciona ao Animal existente, salvo quando ambos possuem brincos distintos;
cadastro manual e via Assistente usam o mesmo comando.

### US-HE-02 — Buscar e reconhecer Animal (`MUST`)

Como Agrônomo operador, quero localizar por brinco ou nome para não registrar no Animal
errado.

**Aceite:** busca tolera caixa/acentos e até dois erros em nomes longos;
resultados mostram informação distintiva; nenhuma fusão aproximada automática.

### US-HE-03 — Formar e alterar Lote (`MUST`)

Como Agrônomo operador, quero mover um Animal entre Lotes com data para preservar o
histórico de manejo.

**Aceite:** uma Lotação por data; início e fim inclusivos; mudança em `D`
encerra a anterior em `D-1`; mudança atômica; histórico visível no Animal e no
Lote.

### US-HE-04 — Arquivar Animal (`MUST`)

Como Agrônomo operador, quero retirar um Animal das listas ativas sem apagar seu
histórico.

**Aceite:** motivo/data; medições preservadas; Animal arquivado não aparece em
novos controles por padrão.

### US-HE-05 — Ver linha do tempo (`MUST`)

Como Agrônomo operador, quero ver lotações, medições e alterações em ordem cronológica
para entender o Animal.

**Aceite:** fatos identificados por tipo e origem; links para o Registro;
ausência não é preenchida.

## Leite

### US-MI-01 — Registrar Produção diária (`MUST`)

Como Agrônomo operador, quero registrar o volume único de leite produzido pela
Fazenda em uma data, sem dividir por turno ou Lote.

**Aceite:** um valor por data; unicidade por data na Fazenda; coexistência com
Controle leiteiro e Coleta na mesma data; formulário conclui em menos de um
minuto na meta do piloto.

### US-MI-02 — Fazer Controle leiteiro (`MUST`)

Como Agrônomo operador, quero abrir a sessão do dia de um Lote (uma página do
caderno) e informar a medição de cada Animal rapidamente.

**Aceite:** sessão identificada por Lote + data + Turno (manhã, tarde ou única,
conforme as Ordenhas por dia do Lote); teclado decimal com 1 casa; progresso;
retomada segura; uma medição por Animal/sessão; unicidade Lote + data + Turno;
no Lote de duas ordenhas, a UI apresenta o “cartão do dia” com colunas
manhã/tarde por Animal; lacuna destacada em linguagem simples (“Mimosa — sem
medição na tarde”) com resolução em um toque; ausência nunca vira zero.

### US-MI-03 — Importar Controle pelo Assistente (`MUST`)

Como Agrônomo operador, quero ditar ou fotografar uma lista de Animal/volume
para revisar os vínculos antes de salvar.

**Aceite:** rótulo/valor originais preservados; matching aceita nome ou brinco,
tolerante a caixa/acentos; rótulo não reconhecido oferece sugestões por
semelhança com vínculo em um toque e cadastro rápido inline sem sair da
Revisão; linha sem vínculo bloqueia a Confirmação; baixa confiança nunca
confirma sozinha.

### US-MI-04 — Registrar Coleta (`MUST`)

Como Agrônomo operador, quero registrar cada retirada do laticínio com volume e horário.

**Aceite:** várias por dia; volume positivo; alerta de possível duplicata sem
fundir automaticamente.

### US-MI-05 — Comparar fatos de leite (`MUST`)

Como Agrônomo operador, quero comparar Produção diária, soma de Medições e Coletas sem que
o sistema invente explicações.

**Aceite:** fontes e limitações visíveis; diferença chamada “observada”; dias
ausentes não viram zero.

### US-MI-06 — Corrigir um fato (`MUST`)

Como Agrônomo operador, quero corrigir data/valor com histórico para reparar um erro
humano.

**Aceite:** motivo obrigatório; validação e unicidade refeitas; auditoria
before/after; histórico mostra valor anterior e posterior; visualização mostra
correção; nenhuma edição silenciosa.

## Análise leiteira

### US-AN-01 — Ver progresso ou regressão da produção (`MUST`)

Como Agrônomo operador, quero comparar a Produção diária entre períodos para
entender a direção da atividade leiteira.

**Aceite:** somente dias medidos; período e quantidade de dias visíveis;
comparação não transforma ausência em zero; cálculo reproduzível.

### US-AN-02 — Comparar desempenho individual (`MUST`)

Como Agrônomo operador, quero comparar as Medições individuais dos Animais para
apoiar decisões de manutenção ou descarte.

**Aceite:** métrica de litros/dia (soma das Ordenhas do Animal na data);
período, escopo e quantidade de dias medidos explícitos; cobertura (dias
medidos / dias com Controle no período) sempre visível; animais com Cobertura
insuficiente não recebem ranking conclusivo; acesso ao histórico original.

### US-AN-03 — Entender cobertura dos dados (`MUST`)

Como Agrônomo operador, quero saber quantos Controles e Animais sustentam uma
análise para não tomar decisão sobre dados incompletos.

**Aceite:** contagens e lacunas factuais; nenhum preenchimento estimado;
limitações em linguagem simples.

### US-AN-04 — Evitar conclusão genética indevida (`MUST`)

Como Agrônomo operador, quero que o sistema diferencie desempenho leiteiro de
genética para que uma métrica operacional não seja apresentada como certeza
biológica.

**Aceite:** nenhum indicador chamado mérito/qualidade genética; sem genealogia
implícita; descarte permanece decisão humana.

## Mapa, Pastos e Instalações

### US-SP-01 — Configurar perímetro (`MUST`)

Como Agrônomo operador, quero registrar o perímetro da Fazenda para delimitar sua área
operacional.

**Aceite:** polígono válido; pertence à Fazenda; substituição é explícita e
auditada.

### US-SP-02 — Cadastrar Pasto no mapa (`MUST`)

Como Agrônomo operador, quero registrar e nomear Pastos para distingui-los na operação.

**Aceite:** nome localmente único; polígono válido; edição preserva ocupações.

### US-SP-03 — Cadastrar Instalação (`MUST`)

Como Agrônomo operador, quero marcar curral, tanque, depósito e estruturas realmente
usadas.

**Aceite:** tipo/nome/ponto; tipos vêm da lista validada; sem regra singleton
não confirmada.

### US-SP-04 — Mover Lote entre Pastos (`MUST`)

Como Agrônomo operador, quero registrar a movimentação de um Lote entre Pastos.

**Aceite:** conflitos impedem confirmação ambígua; intervalos atualizados
atomicamente; histórico preservado.

### US-SP-05 — Ver situação espacial (`MUST`)

Como Agrônomo operador, quero consultar quais Lotes estão em quais Pastos,
contextualizados sobre imagem de satélite.

**Aceite:** estado atual e descanso factual; resultado derivado das ocupações
datadas; indisponibilidade da imagem não altera nem remove os fatos.

## Trato e estoque

### US-FE-01 — Cadastrar Alimento (`MUST`)

Como Agrônomo operador, quero cadastrar um Alimento e sua unidade para padronizar
quantidades.

**Aceite:** nome único por Fazenda; unidade imutável após movimento.

### US-FE-02 — Registrar Entrada (`MUST`)

Como Agrônomo operador, quero registrar compra, estoque inicial ou outra entrada real.

**Aceite:** origem explícita; quantidade positiva; vínculo financeiro opcional
conforme decisão; saldo recalculado.

### US-FE-03 — Registrar Trato (`MUST`)

Como Agrônomo operador, quero informar o que foi fornecido e para qual Lote/local.

**Aceite:** um ou mais Itens; somente linhas preenchidas; saldo insuficiente
alerta, mas não inventa ou bloqueia o ocorrido sem decisão explícita.

### US-FE-04 — Consultar Saldo (`MUST`)

Como Agrônomo operador, quero ver saldo e movimentos de cada Alimento.

**Aceite:** saldo derivado; origem de cada movimento; correção por Ajuste, não
edição direta.

## Financeiro

### US-FI-01 — Registrar Receita/Despesa (`MUST`)

Como Agrônomo operador, quero lançar valor, data, descrição e vencimento com poucos
campos.

**Aceite:** centavos exatos; direção explícita; pendente ou liquidado; Assistente
usa o mesmo comando.

### US-FI-02 — Liquidar lançamento (`MUST`)

Como Agrônomo operador, quero marcar recebimento/pagamento com data.

**Aceite:** estado e data consistentes; desfazer exige auditoria; sem liquidação
parcial no V1.

### US-FI-03 — Ver caixa (`MUST`)

Como Agrônomo operador, quero ver entradas, saídas e Resultado de caixa por período.

**Aceite:** apenas liquidados no realizado; previstos separados; nunca rotular
como lucro.

### US-FI-04 — Comprar Alimento em um fluxo (`DESCONTINUADO`)

**Fora do V1** (P-004 resolvido em D-032): não há acoplamento automático
compra → estoque → despesa. Compra de Alimento e Despesa são registradas por
fluxos independentes.

## Auditoria, suporte e migração

### US-AU-01 — Ver histórico de alterações (`MUST`)

Como Agrônomo operador, quero saber quando e como um Registro foi alterado.

**Aceite:** ator, data, origem e campos mudados; sem conteúdo técnico excessivo.

### US-OP-01 — Investigar falha (`MUST`)

Como Operador técnico, quero buscar um `error_id` e seguir request, comando,
transação e dependências.

**Aceite:** correlação completa; payload sensível redigido; dashboard e trace
disponíveis.

### US-MG-01 — Migrar dados válidos (`MUST`)

Como Agrônomo operador, quero trazer os dados úteis do MVP e receber relatório do que não
entrou.

**Aceite:** dry-run; contagens; classificação por linha; repetível; rollback;
nenhum valor inventado.
