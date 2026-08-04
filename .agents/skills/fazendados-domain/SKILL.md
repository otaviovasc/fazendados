---
name: fazendados-domain
description: Modelar ou revisar animais, lotes, pastos, instalações, leite, coleta, trato, estoque, financeiro e propostas do Assistente no FazenDados. Usar em qualquer alteração de schema, regra, API, comando, indicador, migração ou termo do domínio.
---

# Domínio do FazenDados

1. Ler `../../../UBIQUITOUS_LANGUAGE.md`, `../../../docs/ONTOLOGY.md`,
   `../../../docs/DATA_MODEL.md` e `../../../docs/DECISIONS.md`.
2. Usar os termos canônicos em código, banco, API e UI.
3. Identificar o contexto delimitado e as invariantes afetadas.
4. Preservar a distinção entre Captura, Proposta, fato confirmado, Medição,
   estimativa e ausência.
5. Garantir `farm_id` em toda entidade operacional e em toda consulta.
6. Manter Produção diária, Controle leiteiro e Coleta independentes.
7. Manter Saldo de alimento derivado; nunca editar o saldo diretamente.
8. Não chamar Resultado de caixa de lucro.
9. Não adicionar Plantio, Mastite, reprodução ou parentesco sem nova decisão.
10. Atualizar ontologia, modelo de dados e linguagem ubíqua quando um conceito
    mudar.

Antes de implementar, declarar: contexto, comando, fatos lidos, fatos escritos,
invariantes, idempotência e impacto em indicadores.

