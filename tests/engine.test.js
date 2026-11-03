import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcular, custoHoraDoMes, agregar, metricas, somar, resumoMensal, addMes, mesesEntre, custoMensalVigente,
  detalharLancamentos,
} from '../src/engine.js';
import { gerarDadosDemo } from '../src/seed.js';

const quase = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function dbBase(over = {}) {
  return {
    config: { rateioMetodo: 'por_cabeca', baseHoras: 'capacidade', horasMesPadrao: 160 },
    areas: [{ id: 'A', nome: 'Área' }],
    advogados: [
      { id: 'a1', sigla: 'AAA', areaId: 'A', valorHoraTabela: 960, horasMes: 100, ativoDesde: '2026-01' },
      { id: 'a2', sigla: 'BBB', areaId: 'A', valorHoraTabela: 400, horasMes: 100, ativoDesde: '2026-01' },
    ],
    custosAdvogado: [
      { id: 'c1', advogadoId: 'a1', vigenciaInicio: '2026-01', custoMensal: 20000 },
      { id: 'c2', advogadoId: 'a2', vigenciaInicio: '2026-01', custoMensal: 10000 },
      { id: 'c3', advogadoId: 'a1', vigenciaInicio: '2026-06', custoMensal: 25000 },
    ],
    despesas: [{ id: 'd1', valorMensal: 20000, vigenciaInicio: '2026-01', vigenciaFim: '' }],
    clientes: [{ id: 'C' }],
    projetos: [
      { id: 'P1', clienteId: 'C', areaId: 'A', modalidade: 'fixo', valorFixoMensal: 30000 },
      { id: 'P2', clienteId: 'C', areaId: 'A', modalidade: 'hora', valorFixoMensal: 0 },
    ],
    lancamentos: [
      { id: 'l1', data: '2026-03-02', advogadoId: 'a1', projetoId: 'P1', horas: 10 },
      { id: 'l2', data: '2026-03-03', advogadoId: 'a2', projetoId: 'P2', horas: 25 },
    ],
    faturas: [],
    ...over,
  };
}

test('utilitários de mês', () => {
  assert.equal(addMes('2026-12', 1), '2027-01');
  assert.equal(addMes('2026-01', -1), '2025-12');
  assert.deepEqual(mesesEntre('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('custo vigente respeita histórico (reajuste em junho)', () => {
  const db = dbBase();
  assert.equal(custoMensalVigente(db.custosAdvogado, 'a1', '2026-05'), 20000);
  assert.equal(custoMensalVigente(db.custosAdvogado, 'a1', '2026-06'), 25000);
});

test('rateio por cabeça e custo hora efetivo', () => {
  const ch = custoHoraDoMes(dbBase(), '2026-03').advogados.get('a1');
  assert.equal(ch.cotaRateio, 10000); // 20.000 / 2 advogados
  assert.equal(ch.custoDiretoHora, 200); // 20.000 / 100 h
  assert.equal(ch.rateioHora, 100);
  assert.equal(ch.custoEfetivoHora, 300);
});

test('exemplo da reunião: hora de tabela 960, custo efetivo 300 → margem 660', () => {
  const r = calcular(dbBase());
  const f = r.fatos.find((x) => x.advogadoId === 'a1');
  assert.equal(f.valorTabela / f.horas, 960);
  assert.equal((f.custoDireto + f.custoRateio) / f.horas, 300);
});

test('rateio proporcional ao custo', () => {
  const db = dbBase({ config: { rateioMetodo: 'proporcional_custo' } });
  const ch = custoHoraDoMes(db, '2026-03').advogados;
  quase(ch.get('a1').cotaRateio, 20000 * (20000 / 30000));
  quase(ch.get('a2').cotaRateio, 20000 * (10000 / 30000));
});

test('base de horas lançadas absorve 100% do custo de quem lançou', () => {
  const db = dbBase({ config: { baseHoras: 'lancadas' } });
  const r = calcular(db);
  const [m] = resumoMensal(r, ['2026-03']);
  quase(m.naoAbsorvido, 0);
});

test('custo não absorvido fecha com custo total do escritório', () => {
  const r = calcular(dbBase());
  const [m] = resumoMensal(r, ['2026-03']);
  // custo total = 30.000 pessoal + 20.000 despesas; absorvido = 10h*300 + 25h*(100+100)
  assert.equal(m.custoTotal, 50000);
  quase(m.absorvido, 3000 + 5000);
  quase(m.naoAbsorvido, 42000);
});

test('fatura única sem divisão informada usa valor de referência (fixo vs. horas)', () => {
  const db = dbBase({
    faturas: [{ id: 'F', numero: '1', clienteId: 'C', competencia: '2026-03', valor: 40000, itens: [] }],
  });
  const r = calcular(db);
  const porProj = Object.fromEntries(agregar(r.fatos, ['projeto']).map((x) => [x.chave[0], x]));
  // referência: P1 fixo 30.000; P2 25h × 400 = 10.000 → 75% / 25%
  quase(porProj.P1.faturado, 30000);
  quase(porProj.P2.faturado, 10000);
  assert.equal(r.alocacaoPorFatura.get('F').modo, 'automatico');
});

test('divisão informada na fatura é usada como peso; receita sem horas vira fato sem advogado', () => {
  const db = dbBase({
    lancamentos: [],
    faturas: [{ id: 'F', numero: '1', clienteId: 'C', competencia: '2026-03', valor: 1000, itens: [{ projetoId: 'P2', valor: 1 }] }],
  });
  const r = calcular(db);
  assert.equal(r.fatos.length, 1);
  assert.equal(r.fatos[0].projetoId, 'P2');
  assert.equal(r.fatos[0].advogadoId, null);
  assert.equal(r.fatos[0].faturado, 1000);
  assert.equal(r.alocacaoPorFatura.get('F').modo, 'informada');
});

test('receita do projeto-mês é distribuída entre advogados pelo valor de tabela', () => {
  const db = dbBase({
    lancamentos: [
      { id: 'l1', data: '2026-03-02', advogadoId: 'a1', projetoId: 'P2', horas: 10 }, // 9.600
      { id: 'l2', data: '2026-03-03', advogadoId: 'a2', projetoId: 'P2', horas: 6 }, // 2.400
    ],
    faturas: [{ id: 'F', numero: '1', clienteId: 'C', competencia: '2026-03', valor: 6000, itens: [{ projetoId: 'P2', valor: 6000 }] }],
  });
  const r = calcular(db);
  const porAdv = Object.fromEntries(agregar(r.fatos, ['advogado']).map((x) => [x.chave[0], x]));
  quase(porAdv.a1.faturado, 4800);
  quase(porAdv.a2.faturado, 1200);
});

test('métricas: receita = faturado', () => {
  const m = metricas({ horas: 10, valorTabela: 1000, custoDireto: 300, custoRateio: 100, faturado: 800 });
  assert.equal(m.receita, 800);
  assert.equal(m.margemLiquida, 400);
  assert.equal(m.margemBruta, 500);
  assert.equal(m.pctLiquida, 0.5);
  assert.equal(m.realizacao, 0.8);
});

test('detalhamento dos lançamentos fecha com os fatos do projeto-mês', () => {
  const db = gerarDadosDemo();
  const r = calcular(db);
  const det = detalharLancamentos(db, r, { projetoId: 'prj_nob_plan', mes: '2026-07' });
  const fatos = r.fatos.filter((f) => f.projetoId === 'prj_nob_plan' && f.mes === '2026-07');
  const s = somar(fatos);
  assert.ok(det.length > 0);
  quase(det.reduce((a, l) => a + l.custoDireto, 0), s.custoDireto);
  quase(det.reduce((a, l) => a + l.custoRateio, 0), s.custoRateio);
  quase(det.reduce((a, l) => a + l.valorTabela, 0), s.valorTabela);
  for (const l of det) quase(l.custoEfetivo, l.custoDireto + l.custoRateio);
});

test('dados demo: consistentes e com casos de negócio esperados', () => {
  const db = gerarDadosDemo();
  const r = calcular(db);
  assert.deepEqual(r.avisos, []);
  assert.ok(db.lancamentos.length > 500);
  // faturado total dos fatos = soma das faturas
  quase(somar(r.fatos).faturado, db.faturas.reduce((s, f) => s + f.valor, 0), 1);
  // faturas com divisão informada: soma dos itens = valor da fatura
  for (const f of db.faturas) if (f.itens.length) quase(f.itens.reduce((s, i) => s + i.valor, 0), f.valor, 0.05);
  // projeto fixo subprecificado dá prejuízo
  const vrt = agregar(r.fatos.filter((f) => f.projetoId === 'prj_vrt_trab'), ['projeto'])[0];
  assert.ok(metricas(vrt).margemLiquida < 0, 'Assessoria trabalhista Vértice deveria dar prejuízo');
  // determinismo
  assert.deepEqual(gerarDadosDemo(), db);
});
