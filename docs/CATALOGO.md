# SWC — Integração direta com a Gubo

## Estado atual (12/11/2026)

A vitrine do site SWC consulta a API oficial da Gubo diretamente pelo backend hospedado no Vercel, sem redirecionar os compradores.

- `GET /api/catalog` consulta no servidor:
  - `GET https://api.gubo.com.br/v1/catalogo/produtos`
  - `GET https://api.gubo.com.br/v1/catalogo/variantes?disponivel=true`
- A autenticação usa `GUBO_API_KEY` configurada no Vercel. **Jamais incluir chave no JavaScript do navegador ou no repositório.**
- O catálogo da Gubo fornece nome de referência, código do produto, foto e SKUs, cores e tamanhos disponíveis.
- O arquivo `data/catalog.json` guarda os dados comerciais da SWC (nome de exibição, preço de venda, descrição, categorias, ativação). Ele referencia cada produto por `guboProductCode`.
- O preço exibido é o da SWC (`priceCents`), **não o preço de produção** fornecido pela API Gubo.
- A API da SWC tem cache de 5 minutos, reduzindo requisições à Gubo. O backend pagina respostas e fecha a venda em caso de indisponibilidade da integração.
- A sacola permite selecionar uma variante e adicionar itens, **sem checkout, pagamentos ou pedidos reais** nesta etapa.

## Produtos atualmente conectados

| Código Gubo | Cadastro na SWC |
| --- | --- |
| `P261111208` | pantano |
| `P261111200` | Camiseta Oversized A604793d 0236 429d 88ba b963ded855ca |

Os códigos acima foram confirmados em `GET /api/catalog` pela Gubo.

## Próxima etapa — checkout integrado

Atualmente a chave de teste possui acesso ao catálogo/vínculos, mas `GET /v1/pedidos` retornou `403 escopo_insuficiente`. Para testes de pedidos, deve-se configurar no Gubo Dev uma chave com a permissão **Pedidos completos** no Vercel, sem enviá-la por chat nem registrar em logs.

Ainda será necessário:

1. Definir um intermediador de pagamentos que confirme o pagamento por webhook seguro.
2. Implementar checkout no domínio SWC, registro de pedido persistente, verificação do pagamento no backend, idempotência e cálculo do frete.
3. Só depois da confirmação do pagamento, enviar o pedido para `POST /v1/pedidos/por-variante` com os SKUs corretos e `Idempotency-Key`.
4. Implementar pagamento de produção pela carteira Gubo de forma controlada, acompanhamentos e webhook de rastreio.
5. Executar o ciclo completo no modo de teste, antes de usar uma chave `gubo_live_`.

**Não ativar pedidos reais sem validação de pagamento, saldo, frete, autenticação e mecanismos anti-duplicação.**

Documentação:
- https://gubo.com.br/docs-api/catalogo
- https://gubo.com.br/docs-api/vinculos
- https://gubo.com.br/docs-api/pedidos
- https://gubo.com.br/docs-api/inicio-rapido
