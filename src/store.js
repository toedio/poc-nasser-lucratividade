// Persistência local (localStorage). Na versão real isto vira API + banco alimentado pelo WK.
import { gerarDadosDemo, VERSAO_DADOS } from './seed.js';

const CHAVE = 'nasser-lucratividade:db';

export const COLECOES = [
  'areas', 'advogados', 'custosAdvogado', 'despesas', 'clientes', 'projetos',
  'lancamentos', 'faturas',
];

export function normalizar(d) {
  if (!d || typeof d !== 'object') throw new Error('Arquivo inválido');
  for (const c of COLECOES) {
    if (!Array.isArray(d[c])) throw new Error(`Coleção "${c}" ausente ou inválida`);
  }
  return { versao: VERSAO_DADOS, config: {}, ...d };
}

export function carregar() {
  try {
    const s = localStorage.getItem(CHAVE);
    if (s) {
      const d = JSON.parse(s);
      if (d?.versao === VERSAO_DADOS) return normalizar(d);
    }
  } catch (e) {
    console.warn('Falha ao ler dados salvos; usando demo.', e);
  }
  return gerarDadosDemo();
}

export function salvar(db) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(db));
    return true;
  } catch (e) {
    console.warn('Falha ao salvar dados localmente.', e);
    return false;
  }
}

export function restaurarDemo() {
  const d = gerarDadosDemo();
  salvar(d);
  return d;
}

export function novoId(prefixo) {
  return `${prefixo}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
