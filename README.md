# POC — Módulo de Lucratividade · Nasser Advogados

Prova de conceito para apurar a **lucratividade por cliente, cliente › projeto e cliente › projeto › mês**. Ela cruza:

- **valor faturado** (premissa: faturado = recebido);
- **custo hora do advogado** (remuneração + encargos);
- **rateio das despesas fixas do escritório** → custo efetivo da hora.

> Todos os dados são **fictícios**: nomes, clientes e valores são inventados.

## Rodar

```bash
npm start        # http://localhost:5173  (Node ≥ 20, sem dependências)
npm test         # testes do motor de cálculo
npm run relatorio  # resumo dos dados demo no terminal
```

## Publicar

É um site estático: publique a pasta raiz em GitHub Pages, Netlify, Vercel, S3 etc. Ele precisa ser servido por HTTP. Abrir o `index.html` direto (`file://`) não funciona, por causa dos ES modules.
Os dados ficam no `localStorage` de cada navegador. Para compartilhar um cenário, use Exportar/Importar JSON na tela de configurações. Ela fica fora do menu e se abre pela URL `#/config`.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `src/engine.js` | Regras de cálculo puras (custo hora, rateio, alocação de faturas, agregações) |
| `src/seed.js` | Gerador determinístico de dados fictícios |
| `src/app.js`, `src/styles.css`, `index.html` | Interface (JS puro, identidade visual Nasser) |
| `tests/` | Testes (`node --test`) |
| `docs/PLAYBOOK.md` | **Base de conhecimento do projeto**: contexto, decisões, fórmulas, pendências |
