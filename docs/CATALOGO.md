# SWC — Integração direta com a Gubo

## Status em 12/11/2026

O site [swampchill.vercel.app](https://swampchill.vercel.app) consulta dados da Gubo pelo backend do Vercel. O cliente não é redirecionado para a Gubo.

### Catálogo

- `GET /api/catalog`: obtém produtos, fotos e variantes disponíveis pela API Gubo.
- Variações: `GET /v1/catalogo/variantes?disponivel=true`.
- Produtos: `GET /v1/catalogo/produtos`.
- A SWC mantém seus próprios preços de venda em `data/catalog.json`, sem confundir custo Gubo com preço ao consumidor.
- A chave `GUBO_API_KEY` permanece apenas no servidor.

Produtos associados:

| Código Gubo | Nome comercial SWC | Preço |
|---|---|---|
| `P261111208` | pantano | R$ 149,90 |
| `P261111200` | Camiseta Oversized A604793d 0236 429d 88ba b963ded855ca | R$ 149,90 |

### Sacola e cotação de frete — implementadas

- Sacola local no navegador com seleção de cor/tamanho, quantidade por variante e remoção de itens.
- Persistência de itens no `localStorage` (sem dados pessoais de entrega).
- Campo de CEP, opções de transporte, subtotal, frete e total estimado.
- `POST /api/shipping-quote` usa a chave protegida `GUBO_ORDERS_API_KEY` **somente em modo de teste**.
- O servidor valida CEP, limite de itens, SKUs ativos da Gubo e produtos comerciais ativos da SWC. Nunca confia no preço enviado pelo navegador.
- Após validar os itens, o backend chama `POST /v1/fretes/cotacoes` com `entrega.preferencia = "mais_barata"`; devolve opções de frete com preço e prazo, sem expor a chave.
- Teste concluído: cotação simulada com variante válida e CEP 01310-100; resposta da SWC `200` e **7 opções**. Não houve criação nem pagamento de pedidos.
- Cotação retorna estimativas, sujeitas a atualização no momento de produzir.
- Sem checkout: botão de pagamento permanece desabilitado.

### Segurança e requisitos antes de vender

Ainda faltam:

1. Escolher/conectar um provedor de pagamentos (por exemplo, Mercado Pago) e implementar o checkout **no domínio da SWC**.
2. Implementar registro persistente de pedidos com estados confiáveis e idempotência.
3. Confirmar pagamentos pelo **webhook assinado** do provedor; jamais apenas pelo retorno do navegador.
4. Validar novamente catálogo e valor, criar pedido na Gubo somente após o pagamento confirmado usando `POST /v1/pedidos/por-variante` e `Idempotency-Key`.
5. Implementar escolha de transportadora, recalcular frete, reservar verba para produção e pagar Gubo somente conforme política operacional.
6. Registrar webhook Gubo para produção, postagem, rastreio e entrega; evitar duplicidades.
7. Reforçar limitações e proteção contra abuso de consultas de frete (a proteção em memória atual é apenas inicial), cuidar de LGPD, termos, política de troca e devolução.
8. Concluir o ciclo no sandbox e só então configurar chave `gubo_live_` para produção.

**Não colocar a função de criação/pagamento de pedidos em uma rota pública não autenticada.** O ambiente atual é exclusivamente de demonstração e cotação de teste.

Documentação oficial:
- https://gubo.com.br/docs-api/catalogo
- https://gubo.com.br/docs-api/fretes
- https://gubo.com.br/docs-api/pedidos
- https://gubo.com.br/docs-api/inicio-rapido
