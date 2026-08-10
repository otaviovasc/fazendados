# Decisões de UI/UX

Decisões de interface aprovadas na etapa de protótipo. Este documento encerra a
D-013: navegação, layout, direção visual e interações não são mais questões
abertas. Mudanças aqui exigem nova decisão registrada em `docs/DECISIONS.md`.

## Plataforma e navegação

- **Mobile-first iPhone**, com desktop responsivo. Todo fluxo principal funciona
  bem em 390px antes de ganhar variações de desktop.
- **Navegação:** bottom-bar no mobile; sidebar no desktop.
- Público: agrônomos com afinidade tecnológica média/baixa. Linguagem simples é
  requisito, não preferência.

## Direção visual

- **Paleta:** neutros quentes + verde-pasto como cor principal; **âmbar**
  reservado para Revisões (pendências de confirmação).
- **Tipografia:** Inter, com números tabulares para volumes, valores e tabelas.
- **Ícones:** Lucide.
- **Gráficos:** Recharts.
- **Mapa:** Leaflet com camada de satélite ESRI.

## Mapas: duas visualizações com papéis distintos

- **`/mapa` (utilitário):** Leaflet + satélite ESRI, para desenhar e editar
  polígonos de Pastos e pontos de Instalações. É a ferramenta de cadastro
  espacial — fora da navegação principal: acessada pelo botão "Editar mapa" no
  HUD do `/jogo`, com link de volta ao Jogo no topo.
- **`/jogo` (tabuleiro):** SVG estilizado derivado das geometrias reais, para a
  operação rápida de pastejo — clicar num Pasto e mover um Lote para ele. Não
  edita geometrias.
- **Descanso do Pasto visível:** cada Pasto no tabuleiro mostra há quantos dias
  está descansando, e o jogo sugere o próximo Pasto para o Lote.
- **Paleta por estação do ano:** as cores do tabuleiro variam conforme a
  estação, mantendo a legibilidade dos estados de cada Pasto.
- **HUD com resumo do dia:** o /jogo exibe um resumo do dia (produção, trato,
  pendências) e as Instalações oferecem atalho de registro pelo Assistente.

## Captura, Proposta e Registro

A pessoa sempre sabe em qual estado está:

| Estado | Significado | Tratamento visual |
| --- | --- | --- |
| **Captura** | Entrada original (texto, áudio, foto) | Preservada, somente leitura |
| **Proposta** | Interpretação da IA, ainda não confirmada | Âmbar; editável na Revisão |
| **Registro** | Fato confirmado | Neutro; corrige-se com motivo |

## Regras da Revisão (locked)

1. **Confirmação única por Proposta** (não por linha): a pessoa revisa tudo,
   edita inline e uma única Confirmação cria todos os fatos.
2. **Ack gating:** campos/linhas com confiança média ou baixa bloqueiam a
   Confirmação até serem editados ou conferidos explicitamente (um toque). Alta
   confiança é pré-aceita.
3. **Edit tracking:** campo editado mostra o selo “editado por você” e o valor
   original da IA visível (tachado).
4. **Queue mode:** após Confirmar, toast compacto de sucesso e avanço automático
   para a próxima Proposta pendente.
5. **Matching de Animais:** rótulo não reconhecido (ex.: “Brinco 300”) oferece
   sugestões por semelhança (fuzzy, nome e brinco, tolerante a caixa/acentos)
   com vínculo em um toque, e cadastro rápido inline sem sair da Revisão. Linha
   sem vínculo bloqueia a Confirmação. Antes de cadastrar, nome ou brinco
   repetido oferece o vínculo existente; candidato aproximado exige a escolha
   consciente entre vincular e “Cadastrar mesmo assim”.
6. **Lotação divergente:** em Controle leiteiro, se o Animal não estiver no
   Lote do Controle na data, a linha âmbar explica a divergência e bloqueia a
   Confirmação até a pessoa escolher “mover para este Lote” ou “manter a
   Lotação e registrar só a Medição”. A consequência escolhida permanece
   visível antes da Confirmação.

## Controle leiteiro

- Uma página do caderno = uma sessão: **Lote + data + turno** (manhã, tarde ou
  única, conforme as Ordenhas por dia do Lote).
- **Cartão do dia** por Lote: em lote de duas ordenhas, as colunas manhã/tarde
  aparecem juntas por Animal. Lacuna destacada em linguagem simples
  (“Mimosa — sem medição na tarde”) com resolução em um toque.
- Medição em litros com 1 casa decimal; teclado decimal no campo.

## Regras transversais de apresentação

- **Ausência ≠ zero:** dia ou turno sem medição aparece como lacuna, nunca como
  zero.
- **Cobertura explícita:** toda comparação (evolução, ranking individual)
  mostra período, dias medidos e cobertura (dias medidos / dias com controle).
- **Correção com motivo:** corrigir fato confirmado exige motivo; o histórico
  mostra antes/depois.
- **Resultado de caixa:** somente liquidados; nunca rotulado como lucro.
- **Diferença observada:** divergências entre fatos leiteiros são exibidas como
  fatos, sem explicação inventada.

## Estados obrigatórios

Todo fluxo principal implementa: **loading**, **vazio**, **erro + retry**,
**sucesso** e **alterações não salvas**. Um fluxo sem esses estados não está
pronto.
