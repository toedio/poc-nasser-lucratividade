# Playbook — Módulo de Lucratividade (Nasser Advogados)

> Base de conhecimento viva do projeto. **Atualize ao final de cada conversa/sessão** com decisões, aprendizados e pendências.
> Última atualização: 2026-11-03 (v0.2).

## 1. Contexto do cliente

- **Cliente:** Nasser Advogados (site: https://nasser.adv.br). Interlocutores: sócios Anderson e Tiana; Marina (sócia, fez a planilha manual de custo hora); Patrícia (financeiro/faturamento); Felipe (contato que pode saber sobre a integração com o WK); Emílio (citado sobre ajustes no sistema atual).
- **Sistema atual:** **WK** (chamado de “WKL” na reunião). Módulos: **Finan** (financeiro, contas a receber, planilha de distribuição) e **GE** (cadastro/emissão). Há também o fluxo de **timesheet** (lançamento → revisão pelos sócios → orientação de faturamento).
- **Estrutura:** cada sócio lidera uma **área**. Todo projeto é vinculado a uma área, mas advogados de outras áreas trabalham nele. O faturamento vai para a área do projeto e é **dividido pela participação em horas**.
- **Timesheet é universal:** todas as atividades são lançadas, mesmo em projetos de valor fixo (base para renegociar honorários).
- **Relatório ao cliente (visto em tela, não está na gravação):** por cliente, linhas com **data, horas, sigla do advogado (ex.: VFS = Victor Ferreira Silva), serviço prestado e valor**. Em projeto fixo o cliente vê o valor “se fosse por hora”, mas paga o fixo.

## 2. Dores levantadas (reunião 2026-11-03)

1. Sem visão de **lucratividade por cliente / projeto** nem de **custo hora** do advogado — “hoje a gente tá zero”.
2. **Fatura única para vários projetos** e **pagamento único**: hoje a alocação por projeto é feita à mão.
3. Incluir um projeto por hora numa fatura de fixo exige **alterar o cadastro** no WK; senão a planilha de distribuição não reconhece o recebimento.
4. Fixo com estouro de horas (ex.: fixo 100 mil, 250 h lançadas) e descontos comerciais (tabela 100 mil, fatura 80 mil).
5. Cadastros falhos no WK limitam relatórios.
6. Envio à contabilidade é “retalho” (Drive).
7. Bônus por participação no resultado é questionado pelos advogados: querem mostrar “seu custo é X, seus projetos renderam Y”.

## 3. Decisões

| Data | Decisão |
|---|---|
| 2026-11-03 | Começar pelo **módulo de rentabilidade** (cliente / projeto / mês). A distribuição entre sócios (DRE por área) fica para depois — já tem algo “aceitável” no WK. |
| 2026-11-03 | Construir um **sistema auxiliar** que puxa o máximo do WK e complementa o que faltar (principalmente o **custo dos advogados**). A substituição do WK é uma visão de longo prazo. |
| 2026-11-03 | Fazer uma **POC com dados fictícios** antes de integrar. Depois, teste com um cliente/projeto real. |
| 2026-11-03 | ~~Receita = recebido, com alternância para faturado~~ → **revisto no mesmo dia: não há diferença entre faturado e recebido.** Receita = valor faturado; sem pagamentos, “a receber” nem filtro de receita. |
| 2026-11-03 | Despesas do escritório **rateadas entre os advogados** e incorporadas ao custo hora (margem bruta × líquida). |
| 2026-11-03 | **Fatura e divisão por projeto são um cadastro só**: a fatura traz `itens` [{projetoId, valor}]. A soma dos itens deve bater com o valor da fatura. Sem itens, a divisão é automática. |
| 2026-11-03 | Painel: o mês abre os **serviços prestados** e a **composição do custo por advogado** (custo direto/h, rateio/h, totais). Coluna **Área** na tabela e **tooltip** (ícone “i”) em cada coluna explicando o cálculo. |
| 2026-11-03 | Painel sem texto introdutório. Tooltips também em “Projetos com margem negativa” e “Escritório mês a mês”. |
| 2026-11-03 | Escritório mês a mês ganhou **gráfico de barras empilhadas**: faturado por mês, uma subsérie por **área** (padrão: área do projeto; alternável para área do advogado = participação por horas), mais uma **linha de custo total** do escritório (oculta com filtro de área). Tooltip por mês, teclado (setas), “Ver dados do gráfico”. |
| 2026-11-03 | Cores do gráfico = paleta categórica de referência da skill dataviz (validada nos dois temas contra as superfícies do app). As cores da marca **reprovam** como série (grafite/bege leem como cinza; vermelho × grafite indistinguíveis para daltônicos). Cor segue a área (ordem do cadastro), nunca o ranking. Máx. 7 áreas coloridas; além disso, “Outras áreas” em bege neutro. |
| 2026-11-03 | **Tema único claro**, sem modo escuro, inspirado nas seções do site: fundo branco quente, títulos em caixa alta com peso leve (H1 em vermelho), texto grafite `#4A4A4A`, cabeçalho branco com logo vermelho (`assets/logo-nasser-vermelho.svg`) e menu em caixa alta com sublinhado vermelho. |
| 2026-11-03 | **Configurações oculta** do menu para a publicação: acessível só pela URL `#/config` (rateio, base de horas, import/export JSON, import CSV, restaurar demo). |
| 2026-11-03 | Identidade visual da Nasser: vermelho `#C41230`, vinho `#670D12`, grafite `#4A4A4A`, bege `#EAE2D9`/`#CAC2B8`/`#9F9388`, fundo `#F5F4F1`. Fonte do site: Proxima Nova (licenciada) → na POC usamos **Montserrat**. Logo: `assets/logo-nasser-vermelho.svg` (usado no cabeçalho branco); `assets/logo-nasser.svg` é a versão branca. |

## 4. Modelo de cálculo (implementado em `src/engine.js`)

**Grão dos fatos:** (projeto, mês, advogado). Todo o resto é agregação.

**Custo hora do advogado (por mês):**
```
custo direto/h  = custo mensal vigente ÷ horas base
cota de rateio  = despesas fixas do mês × peso do advogado ÷ soma dos pesos
rateio/h        = cota ÷ horas base
custo efetivo/h = custo direto/h + rateio/h
```
- **Custo mensal** = remuneração + encargos, com **histórico por vigência** (reajuste = novo registro; meses passados não mudam).
- **Despesas fixas** também têm vigência (ex.: reajuste de condomínio em junho).
- **Peso do rateio** (configurável): por cabeça (padrão, igual à planilha da Marina) | proporcional ao custo | proporcional às horas lançadas.
- **Horas base** (configurável): capacidade (horas disponíveis/mês, padrão) | horas lançadas. Com capacidade, a ociosidade aparece como **custo não absorvido**.
- Exemplo validado nos testes: hora de tabela R$ 960, custo efetivo R$ 300 → margem R$ 660/h (o exemplo da reunião).

**Receita por projeto-mês** (premissa do cliente: faturado = recebido):
- Mês = **competência** da fatura (mês do serviço).
- Fatura → projetos:
  1. **Divisão informada** na própria fatura (`fatura.itens`; valores funcionam como pesos; a UI exige soma = valor da fatura).
  2. Sem itens → **automática**: projetos do cliente ponderados pelo **valor de referência** da competência (fixo → `valorFixoMensal`; por hora → horas × tabela).
- Dentro do projeto-mês, a receita é **distribuída entre advogados pela participação no valor de tabela** (base para a visão de bônus e de área do advogado). Projeto com receita e sem horas no mês → fato com `advogadoId = null`.

**Indicadores:** receita = faturado; margem bruta = faturado − custo direto; margem líquida = faturado − custo efetivo; margem % = margem líquida ÷ faturado; realização = faturado ÷ valor de tabela.

**Detalhe por lançamento:** `detalharLancamentos()` aplica as mesmas regras por lançamento (custo direto, rateio, custo efetivo, valor de tabela). Os totais batem com os fatos (há teste para isso).

**Visão do escritório:** custo total (pessoal + despesas) − absorvido nos projetos = **não absorvido**; resultado = faturado − custo total.

## 5. POC — como está construída

- App estático (HTML + JS ES modules, **sem build e sem dependências**), dados em `localStorage`.
- `src/engine.js` – regras puras (reutilizáveis no backend futuro) · `src/seed.js` – gerador **determinístico** de dados fictícios · `src/store.js` – persistência · `src/app.js` – UI · `tests/engine.test.js` – `npm test`.
- `npm start` → http://localhost:5173 · `npm run relatorio` → resumo dos dados demo no terminal.
- Telas: Painel (drill-down cliente → projeto → mês → serviços prestados + composição do custo, coluna Área, tooltips por coluna, projetos com prejuízo, escritório mês a mês) · Análise (quebras, ordenação, CSV) · Custo hora · Relatório de horas (espelha o relatório ao cliente + visão interna) · Cadastros (advogados, custos, despesas, áreas, clientes, projetos, lançamentos, faturas com divisão) · Configurações **oculta**, em `#/config` (rateio, base de horas, import/export JSON, import CSV de lançamentos).
- **Publicado em:** https://toedio.github.io/poc-nasser-lucratividade/ (GitHub Pages, branch `main`, raiz). Repo: https://github.com/toedio/poc-nasser-lucratividade (**público** — o plano gratuito não permite Pages em repo privado; decisão do Victor em 2026-11-03). Todo push na `main` republica em ~1 min.
- **Publicação (alternativas):** qualquer host estático (GitHub Pages, Netlify, Vercel, S3) servindo a raiz. Não abre via `file://` (ES modules) — precisa de HTTP.

### Cenários embutidos nos dados fictícios (para a demo)
- *Grupo Atlântico*: **fatura única** para 3 projetos; jan–mai com divisão informada, jun–set automática; desconto de 10% nas horas.
- *Vértice – Assessoria trabalhista mensal*: **fixo subprecificado → prejuízo**.
- *Instituto Aurora*: valor simbólico → margem negativa.
- *Fazenda Santa Clara*: desconto de 20%; due diligence pontual (fev–mar).
- *Nobre – M&A*: projeto temporário (abr–ago).
- Reajustes salariais em jul (JMT, BCN, LOS); condomínio reajustado em jun; advogada júnior entra em mar.
- Outubro: horas lançadas e ainda **sem fatura** (em fechamento).

## 6. Pendências / próximos passos

- [ ] **Integração WK (dealbreaker):** Anderson vai perguntar ao Felipe (quinta, 2026-11-05) como extrair automaticamente: acesso ao banco? API? Relatório Excel agendado? Banco no servidor do WK (dados são da Nasser). Se só der manual, o projeto muda de forma.
- [ ] Apresentar a POC aos sócios; reunião com a **Marina** na semana de 2026-11-09 (ela tem a planilha manual de custo hora — comparar fórmulas).
- [ ] Validar com a Marina: rateio por cabeça × proporcional; quais despesas entram; horas base (capacidade × lançadas); sócios entram no rateio?
- [ ] Mapear campos do WK → modelo (cliente, projeto, área, modalidade, timesheet, fatura, recebimento, vínculo fatura↔projeto).
- [ ] Proposta comercial: projeto fechado × mensalidade (Victor prefere mensal com desenvolvimento + manutenção, sem fidelidade).
- [ ] Futuro: DRE por área / distribuição entre sócios; visão de bônus por advogado; envio automático à contabilidade.

## 7. Aprendizados / armadilhas

- Fixos **parecem** lucrativos olhando valor de tabela, mas a realização (faturado ÷ tabela) denuncia estouro de horas. Mostrar realização ao lado da margem.
- Usar **competência** para receita; data do pagamento só para caixa. Misturar os dois distorce a margem mensal.
- Sócios lançam menos horas faturáveis → custo hora por capacidade subestima o custo real deles; discutir com a Marina.
- Dados demo: `FATOR_OCUPACAO` em `src/seed.js` controla a ocupação média (~75%). Mudar a seed altera todos os números das telas e da demo.

## 8. Histórico de sessões

- **2026-11-03** – Reunião de entendimento (transcrição Gemini). POC v0.1 criada: motor + testes (12), dados fictícios, 6 telas, identidade visual da Nasser.
- **2026-11-03 (v0.2)** – Correções do Victor: serviços prestados e composição do custo no mês; coluna Área; tooltips nas colunas; faturado = recebido (pagamentos removidos); fatura + divisão por projeto num cadastro só; Configurações oculta; tooltips nas outras tabelas; gráfico mensal empilhado por área. Dados demo agora na versão 2: um `localStorage` antigo é descartado. 13 testes.
- **2026-11-03** – Código publicado no GitHub (`toedio/poc-nasser-lucratividade`, tornado público) e hospedado no GitHub Pages.
