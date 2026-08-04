# Linguagem Ubíqua

## Identidade e propriedade

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Usuário** | Identidade autenticável de uma pessoa que opera uma Fazenda. | Conta, agente, membro |
| **Agrônomo operador** | Persona responsável por registrar e analisar a operação produtiva da Fazenda. | Administrador, funcionário genérico |
| **Fazenda** | Unidade proprietária e fronteira de isolamento de todos os dados operacionais. | Tenant, workspace, sítio |
| **Sessão** | Autenticação ativa que resolve um Usuário e sua Fazenda. | Login, token |

## Rebanho e espaço físico

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Animal** | Bovino identificado e acompanhado pela Fazenda; identidade mínima no V1 é nome/brinco + status (ativo/arquivado). | Vaca, cabeça, item do rebanho |
| **Lote** | Grupo operacional de animais manejados juntos em um período. | Grupo, rebanho, turma |
| **Lotação** | Período datado em que um Animal pertence a um Lote. | Vínculo atual, grupo atual |
| **Pasto** | Área física mapeada destinada à ocupação temporária de um Lote. | Piquete, zona, polígono |
| **Ocupação de pasto** | Período datado em que um Lote ocupa um Pasto. | Localização do lote |
| **Instalação** | Estrutura física mapeada da Fazenda, como curral, tanque ou depósito. | Prédio, ponto, marcador |
| **Mapa da Fazenda** | Representação espacial dos Pastos e Instalações da Fazenda. | Jogo, mapa gamificado |
| **Imagem de satélite** | Camada cartográfica externa usada como referência visual no Mapa da Fazenda; não é um fato operacional. | Perímetro oficial, ocupação inferida |

## Leite

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Produção diária** | Volume único medido em uma data para toda a Fazenda, sem divisão por turno ou Lote. | Produção total, leite do dia, produção por lote |
| **Controle leiteiro** | Sessão de medições individuais de leite de um Lote em uma data e um Turno; corresponde a uma página do caderno. | Produção individual diária |
| **Ordenha / Turno** | Período de ordenha de um Lote em uma data: manhã, tarde ou única. Lotes com uma ordenha diária usam sempre o turno única. | Sessão genérica, período livre |
| **Ordenhas por dia** | Propriedade do Lote (`milkingsPerDay`) que define se ele é ordenhado uma ou duas vezes por dia. | Rotina de ordenha, escala |
| **Medição individual** | Volume em litros (1 casa decimal) de um Animal em uma Ordenha, dentro de um Controle leiteiro. | Produção da vaca |
| **Litros/dia** | Métrica derivada de um Animal: soma das Medições individuais dele na data; em Lote de uma ordenha, é a própria ordenha única. | Média por ordenha, produção estimada |
| **Coleta** | Retirada de um volume de leite pelo laticínio em data e hora informadas. | Venda, produção, baixa |
| **Diferença observada** | Subtração factual entre volumes comparados, sem causa inferida. | Perda, quebra, erro |
| **Desempenho leiteiro** | Conjunto de Litros/dia confirmados de um Animal, sempre acompanhado de período e Cobertura de dados. | Qualidade genética, mérito do animal |
| **Cobertura de dados** | Dias medidos sobre dias com Controle leiteiro no período; sustenta qualquer comparação. | Confiança da IA |

## Alimentação

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Alimento** | Item controlado em uma unidade estável, como ração, sal ou silagem. | Produto, insumo |
| **Entrada de alimento** | Quantidade de um Alimento incorporada ao estoque por uma compra ou ajuste explícito. | Compra de ração |
| **Trato** | Fornecimento datado de um ou mais Alimentos a um Lote ou local de manejo. | Dieta, consumo, alimentação |
| **Item do trato** | Quantidade de um Alimento registrada dentro de um Trato. | Linha, ingrediente |
| **Saldo de alimento** | Resultado derivado das entradas menos os Itens do trato confirmados. | Estoque informado |

## Financeiro

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Lançamento financeiro** | Fato financeiro classificado como Receita ou Despesa da Fazenda. | Transação, movimento |
| **Receita** | Valor que entra ou deve entrar no caixa da Fazenda. | Venda, recebimento |
| **Despesa** | Valor que sai ou deve sair do caixa da Fazenda. | Compra, pagamento |
| **Liquidação** | Confirmação de que uma Receita foi recebida ou uma Despesa foi paga. | Baixa, conclusão |
| **Resultado de caixa** | Receitas liquidadas menos Despesas liquidadas no período. | Lucro |

## Assistente

| Termo | Definição | Evitar |
| --- | --- | --- |
| **Captura** | Entrada original enviada ao Assistente por texto, áudio, foto ou documento. | Prompt, mensagem |
| **Proposta** | Interpretação estruturada e ainda não confirmada produzida a partir de uma Captura. | Registro, fato, ação da IA |
| **Revisão** | Etapa humana de conferir e corrigir uma Proposta. | Aprovação automática |
| **Confirmação** | Decisão humana que autoriza transformar uma Proposta em fatos do domínio. | Aceite da IA |
| **Registro** | Fato persistido após comando manual ou Confirmação. | Captura, proposta |

## Relações

- Um **Usuário** pertence a exatamente uma **Fazenda** no V1.
- Uma **Fazenda** possui exatamente um **Usuário** no V1.
- Todo **Animal**, **Lote**, **Pasto**, **Instalação**, fato leiteiro,
  alimentar ou financeiro pertence a exatamente uma **Fazenda**.
- Um **Animal** possui no máximo uma **Lotação** aberta.
- Um **Lote** ocupa no máximo um **Pasto** por vez e um **Pasto** abriga no
  máximo um Lote por vez.
- Existe no máximo uma **Produção diária** por data na Fazenda.
- Existe no máximo um **Controle leiteiro** por combinação de Lote, data e
  Turno; uma sessão contém uma Medição individual por Animal.
- Uma **Produção diária**, um **Controle leiteiro** e uma **Coleta** podem
  coexistir na mesma data sem se substituir.
- Uma **Captura** pode produzir uma ou mais **Propostas**.
- Uma **Proposta** só produz **Registros** por uma **Confirmação**.

## Exemplo de diálogo

> **Dev:** “A coleta de hoje pode preencher a produção diária que ficou vazia?”
>
> **Especialista:** “Não. A **Coleta** é uma retirada do tanque; a
> **Produção diária** é o valor único medido no dia pela Fazenda. São fatos
> independentes.”
>
> **Dev:** “E quando o Assistente entende ‘controle do Lote 1, manhã: Mimosa
> 12,5’?”
>
> **Especialista:** “Ele cria uma **Proposta** de Controle leiteiro do Lote 1
> no turno da manhã, com a Medição individual da Mimosa. Só a **Confirmação**
> cria o **Registro**.”
>
> **Dev:** “Se o valor divergir da Coleta, classificamos como perda?”
>
> **Especialista:** “Não. Mostramos apenas a **Diferença observada**.”

## Ambiguidades sinalizadas

- “Mapa” hoje também significa jogo. O termo canônico é **Mapa da Fazenda**;
  gamificação é uma decisão de experiência, não um conceito do domínio.
- “Produção individual” sugere recorrência diária. Usar **Controle leiteiro**
  para a sessão e **Medição individual** para cada Animal; a métrica diária
  derivada é **Litros/dia**.
- “Turno” fora do leite pode sugerir escala de trabalho. No domínio, **Turno**
  é sempre o período de Ordenha de um Lote.
- “Transação” pode significar transação de banco ou fato financeiro. Usar
  **Lançamento financeiro** no domínio e “transação PostgreSQL” na arquitetura.
- “Melhor” e “pior” Animal são rótulos excessivos. Usar **Desempenho leiteiro**
  e declarar período, quantidade de medições e **Cobertura de dados**.
- “Genética” neste produto significa somente o objetivo de longo prazo de
  melhorar o rebanho por seleção baseada em desempenho. Genealogia, genômica e
  mérito genético não pertencem à V1.
- “Grupo” é a expressão informal; **Lote** é o termo canônico para Animais
  manejados juntos.
