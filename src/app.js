// Interface da POC — JS puro, sem build. Regras de cálculo ficam em engine.js.
import * as E from './engine.js';
import { carregar, salvar, restaurarDemo, novoId, normalizar, COLECOES } from './store.js';

let db = carregar();
let cache = null;
let mapas = null;
const calc = () => (cache ??= E.calcular(db));
const M = () =>
  (mapas ??= Object.fromEntries(COLECOES.map((c) => [c, new Map(db[c].map((x) => [x.id, x]))])));

function commit(msg) {
  salvar(db);
  cache = null;
  mapas = null;
  render();
  if (msg) toast(msg);
}

// ---------------- formatação ----------------
const fBRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fBRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fNum1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const fNum2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const ok = (v) => v != null && Number.isFinite(v);
const brl = (v) => (ok(v) ? fBRL0.format(v) : '—');
const brl2 = (v) => (ok(v) ? fBRL2.format(v) : '—');
const hrs = (v) => (ok(v) ? fNum1.format(v) : '—');
const pct = (v) => (ok(v) ? `${fNum1.format(v * 100)}%` : '—');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeMes = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}` : '—');
const dataBR = (d) => (d ? d.split('-').reverse().join('/') : '—');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cor = (v) => (!ok(v) ? '' : v < 0 ? 'neg' : 'pos');
const hoje = () => db.hoje || new Date().toISOString().slice(0, 10);

const nomeCliente = (id) => M().clientes.get(id)?.nome ?? '—';
const nomeProjeto = (id) => M().projetos.get(id)?.nome ?? '—';
const nomeArea = (id) => M().areas.get(id)?.nome ?? '—';
const siglaAdv = (id) => M().advogados.get(id)?.sigla ?? '—';
const nomeAdv = (id) => {
  if (!id) return '(receita sem horas no mês)';
  const a = M().advogados.get(id);
  return a ? `${a.sigla} — ${a.nome}` : '—';
};
const ROTULO_DIM = {
  cliente: nomeCliente, projeto: nomeProjeto, mes: nomeMes, advogado: nomeAdv, areaProjeto: nomeArea, areaAdvogado: nomeArea,
};
const TITULO_DIM = {
  cliente: 'Cliente', projeto: 'Projeto', mes: 'Mês', advogado: 'Advogado', areaProjeto: 'Área do projeto', areaAdvogado: 'Área do advogado',
};

// ---------------- estado de tela ----------------
const ui = {
  de: '', ate: '', area: '', grafArea: 'areaProjeto',
  aberto: new Set(),
  pivo: 'projeto', ord: { k: 'margemLiquida', d: 1 },
  rel: { cliente: '', mes: '', interno: true },
  chMes: '',
  cad: { busca: '', mes: '' },
};

function garantirPeriodo() {
  const c = calc();
  const comFatura = db.faturas.map((f) => f.competencia).sort();
  if (!ui.de || !c.meses.includes(ui.de)) ui.de = c.meses[0] || '';
  if (!ui.ate || !c.meses.includes(ui.ate)) ui.ate = comFatura.at(-1) || c.meses.at(-1) || '';
  if (ui.de > ui.ate) [ui.de, ui.ate] = [ui.ate, ui.de];
}

function setUi(caminho, valor) {
  const partes = caminho.split('.');
  let o = ui;
  while (partes.length > 1) o = o[partes.shift()];
  o[partes[0]] = valor;
}

// ---------------- componentes ----------------
// `dica` = texto do tooltip do cabeçalho (cálculo/significado da coluna)
const COLS = [
  { k: 'horas', t: 'Horas', f: hrs, dica: 'Soma das horas lançadas no timesheet pelos advogados no projeto, no período.' },
  { k: 'valorTabela', t: 'Valor de tabela', f: brl, dica: 'Σ (horas × valor hora de tabela do advogado). É o valor que aparece no relatório ao cliente, “se fosse cobrado por hora”.' },
  { k: 'faturado', t: 'Faturado', f: brl, dica: 'Valor das faturas da competência atribuído ao projeto (divisão informada na fatura ou automática). É a receita: faturado = recebido.' },
  { k: 'custoDireto', t: 'Custo direto', f: brl, dica: 'Σ (horas × custo direto/h do advogado). Custo direto/h = custo mensal do advogado (remuneração + encargos) ÷ horas base do mês.' },
  { k: 'custoRateio', t: 'Rateio', f: brl, dica: 'Σ (horas × rateio/h). Rateio/h = cota do advogado nas despesas fixas do escritório (aluguel, condomínio, secretaria, sistemas…) ÷ horas base do mês.' },
  { k: 'custoEfetivo', t: 'Custo efetivo', f: brl, dica: 'Custo direto + rateio de despesas. É o custo real das horas trabalhadas no projeto.' },
  { k: 'margemBruta', t: 'Margem bruta', f: brl, cor: true, dica: 'Faturado − custo direto. Quanto sobra depois de pagar as horas dos advogados, antes das despesas do escritório.' },
  { k: 'margemLiquida', t: 'Margem líquida', f: brl, cor: true, dica: 'Faturado − custo efetivo. Quanto sobra depois das horas dos advogados e do rateio das despesas fixas.' },
  { k: 'pctLiquida', t: 'Margem %', f: pct, cor: true, barra: true, dica: 'Margem líquida ÷ faturado (percentual da margem líquida). Negativo = o projeto custou mais do que faturou.' },
];
const DICAS = {
  area: 'Área do projeto (sócio responsável).',
  ...Object.fromEntries(COLS.map((c) => [c.k, c.dica])),
};
const COLS_EXTRA = [
  { k: 'realizacao', t: 'Realização', f: pct, dica: (DICAS.realizacao = 'Faturado ÷ valor de tabela. Abaixo de 100% = desconto ou horas além do fixo; acima = fixo com poucas horas.') },
  { k: 'receitaHora', t: 'Faturado/h', f: brl, dica: 'Faturado ÷ horas lançadas: quanto cada hora trabalhada efetivamente gerou.' },
  { k: 'custoEfetivoHora', t: 'Custo efetivo/h', f: brl, dica: 'Custo efetivo ÷ horas lançadas.' },
];

const barra = (p) => {
  if (!ok(p)) return '';
  const w = Math.min(Math.abs(p), 1) * 50;
  return `<span class="barra" aria-hidden="true"><i class="${p >= 0 ? 'p' : 'q'}" style="width:${w}%"></i></span>`;
};
const td = (c, m) => `<td class="n ${c.cor ? cor(m[c.k]) : ''}">${c.f(m[c.k])}${c.barra ? barra(m[c.k]) : ''}</td>`;
const dica = (txt, lado = 'dir') =>
  txt ? `<span class="dica ${lado}" tabindex="0" role="note" aria-label="${esc(txt)}" data-dica="${esc(txt)}">i</span>` : '';
const th = (c, ord, lado = 'dir') =>
  `<th class="n${ord ? ' ord' : ''}" ${ord ? `data-act="ordenar" data-k="${c.k}"` : ''}>${esc(c.t)}${ord && ui.ord.k === c.k ? (ui.ord.d > 0 ? ' ▲' : ' ▼') : ''}${dica(c.dica, lado)}</th>`;

function opcoesMes(sel, meses = calc().meses) {
  return meses.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${nomeMes(m)}</option>`).join('');
}

function filtrosPeriodo({ area = true } = {}) {
  return `<div class="filtros">
    <label class="campo">De<select data-ui="de">${opcoesMes(ui.de)}</select></label>
    <label class="campo">Até<select data-ui="ate">${opcoesMes(ui.ate)}</select></label>
    ${area ? `<label class="campo">Área do projeto<select data-ui="area"><option value="">Todas</option>${db.areas
      .map((a) => `<option value="${a.id}" ${a.id === ui.area ? 'selected' : ''}>${esc(a.nome)}</option>`)
      .join('')}</select></label>` : ''}
    <span class="nota">Mês = competência do serviço. Receita = valor faturado.</span>
  </div>`;
}

// ---------------- Painel ----------------
function areasDoCliente(fatos) {
  const ids = [...new Set(fatos.map((f) => f.areaProjetoId))];
  return ids.map(nomeArea).sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ');
}

/** Detalhe do mês: serviços prestados e composição do custo por advogado. */
function detalheMes(pid, mes, nCols) {
  const lancs = E.detalharLancamentos(db, calc(), { projetoId: pid, mes });
  const porAdv = new Map();
  for (const l of lancs) {
    const a = porAdv.get(l.advogadoId) || { id: l.advogadoId, horas: 0, valorTabela: 0, custoDireto: 0, custoRateio: 0, custoEfetivo: 0, l };
    a.horas += l.horas; a.valorTabela += l.valorTabela; a.custoDireto += l.custoDireto; a.custoRateio += l.custoRateio; a.custoEfetivo += l.custoEfetivo;
    porAdv.set(l.advogadoId, a);
  }
  const advs = [...porAdv.values()].sort((a, b) => b.custoEfetivo - a.custoEfetivo);
  const s = advs.reduce((t, a) => ({ horas: t.horas + a.horas, valorTabela: t.valorTabela + a.valorTabela, custoDireto: t.custoDireto + a.custoDireto, custoRateio: t.custoRateio + a.custoRateio, custoEfetivo: t.custoEfetivo + a.custoEfetivo }), { horas: 0, valorTabela: 0, custoDireto: 0, custoRateio: 0, custoEfetivo: 0 });
  const fats = db.faturas.filter((f) => f.competencia === mes && calc().alocacaoPorFatura.get(f.id)?.partes.some((p) => p.projetoId === pid));
  const fatTxt = fats.length
    ? fats.map((f) => {
        const parte = calc().alocacaoPorFatura.get(f.id);
        const pctP = parte.partes.find((p) => p.projetoId === pid).pct;
        return `${esc(f.numero)} (${brl2(f.valor)}${pctP < 0.9999 ? ` · ${pct(pctP)} para este projeto, divisão ${parte.modo === 'informada' ? 'informada' : 'automática'}` : ''})`;
      }).join('; ')
    : 'nenhuma fatura nesta competência';
  return `<tr class="detalhe"><td colspan="${nCols}"><div class="det-caixa">
    <div class="det-titulo">Composição do custo por advogado <span class="mut">· ${nomeMes(mes)} · faturas: ${fatTxt}</span></div>
    <table class="det">
      <thead><tr><th>Advogado</th><th class="n">Horas</th><th class="n">Custo direto/h${dica('Custo mensal do advogado ÷ horas base do mês.')}</th><th class="n">Rateio/h${dica('Cota do advogado nas despesas fixas ÷ horas base do mês.')}</th><th class="n">Custo efetivo/h</th><th class="n">Custo direto${dica('Horas × custo direto/h.')}</th><th class="n">Rateio${dica('Horas × rateio/h.')}</th><th class="n">Custo efetivo${dica('Custo direto + rateio.')}</th><th class="n">Valor de tabela${dica('Horas × valor hora de tabela.')}</th></tr></thead>
      <tbody>${advs.map((a) => `<tr><td>${esc(nomeAdv(a.id))}</td><td class="n">${hrs(a.horas)}</td><td class="n">${brl2(a.l.custoDiretoHora)}</td><td class="n">${brl2(a.l.rateioHora)}</td><td class="n">${brl2(a.l.custoEfetivoHora)}</td><td class="n">${brl2(a.custoDireto)}</td><td class="n">${brl2(a.custoRateio)}</td><td class="n"><b>${brl2(a.custoEfetivo)}</b></td><td class="n">${brl2(a.valorTabela)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${hrs(s.horas)}</td><td></td><td></td><td></td><td class="n">${brl2(s.custoDireto)}</td><td class="n">${brl2(s.custoRateio)}</td><td class="n">${brl2(s.custoEfetivo)}</td><td class="n">${brl2(s.valorTabela)}</td></tr></tfoot>
    </table>
    <div class="det-titulo" style="margin-top:12px">Serviços prestados (${lancs.length})</div>
    <table class="det">
      <thead><tr><th>Data</th><th>Adv.</th><th>Serviço prestado</th><th class="n">Horas</th><th class="n">Valor de tabela</th><th class="n">Custo direto</th><th class="n">Rateio</th><th class="n">Custo efetivo</th></tr></thead>
      <tbody>${lancs.map((l) => `<tr><td>${dataBR(l.data)}</td><td><b>${esc(siglaAdv(l.advogadoId))}</b></td><td class="quebra">${esc(l.descricao)}</td><td class="n">${hrs(l.horas)}</td><td class="n">${brl2(l.valorTabela)}</td><td class="n">${brl2(l.custoDireto)}</td><td class="n">${brl2(l.custoRateio)}</td><td class="n">${brl2(l.custoEfetivo)}</td></tr>`).join('') || '<tr><td colspan="8" class="mut">Sem horas lançadas neste mês (receita sem horas).</td></tr>'}</tbody>
    </table>
  </div></td></tr>`;
}

function vPainel() {
  const c = calc();
  const fatos = E.filtrarFatos(c.fatos, { de: ui.de, ate: ui.ate, areaId: ui.area });
  const t = E.metricas(E.somar(fatos));
  const meses = E.mesesEntre(ui.de, ui.ate).filter((m) => c.meses.includes(m));
  const mensal = E.resumoMensal(c, meses);
  const naoAbs = mensal.reduce((s, m) => s + m.naoAbsorvido, 0);
  const custoTotal = mensal.reduce((s, m) => s + m.custoTotal, 0);
  const nCols = COLS.length + 2;

  const kpi = (rot, val, det, cls = '') =>
    `<div class="kpi"><div class="rot">${rot}</div><div class="val ${cls}">${val}</div><div class="det">${det}</div></div>`;

  const ordenar = (arr) => arr.map((r) => ({ r, m: E.metricas(r) })).sort((a, b) => b.m.receita - a.m.receita);
  const linha = (nivel, chave, rotulo, area, m, expansivel) => {
    const aberto = ui.aberto.has(chave);
    const btn = expansivel
      ? `<button class="exp" data-act="expandir" data-k="${esc(chave)}" aria-expanded="${aberto}" aria-label="${aberto ? 'Recolher' : 'Expandir'} ${esc(rotulo)}">${aberto ? '▾' : '▸'}</button>`
      : '<span class="exp" style="display:inline-block;width:22px"></span>';
    return `<tr class="n${nivel}"><td>${btn}${esc(rotulo)}</td><td class="mut area" title="${esc(area)}">${esc(area)}</td>${COLS.map((col) => td(col, m)).join('')}</tr>`;
  };
  let corpo = '';
  for (const { r, m } of ordenar(E.agregar(fatos, ['cliente']))) {
    const cid = r.chave[0];
    const doCli = fatos.filter((f) => f.clienteId === cid);
    corpo += linha(0, `c:${cid}`, nomeCliente(cid), areasDoCliente(doCli), m, true);
    if (!ui.aberto.has(`c:${cid}`)) continue;
    for (const { r: rp, m: mp } of ordenar(E.agregar(doCli, ['projeto']))) {
      const pid = rp.chave[0];
      const p = M().projetos.get(pid);
      const rot = `${nomeProjeto(pid)} · ${p?.modalidade === 'fixo' ? 'fixo' : 'por hora'}`;
      corpo += linha(1, `p:${pid}`, rot, nomeArea(p?.areaId), mp, true);
      if (!ui.aberto.has(`p:${pid}`)) continue;
      const meses = E.agregar(doCli.filter((f) => f.projetoId === pid), ['mes']).sort((a, b) => a.chave[0].localeCompare(b.chave[0]));
      for (const rm of meses) {
        const k = `m:${pid}:${rm.chave[0]}`;
        corpo += linha(2, k, nomeMes(rm.chave[0]), '', E.metricas(rm), true);
        if (ui.aberto.has(k)) corpo += detalheMes(pid, rm.chave[0], nCols);
      }
    }
  }

  const prejuizo = E.agregar(fatos, ['cliente', 'projeto'])
    .map((r) => ({ r, m: E.metricas(r) }))
    .filter((x) => x.m.margemLiquida < 0)
    .sort((a, b) => a.m.margemLiquida - b.m.margemLiquida);

  return `
  <h1>Painel de lucratividade</h1>
  ${filtrosPeriodo()}
  <div class="kpis">
    ${kpi('Faturado', brl(t.faturado), `Valor de tabela ${brl(t.valorTabela)}`)}
    ${kpi('Custo efetivo dos projetos', brl(t.custoEfetivo), `Direto ${brl(t.custoDireto)} + rateio ${brl(t.custoRateio)}`)}
    ${kpi('Margem bruta', brl(t.margemBruta), `${pct(t.pctBruta)} do faturado`, cor(t.margemBruta))}
    ${kpi('Margem líquida', brl(t.margemLiquida), `${pct(t.pctLiquida)} do faturado`, cor(t.margemLiquida))}
    ${kpi('Horas lançadas', hrs(t.horas), `Faturado/h ${brl(t.receitaHora)} · custo/h ${brl(t.custoEfetivoHora)}`)}
    ${kpi('Realização', pct(t.realizacao), 'Faturado ÷ valor de tabela')}
    ${ui.area ? '' : kpi('Custo não absorvido', brl(naoAbs), `${pct(custoTotal ? naoAbs / custoTotal : null)} do custo total — horas não lançadas`, naoAbs > 0 ? 'aviso' : '')}
  </div>

  <h2>Por cliente, projeto e mês</h2>
  <div class="cartao rolagem tabela-dicas"><table>
    <thead><tr><th>Cliente / projeto / mês${dica('Clique em ▸ para abrir. O mês abre os serviços prestados e a composição do custo por advogado.', 'esq')}</th><th>Área${dica('Área do projeto (sócio responsável). No cliente, lista as áreas dos projetos dele.', 'esq')}</th>${COLS.map((col, i) => th(col, false, i >= COLS.length - 3 ? 'dir' : 'meio')).join('')}</tr></thead>
    <tbody>${corpo || `<tr><td colspan="${nCols}" class="mut">Sem dados no período.</td></tr>`}</tbody>
    <tfoot><tr><td>Total</td><td></td>${COLS.map((col) => td(col, t)).join('')}</tr></tfoot>
  </table></div>

  ${prejuizo.length ? `<h2>Projetos com margem líquida negativa no período</h2>
  <div class="cartao rolagem tabela-dicas"><table>
    <thead><tr>
      <th>Cliente</th><th>Projeto</th><th>Área${dica(DICAS.area, 'esq')}</th>
      <th class="n">Horas${dica(DICAS.horas, 'meio')}</th><th class="n">Faturado${dica(DICAS.faturado, 'meio')}</th>
      <th class="n">Custo efetivo${dica(DICAS.custoEfetivo, 'meio')}</th><th class="n">Margem líquida${dica(DICAS.margemLiquida)}</th>
      <th class="n">Realização${dica(DICAS.realizacao)}</th></tr></thead>
    <tbody>${prejuizo.map(({ r, m }) => `<tr><td>${esc(nomeCliente(r.chave[0]))}</td><td>${esc(nomeProjeto(r.chave[1]))}</td><td class="mut">${esc(nomeArea(M().projetos.get(r.chave[1])?.areaId))}</td><td class="n">${hrs(m.horas)}</td><td class="n">${brl(m.faturado)}</td><td class="n">${brl(m.custoEfetivo)}</td><td class="n neg">${brl(m.margemLiquida)}</td><td class="n">${pct(m.realizacao)}</td></tr>`).join('')}</tbody>
  </table></div>` : ''}

  <h2>Escritório mês a mês</h2>
  ${secaoGrafico(fatos, mensal)}
  <div class="cartao rolagem tabela-dicas" style="margin-top:12px"><table>
    <thead><tr><th>Mês</th>
      <th class="n">Horas${dica('Total de horas lançadas no mês, em todos os projetos.', 'meio')}</th>
      <th class="n">Faturado${dica('Soma das faturas com competência no mês (faturado = recebido).', 'meio')}</th>
      <th class="n">Custo pessoal${dica('Soma do custo mensal vigente (remuneração + encargos) dos advogados ativos no mês.', 'meio')}</th>
      <th class="n">Despesas fixas${dica('Soma das despesas do escritório vigentes no mês (aluguel, condomínio, secretaria, sistemas…).', 'meio')}</th>
      <th class="n">Absorvido nos projetos${dica('Parte do custo (pessoal + despesas) coberta por horas lançadas: Σ horas × custo efetivo/h de cada advogado.', 'meio')}</th>
      <th class="n">Não absorvido${dica('Custo pessoal + despesas − absorvido. Custo que nenhum projeto carregou: ociosidade e horas administrativas não lançadas.')}</th>
      <th class="n">Resultado${dica('Faturado − custo pessoal − despesas fixas. Resultado do escritório no mês.')}</th></tr></thead>
    <tbody>${mensal.map((m) => `<tr><td>${nomeMes(m.mes)}</td><td class="n">${hrs(m.horas)}</td><td class="n">${brl(m.faturado)}</td><td class="n">${brl(m.custoPessoal)}</td><td class="n">${brl(m.despesas)}</td><td class="n">${brl(m.absorvido)}</td><td class="n aviso">${brl(m.naoAbsorvido)}</td><td class="n ${cor(m.resultado)}">${brl(m.resultado)}</td></tr>`).join('')}</tbody>
  </table></div>
  ${c.avisos.length ? `<h2>Avisos de consistência</h2><ul>${c.avisos.map((a) => `<li class="aviso">${esc(a)}</li>`).join('')}</ul>` : ''}`;
}

// ---------------- Gráfico: faturado mensal empilhado por área ----------------
// Cores seguem a ENTIDADE (ordem das áreas no cadastro), nunca o ranking: filtrar não repinta.
// Paleta validada (dataviz/validate_palette.js) nos dois temas — ver --serie-* em styles.css.
const MAX_SERIES = 7;
let grafico = null; // preparado em vPainel; desenhado após o render (precisa da largura real)

function secaoGrafico(fatos, mensal) {
  const dim = ui.grafArea === 'areaAdvogado' ? 'areaAdvogadoId' : 'areaProjetoId';
  const ordem = db.areas.map((a) => a.id);
  const cores = new Map(ordem.slice(0, MAX_SERIES).map((id, i) => [id, `var(--serie-${i + 1})`]));
  const valor = new Map();
  for (const f of fatos) {
    const sid = cores.has(f[dim]) ? f[dim] : 'outras';
    const k = `${f.mes}|${sid}`;
    valor.set(k, (valor.get(k) || 0) + f.faturado);
  }
  const meses = mensal.map((m) => m.mes);
  const series = [
    ...ordem.filter((id) => cores.has(id)).map((id) => ({ id, t: nomeArea(id), cor: cores.get(id) })),
    { id: 'outras', t: 'Outras áreas', cor: 'var(--serie-outros)' },
  ].filter((s) => meses.some((m) => (valor.get(`${m}|${s.id}`) || 0) > 0.5));
  const comCusto = !ui.area;
  grafico = {
    meses,
    series,
    v: (m, sid) => valor.get(`${m}|${sid}`) || 0,
    custo: comCusto ? new Map(mensal.map((m) => [m.mes, m.custoTotal])) : null,
  };
  const legenda = series
    .map((s) => `<span class="leg"><i class="leg-q" style="background:${s.cor}"></i>${esc(s.t)}</span>`)
    .join('') + (comCusto ? '<span class="leg"><i class="leg-l"></i>Custo total do escritório</span>' : '');
  const tabela = `<details class="graf-dados"><summary>Ver dados do gráfico</summary>
    <div class="rolagem"><table><thead><tr><th>Área</th>${meses.map((m) => `<th class="n">${nomeMes(m)}</th>`).join('')}<th class="n">Total</th></tr></thead>
    <tbody>${series.map((s) => `<tr><td>${esc(s.t)}</td>${meses.map((m) => `<td class="n">${brl(grafico.v(m, s.id))}</td>`).join('')}<td class="n">${brl(meses.reduce((a, m) => a + grafico.v(m, s.id), 0))}</td></tr>`).join('')}
    ${comCusto ? `<tr><td>Custo total</td>${meses.map((m) => `<td class="n">${brl(grafico.custo.get(m))}</td>`).join('')}<td class="n">${brl(mensal.reduce((a, m) => a + m.custoTotal, 0))}</td></tr>` : ''}</tbody></table></div></details>`;
  return `<div class="cartao grafico">
    <div class="graf-topo">
      <div><div class="graf-titulo">Faturado por mês, por área${dica('Barras = faturado no mês (competência), empilhado por área. Linha = custo total do escritório (pessoal + despesas fixas). Onde a barra passa da linha, o mês deu resultado positivo.', 'esq')}</div>
      <div class="legenda">${legenda}</div></div>
      <label class="campo">Empilhar por
        <select data-ui="grafArea">
          <option value="areaProjeto" ${ui.grafArea !== 'areaAdvogado' ? 'selected' : ''}>Área do projeto</option>
          <option value="areaAdvogado" ${ui.grafArea === 'areaAdvogado' ? 'selected' : ''}>Área do advogado (participação por horas)</option>
        </select></label>
    </div>
    <div id="grafFat" class="graf-area" tabindex="0" role="img" aria-label="Gráfico de barras empilhadas do faturado mensal por área${comCusto ? ', com linha do custo total do escritório' : ''}. Use as setas para percorrer os meses; os valores também estão em “Ver dados do gráfico”."></div>
    ${comCusto ? '' : '<p class="nota" style="margin:0 14px 10px">Com filtro de área, a linha de custo total do escritório fica oculta (o custo é consolidado).</p>'}
    ${tabela}
  </div>`;
}

function escalaY(max) {
  const bruto = max / 5 || 1;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((p) => p >= bruto);
  const hi = Math.ceil(max / passo) * passo || passo;
  const ticks = [];
  for (let v = 0; v <= hi + passo / 2; v += passo) ticks.push(v);
  return { hi, ticks };
}
const brlCurto = (v) =>
  Math.abs(v) >= 1e6 ? `R$ ${fNum1.format(v / 1e6)} mi` : v === 0 ? 'R$ 0' : `R$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} mil`;

function desenharGrafico() {
  const el = document.getElementById('grafFat');
  if (!el || !grafico) return;
  const g = grafico;
  const W = el.clientWidth;
  const H = 300;
  const m = { l: 74, r: 16, t: 14, b: 30 };
  const iw = Math.max(50, W - m.l - m.r);
  const ih = H - m.t - m.b;
  const n = g.meses.length;
  if (!n) { el.innerHTML = '<p class="mut" style="padding:14px">Sem dados no período.</p>'; return; }
  const totais = g.meses.map((mes) => g.series.reduce((s, se) => s + g.v(mes, se.id), 0));
  const { hi, ticks } = escalaY(Math.max(1, ...totais, ...(g.custo ? g.meses.map((mm) => g.custo.get(mm) || 0) : [])));
  const y = (v) => m.t + ih - (v / hi) * ih;
  const banda = iw / n;
  const bw = Math.min(24, banda * 0.6);
  const cx = (i) => m.l + banda * i + banda / 2;
  const r2 = (v) => Math.round(v * 10) / 10;

  let svg = '';
  for (const t of ticks) {
    svg += `<line class="g-grade" x1="${m.l}" x2="${m.l + iw}" y1="${r2(y(t))}" y2="${r2(y(t))}"/>`;
    svg += `<text class="g-eixo" x="${m.l - 8}" y="${r2(y(t)) + 4}" text-anchor="end">${brlCurto(t)}</text>`;
  }
  svg += `<g class="g-hl"></g>`;
  g.meses.forEach((mes, i) => {
    svg += `<text class="g-eixo" x="${r2(cx(i))}" y="${H - 8}" text-anchor="middle">${nomeMes(mes)}</text>`;
    let acc = 0;
    const segs = g.series.map((s) => ({ s, v: g.v(mes, s.id) })).filter((x) => x.v > 0.5);
    segs.forEach(({ s, v }, j) => {
      let topo = y(acc + v);
      let base = y(acc);
      acc += v;
      if (j > 0) base -= 1; // 2px de respiro entre segmentos (1px de cada lado)
      if (j < segs.length - 1) topo += 1;
      const h = base - topo;
      if (h < 0.5) return;
      const x0 = cx(i) - bw / 2;
      if (j === segs.length - 1) {
        const rr = Math.min(4, h, bw / 2); // ponta de dado arredondada, base reta
        svg += `<path fill="${s.cor}" d="M${r2(x0)},${r2(base)}V${r2(topo + rr)}Q${r2(x0)},${r2(topo)} ${r2(x0 + rr)},${r2(topo)}H${r2(x0 + bw - rr)}Q${r2(x0 + bw)},${r2(topo)} ${r2(x0 + bw)},${r2(topo + rr)}V${r2(base)}Z"/>`;
      } else {
        svg += `<rect fill="${s.cor}" x="${r2(x0)}" y="${r2(topo)}" width="${r2(bw)}" height="${r2(h)}"/>`;
      }
    });
  });
  if (g.custo) {
    const pts = g.meses.map((mes, i) => `${r2(cx(i))},${r2(y(g.custo.get(mes) || 0))}`);
    svg += `<polyline class="g-linha" points="${pts.join(' ')}"/>`;
    for (const p of pts) {
      const [px, py] = p.split(',');
      svg += `<circle class="g-ponto" cx="${px}" cy="${py}" r="4"/>`;
    }
  }
  g.meses.forEach((_, i) => {
    svg += `<rect class="g-alvo" data-i="${i}" x="${r2(m.l + banda * i)}" y="${m.t}" width="${r2(banda)}" height="${ih}"/>`;
  });
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${svg}</svg><div class="g-tip" hidden></div>`;

  const tip = el.querySelector('.g-tip');
  const hl = el.querySelector('.g-hl');
  const mostrar = (i) => {
    const mes = g.meses[i];
    hl.innerHTML = `<rect class="g-banda" x="${r2(m.l + banda * i)}" y="${m.t}" width="${r2(banda)}" height="${ih}"/>`;
    const fat = totais[i];
    const linhas = [...g.series].reverse()
      .map((s) => ({ s, v: g.v(mes, s.id) }))
      .filter((x) => x.v > 0.5)
      .map(({ s, v }) => `<div class="tip-l"><i class="leg-q" style="background:${s.cor}"></i><span>${esc(s.t)}</span><b>${brl(v)}</b></div>`)
      .join('');
    const custo = g.custo?.get(mes);
    tip.innerHTML = `<div class="tip-t">${nomeMes(mes)}</div>${linhas}
      <div class="tip-l tip-tot"><span>Faturado</span><b>${brl(fat)}</b></div>
      ${g.custo ? `<div class="tip-l"><i class="leg-l"></i><span>Custo total</span><b>${brl(custo)}</b></div>
      <div class="tip-l tip-tot"><span>Resultado</span><b>${brl(fat - custo)}</b></div>` : ''}`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = cx(i) + bw / 2 + 12;
    if (left + tw > W - 4) left = cx(i) - bw / 2 - 12 - tw;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${m.t}px`;
    el.dataset.i = i;
  };
  const esconder = () => { tip.hidden = true; hl.innerHTML = ''; };
  el.querySelectorAll('.g-alvo').forEach((r) => r.addEventListener('pointerenter', () => mostrar(Number(r.dataset.i))));
  el.addEventListener('pointerleave', esconder);
  el.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') return esconder();
    const atual = el.dataset.i != null && !tip.hidden ? Number(el.dataset.i) : -1;
    const prox = { ArrowLeft: atual - 1, ArrowRight: atual + 1, Home: 0, End: n - 1 }[e.key];
    mostrar(Math.min(n - 1, Math.max(0, prox < 0 && atual === -1 ? 0 : prox)));
  };
  el.onblur = esconder;
}

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(desenharGrafico, 120); });

// ---------------- Análise ----------------
const PIVOS = {
  cliente: { t: 'Cliente', dims: ['cliente'] },
  projeto: { t: 'Cliente › Projeto', dims: ['cliente', 'projeto'] },
  projetoMes: { t: 'Cliente › Projeto › Mês', dims: ['cliente', 'projeto', 'mes'] },
  mes: { t: 'Mês', dims: ['mes'] },
  advogado: { t: 'Advogado', dims: ['advogado'] },
  advogadoProjeto: { t: 'Advogado › Cliente › Projeto', dims: ['advogado', 'cliente', 'projeto'] },
  areaProjeto: { t: 'Área do projeto', dims: ['areaProjeto'] },
  areaAdvogado: { t: 'Área do advogado (participação por horas)', dims: ['areaAdvogado'] },
};

function linhasAnalise() {
  const c = calc();
  const piv = PIVOS[ui.pivo];
  const fatos = E.filtrarFatos(c.fatos, { de: ui.de, ate: ui.ate, areaId: ui.area });
  const linhas = E.agregar(fatos, piv.dims).map((r) => ({
    rotulos: r.chave.map((k, i) => ROTULO_DIM[piv.dims[i]](k)),
    chave: r.chave,
    m: E.metricas(r),
  }));
  const { k, d } = ui.ord;
  const val = (x) => {
    if (/^d\d$/.test(k)) {
      const i = Number(k[1]);
      return piv.dims[i] === 'mes' ? x.chave[i] : x.rotulos[i] ?? '';
    }
    return x.m[k] ?? -Infinity;
  };
  linhas.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    return (typeof va === 'string' ? va.localeCompare(vb, 'pt-BR') : va - vb) * d;
  });
  return { piv, linhas, total: E.metricas(E.somar(fatos)) };
}

function vAnalise() {
  const { piv, linhas, total } = linhasAnalise();
  const cols = [...COLS, ...COLS_EXTRA];
  const thDim = piv.dims
    .map((dim, i) => `<th class="ord" data-act="ordenar" data-k="d${i}">${TITULO_DIM[dim]}${ui.ord.k === `d${i}` ? (ui.ord.d > 0 ? ' ▲' : ' ▼') : ''}</th>`)
    .join('');
  return `
  <h1>Análise de lucratividade</h1>
  <p class="sub">Escolha a quebra, clique no cabeçalho para ordenar e exporte para Excel (CSV). A visão por advogado distribui a receita do projeto pela participação de cada um no valor de tabela — base para a conversa sobre bônus.</p>
  ${filtrosPeriodo()}
  <div class="filtros">
    <label class="campo">Quebra<select data-ui="pivo">${Object.entries(PIVOS)
      .map(([k, p]) => `<option value="${k}" ${k === ui.pivo ? 'selected' : ''}>${p.t}</option>`)
      .join('')}</select></label>
    <button data-act="exportarAnalise">Exportar CSV</button>
    <span class="nota">${linhas.length} linha(s)</span>
  </div>
  <div class="cartao rolagem"><table>
    <thead><tr>${thDim}${cols.map((col) => th(col, true)).join('')}</tr></thead>
    <tbody>${linhas
      .map((l) => `<tr>${l.rotulos.map((r, i) => `<td>${piv.dims[i] === 'mes' ? nomeMes(l.chave[i]) : esc(r)}</td>`).join('')}${cols.map((col) => td(col, l.m)).join('')}</tr>`)
      .join('')}</tbody>
    <tfoot><tr><td colspan="${piv.dims.length}">Total</td>${cols.map((col) => td(col, total)).join('')}</tr></tfoot>
  </table></div>`;
}

function csv(linhas) {
  const cel = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '';
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
}

function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- Custo hora ----------------
function vCustoHora() {
  const c = calc();
  if (!ui.chMes || !c.meses.includes(ui.chMes)) ui.chMes = ui.ate || c.meses.at(-1);
  const ch = c.custoHora.get(ui.chMes) || E.custoHoraDoMes(db, ui.chMes);
  const cfg = { ...E.CONFIG_PADRAO, ...db.config };
  const linhas = [...ch.advogados.values()]
    .map((x) => ({ ...x, adv: M().advogados.get(x.advogadoId) }))
    .sort((a, b) => b.custoEfetivoHora - a.custoEfetivoHora);
  const soma = (k) => linhas.reduce((s, x) => s + x[k], 0);
  const metodo = { por_cabeca: 'igual por advogado ativo (por cabeça)', proporcional_custo: 'proporcional ao custo mensal de cada advogado', proporcional_horas: 'proporcional às horas lançadas no mês' }[cfg.rateioMetodo];
  return `
  <h1>Custo hora dos advogados</h1>
  <p class="sub">O custo efetivo da hora soma o custo do próprio advogado (remuneração + encargos) à cota dele nas despesas fixas do escritório (aluguel, condomínio, secretaria, sistemas, material…).</p>
  <div class="filtros">
    <label class="campo">Mês<select data-ui="chMes">${opcoesMes(ui.chMes)}</select></label>
    <span class="nota">Rateio: <b>${metodo}</b> · base de horas: <b>${cfg.baseHoras === 'lancadas' ? 'horas lançadas no mês' : 'capacidade (horas disponíveis/mês)'}</b></span>
  </div>
  <div class="grade2" style="margin-bottom:16px">
    <div class="caixa"><div class="formula">custo direto/h  = custo mensal ÷ horas base
rateio/h        = (despesas fixas do mês × peso) ÷ horas base
custo efetivo/h = custo direto/h + rateio/h
margem/h        = valor hora de tabela − custo efetivo/h</div></div>
    <div class="caixa">
      <div class="kpis" style="margin:0">
        <div class="kpi"><div class="rot">Despesas fixas do mês</div><div class="val">${brl(ch.despesas)}</div><div class="det">${linhas.length} advogado(s) ativos</div></div>
        <div class="kpi"><div class="rot">Custo de pessoal</div><div class="val">${brl(ch.custoPessoal)}</div><div class="det">Total ${brl(ch.custoPessoal + ch.despesas)}</div></div>
      </div>
    </div>
  </div>
  <div class="cartao rolagem"><table>
    <thead><tr><th>Advogado</th><th>Cargo</th><th>Área</th><th class="n">Custo mensal</th><th class="n">Cota de despesas</th><th class="n">Horas base</th><th class="n">Horas lançadas</th><th class="n">Ocupação</th><th class="n">Custo direto/h</th><th class="n">Rateio/h</th><th class="n">Custo efetivo/h</th><th class="n">Valor tabela/h</th><th class="n">Margem/h</th><th class="n" title="Valor de tabela ÷ custo efetivo">Multiplicador</th></tr></thead>
    <tbody>${linhas
      .map((x) => {
        const mh = x.valorHoraTabela - x.custoEfetivoHora;
        return `<tr><td><b>${esc(x.adv?.sigla)}</b> ${esc(x.adv?.nome)}</td><td>${esc(x.adv?.cargo)}</td><td>${esc(nomeArea(x.adv?.areaId))}</td><td class="n">${brl(x.custoMensal)}</td><td class="n">${brl(x.cotaRateio)}</td><td class="n">${hrs(x.horasBase)}</td><td class="n">${hrs(x.horasLancadas)}</td><td class="n">${pct(x.horasCapacidade ? x.horasLancadas / x.horasCapacidade : null)}</td><td class="n">${brl2(x.custoDiretoHora)}</td><td class="n">${brl2(x.rateioHora)}</td><td class="n"><b>${brl2(x.custoEfetivoHora)}</b></td><td class="n">${brl2(x.valorHoraTabela)}</td><td class="n ${cor(mh)}">${brl2(mh)}</td><td class="n">${x.custoEfetivoHora ? fNum2.format(x.valorHoraTabela / x.custoEfetivoHora) + '×' : '—'}</td></tr>`;
      })
      .join('')}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="n">${brl(soma('custoMensal'))}</td><td class="n">${brl(soma('cotaRateio'))}</td><td class="n">${hrs(soma('horasBase'))}</td><td class="n">${hrs(soma('horasLancadas'))}</td><td colspan="7"></td></tr></tfoot>
  </table></div>
  <p class="nota">Para reajustes (salário, condomínio etc.) cadastre um novo registro com a nova vigência em <a href="#/cadastros/custosAdvogado">Custos dos advogados</a> ou <a href="#/cadastros/despesas">Despesas</a>; os meses anteriores continuam com o valor antigo.</p>`;
}

// ---------------- Relatório de fatura ----------------
function vRelatorio() {
  const c = calc();
  const clientes = [...db.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (!ui.rel.cliente || !M().clientes.has(ui.rel.cliente)) ui.rel.cliente = clientes[0]?.id || '';
  if (!ui.rel.mes || !c.meses.includes(ui.rel.mes)) ui.rel.mes = ui.ate;
  const { cliente, mes, interno } = ui.rel;
  const projs = new Set(db.projetos.filter((p) => p.clienteId === cliente).map((p) => p.id));
  const lancs = db.lancamentos
    .filter((l) => projs.has(l.projetoId) && E.mesDe(l.data) === mes)
    .sort((a, b) => a.projetoId.localeCompare(b.projetoId) || a.data.localeCompare(b.data));
  const ch = c.custoHora.get(mes);
  const custoH = (l) => ch?.advogados.get(l.advogadoId)?.custoEfetivoHora ?? 0;
  const vh = (l) => (l.valorHora != null && l.valorHora !== '' ? Number(l.valorHora) : Number(M().advogados.get(l.advogadoId)?.valorHoraTabela) || 0);

  const grupos = new Map();
  for (const l of lancs) {
    if (!grupos.has(l.projetoId)) grupos.set(l.projetoId, []);
    grupos.get(l.projetoId).push(l);
  }
  const nCol = interno ? 7 : 5;
  let corpo = '';
  let tH = 0, tV = 0, tC = 0;
  for (const [pid, ls] of grupos) {
    const p = M().projetos.get(pid);
    corpo += `<tr class="n1"><td colspan="${nCol}"><b>${esc(p?.nome)}</b> <span class="tag">${p?.modalidade === 'fixo' ? `fixo ${brl(p.valorFixoMensal)}/mês` : 'por hora'}</span></td></tr>`;
    let h = 0, v = 0, cu = 0;
    for (const l of ls) {
      const valor = l.horas * vh(l);
      const custo = l.horas * custoH(l);
      h += l.horas; v += valor; cu += custo;
      corpo += `<tr><td>${dataBR(l.data)}</td><td><b>${esc(siglaAdv(l.advogadoId))}</b></td><td class="quebra">${esc(l.descricao)}</td><td class="n">${hrs(l.horas)}</td><td class="n">${brl2(valor)}</td>${interno ? `<td class="n">${brl2(custo)}</td><td class="n ${cor(valor - custo)}">${brl2(valor - custo)}</td>` : ''}</tr>`;
    }
    corpo += `<tr><td colspan="3" class="mut">Subtotal</td><td class="n"><b>${hrs(h)}</b></td><td class="n"><b>${brl2(v)}</b></td>${interno ? `<td class="n"><b>${brl2(cu)}</b></td><td class="n ${cor(v - cu)}"><b>${brl2(v - cu)}</b></td>` : ''}</tr>`;
    tH += h; tV += v; tC += cu;
  }

  const faturas = db.faturas.filter((f) => f.clienteId === cliente && f.competencia === mes);
  const fatosCli = E.filtrarFatos(c.fatos, { de: mes, ate: mes, clienteId: cliente });
  const porProj = E.agregar(fatosCli, ['projeto']).map((r) => ({ id: r.chave[0], m: E.metricas(r) }));
  const tot = E.metricas(E.somar(fatosCli));

  return `
  <div class="cab-relatorio">
    <div><h1>Relatório de horas por cliente</h1>
    <p class="sub" style="margin:0">Reproduz o relatório enviado ao cliente (data, sigla, serviço, horas, valor). A visão interna acrescenta custo efetivo e margem por lançamento.</p></div>
    <div class="acoes noprint"><button data-act="imprimir">Imprimir / PDF</button></div>
  </div>
  <div class="filtros">
    <label class="campo">Cliente<select data-ui="rel.cliente">${clientes.map((x) => `<option value="${x.id}" ${x.id === cliente ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
    <label class="campo">Competência<select data-ui="rel.mes">${opcoesMes(mes)}</select></label>
    <label class="campo" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-ui="rel.interno" ${interno ? 'checked' : ''}> Visão interna (custos e margem)</label>
  </div>
  <h2 style="margin-top:0">${esc(nomeCliente(cliente))} — ${nomeMes(mes)}</h2>
  <div class="cartao rolagem"><table>
    <thead><tr><th>Data</th><th>Adv.</th><th>Serviço prestado</th><th class="n">Horas</th><th class="n">Valor</th>${interno ? '<th class="n">Custo efetivo</th><th class="n">Margem s/ tabela</th>' : ''}</tr></thead>
    <tbody>${corpo || `<tr><td colspan="${nCol}" class="mut">Nenhum lançamento neste mês.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="n">${hrs(tH)}</td><td class="n">${brl2(tV)}</td>${interno ? `<td class="n">${brl2(tC)}</td><td class="n ${cor(tV - tC)}">${brl2(tV - tC)}</td>` : ''}</tr></tfoot>
  </table></div>
  ${interno ? `
  <div class="grade2" style="margin-top:16px">
    <div class="caixa"><h2 style="margin-top:0">Faturas da competência</h2>
      ${faturas.length ? `<table><thead><tr><th>Número</th><th class="n">Valor</th><th>Divisão por projeto</th></tr></thead><tbody>${faturas
        .map((f) => `<tr><td>${esc(f.numero)}</td><td class="n">${brl2(f.valor)}</td><td class="quebra">${resumoDivisao(f)}</td></tr>`)
        .join('')}</tbody></table>` : '<p class="mut">Nenhuma fatura emitida para esta competência.</p>'}
    </div>
    <div class="caixa"><h2 style="margin-top:0">Resultado do mês por projeto</h2>
      <table><thead><tr><th>Projeto</th><th class="n">Faturado</th><th class="n">Custo efetivo</th><th class="n">Margem líq.</th></tr></thead>
      <tbody>${porProj.map(({ id, m }) => `<tr><td>${esc(nomeProjeto(id))}</td><td class="n">${brl(m.faturado)}</td><td class="n">${brl(m.custoEfetivo)}</td><td class="n ${cor(m.margemLiquida)}">${brl(m.margemLiquida)} <span class="mut">${pct(m.pctLiquida)}</span></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${brl(tot.faturado)}</td><td class="n">${brl(tot.custoEfetivo)}</td><td class="n ${cor(tot.margemLiquida)}">${brl(tot.margemLiquida)}</td></tr></tfoot></table>
    </div>
  </div>` : ''}`;
}

/** Texto da divisão de uma fatura entre projetos (informada ou automática). */
function resumoDivisao(f) {
  const a = calc().alocacaoPorFatura.get(f.id);
  if (!a?.partes.length) return '<span class="neg">sem projeto</span>';
  const partes = a.partes
    .map((p) => `${esc(nomeProjeto(p.projetoId))}: ${brl2(f.valor * p.pct)}`)
    .join(' · ');
  return a.modo === 'automatico' ? `<span class="tag at">automática</span> ${partes}` : partes;
}

// ---------------- Cadastros ----------------
const ROT_REF = {
  areas: (a) => a.nome,
  advogados: (a) => `${a.sigla} — ${a.nome}`,
  clientes: (c) => c.nome,
  projetos: (p) => `${nomeCliente(p.clienteId)} › ${p.nome}`,
  faturas: (f) => `${f.numero} · ${nomeCliente(f.clienteId)} · ${nomeMes(f.competencia)}`,
};
const MODALIDADES = [{ v: 'fixo', t: 'Valor fixo mensal' }, { v: 'hora', t: 'Por hora' }];

const ENT = {
  advogados: {
    t: 'Advogados', um: 'advogado', prefixo: 'adv',
    ajuda: 'O custo mensal de cada advogado (remuneração + encargos) fica em “Custos dos advogados”, com histórico por vigência.',
    campos: [
      { k: 'nome', t: 'Nome', tipo: 'text', req: true },
      { k: 'sigla', t: 'Sigla', tipo: 'text', req: true },
      { k: 'areaId', t: 'Área', tipo: 'ref', ref: 'areas', req: true },
      { k: 'cargo', t: 'Cargo', tipo: 'select', opcoes: E.CARGOS.map((c) => ({ v: c, t: c })) },
      { k: 'valorHoraTabela', t: 'Valor hora (tabela)', tipo: 'money', req: true },
      { k: 'horasMes', t: 'Horas disponíveis/mês', tipo: 'number', req: true },
      { k: 'ativoDesde', t: 'Ativo desde', tipo: 'month', req: true },
      { k: 'ativoAte', t: 'Ativo até', tipo: 'month' },
    ],
    extras: [{ t: 'Custo mensal vigente', f: (a) => brl(E.custoMensalVigente(db.custosAdvogado, a.id, E.mesDe(hoje()))) }],
  },
  custosAdvogado: {
    t: 'Custos dos advogados', um: 'custo', prefixo: 'cst',
    ajuda: 'Para um reajuste, crie um novo registro com a nova vigência: o histórico é preservado e os meses anteriores não mudam.',
    campos: [
      { k: 'advogadoId', t: 'Advogado', tipo: 'ref', ref: 'advogados', req: true },
      { k: 'vigenciaInicio', t: 'Vigente a partir de', tipo: 'month', req: true },
      { k: 'custoMensal', t: 'Custo mensal (remuneração + encargos)', tipo: 'money', req: true },
      { k: 'observacao', t: 'Observação', tipo: 'text' },
    ],
    ordem: (a, b) => siglaAdv(a.advogadoId).localeCompare(siglaAdv(b.advogadoId)) || a.vigenciaInicio.localeCompare(b.vigenciaInicio),
  },
  despesas: {
    t: 'Despesas do escritório', um: 'despesa', prefixo: 'dsp',
    ajuda: 'Despesas fixas mensais, rateadas entre os advogados ativos. Para reajuste (ex.: condomínio), encerre a vigência atual e crie um novo registro.',
    campos: [
      { k: 'descricao', t: 'Descrição', tipo: 'text', req: true },
      { k: 'categoria', t: 'Categoria', tipo: 'text' },
      { k: 'valorMensal', t: 'Valor mensal', tipo: 'money', req: true },
      { k: 'vigenciaInicio', t: 'Vigente a partir de', tipo: 'month', req: true },
      { k: 'vigenciaFim', t: 'Vigente até', tipo: 'month' },
    ],
  },
  areas: {
    t: 'Áreas', um: 'área', prefixo: 'ar',
    campos: [
      { k: 'nome', t: 'Nome', tipo: 'text', req: true },
      { k: 'socioId', t: 'Sócio responsável', tipo: 'ref', ref: 'advogados' },
    ],
  },
  clientes: {
    t: 'Clientes', um: 'cliente', prefixo: 'cli',
    campos: [
      { k: 'nome', t: 'Nome', tipo: 'text', req: true },
      { k: 'documento', t: 'CNPJ/CPF', tipo: 'text' },
    ],
    ordem: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  },
  projetos: {
    t: 'Projetos', um: 'projeto', prefixo: 'prj',
    ajuda: 'Cada projeto pertence a um cliente e a uma área. Projetos fixos usam o valor mensal como referência para dividir faturas únicas.',
    campos: [
      { k: 'clienteId', t: 'Cliente', tipo: 'ref', ref: 'clientes', req: true },
      { k: 'nome', t: 'Nome do projeto', tipo: 'text', req: true },
      { k: 'areaId', t: 'Área', tipo: 'ref', ref: 'areas', req: true },
      { k: 'modalidade', t: 'Modalidade', tipo: 'select', opcoes: MODALIDADES, req: true },
      { k: 'valorFixoMensal', t: 'Valor fixo mensal', tipo: 'money' },
    ],
    ordem: (a, b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'),
  },
  lancamentos: {
    t: 'Lançamentos (timesheet)', um: 'lançamento', prefixo: 'lan', filtroMes: 'data',
    ajuda: 'Na versão real, estes dados virão do WK (timesheet).',
    campos: [
      { k: 'data', t: 'Data', tipo: 'date', req: true },
      { k: 'advogadoId', t: 'Advogado', tipo: 'ref', ref: 'advogados', req: true },
      { k: 'projetoId', t: 'Cliente › Projeto', tipo: 'ref', ref: 'projetos', req: true },
      { k: 'horas', t: 'Horas', tipo: 'number', req: true, passo: 0.25 },
      { k: 'descricao', t: 'Serviço prestado', tipo: 'textarea' },
      { k: 'valorHora', t: 'Valor hora (vazio = tabela do advogado)', tipo: 'money' },
    ],
    ordem: (a, b) => b.data.localeCompare(a.data),
  },
  faturas: {
    t: 'Faturas', um: 'fatura', prefixo: 'fat', filtroMes: 'competencia',
    ajuda: 'A fatura já traz a divisão por projeto. Um projeto só: adicione uma linha com o projeto. Fatura única para vários projetos: uma linha por projeto, e a soma deve bater com o valor da fatura. Sem nenhuma linha, a divisão é automática (valor fixo mensal ou horas × tabela de cada projeto na competência). Premissa: faturado = recebido.',
    campos: [
      { k: 'numero', t: 'Número', tipo: 'text', req: true },
      { k: 'clienteId', t: 'Cliente', tipo: 'ref', ref: 'clientes', req: true },
      { k: 'competencia', t: 'Competência (mês do serviço)', tipo: 'month', req: true },
      { k: 'emissao', t: 'Emissão', tipo: 'date' },
      { k: 'valor', t: 'Valor da fatura', tipo: 'money', req: true },
      { k: 'itens', t: 'Divisão por projeto', tipo: 'itens' },
    ],
    ordem: (a, b) => b.competencia.localeCompare(a.competencia) || a.numero.localeCompare(b.numero),
  },
};

function fmtCampo(c, v) {
  if (v == null || v === '') return '<span class="mut">—</span>';
  switch (c.tipo) {
    case 'money': return brl2(Number(v));
    case 'number': return fNum2.format(Number(v));
    case 'month': return nomeMes(v);
    case 'date': return dataBR(v);
    case 'ref': { const r = M()[c.ref].get(v); return r ? esc(ROT_REF[c.ref](r)) : '<span class="neg">?</span>'; }
    case 'select': return esc(c.opcoes.find((o) => o.v === v)?.t ?? v);
    case 'itens':
      return Array.isArray(v) && v.length
        ? v.map((i) => `${esc(nomeProjeto(i.projetoId))}: ${brl2(Number(i.valor))}`).join('<br>')
        : '<span class="tag at">automática</span>';
    default: return esc(v);
  }
}

const LIMITE = 300;
function vCadastros(sub) {
  const chave = ENT[sub] ? sub : 'advogados';
  const ent = ENT[chave];
  const busca = ui.cad.busca.trim().toLowerCase();
  let regs = db[chave];
  if (ent.filtroMes && ui.cad.mes) regs = regs.filter((r) => E.mesDe(r[ent.filtroMes]) === ui.cad.mes);
  const linhas = [];
  for (const r of ent.ordem ? [...regs].sort(ent.ordem) : regs) {
    const cel = ent.campos.map((c) => fmtCampo(c, r[c.k]));
    if (busca && !cel.join(' ').replace(/<[^>]+>/g, '').toLowerCase().includes(busca)) continue;
    linhas.push({ r, cel });
  }
  const mesesFiltro = ent.filtroMes ? [...new Set(db[chave].map((r) => E.mesDe(r[ent.filtroMes])))].sort().reverse() : [];
  return `
  <h1>Cadastros</h1>
  <div class="abas" role="tablist">${Object.entries(ENT)
    .map(([k, e]) => `<a href="#/cadastros/${k}" ${k === chave ? 'aria-current="page"' : ''}>${e.t} <span class="mut">${db[k].length}</span></a>`)
    .join('')}</div>
  ${ent.ajuda ? `<p class="sub">${esc(ent.ajuda)}</p>` : ''}
  <div class="filtros">
    <button class="prim" data-act="novo" data-ent="${chave}">+ Novo ${esc(ent.um)}</button>
    <label class="campo">Buscar<input type="search" data-ui="cad.busca" value="${esc(ui.cad.busca)}" placeholder="texto…"></label>
    ${ent.filtroMes ? `<label class="campo">Mês<select data-ui="cad.mes"><option value="">Todos</option>${opcoesMes(ui.cad.mes, mesesFiltro)}</select></label>` : ''}
    <span class="nota">${linhas.length} registro(s)${linhas.length > LIMITE ? ` — exibindo ${LIMITE}; use os filtros` : ''}</span>
  </div>
  <div class="cartao rolagem"><table>
    <thead><tr>${ent.campos.map((c) => `<th class="${['money', 'number'].includes(c.tipo) ? 'n' : ''}">${esc(c.t)}</th>`).join('')}${(ent.extras || []).map((x) => `<th>${esc(x.t)}</th>`).join('')}<th class="noprint"></th></tr></thead>
    <tbody>${linhas
      .slice(0, LIMITE)
      .map(({ r, cel }) => `<tr>${cel.map((h, i) => `<td class="${['money', 'number'].includes(ent.campos[i].tipo) ? 'n' : ['textarea', 'itens'].includes(ent.campos[i].tipo) ? 'quebra' : ''}">${h}</td>`).join('')}${(ent.extras || [])
        .map((x) => `<td>${x.html ? x.f(r) : esc(x.f(r))}</td>`)
        .join('')}<td class="noprint"><button class="link" data-act="editar" data-ent="${chave}" data-id="${esc(r.id)}">Editar</button><button class="link perigo" data-act="excluir" data-ent="${chave}" data-id="${esc(r.id)}">Excluir</button></td></tr>`)
      .join('') || `<tr><td colspan="${ent.campos.length + 2}" class="mut">Nenhum registro.</td></tr>`}</tbody>
  </table></div>`;
}

const dlg = () => document.getElementById('dlg');

function inputCampo(c, v) {
  const id = `f_${c.k}`;
  const req = c.req ? 'required' : '';
  const val = esc(v ?? '');
  let ctl;
  switch (c.tipo) {
    case 'ref': {
      const opts = [...db[c.ref]].map((r) => ({ v: r.id, t: ROT_REF[c.ref](r) })).sort((a, b) => a.t.localeCompare(b.t, 'pt-BR'));
      ctl = `<select id="${id}" name="${c.k}" ${req}><option value="">${c.req ? 'Selecione…' : '(nenhum)'}</option>${opts.map((o) => `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
      break;
    }
    case 'select':
      ctl = `<select id="${id}" name="${c.k}" ${req}><option value="">Selecione…</option>${c.opcoes.map((o) => `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
      break;
    case 'textarea':
      ctl = `<textarea id="${id}" name="${c.k}" rows="3" ${req}>${val}</textarea>`;
      break;
    case 'money':
    case 'number':
      ctl = `<input id="${id}" name="${c.k}" type="number" min="0" step="${c.passo ?? (c.tipo === 'money' ? '0.01' : '1')}" value="${val}" ${req}>`;
      break;
    case 'itens':
      return `<fieldset class="itens"><legend>${esc(c.t)}</legend>
        <div id="itensLinhas">${(Array.isArray(v) ? v : []).map((i) => linhaItem(i)).join('')}</div>
        <div class="acoes"><button type="button" data-act="addItem">+ Adicionar projeto</button><span class="nota" id="itensSoma"></span></div>
        <p class="nota" style="margin:4px 0 0">Sem linhas = divisão automática entre os projetos do cliente.</p>
      </fieldset>`;
    default:
      ctl = `<input id="${id}" name="${c.k}" type="${c.tipo}" value="${val}" ${req}>`;
  }
  return `<label class="campo" for="${id}">${esc(c.t)}${c.req ? ' *' : ''}${ctl}</label>`;
}

// ---- divisão da fatura por projeto (dentro do formulário da fatura) ----
function opcoesProjetos(clienteId, sel) {
  const projs = db.projetos.filter((p) => !clienteId || p.clienteId === clienteId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return `<option value="">Projeto…</option>${projs.map((p) => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}`;
}
function linhaItem(item = {}, clienteId) {
  const cli = clienteId ?? document.getElementById('f_clienteId')?.value ?? M().projetos.get(item.projetoId)?.clienteId;
  return `<div class="item-linha">
    <select name="item_projeto" aria-label="Projeto">${opcoesProjetos(cli || M().projetos.get(item.projetoId)?.clienteId, item.projetoId)}</select>
    <input name="item_valor" type="number" min="0" step="0.01" value="${esc(item.valor ?? '')}" aria-label="Valor do projeto" placeholder="Valor">
    <button type="button" class="link perigo" data-act="remItem" aria-label="Remover projeto">✕</button>
  </div>`;
}
function atualizarSomaItens() {
  const el = document.getElementById('itensSoma');
  if (!el) return;
  const vals = [...document.querySelectorAll('[name="item_valor"]')].map((i) => Number(i.value) || 0);
  if (!vals.length) { el.textContent = ''; return; }
  const soma = vals.reduce((s, v) => s + v, 0);
  const total = Number(document.getElementById('f_valor')?.value) || 0;
  const dif = total - soma;
  el.innerHTML = `Soma ${brl2(soma)} · ${Math.abs(dif) < 0.01 ? '<span class="pos">confere com o valor da fatura</span>' : `<span class="neg">diferença ${brl2(dif)}</span>`}`;
}

function abrirForm(chave, id) {
  const ent = ENT[chave];
  const reg = id ? db[chave].find((x) => x.id === id) : padroes(chave);
  const d = dlg();
  d.innerHTML = `<form id="frm" novalidate>
    <h3>${id ? 'Editar' : 'Novo'} ${esc(ent.um)}</h3>
    ${ent.campos.map((c) => inputCampo(c, reg?.[c.k])).join('')}
    <div class="erro" id="frmErro" role="alert"></div>
    <div class="rodape"><button type="button" data-act="fecharDlg">Cancelar</button><button class="prim" type="submit">Salvar</button></div>
  </form>`;
  d.showModal();
  const frm = d.querySelector('#frm');
  if (chave === 'faturas') {
    frm.addEventListener('input', atualizarSomaItens);
    frm.querySelector('#f_clienteId').addEventListener('change', (e) => {
      for (const s of frm.querySelectorAll('[name="item_projeto"]')) s.innerHTML = opcoesProjetos(e.target.value, '');
    });
    atualizarSomaItens();
  }
  frm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const novo = { ...(reg || {}) };
    const erros = [];
    for (const c of ent.campos) {
      if (c.tipo === 'itens') {
        const projs = fd.getAll('item_projeto');
        const vals = fd.getAll('item_valor');
        const itens = [];
        projs.forEach((p, i) => {
          const v = Number(String(vals[i] ?? '').replace(',', '.'));
          if (!p && !vals[i]) return;
          if (!p) return erros.push(`Linha ${i + 1} da divisão sem projeto.`);
          if (!(v >= 0) || vals[i] === '') return erros.push(`Linha ${i + 1} da divisão sem valor.`);
          itens.push({ projetoId: p, valor: v });
        });
        novo[c.k] = itens;
        continue;
      }
      let v = String(fd.get(c.k) ?? '').trim();
      if (c.req && v === '') erros.push(`${c.t} é obrigatório.`);
      if (['money', 'number'].includes(c.tipo) && v !== '') {
        const n = Number(v.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) erros.push(`${c.t} deve ser um número ≥ 0.`);
        v = n;
      }
      novo[c.k] = v;
    }
    if (chave === 'advogados' && db.advogados.some((a) => a.id !== novo.id && a.sigla.toUpperCase() === String(novo.sigla).toUpperCase())) erros.push('Sigla já usada por outro advogado.');
    if (chave === 'faturas') {
      const its = novo.itens || [];
      if (its.some((i) => M().projetos.get(i.projetoId)?.clienteId !== novo.clienteId)) erros.push('Há projeto na divisão que não é deste cliente.');
      if (new Set(its.map((i) => i.projetoId)).size !== its.length) erros.push('Projeto repetido na divisão.');
      const soma = its.reduce((s, i) => s + i.valor, 0);
      if (its.length && Math.abs(soma - Number(novo.valor)) >= 0.01) erros.push(`A soma da divisão (${brl2(soma)}) difere do valor da fatura (${brl2(Number(novo.valor))}).`);
    }
    if (chave === 'despesas' && novo.vigenciaFim && novo.vigenciaFim < novo.vigenciaInicio) erros.push('Vigência final anterior à inicial.');
    if (erros.length) {
      d.querySelector('#frmErro').textContent = erros.join(' ');
      return;
    }
    if (reg?.id) Object.assign(db[chave].find((x) => x.id === reg.id), novo);
    else db[chave].push({ ...novo, id: novoId(ent.prefixo) });
    d.close();
    commit('Salvo.');
  });
}

function padroes(chave) {
  const mes = ui.ate || E.mesDe(hoje());
  return {
    lancamentos: { data: hoje() },
    faturas: { competencia: mes, emissao: hoje(), numero: `NF ${String(db.faturas.length + 1).padStart(4, '0')}`, itens: [] },
    custosAdvogado: { vigenciaInicio: E.mesDe(hoje()) },
    despesas: { vigenciaInicio: E.mesDe(hoje()) },
    advogados: { ativoDesde: E.mesDe(hoje()), horasMes: (db.config?.horasMesPadrao ?? 160) },
    projetos: { modalidade: 'hora' },
  }[chave] || {};
}

function referencias(colecao, id) {
  let n = 0;
  for (const [k, ent] of Object.entries(ENT)) {
    for (const c of ent.campos) if (c.tipo === 'ref' && c.ref === colecao) n += db[k].filter((x) => x[c.k] === id).length;
  }
  if (colecao === 'projetos') n += db.faturas.filter((f) => (f.itens || []).some((i) => i.projetoId === id)).length;
  return n;
}

// ---------------- Configurações ----------------
function vConfig() {
  const cfg = { ...E.CONFIG_PADRAO, ...db.config };
  const radio = (nome, v, t, d) =>
    `<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="radio" name="${nome}" value="${v}" data-cfg="${nome}" ${cfg[nome] === v ? 'checked' : ''}><span><b>${t}</b><br><span class="nota">${d}</span></span></label>`;
  return `
  <h1>Configurações</h1>
  <div class="grade2">
    <div class="caixa"><h2 style="margin-top:0">Rateio das despesas fixas</h2>
      ${radio('rateioMetodo', 'por_cabeca', 'Por cabeça', 'Despesas do mês ÷ nº de advogados ativos. É o modelo usado hoje na planilha manual.')}
      ${radio('rateioMetodo', 'proporcional_custo', 'Proporcional ao custo', 'Quem custa mais absorve mais despesa (ex.: sócios).')}
      ${radio('rateioMetodo', 'proporcional_horas', 'Proporcional às horas lançadas', 'Quem lança mais horas absorve mais despesa no mês.')}
    </div>
    <div class="caixa"><h2 style="margin-top:0">Base de horas do custo hora</h2>
      ${radio('baseHoras', 'capacidade', 'Capacidade (horas disponíveis/mês)', 'Custo hora estável. A ociosidade aparece como “custo não absorvido” no painel.')}
      ${radio('baseHoras', 'lancadas', 'Horas efetivamente lançadas', 'Todo o custo é distribuído nos projetos; custo hora sobe em meses de pouca ocupação.')}
      <label class="campo" style="max-width:220px;margin-top:8px">Horas/mês padrão (novos advogados)<input type="number" min="1" value="${cfg.horasMesPadrao}" data-cfg="horasMesPadrao"></label>
      <label class="campo" style="max-width:220px;margin-top:8px">Data de referência (“hoje”)<input type="date" value="${esc(hoje())}" data-cfg="hoje"></label>
    </div>
    <div class="caixa"><h2 style="margin-top:0">Dados</h2>
      <p class="nota">Os dados ficam salvos somente neste navegador (localStorage). Exporte para compartilhar ou fazer backup.</p>
      <div class="acoes">
        <button data-act="exportarJson">Exportar JSON</button>
        <label class="campo"><span>Importar JSON</span><input type="file" accept=".json,application/json" data-arquivo="json"></label>
      </div>
      <p class="acoes" style="margin-top:14px"><button class="perigo" data-act="restaurar">Restaurar dados fictícios de demonstração</button></p>
    </div>
    <div class="caixa"><h2 style="margin-top:0">Importar lançamentos (CSV)</h2>
      <p class="nota">Simula a carga vinda do WK. Separador <code>;</code>, com cabeçalho:</p>
      <div class="formula">data;sigla;cliente;projeto;horas;descricao;valor_hora
03/09/2026;JMT;Nobre Alimentos S.A.;Planejamento tributário;2,5;Parecer sobre ICMS-ST;</div>
      <p class="nota">Cliente e projeto devem existir com o mesmo nome; valor_hora é opcional.</p>
      <div class="acoes">
        <input type="file" accept=".csv,text/csv" data-arquivo="csv">
        <button data-act="modeloCsv">Baixar modelo</button>
      </div>
    </div>
  </div>`;
}

function parseCsv(texto) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = linhas[0]?.includes(';') ? ';' : ',';
  const split = (l) => {
    const r = [];
    let cur = '', q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { r.push(cur); cur = ''; } else cur += ch;
    }
    r.push(cur);
    return r.map((x) => x.trim());
  };
  const cab = split(linhas.shift() || '').map((h) => h.toLowerCase());
  return linhas.map((l) => Object.fromEntries(split(l).map((v, i) => [cab[i], v])));
}

function importarLancamentosCsv(texto) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const advPorSigla = new Map(db.advogados.map((a) => [norm(a.sigla), a]));
  const projPorNome = new Map(db.projetos.map((p) => [`${norm(nomeCliente(p.clienteId))}|${norm(p.nome)}`, p]));
  const novos = [];
  const erros = [];
  parseCsv(texto).forEach((r, i) => {
    const n = i + 2;
    const dataBr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r.data || '');
    const data = dataBr ? `${dataBr[3]}-${dataBr[2]}-${dataBr[1]}` : r.data;
    const adv = advPorSigla.get(norm(r.sigla));
    const proj = projPorNome.get(`${norm(r.cliente)}|${norm(r.projeto)}`);
    const horas = Number(String(r.horas || '').replace(',', '.'));
    const vh = r.valor_hora ? Number(String(r.valor_hora).replace(/\./g, '').replace(',', '.')) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) return erros.push(`linha ${n}: data inválida`);
    if (!adv) return erros.push(`linha ${n}: sigla “${r.sigla}” não cadastrada`);
    if (!proj) return erros.push(`linha ${n}: projeto “${r.cliente} › ${r.projeto}” não encontrado`);
    if (!(horas > 0)) return erros.push(`linha ${n}: horas inválidas`);
    novos.push({ id: novoId('lan'), data, advogadoId: adv.id, projetoId: proj.id, horas, descricao: r.descricao || '', valorHora: Number.isFinite(vh) ? vh : '' });
  });
  db.lancamentos.push(...novos);
  commit(`${novos.length} lançamento(s) importado(s).`);
  if (erros.length) alert(`${erros.length} linha(s) ignorada(s):\n\n${erros.slice(0, 20).join('\n')}${erros.length > 20 ? '\n…' : ''}`);
}

// ---------------- roteamento / eventos ----------------
// oculta = fora do menu (acessível só pela URL #/config)
const ROTAS = [
  ['painel', 'Painel', vPainel],
  ['analise', 'Análise', vAnalise],
  ['custo-hora', 'Custo hora', vCustoHora],
  ['relatorio', 'Relatório de horas', vRelatorio],
  ['cadastros', 'Cadastros', vCadastros],
  ['config', 'Configurações', vConfig, { oculta: true }],
];

function render() {
  const [rota, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const atual = ROTAS.find((r) => r[0] === rota) || ROTAS[0];
  garantirPeriodo();
  document.getElementById('nav').innerHTML = ROTAS.filter((r) => !r[3]?.oculta).map(
    ([k, t]) => `<a href="#/${k}" ${k === atual[0] ? 'aria-current="page"' : ''}>${t}</a>`,
  ).join('');
  const foco = document.activeElement?.dataset?.ui;
  const pos = document.activeElement?.selectionStart;
  document.getElementById('app').innerHTML = atual[2](sub);
  if (atual[0] === 'painel') desenharGrafico();
  document.title = `${atual[1]} — Lucratividade (POC)`;
  if (foco) {
    const el = document.querySelector(`[data-ui="${foco}"]`);
    if (el) {
      el.focus();
      if (pos != null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch { /* select */ }
    }
  }
}

let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

const ACOES = {
  expandir: ({ k }) => { ui.aberto.has(k) ? ui.aberto.delete(k) : ui.aberto.add(k); render(); },
  ordenar: ({ k }) => { ui.ord = { k, d: ui.ord.k === k ? -ui.ord.d : /^d\d$/.test(k) ? 1 : -1 }; render(); },
  novo: ({ ent }) => abrirForm(ent),
  editar: ({ ent, id }) => abrirForm(ent, id),
  excluir: ({ ent, id }) => {
    const refs = referencias(ent, id);
    if (refs) return alert(`Não é possível excluir: há ${refs} registro(s) que dependem deste.`);
    if (!confirm('Excluir este registro?')) return;
    db[ent] = db[ent].filter((x) => x.id !== id);
    commit('Excluído.');
  },
  fecharDlg: () => dlg().close(),
  addItem: () => {
    document.getElementById('itensLinhas').insertAdjacentHTML('beforeend', linhaItem({}, document.getElementById('f_clienteId').value));
    atualizarSomaItens();
  },
  remItem: (_, e) => {
    e.target.closest('.item-linha')?.remove();
    atualizarSomaItens();
  },
  imprimir: () => window.print(),
  exportarAnalise: () => {
    const { piv, linhas, total } = linhasAnalise();
    const cols = [...COLS, ...COLS_EXTRA];
    const dados = [
      [...piv.dims.map((d) => TITULO_DIM[d]), ...cols.map((c) => c.t)],
      ...linhas.map((l) => [...l.rotulos.map((r, i) => (piv.dims[i] === 'mes' ? l.chave[i] : r)), ...cols.map((c) => l.m[c.k] ?? '')]),
      ['Total', ...piv.dims.slice(1).map(() => ''), ...cols.map((c) => total[c.k] ?? '')],
    ];
    baixar(`lucratividade-${ui.pivo}-${ui.de}_${ui.ate}.csv`, csv(dados), 'text/csv;charset=utf-8');
  },
  exportarJson: () => baixar(`lucratividade-dados-${hoje()}.json`, JSON.stringify(db, null, 2), 'application/json'),
  modeloCsv: () => baixar('modelo-lancamentos.csv', '﻿data;sigla;cliente;projeto;horas;descricao;valor_hora\r\n03/09/2026;JMT;Nobre Alimentos S.A.;Planejamento tributário;2,5;Parecer sobre ICMS-ST;\r\n', 'text/csv;charset=utf-8'),
  restaurar: () => {
    if (!confirm('Substituir todos os dados atuais pelos dados fictícios de demonstração?')) return;
    db = restaurarDemo();
    ui.de = ui.ate = '';
    commit('Dados de demonstração restaurados.');
  },
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  e.preventDefault();
  ACOES[b.dataset.act]?.(b.dataset, e);
});

let buscaT;
document.addEventListener('input', (e) => {
  if (e.target.dataset.ui !== 'cad.busca') return;
  clearTimeout(buscaT);
  buscaT = setTimeout(() => { ui.cad.busca = e.target.value; render(); }, 200);
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.ui && t.dataset.ui !== 'cad.busca') {
    setUi(t.dataset.ui, t.type === 'checkbox' ? t.checked : t.value);
    if (t.dataset.ui === 'de' && ui.de > ui.ate) ui.ate = ui.de;
    if (t.dataset.ui === 'ate' && ui.ate < ui.de) ui.de = ui.ate;
    render();
  } else if (t.dataset.cfg) {
    const k = t.dataset.cfg;
    if (k === 'hoje') db.hoje = t.value;
    else db.config = { ...db.config, [k]: k === 'horasMesPadrao' ? Math.max(1, Number(t.value) || 160) : t.value };
    commit('Configuração salva.');
  } else if (t.dataset.arquivo && t.files?.[0]) {
    const texto = await t.files[0].text();
    try {
      if (t.dataset.arquivo === 'json') {
        if (!confirm('Substituir todos os dados atuais pelo arquivo importado?')) return;
        db = normalizar(JSON.parse(texto));
        ui.de = ui.ate = '';
        commit('Dados importados.');
      } else importarLancamentosCsv(texto);
    } catch (err) {
      alert(`Não foi possível importar: ${err.message}`);
    } finally {
      t.value = '';
    }
  }
});

window.addEventListener('hashchange', () => { ui.cad.busca = ''; ui.cad.mes = ''; render(); document.getElementById('app').focus(); });
render();
