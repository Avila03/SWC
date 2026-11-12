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

## Próxima integração Vercel ⇄ Supabase

As variáveis Supabase ainda **não** foram adicionadas ao projeto Vercel. Para conectar o backend:

1. No dashboard do Supabase, abrir **Project Settings → API Keys** e obter uma *secret key* adequada para acesso de backend. Se disponível, preferir uma chave nova `sb_secret_...` em vez de usar um `service_role` legado.
2. No projeto Vercel `swampchill`, configurar **Sensitive** `SUPABASE_SECRET_KEY`, apenas no ambiente necessário. Nunca informar a chave no chat ou versionar no Git.
3. Definir `SUPABASE_URL=https://sclerlfknowmjwceehwh.supabase.co`.
4. Fazer novo deploy e construir uma rota server-side de diagnóstico que apenas verifica conexão (sem expor chave ou dados de clientes).
5. Implementar endpoint seguro de sessão de checkout que derive os valores do catálogo comercial, confirme os SKUs ativos e valide a cotação de frete.
6. Implementar pagamentos Mercado Pago no **sandbox**, com registro atômico e idempotência. Não criar pagamentos sem persistência e proteção contra duplicações.
7. Implementar webhooks assinados de Mercado Pago e Gubo, confirmar pagamentos consultando a API e só então preparar produção.

**Importante:** o token do Mercado Pago está configurado e autenticado, mas isso não autoriza ativar cobranças reais; o webhook seguro, processamento de pedidos e testes end-to-end ainda precisam ser concluídos.

Referências de segurança:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api
