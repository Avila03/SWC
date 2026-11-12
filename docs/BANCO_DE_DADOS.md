# SWC — Banco de dados e checkout

## Projeto

- Supabase: https://supabase.com/dashboard/project/sclerlfknowmjwceehwh
- Project ref: `sclerlfknowmjwceehwh`
- API URL: `https://sclerlfknowmjwceehwh.supabase.co`
- Site: https://swampchill.vercel.app
- Repositório: `Avila03/SWC`

## Estrutura aplicada em 12/11/2026

Migração: `swc_checkout_initial_private_orders`.

| Tabela | Finalidade |
|---|---|
| `public.swc_orders` | Pedido, cliente, entrega, totais, status |
| `public.swc_order_items` | SKUs Gubo e preços do pedido |
| `public.swc_payments` | Tentativas de pagamento Mercado Pago e idempotência |
| `public.swc_fulfillments` | Integração de produção com Gubo |
| `public.swc_webhook_events` | Registro deduplicado de eventos externos |
| `public.swc_order_events` | Histórico interno do pedido |

Todas têm RLS habilitado. Não existem permissões de leitura/escrita para `anon` e `authenticated`, nem políticas públicas. O acesso dessas tabelas destina-se somente ao backend com credencial secreta do Supabase. A tabela `public."Swc"` preexistente foi preservada.

Todos os valores financeiros usam centavos em inteiros. Referências externas e chaves de idempotência são únicas.

A consulta de verificação retornou **zero pedidos, zero pagamentos e zero envios**. Nenhuma compra foi disparada ao criar o banco.

## Integração Vercel ⇄ Supabase confirmada (12/11/2026)

As variáveis `SUPABASE_URL` e `SUPABASE_SECRET_KEY` estão cadastradas como **Sensitive** em produção no Vercel da SWC.

O backend Vercel autenticou com a API REST do Supabase e consultou `public.swc_orders` em modo somente leitura, com **HTTP 200**. O teste não criou, atualizou ou removeu registros.

A camada reutilizável em `lib/supabase-server.js` restringe a conexão ao host do projeto `sclerlfknowmjwceehwh.supabase.co` e à lista das seis tabelas internas. Ela utiliza a chave apenas no servidor, nunca no navegador.

O status público de preparação é exibido por `GET /api/mercadopago-readiness`. Esse endpoint não devolve chaves nem detalhes do banco.

## Próxima etapa — registrar pedidos e integrar Pix em ambiente de testes

1. Definir uma criação de pedido transacional e idempotente, validando SKUs e preços no backend antes de gravar registros.
2. Implementar formulário de entrega da SWC com validação e armazenamento protegido de dados pessoais, sem CPF ou endereço em `localStorage`.
3. Verificar explicitamente o ambiente das credenciais de Mercado Pago antes de criar qualquer cobrança de teste.
4. Integrar a criação de cobrança Pix em sandbox com chave de idempotência e vínculo ao pedido persistido.
5. Implementar webhook autenticado do Mercado Pago, com o segredo `MP_WEBHOOK_SECRET`; confirmar cada pagamento diretamente na API.
6. Somente após confirmação segura e persistida do pagamento, criar pedido Gubo usando `Idempotency-Key`, registrar e acompanhar estados da produção.
7. Executar os casos de teste: duplicidade de webhook, pagamento expirado, falha de entrega, cancelamento e reembolso. Habilitar cobranças reais somente depois.

**Atualmente:** nenhum checkout foi habilitado; o catálogo e a cotação Gubo seguem em modo de teste. O banco continua vazio.

Referências:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api
