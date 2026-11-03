// Motor de cálculo de lucratividade — funções puras, sem DOM.
// Roda no browser e no Node (testes em tests/engine.test.js).
// Regras de negócio documentadas em docs/PLAYBOOK.md.

export const CONFIG_PADRAO = {
  rateioMetodo: 'por_cabeca', // por_cabeca | proporcional_custo | proporcional_horas
  baseHoras: 'capacidade', // capacidade | lancadas
  horasMesPadrao: 160,
};

export const CARGOS = ['Sócio', 'Sênior', 'Pleno', 'Júnior', 'Estagiário'];

// ---------- datas / meses ----------
export const mesDe = (data) => String(data).slice(0, 7);

export function addMes(mes, n) {
  let [y, m] = mes.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function mesesEntre(de, ate) {
  const r = [];
  if (!de || !ate) return r;
  for (let m = de; m <= ate; m = addMes(m, 1)) r.push(m);
  return r;
}

const vigenteNoMes = (ini, fim, mes) => (!ini || ini <= mes) && (!fim || fim >= mes);

export const advogadoAtivo = (adv, mes) => vigenteNoMes(adv.ativoDesde, adv.ativoAte, mes);

/** Custo mensal (salário/pró-labore + encargos) vigente no mês: o registro mais recente com vigenciaInicio <= mês. */
export function custoMensalVigente(custos, advogadoId, mes) {
  let best = null;
  for (const c of custos) {
    if (c.advogadoId !== advogadoId || !c.vigenciaInicio || c.vigenciaInicio > mes) continue;
    if (!best || c.vigenciaInicio > best.vigenciaInicio) best = c;
  }
  return best ? Number(best.custoMensal) || 0 : 0;
}

export function despesasDoMes(despesas, mes) {
  return despesas
    .filter((d) => vigenteNoMes(d.vigenciaInicio, d.vigenciaFim, mes))
    .reduce((s, d) => s + (Number(d.valorMensal) || 0), 0);
}

/**
 * Custo hora de cada advogado ativo no mês.
 *  custoDiretoHora  = custoMensal / horasBase
 *  rateioHora       = cotaRateio / horasBase   (cota = despesas fixas do mês rateadas)
 *  custoEfetivoHora = custoDiretoHora + rateioHora
 */
export function custoHoraDoMes(db, mes, horasLancadas = new Map()) {
  const cfg = { ...CONFIG_PADRAO, ...(db.config || {}) };
  const ativos = db.advogados.filter((a) => advogadoAtivo(a, mes));
  const despesas = despesasDoMes(db.despesas, mes);
  const custo = new Map(ativos.map((a) => [a.id, custoMensalVigente(db.custosAdvogado, a.id, mes)]));

  let pesos;
  if (cfg.rateioMetodo === 'proporcional_custo') pesos = ativos.map((a) => custo.get(a.id));
  else if (cfg.rateioMetodo === 'proporcional_horas') pesos = ativos.map((a) => horasLancadas.get(a.id) || 0);
  else pesos = ativos.map(() => 1);
  let soma = pesos.reduce((s, p) => s + p, 0);
  if (soma <= 0) {
    pesos = ativos.map(() => 1);
    soma = ativos.length;
  }

  const advogados = new Map();
  let custoPessoal = 0;
  ativos.forEach((a, i) => {
    const cm = custo.get(a.id);
    custoPessoal += cm;
    const cota = soma ? (despesas * pesos[i]) / soma : 0;
    const lanc = horasLancadas.get(a.id) || 0;
    const cap = Number(a.horasMes) || cfg.horasMesPadrao;
    const base = cfg.baseHoras === 'lancadas' && lanc > 0 ? lanc : cap;
    advogados.set(a.id, {
      advogadoId: a.id,
      custoMensal: cm,
      cotaRateio: cota,
      horasCapacidade: cap,
      horasLancadas: lanc,
      horasBase: base,
      custoDiretoHora: cm / base,
      rateioHora: cota / base,
      custoEfetivoHora: (cm + cota) / base,
      valorHoraTabela: Number(a.valorHoraTabela) || 0,
    });
  });
  return { mes, despesas, custoPessoal, advogados };
}

// ---------- alocação de faturas ----------
/**
 * Distribui uma fatura entre projetos:
 *  1. divisão informada na própria fatura (`fatura.itens` = [{projetoId, valor}]) — valores usados como pesos
 *  2. sem itens → automática: projetos do cliente ponderados pelo valor de referência da competência
 *     (fixo → valorFixoMensal; por hora → valor de tabela das horas lançadas)
 */
export function alocarFatura(fatura, ctx) {
  const itens = (fatura.itens || []).filter((i) => i.projetoId);
  let partes;
  let modo;
  if (itens.length) {
    modo = 'informada';
    partes = itens.map((a) => ({ projetoId: a.projetoId, peso: Number(a.valor) || 0 }));
  } else {
    modo = 'automatico';
    const projs = ctx.projetosPorCliente.get(fatura.clienteId) || [];
    partes = projs.map((p) => ({ projetoId: p.id, peso: ctx.valorReferencia(p, fatura.competencia) }));
    if (!partes.some((p) => p.peso > 0)) partes = projs.map((p) => ({ projetoId: p.id, peso: 1 }));
  }
  const soma = partes.reduce((s, p) => s + Math.max(0, p.peso), 0);
  if (soma <= 0) return { modo, partes: [] };
  return { modo, partes: partes.filter((p) => p.peso > 0).map((p) => ({ projetoId: p.projetoId, pct: p.peso / soma })) };
}

function indexar(db) {
  const porId = (arr) => new Map(arr.map((x) => [x.id, x]));
  const agrupar = (arr, k) => {
    const m = new Map();
    for (const x of arr) {
      const key = x[k];
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(x);
    }
    return m;
  };
  return {
    advogados: porId(db.advogados),
    projetos: porId(db.projetos),
    clientes: porId(db.clientes),
    faturas: porId(db.faturas),
    projetosPorCliente: agrupar(db.projetos, 'clienteId'),
  };
}

// ---------- cálculo principal ----------
/**
 * Gera a tabela de fatos no grão (projeto, mês, advogado).
 * Receita do projeto-mês é distribuída entre advogados pela participação no valor de tabela;
 * se o projeto não teve horas no mês, a receita fica num fato com advogadoId = null.
 * Receita = valor faturado (premissa: faturado = recebido), no mês de competência da fatura.
 */
export function calcular(db) {
  const idx = indexar(db);
  const avisos = [];

  const horasMesAdv = new Map();
  for (const l of db.lancamentos) {
    const mes = mesDe(l.data);
    if (!horasMesAdv.has(mes)) horasMesAdv.set(mes, new Map());
    const m = horasMesAdv.get(mes);
    m.set(l.advogadoId, (m.get(l.advogadoId) || 0) + (Number(l.horas) || 0));
  }

  const meses = new Set([...horasMesAdv.keys(), ...db.faturas.map((f) => f.competencia)]);
  const custoHora = new Map();
  for (const m of [...meses].sort()) custoHora.set(m, custoHoraDoMes(db, m, horasMesAdv.get(m)));

  const fatos = new Map();
  const fato = (projetoId, mes, advogadoId) => {
    const key = `${projetoId}|${mes}|${advogadoId ?? ''}`;
    let f = fatos.get(key);
    if (!f) {
      const p = idx.projetos.get(projetoId);
      const adv = advogadoId ? idx.advogados.get(advogadoId) : null;
      f = {
        projetoId,
        clienteId: p?.clienteId ?? null,
        areaProjetoId: p?.areaId ?? null,
        areaAdvogadoId: adv?.areaId ?? p?.areaId ?? null,
        mes,
        advogadoId: advogadoId ?? null,
        horas: 0,
        valorTabela: 0,
        custoDireto: 0,
        custoRateio: 0,
        faturado: 0,
      };
      fatos.set(key, f);
    }
    return f;
  };

  const tabelaProjMes = new Map();
  const inativosAvisados = new Set();
  for (const l of db.lancamentos) {
    const mes = mesDe(l.data);
    const adv = idx.advogados.get(l.advogadoId);
    if (!adv || !idx.projetos.has(l.projetoId)) {
      avisos.push(`Lançamento ${l.id} referencia advogado/projeto inexistente — ignorado.`);
      continue;
    }
    let ch = custoHora.get(mes).advogados.get(adv.id);
    if (!ch) {
      // advogado lançou horas fora do período ativo: custo direto pela capacidade, sem rateio
      const cm = custoMensalVigente(db.custosAdvogado, adv.id, mes);
      const cap = Number(adv.horasMes) || CONFIG_PADRAO.horasMesPadrao;
      ch = { custoDiretoHora: cm / cap, rateioHora: 0 };
      const k = `${adv.id}|${mes}`;
      if (!inativosAvisados.has(k)) {
        inativosAvisados.add(k);
        avisos.push(`${adv.sigla} lançou horas em ${mes} fora do período ativo — sem rateio de despesas.`);
      }
    }
    const h = Number(l.horas) || 0;
    const vh = l.valorHora != null && l.valorHora !== '' ? Number(l.valorHora) : Number(adv.valorHoraTabela) || 0;
    const f = fato(l.projetoId, mes, adv.id);
    f.horas += h;
    f.valorTabela += h * vh;
    f.custoDireto += h * ch.custoDiretoHora;
    f.custoRateio += h * ch.rateioHora;
    const kpm = `${l.projetoId}|${mes}`;
    tabelaProjMes.set(kpm, (tabelaProjMes.get(kpm) || 0) + h * vh);
  }

  const ctx = {
    ...idx,
    valorReferencia: (p, mes) =>
      p.modalidade === 'fixo' ? Number(p.valorFixoMensal) || 0 : tabelaProjMes.get(`${p.id}|${mes}`) || 0,
  };

  const receitaProjMes = new Map();
  const alocacaoPorFatura = new Map();
  for (const fat of db.faturas) {
    const aloc = alocarFatura(fat, ctx);
    alocacaoPorFatura.set(fat.id, aloc);
    if (!aloc.partes.length) {
      avisos.push(`Fatura ${fat.numero} não pôde ser alocada a nenhum projeto (cliente sem projetos).`);
      continue;
    }
    for (const parte of aloc.partes) {
      const k = `${parte.projetoId}|${fat.competencia}`;
      receitaProjMes.set(k, (receitaProjMes.get(k) || 0) + (Number(fat.valor) || 0) * parte.pct);
    }
  }

  const fatosPorProjMes = new Map();
  for (const f of fatos.values()) {
    const k = `${f.projetoId}|${f.mes}`;
    if (!fatosPorProjMes.has(k)) fatosPorProjMes.set(k, []);
    fatosPorProjMes.get(k).push(f);
  }
  for (const [k, valor] of receitaProjMes) {
    const [projetoId, mes] = k.split('|');
    const lista = fatosPorProjMes.get(k) || [];
    const tot = lista.reduce((s, f) => s + f.valorTabela, 0);
    if (tot > 0) {
      for (const f of lista) f.faturado += (valor * f.valorTabela) / tot;
    } else {
      fato(projetoId, mes, null).faturado += valor;
    }
  }

  return {
    fatos: [...fatos.values()],
    custoHora,
    meses: [...meses].sort(),
    alocacaoPorFatura,
    avisos,
  };
}

/**
 * Detalha os lançamentos (serviços prestados) que compõem um conjunto de fatos:
 * para cada lançamento, valor de tabela e a composição do custo (direto + rateio).
 * Usa as mesmas regras de calcular() — os totais batem com os fatos.
 */
export function detalharLancamentos(db, resultado, { projetoId, mes, clienteId } = {}) {
  const advs = new Map(db.advogados.map((a) => [a.id, a]));
  const projs = new Map(db.projetos.map((p) => [p.id, p]));
  return db.lancamentos
    .filter((l) => {
      const m = mesDe(l.data);
      return (!projetoId || l.projetoId === projetoId) && (!mes || m === mes) && (!clienteId || projs.get(l.projetoId)?.clienteId === clienteId);
    })
    .map((l) => {
      const m = mesDe(l.data);
      const adv = advs.get(l.advogadoId);
      let ch = resultado.custoHora.get(m)?.advogados.get(l.advogadoId);
      if (!ch && adv) {
        const cap = Number(adv.horasMes) || CONFIG_PADRAO.horasMesPadrao;
        ch = { custoDiretoHora: custoMensalVigente(db.custosAdvogado, adv.id, m) / cap, rateioHora: 0 };
      }
      const h = Number(l.horas) || 0;
      const valorHora = l.valorHora != null && l.valorHora !== '' ? Number(l.valorHora) : Number(adv?.valorHoraTabela) || 0;
      const custoDiretoHora = ch?.custoDiretoHora ?? 0;
      const rateioHora = ch?.rateioHora ?? 0;
      return {
        ...l,
        mes: m,
        valorHora,
        valorTabela: h * valorHora,
        custoDiretoHora,
        rateioHora,
        custoEfetivoHora: custoDiretoHora + rateioHora,
        custoDireto: h * custoDiretoHora,
        custoRateio: h * rateioHora,
        custoEfetivo: h * (custoDiretoHora + rateioHora),
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || String(a.advogadoId).localeCompare(String(b.advogadoId)));
}

// ---------- agregação ----------
export const DIMENSOES = {
  cliente: (f) => f.clienteId,
  projeto: (f) => f.projetoId,
  mes: (f) => f.mes,
  advogado: (f) => f.advogadoId ?? '',
  areaProjeto: (f) => f.areaProjetoId,
  areaAdvogado: (f) => f.areaAdvogadoId,
};

const CAMPOS_SOMA = ['horas', 'valorTabela', 'custoDireto', 'custoRateio', 'faturado'];
const zero = () => Object.fromEntries(CAMPOS_SOMA.map((c) => [c, 0]));

export function somar(fatos) {
  const r = zero();
  for (const f of fatos) for (const c of CAMPOS_SOMA) r[c] += f[c];
  return r;
}

export function filtrarFatos(fatos, { de, ate, areaId, clienteId, projetoId, advogadoId } = {}) {
  return fatos.filter(
    (f) =>
      (!de || f.mes >= de) &&
      (!ate || f.mes <= ate) &&
      (!areaId || f.areaProjetoId === areaId) &&
      (!clienteId || f.clienteId === clienteId) &&
      (!projetoId || f.projetoId === projetoId) &&
      (!advogadoId || f.advogadoId === advogadoId),
  );
}

/** Agrupa fatos pelas dimensões indicadas (ex.: ['cliente','projeto']). */
export function agregar(fatos, dims) {
  const m = new Map();
  for (const f of fatos) {
    const chave = dims.map((d) => DIMENSOES[d](f));
    const k = chave.join('|');
    let r = m.get(k);
    if (!r) {
      r = { chave, ...zero() };
      m.set(k, r);
    }
    for (const c of CAMPOS_SOMA) r[c] += f[c];
  }
  return [...m.values()];
}

/** Indicadores derivados. Receita = faturado (premissa: faturado = recebido). */
export function metricas(r) {
  const receita = r.faturado;
  const custoEfetivo = r.custoDireto + r.custoRateio;
  const margemBruta = receita - r.custoDireto;
  const margemLiquida = receita - custoEfetivo;
  const div = (a, b) => (b ? a / b : null);
  return {
    ...r,
    receita,
    custoEfetivo,
    margemBruta,
    margemLiquida,
    pctBruta: div(margemBruta, receita),
    pctLiquida: div(margemLiquida, receita),
    realizacao: div(r.faturado, r.valorTabela),
    receitaHora: div(receita, r.horas),
    custoEfetivoHora: div(custoEfetivo, r.horas),
  };
}

/** Visão do escritório mês a mês: quanto do custo total foi absorvido pelas horas lançadas. */
export function resumoMensal(resultado, meses) {
  return meses.map((mes) => {
    const ch = resultado.custoHora.get(mes);
    const doMes = resultado.fatos.filter((f) => f.mes === mes);
    const s = somar(doMes);
    const despesas = ch?.despesas ?? 0;
    const custoPessoal = ch?.custoPessoal ?? 0;
    const absorvido = s.custoDireto + s.custoRateio;
    return {
      mes,
      despesas,
      custoPessoal,
      custoTotal: despesas + custoPessoal,
      absorvido,
      naoAbsorvido: despesas + custoPessoal - absorvido,
      horas: s.horas,
      faturado: s.faturado,
      resultado: s.faturado - despesas - custoPessoal,
    };
  });
}
