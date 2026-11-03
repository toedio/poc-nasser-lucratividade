// Gerador de dados FICTÍCIOS para a POC. Determinístico (mesma semente → mesmos dados).
// Nomes, clientes e valores são inventados — não representam a Nasser nem seus clientes.
import { CONFIG_PADRAO, addMes, mesesEntre } from './engine.js';

export const VERSAO_DADOS = 2;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AREAS = [
  { id: 'ar_trib', nome: 'Tributário', socioId: 'adv_rap' },
  { id: 'ar_soc', nome: 'Societário e Contratos', socioId: 'adv_hcb' },
  { id: 'ar_trab', nome: 'Trabalhista', socioId: 'adv_flr' },
];

// [id, nome, sigla, área, cargo, valor hora tabela, horas/mês, custo mensal, ativoDesde, reajuste {mes, valor}]
const ADVOGADOS = [
  ['adv_rap', 'Ricardo Almeida Prado', 'RAP', 'ar_trib', 'Sócio', 1200, 140, 42000],
  ['adv_hcb', 'Helena Costa Bastos', 'HCB', 'ar_soc', 'Sócio', 1200, 140, 42000],
  ['adv_flr', 'Fernando Lima Rocha', 'FLR', 'ar_trab', 'Sócio', 1100, 140, 38000],
  ['adv_jmt', 'Juliana Mendes Torres', 'JMT', 'ar_trib', 'Sênior', 850, 160, 22000, null, { mes: '2026-07', valor: 23500 }],
  ['adv_bcn', 'Bruno Carvalho Neves', 'BCN', 'ar_soc', 'Sênior', 850, 160, 21000, null, { mes: '2026-07', valor: 22300 }],
  ['adv_cfd', 'Camila Ferreira Dias', 'CFD', 'ar_trab', 'Pleno', 600, 168, 13500],
  ['adv_los', 'Lucas Oliveira Santos', 'LOS', 'ar_trib', 'Pleno', 600, 168, 12800, null, { mes: '2026-07', valor: 14000 }],
  ['adv_grl', 'Gabriela Rezende Lopes', 'GRL', 'ar_soc', 'Júnior', 400, 168, 8200, '2026-03'],
  ['adv_tbp', 'Thiago Barros Pinto', 'TBP', 'ar_trab', 'Estagiário', 200, 120, 2800],
];

// [descrição, categoria, valor mensal, vigênciaInício, vigênciaFim]
const DESPESAS = [
  ['Aluguel do escritório', 'Ocupação', 42000, '2026-01'],
  ['Condomínio e IPTU', 'Ocupação', 9800, '2026-01', '2026-05'],
  ['Condomínio e IPTU (reajuste)', 'Ocupação', 10900, '2026-06'],
  ['Secretariado e recepção', 'Pessoal de apoio', 16500, '2026-01'],
  ['Financeiro / faturamento', 'Pessoal de apoio', 9500, '2026-01'],
  ['Sistemas (WK, Office, nuvem) e TI', 'Tecnologia', 6200, '2026-01'],
  ['Contabilidade terceirizada', 'Serviços', 4800, '2026-01'],
  ['Energia, internet e telefonia', 'Utilidades', 3100, '2026-01'],
  ['Material de escritório e copa', 'Materiais', 2200, '2026-01'],
  ['Seguros, anuidades OAB e taxas', 'Taxas', 1900, '2026-01'],
];

const CLIENTES = [
  { id: 'cli_atl', nome: 'Grupo Atlântico Logística S.A.', documento: '11.111.111/0001-11', desconto: 0.1, faturaUnica: true },
  { id: 'cli_vrt', nome: 'Vértice Engenharia Ltda.', documento: '22.222.222/0001-22', desconto: 0 },
  { id: 'cli_nob', nome: 'Nobre Alimentos S.A.', documento: '33.333.333/0001-33', desconto: 0 },
  { id: 'cli_hor', nome: 'Clínica Horizonte Saúde Ltda.', documento: '44.444.444/0001-44', desconto: 0 },
  { id: 'cli_tec', nome: 'TechNova Software Ltda.', documento: '55.555.555/0001-55', desconto: 0 },
  { id: 'cli_faz', nome: 'Fazenda Santa Clara Agro S.A.', documento: '66.666.666/0001-66', desconto: 0.2 },
  { id: 'cli_aur', nome: 'Instituto Aurora', documento: '77.777.777/0001-77', desconto: 0 },
];

// [id, cliente, nome, área, modalidade, valor fixo mensal, equipe [[adv, horas médias/mês]], de, até]
const PROJETOS = [
  ['prj_atl_cons', 'cli_atl', 'Consultoria tributária recorrente', 'ar_trib', 'fixo', 72000, [['adv_rap', 10], ['adv_jmt', 30], ['adv_los', 25]]],
  ['prj_atl_icms', 'cli_atl', 'Contencioso fiscal ICMS', 'ar_trib', 'hora', 0, [['adv_rap', 6], ['adv_jmt', 15], ['adv_los', 20]]],
  ['prj_atl_reest', 'cli_atl', 'Reestruturação societária', 'ar_soc', 'hora', 0, [['adv_hcb', 12], ['adv_bcn', 25], ['adv_grl', 15]], '2026-02', '2026-09'],
  ['prj_vrt_trab', 'cli_vrt', 'Assessoria trabalhista mensal', 'ar_trab', 'fixo', 16000, [['adv_flr', 8], ['adv_cfd', 30], ['adv_tbp', 25]]],
  ['prj_vrt_contr', 'cli_vrt', 'Contratos de obra', 'ar_soc', 'hora', 0, [['adv_hcb', 4], ['adv_bcn', 10], ['adv_grl', 8]]],
  ['prj_nob_plan', 'cli_nob', 'Planejamento tributário', 'ar_trib', 'fixo', 52000, [['adv_rap', 14], ['adv_jmt', 35], ['adv_los', 30], ['adv_hcb', 4]]],
  ['prj_nob_ma', 'cli_nob', 'Aquisição Granja Boa Vista (M&A)', 'ar_soc', 'hora', 0, [['adv_hcb', 25], ['adv_bcn', 45], ['adv_grl', 40], ['adv_rap', 6]], '2026-04', '2026-08'],
  ['prj_hor_cont', 'cli_hor', 'Contencioso trabalhista', 'ar_trab', 'hora', 0, [['adv_flr', 10], ['adv_cfd', 35], ['adv_tbp', 20]]],
  ['prj_tec_pi', 'cli_tec', 'Contratos e propriedade intelectual', 'ar_soc', 'fixo', 22000, [['adv_hcb', 3], ['adv_grl', 6]]],
  ['prj_faz_cred', 'cli_faz', 'Recuperação de créditos PIS/COFINS', 'ar_trib', 'hora', 0, [['adv_rap', 5], ['adv_jmt', 12], ['adv_los', 25]]],
  ['prj_faz_dd', 'cli_faz', 'Due diligence trabalhista', 'ar_trab', 'hora', 0, [['adv_flr', 6], ['adv_cfd', 30], ['adv_tbp', 30]], '2026-02', '2026-03'],
  ['prj_aur_pb', 'cli_aur', 'Consultoria institucional (valor simbólico)', 'ar_soc', 'fixo', 5000, [['adv_hcb', 2], ['adv_grl', 10], ['adv_bcn', 4]]],
];

const SERVICOS = {
  ar_trib: [
    'Análise de auto de infração',
    'Parecer sobre ICMS-ST',
    'Revisão da apuração de PIS/COFINS',
    'Reunião com cliente — planejamento tributário',
    'Elaboração de impugnação administrativa',
    'Pesquisa de jurisprudência (CARF/STJ)',
    'Acompanhamento processual',
  ],
  ar_soc: [
    'Revisão de minuta contratual',
    'Elaboração de acordo de sócios',
    'Due diligence documental',
    'Reunião de negociação',
    'Elaboração de alteração contratual e atas',
    'Análise de cláusulas de M&A',
  ],
  ar_trab: [
    'Elaboração de contestação',
    'Audiência trabalhista',
    'Parecer sobre terceirização',
    'Cálculo de passivo trabalhista',
    'Reunião com RH do cliente',
    'Elaboração de recurso ordinário',
  ],
};

const FATOR_OCUPACAO = 2.1; // ajusta a ocupação média da equipe (~75% da capacidade)
const MES_INICIAL = '2026-01';
const MES_FINAL_HORAS = '2026-10'; // outubro em fechamento: horas lançadas, ainda sem fatura
const MES_FINAL_FATURAS = '2026-09';

function diasUteis(mes) {
  const [y, m] = mes.split('-').map(Number);
  const r = [];
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) break;
    const wd = dt.getUTCDay();
    if (wd !== 0 && wd !== 6) r.push(`${mes}-${String(d).padStart(2, '0')}`);
  }
  return r;
}


const arred = (v) => Math.round(v * 100) / 100;

export function gerarDadosDemo(seed = 20261103) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const advogados = ADVOGADOS.map(([id, nome, sigla, areaId, cargo, valorHoraTabela, horasMes, , ativoDesde]) => ({
    id, nome, sigla, areaId, cargo, valorHoraTabela, horasMes, ativoDesde: ativoDesde || MES_INICIAL, ativoAte: '',
  }));
  const custosAdvogado = [];
  for (const [id, , , , , , , custo, ativoDesde, reajuste] of ADVOGADOS) {
    custosAdvogado.push({ id: `cst_${id}_0`, advogadoId: id, vigenciaInicio: ativoDesde || MES_INICIAL, custoMensal: custo, observacao: 'Remuneração + encargos' });
    if (reajuste) custosAdvogado.push({ id: `cst_${id}_1`, advogadoId: id, vigenciaInicio: reajuste.mes, custoMensal: reajuste.valor, observacao: 'Reajuste salarial' });
  }
  const advById = new Map(advogados.map((a) => [a.id, a]));

  const despesas = DESPESAS.map(([descricao, categoria, valorMensal, vigenciaInicio, vigenciaFim], i) => ({
    id: `dsp_${i + 1}`, descricao, categoria, valorMensal, vigenciaInicio, vigenciaFim: vigenciaFim || '',
  }));

  const clientes = CLIENTES.map(({ id, nome, documento }) => ({ id, nome, documento }));
  const projetos = PROJETOS.map(([id, clienteId, nome, areaId, modalidade, valorFixoMensal]) => ({
    id, clienteId, nome, areaId, modalidade, valorFixoMensal,
  }));

  // ---- lançamentos de timesheet ----
  const lancamentos = [];
  let nL = 0;
  const tabela = new Map(); // projeto|mes -> valor de tabela
  for (const mes of mesesEntre(MES_INICIAL, MES_FINAL_HORAS)) {
    const dias = diasUteis(mes);
    for (const [pid, , , areaId, , , equipe, de, ate] of PROJETOS) {
      if ((de && mes < de) || (ate && mes > ate)) continue;
      for (const [advId, media] of equipe) {
        const adv = advById.get(advId);
        if (adv.ativoDesde > mes) continue;
        let restante = Math.round(media * FATOR_OCUPACAO * (0.6 + 0.8 * rnd()) * 2) / 2;
        while (restante > 0) {
          const h = Math.min(restante, Math.max(0.5, Math.round((0.5 + rnd() * 3.5) * 2) / 2));
          restante = Math.round((restante - h) * 2) / 2;
          lancamentos.push({
            id: `lan_${++nL}`, data: pick(dias), advogadoId: advId, projetoId: pid, horas: h,
            descricao: pick(SERVICOS[areaId]), valorHora: adv.valorHoraTabela,
          });
          const k = `${pid}|${mes}`;
          tabela.set(k, (tabela.get(k) || 0) + h * adv.valorHoraTabela);
        }
      }
    }
  }
  lancamentos.sort((a, b) => a.data.localeCompare(b.data));

  // ---- faturas, alocações e pagamentos ----
  const faturas = [];
  let nF = 0;
  // itens = divisão da fatura por projeto; vazio = divisão automática
  const novaFatura = (cli, mes, valor, itens) => {
    const f = {
      id: `fat_${++nF}`, numero: `NF ${String(nF).padStart(4, '0')}`, clienteId: cli.id, competencia: mes,
      emissao: `${addMes(mes, 1)}-05`, valor: arred(valor), itens,
    };
    faturas.push(f);
    return f;
  };

  const valorProjetoMes = (p, cli, mes) =>
    p.modalidade === 'fixo' ? p.valorFixoMensal : (tabela.get(`${p.id}|${mes}`) || 0) * (1 - cli.desconto);

  for (const mes of mesesEntre(MES_INICIAL, MES_FINAL_FATURAS)) {
    for (const cli of CLIENTES) {
      const projs = projetos.filter((p) => p.clienteId === cli.id);
      if (cli.faturaUnica) {
        // Caso da reunião: cliente pede uma única fatura para vários projetos.
        // Jan–mai: financeiro informou a divisão na fatura; jun em diante: divisão automática.
        const partes = projs.map((p) => ({ projetoId: p.id, valor: arred(valorProjetoMes(p, cli, mes)) })).filter((x) => x.valor > 0);
        novaFatura(cli, mes, partes.reduce((s, x) => s + x.valor, 0), mes <= '2026-05' ? partes : []);
      } else {
        for (const p of projs) {
          const v = arred(valorProjetoMes(p, cli, mes));
          if (v > 0) novaFatura(cli, mes, v, [{ projetoId: p.id, valor: v }]);
        }
      }
    }
  }

  return {
    versao: VERSAO_DADOS,
    geradoEm: '2026-11-03',
    hoje: '2026-11-03',
    config: { ...CONFIG_PADRAO },
    areas: AREAS.map((a) => ({ ...a })),
    advogados,
    custosAdvogado,
    despesas,
    clientes,
    projetos,
    lancamentos,
    faturas,
  };
}
