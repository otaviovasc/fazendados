# Respostas de descoberta

Este documento registra fatos informados pelo responsável pelo produto. Inferências e
recomendações aparecem separadas para não serem confundidas com decisões de domínio.

## Etapa 1 — operação, usuário e resultado

### Respostas

1. **Usuário principal:** agrônomos que controlam a operação produtiva de um sítio.
2. **Dispositivos:** iPhone e desktop.
3. **Contexto atual:** registros feitos no sítio, normalmente em folhas de caderno.
4. **Registros mais frequentes:**
   - controle individual de leite por animal;
   - produção total de leite do dia;
   - coleta de leite realizada pelo laticínio.
5. **Resultado esperado:** visualizar progresso ou regressão da produção, comparar vacas
   para apoiar decisões de descarte ou permanência e, no longo prazo, melhorar a qualidade
   produtiva do rebanho.
6. **Fonte atual dos dados:** papel e memória.
7. **Estratégia de construção:** sistema novo, do zero, sem obrigação de preservar a
   arquitetura do MVP.
8. **Limite desta etapa:** definir apenas guidelines de UX; decisões de interface,
   navegação, layout e componentes ficam para uma etapa posterior de prototipação.
9. **Melhoria do rebanho:** a V1 apoia seleção somente pelo desempenho leiteiro
   medido; não registra genealogia ou genômica.
10. **Manejo espacial:** manter Lotes de Animais, sua permanência temporal em
    Pastos e a visualização sobre imagem de satélite.

## Implicações confirmadas para o plano

- O primeiro fluxo vertical deve cobrir os três fatos leiteiros prioritários.
- Correção e rastreabilidade são requisitos centrais: o produto substituirá papel e memória.
- Comparações entre animais precisam informar período, quantidade de medições e cobertura.
- A conclusão de manter ou descartar um animal pertence ao agrônomo; o sistema fornece
  evidências, não uma decisão automática.
- A capacidade deve existir em iPhone e desktop, sem assumir que as duas experiências terão
  o mesmo arranjo visual.
- A V1 continua com um usuário pertencente a uma fazenda, e a fazenda é proprietária dos
  dados.

## Inferências que ainda precisam de validação

- A frequência real dos controles individuais pode ser menor que a da produção total diária.
- Conectividade no campo pode ser instável, mas isso ainda não foi confirmado.
- Os registros em papel podem conter totais e medidas individuais incompatíveis; a política
  de divergência ainda precisa ser definida.
- Um Lote provavelmente ocupa um único Pasto por vez; ainda é preciso confirmar se
  um Pasto pode receber mais de um Lote simultaneamente.

## Pendências imediatas

1. Definir cardinalidade simultânea entre Lote e Pasto.
2. Definir como, quando e por quem cada um dos três fatos leiteiros é medido.
3. Definir unidades, precisão, horários operacionais e regras de correção.
4. Confirmar conectividade e necessidade de operação offline.
