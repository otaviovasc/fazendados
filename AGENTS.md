# FazenDados

Sistema para registrar, consultar e entender a operação de uma fazenda leiteira,
com uso de campo no iPhone, consulta também em desktop e o assistente como
principal porta de entrada de dados.

## Leitura obrigatória

- Contexto do produto: leia `docs/PRODUCT_PLAN.md`, `docs/DELIVERY_PLAN.md` e
  `docs/DISCOVERY_ANSWERS.md`.
- Execução da V1: siga `docs/IMPLEMENTATION_PLAN.md`; decisões de UI/UX em
  `docs/UI_UX_DECISIONS.md`.
- Mudança de domínio: use `$fazendados-domain` e leia
  `UBIQUITOUS_LANGUAGE.md`, `docs/ONTOLOGY.md` e `docs/DECISIONS.md`.
- Comando, persistência, API, job ou integração: use
  `$fazendados-application-patterns`.
- Tela, formulário, navegação ou fluxo de revisão: use
  `$fazendados-field-ux`.

## Regras centrais

- A **Fazenda** é dona dos dados. Toda entidade operacional persistida possui
  `farm_id`; o escopo nunca vem do payload do cliente, mas da sessão autenticada.
- No V1, cada **Usuário** pertence a exatamente uma **Fazenda** e cada Fazenda
  possui exatamente um Usuário.
- Preservar a entrada original do assistente. Proposta de IA nunca é fato
  confirmado sem confirmação humana.
- Produção diária, medição individual e coleta são fatos independentes.
- Produção diária é um valor único por data, sempre no escopo da Fazenda. O
  Controle leiteiro é uma sessão por Lote, data e turno; a métrica individual
  derivada é litros/dia.
- Não transformar estimativa, ausência ou inferência em medição.
- Preferir modelos pequenos, comandos explícitos e uma transação PostgreSQL por
  caso de uso.
- Registrar auditoria da mutação na mesma transação do dado alterado.
- Logs de aplicação são estruturados e não contêm segredos, documentos ou texto
  integral potencialmente sensível.
- Um fluxo deve funcionar muito bem no celular antes de ganhar variações.
- Não reintroduzir funcionalidade fora do escopo sem nova decisão registrada.

## Fronteira do V1

Inclui: identidade e Fazenda, animais e lotes, mapa com pastos e instalações,
produção de leite, coleta, trato, estoque derivado, financeiro simples,
assistente, consulta e observabilidade.

Não inclui: plantio, mastite, cio, peso, reprodução, parentesco animal,
genealogia/genômica, colaboração de vários usuários na mesma Fazenda e
automações que confirmem fatos sem uma pessoa.
