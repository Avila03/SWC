# Catálogo SWC e vínculos Gubo

Este repositório hospeda o catálogo comercial da SWC, enquanto a Gubo produz as peças associadas aos SKUs de cada variante.

## Como colocar produtos reais na vitrine

Edite `data/catalog.json`. O campo `products` começa vazio para não inventarmos nomes, fotos, preços ou SKUs.

Cada produto deve seguir este formato (apenas exemplo de estrutura — não é produto real):

```json
{
  "version": 1,
  "products": [
    {
      "id": "slug-unico-do-produto",
      "name": "Nome do produto real",
      "category": "Camisetas",
      "description": "Descrição fornecida pela SWC",
      "priceCents": 8990,
      "images": ["/assets/foto-real-do-produto.webp"],
      "active": true,
      "variants": [
        {
          "sku": "SUBSTITUIR-PELO-SKU-REAL-DA-GUBO",
          "color": "Preto",
          "size": "M",
          "available": true
        }
      ]
    }
  ]
}
```

- `priceCents` é o preço da SWC em centavos, **não** o custo de produção da Gubo.
- Cada combinação de cor e tamanho precisa do SKU correto da variante Gubo.
- As fotos podem ser URLs HTTPS ou arquivos versionados no próprio site, como `/assets/...`.
- Somente produtos com `active: true`, preço válido e pelo menos uma variante válida aparecem na vitrine.
- A página consulta `GET /api/catalog` e substitui a vitrine conceitual quando há produtos reais.
- Nenhum token ou informação privada deve ser escrito neste JSON. A chave `GUBO_API_KEY` permanece somente no Vercel.

## O que ainda não faz

- Não importamos automaticamente imagens, nomes e valores da Gubo: a existência dessa função não foi confirmada pela documentação acessível.
- A sacola continua uma simulação; ainda não existe checkout, pagamento, frete ou criação de pedidos.
- Não será feito envio para produção sem um fluxo de pagamento validado e a configuração completa dos endpoints e webhooks oficiais.

Documentação indicada pelo usuário: https://studio.gubo.com.br/docs-api/inicio-rapido
