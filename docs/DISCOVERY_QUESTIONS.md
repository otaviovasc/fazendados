# Perguntas de descoberta por etapas

Responder uma etapa por vez. Respostas curtas são suficientes; use o número da
pergunta. Cada item traz a recomendação atual para acelerar a decisão.

Respostas confirmadas devem ser transferidas para `DISCOVERY_ANSWERS.md`. Este
arquivo mantém o roteiro da entrevista e não representa decisões já tomadas.

## Etapa 1 — Realidade de uso e sucesso

**Status:** respondida em `DISCOVERY_ANSWERS.md`.

1. **Quem é a pessoa real que fará 80% dos registros?**
   Recomendação: identificar uma pessoa concreta e desenhar primeiro para ela.
2. **Ela usa Android ou iPhone, e qual faixa de aparelho/conectividade?**
   Recomendação: Android intermediário, tela pequena e conexão instável como
   baseline.
3. **Em quais momentos e lugares os registros acontecem?**
   Recomendação: durante/imediatamente após ordenha, trato, coleta e compra.
4. **Quais três registros precisam ocorrer quase todos os dias?**
   Recomendação: Produção diária, Trato e movimentação financeira; confirmar na
   prática.
5. **Qual resultado após 30 dias provará que o produto vale a pena?**
   Recomendação: dados registrados em pelo menos 80% dos dias operados e busca
   sem recorrer ao caderno.
6. **Quais dados hoje existem apenas na memória, WhatsApp, papel ou planilha?**
   Recomendação: listar fonte, responsável e frequência de cada um.

## Etapa 2 — Assistente e revisão

1. **Quais frases reais o usuário diria para cada tipo de registro?**
   Recomendação: coletar 10 exemplos literais por intent prioritário.
2. **Um áudio pode registrar vários fatos diferentes de uma vez?**
   Recomendação: sim, gerar Propostas independentes e confirmáveis separadamente.
3. **O usuário prefere confirmar cada fato ou um lote de fatos?**
   Recomendação: revisão em lote com problemas destacados e confirmação
   explícita por grupo.
4. **Quais erros da IA são aceitáveis como Proposta e quais devem bloquear?**
   Recomendação: ambiguidade de Animal/data/valor bloqueia; nota opcional não.
5. **Por quanto tempo guardar áudio, foto, transcrição e resposta bruta?**
   Recomendação: arquivo bruto por prazo curto; estrutura e auditoria por prazo
   maior.
6. **O Assistente deve responder perguntas sobre dados ou apenas registrar?**
   Recomendação: V1 registra e oferece consultas pré-definidas; chat analítico
   livre depois.
7. **Quais ações nunca podem ser propostas por IA?**
   Recomendação: exclusões, troca de Fazenda, ajustes de estoque e cancelamentos
   financeiros exigem fluxo manual reforçado.

## Etapa 3 — Animal, Lote e leite

1. **Quais tipos de Animal realmente precisam ser cadastrados no V1?**
   Recomendação: somente animais acompanhados individualmente; esclarecer se
   inclui bezerros, machos e animais secos.
2. **Quais campos mínimos identificam um Animal sem ambiguidade?**
   Recomendação: brinco ou nome; sexo apenas se usado; nada de parentesco.
3. **Precisamos saber “em lactação” para montar o Controle leiteiro?**
   Recomendação: sim, como estado operacional simples, sem ciclo reprodutivo.
4. **Quais motivos tornam um Animal inativo?**
   Recomendação: vendido, morto ou removido, com motivo textual e data; avaliar
   se enums agregam valor.
5. **Lote existe só para manejo/pasto ou também define rotina de ordenha?**
   Recomendação: Lote de manejo com rotina de ordenha explícita.
6. **O Controle leiteiro é da Fazenda inteira ou sempre de um Lote?**
   Recomendação: sessão por Lote quando a operação trabalha assim; evitar null
   sem significado.
7. **Controle individual precisa estar completo para ser finalizado?**
   Recomendação: permitir parcial explicitamente e mostrar cobertura, sem
   preencher ausentes.
8. **Manhã e tarde são obrigatórias ou o usuário às vezes informa só o total?**
   Recomendação: aceitar os dois formatos e preservar qual foi informado.
9. **Como reconhecer possível duplicata de Produção, Controle e Coleta?**
   Recomendação: constraint onde a regra é certa; alerta por proximidade onde
   pode haver vários fatos.
10. **Quais gráficos realmente mudam uma decisão?**
    Recomendação: tendência diária total, evolução individual pontual e
    comparação Produção/Coleta; nada além sem uso real.

## Etapa 4 — Pastos, Instalações e Trato

1. **Quais tipos de Instalação existem na Fazenda real?**
   Recomendação: lista curta configurada no onboarding, sem cardinalidade
   singleton codificada.
2. **O mapa precisa de coordenada GPS real ou bastaria desenho esquemático?**
   Recomendação: coordenada real sobre satélite se rotação e localização forem
   usadas; caso contrário, simplificar.
3. **Quem desenha o perímetro e Pastos, e isso acontece só uma vez?**
   Recomendação: onboarding assistido e edição rara com confirmação.
4. **Um Pasto pode receber mais de um Lote simultaneamente?**
   Recomendação atual: não; confirmar a realidade antes da constraint.
5. **Um Lote pode ocupar mais de um Pasto simultaneamente?**
   Recomendação atual: não; confirmar divisões temporárias.
6. **Descanso do Pasto é apenas informativo ou gera alerta?**
   Recomendação: informativo no V1; alerta só após validar regra real.
7. **Trato é destinado a Lote, Instalação, ambos ou às vezes à Fazenda toda?**
   Recomendação: exigir ao menos um destino contextual.
8. **Quais Alimentos e unidades são usados hoje?**
   Recomendação: cadastrar poucos itens reais; converter tonelada para kg na UI.
9. **De onde vêm Entradas além de compras?**
   Recomendação: validar estoque inicial, produção própria, devolução e ajuste.
10. **Saldo negativo deve bloquear o Trato?**
    Recomendação: alertar e permitir confirmação, pois o registro pode estar
    incompleto.

## Etapa 5 — Financeiro

1. **O objetivo é caixa, contas a pagar/receber ou ambos?**
   Recomendação: ambos, com visão separado entre previsto e realizado.
2. **Existem pagamentos/recebimentos parciais na rotina?**
   Recomendação: excluir parcial do V1 se for raro; isso elimina uma tabela.
3. **Quais categorias são realmente usadas?**
   Recomendação: 5–8 categorias iniciais e “Outros”, sem plano de contas.
4. **Fornecedor/comprador precisa de cadastro próprio?**
   Recomendação: nome textual no V1, criar entidade só quando houver reutilização
   concreta.
5. **Compra de Alimento deve sempre criar Despesa?**
   Recomendação: oferecer fluxo combinado, mantendo os dois fatos vinculados.
6. **Coleta deve criar Receita esperada automaticamente?**
   Recomendação: não; volume coletado e pagamento são fatos independentes.
7. **Preço do leite e estimativa de recebimento entram no V1?**
   Recomendação: somente se usados para decisão semanal; nunca criar Receita
   realizada.
8. **Quais documentos financeiros precisam ser guardados?**
   Recomendação: comprovantes e notas apenas se houver busca/consulta real.
9. **Qual período é principal: dia, semana ou mês?**
   Recomendação: mês no financeiro, dia/semana na operação.

## Etapa 6 — Dados, correções e migração

1. **Quais tabelas/dados do MVP possuem valor real e devem migrar?**
   Recomendação: Animais, Lotes, lotações, leite, Coletas, Pastos, Instalações,
   Alimentos/Tratos e financeiro; confirmar qualidade.
2. **Existem dados reais misturados com seed/demo?**
   Recomendação: identificar por origem antes de qualquer importação.
3. **O que fazer com Plantio, Mastite, reprodução e parentesco antigos?**
   Recomendação: exportação histórica legível, sem importar no novo schema.
4. **Correção de fato mantém versão anterior visível ao usuário?**
   Recomendação: sim na auditoria; UI mostra resumo, não diff técnico completo.
5. **Cancelamento e exclusão são diferentes para o usuário?**
   Recomendação: rascunho pode excluir; fato confirmado cancela/arquiva.
6. **Quanto tempo reter dados após exclusão da conta/Fazenda?**
   Recomendação: definir política antes do primeiro usuário real.
7. **Precisamos exportar tudo em CSV/JSON e fazer backup restaurável?**
   Recomendação: sim, antes do piloto.
8. **Qual é a tolerância a perda de dados e indisponibilidade?**
   Recomendação inicial: RPO ≤ 24h e RTO ≤ 4h; ajustar à realidade.

## Etapa 7 — Observabilidade, segurança e operação

1. **Quem recebe alertas e em qual canal?**
   Recomendação: uma pessoa responsável e um canal de baixa fricção.
2. **Qual stack já é preferida para erros, logs, métricas e traces?**
   Recomendação: OpenTelemetry + fornecedor gerenciado único quando possível.
3. **Por quanto tempo guardar logs técnicos e audit events?**
   Recomendação: logs 30 dias; auditoria pelo prazo dos dados de domínio.
4. **Suporte pode visualizar Capturas brutas?**
   Recomendação: não por padrão; acesso excepcional, auditado e temporário.
5. **Quais SLOs importam para os fluxos críticos?**
   Recomendação: disponibilidade mensal, p95 de leitura/comando e sucesso do
   pipeline do Assistente.
6. **Qual orçamento de latência é aceitável?**
   Recomendação: UI reage em <100 ms; comandos comuns p95 <500 ms; IA mostra
   progresso e primeira resposta útil em poucos segundos.
7. **Como o usuário relata um erro?**
   Recomendação: ação “Relatar problema” inclui `error_id` e contexto técnico,
   nunca conteúdo sensível sem consentimento.
8. **Autenticação será senha, magic link ou provedor social?**
   Recomendação: magic link ou código por email, com recuperação simples.

## Etapa 8 — UX, validação e corte final

1. **Mapa ou Hoje deve abrir primeiro?**
   Recomendação: Hoje/Assistente abre primeiro; Mapa é uma aba principal.
2. **Quais são as três ações fixas de primeiro nível?**
   Recomendação: Assistente, Hoje e Explorar/Mapa; validar com uso real.
3. **O usuário prefere falar, fotografar ou tocar em formulário em cada rotina?**
   Recomendação: escolher default por fluxo, mantendo alternativa manual.
4. **Quais tarefas precisam funcionar com conexão instável?**
   Recomendação: preservar rascunho local e retry seguro; offline completo fora
   do V1 salvo necessidade comprovada.
5. **Quais três protótipos devem ser testados antes de programar?**
   Recomendação: Captura/Revisão, Controle leiteiro e mapa/rotação.
6. **Qual meta de tempo e erros para cada protótipo?**
   Recomendação: registrar fato simples <60 s, zero perda de entrada, no máximo
   uma correção não assistida.
7. **Quem participa do piloto e por quantas semanas?**
   Recomendação: usuário principal por 2–4 semanas com entrevistas curtas.
8. **Qual funcionalidade será cortada primeiro se o cronograma apertar?**
   Recomendação: foto/documento, detalhes avançados do mapa e integrações
   financeiras; nunca cortar isolamento, auditoria ou confirmação humana.
