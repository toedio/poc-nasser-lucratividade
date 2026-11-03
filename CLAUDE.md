# CLAUDE.md

- Antes de qualquer tarefa, leia `docs/PLAYBOOK.md` (contexto do cliente Nasser Advogados, decisões, modelo de cálculo, pendências).
- Ao final de cada sessão, **atualize o playbook**: decisões novas, aprendizados, pendências e uma linha no histórico de sessões.
- Regras de negócio ficam só em `src/engine.js` (funções puras). A UI (`src/app.js`) não calcula margem. Toda regra nova precisa de teste em `tests/engine.test.js`; rode `npm test`.
- Sem build e sem dependências: JS puro com ES modules, para continuar publicável como site estático.
- Dados de demo são fictícios e determinísticos (`src/seed.js`). Nunca usar nomes reais de clientes ou advogados da Nasser.
- Identidade visual: tokens em `src/styles.css` (vermelho `#C41230`). Idioma da UI e da documentação: português (Brasil).
