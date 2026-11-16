# Estrutura do site (16/11/2026)

- `public/` — tudo que o navegador recebe: `index.html` (vitrine), `produto.html?p=<id>` (peça), `checkout.html`, `404.html`, CSS, JS e `assets/`.
- `api/` — funções do servidor (catálogo, frete, checkout de teste, estado do pedido, webhook, readiness).
- `lib/`, `data/`, `docs/` — só no servidor/repositório; não são mais servidos como arquivos do site.
- `vercel.json` — cabeçalhos de segurança (CSP, nosniff, frame, referrer) e cache de `assets/`.

Scripts do navegador: `swc-core.js` (sacola, catálogo, menu), `home.js`, `produto.js`, `checkout.js`, `gallery.js` (animações).
`POST /api/order-status` devolve só o estado do pedido e exige número do pedido + chave do checkout.

Se um novo script inline for adicionado a uma página, atualizar o hash em `Content-Security-Policy` no `vercel.json`.
