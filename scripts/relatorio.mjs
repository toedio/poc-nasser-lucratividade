// Imprime no terminal um resumo dos dados demo — útil para conferir o motor sem abrir o browser.
import { gerarDadosDemo } from '../src/seed.js';
import { calcular, agregar, metricas, resumoMensal } from '../src/engine.js';

const db = gerarDadosDemo();
const r = calcular(db);
const brl = (v) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const nome = (arr, id) => arr.find((x) => x.id === id)?.nome ?? id;

console.log(`Lançamentos: ${db.lancamentos.length} | Faturas: ${db.faturas.length}`);
console.log('\nPor cliente › projeto (receita = faturado)');
const linhas = agregar(r.fatos, ['cliente', 'projeto'])
  .map((x) => ({ x, m: metricas(x) }))
  .sort((a, b) => a.m.pctLiquida - b.m.pctLiquida);
for (const { x, m } of linhas) {
  console.log(
    `${nome(db.clientes, x.chave[0]).slice(0, 28).padEnd(28)} ${nome(db.projetos, x.chave[1]).slice(0, 34).padEnd(34)}` +
      ` h=${String(Math.round(m.horas)).padStart(5)} tab=${brl(m.valorTabela).padStart(9)} fat=${brl(m.faturado).padStart(9)}` +
      ` cEf=${brl(m.custoEfetivo).padStart(9)} mLiq=${brl(m.margemLiquida).padStart(9)} ${pct(m.pctLiquida).padStart(7)}`,
  );
}
console.log('\nEscritório mês a mês');
for (const m of resumoMensal(r, r.meses)) {
  console.log(
    `${m.mes} custo=${brl(m.custoTotal)} absorvido=${brl(m.absorvido)} não abs.=${brl(m.naoAbsorvido)} faturado=${brl(m.faturado)} resultado=${brl(m.resultado)}`,
  );
}
if (r.avisos.length) console.log('\nAvisos:', r.avisos);
