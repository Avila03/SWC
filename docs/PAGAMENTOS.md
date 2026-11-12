# Mercado Pago — checkout próprio da SWC

## Situação inicial

Uma captura de tela mostra o Mercado Pago conectado em outra plataforma. Isso **não transfere automaticamente** a autorização de pagamento para a SWC hospedada no Vercel.

A SWC tem a Gubo conectada para catálogo, variantes e frete; o checkout SWC e os pagamentos ainda não estão ativos.

## Configuração segura no Vercel

1. Acesse https://www.mercadopago.com.br/developers/panel/app e a aplicação que será utilizada pela SWC. Caso a conexão existente esteja em outra plataforma, mantenha-a e use uma aplicação própria para a SWC.
2. Em **Credenciais**, escolha o ambiente de **Teste** e obtenha o **Access Token** de teste. Não envie o token ao ChatGPT nem coloque-o no GitHub ou no navegador.
3. No projeto Vercel `swampchill`, em **Settings > Environment Variables**, cadastre:
   - `MP_TEST_ACCESS_TOKEN`: *Sensitive*, valor do Access Token de teste do Mercado Pago.
   - `MP_WEBHOOK_SECRET`: *Sensitive*, preencher com a assinatura secreta da integração quando configurarmos o webhook. O webhook só deve ser publicado depois de ter verificação de assinatura.
4. Faça novo deploy e consulte `GET /api/mercadopago-readiness`, que confirma apenas se essas variáveis existem. Esse endpoint **não** autentica nem processa pagamentos.
5. Nunca utilizar credenciais de produção antes de concluir o ciclo de testes, registro persistente de pedidos e bloqueios de duplicidade.

## Fluxo técnico que ainda precisa ser implementado

- Checkout da SWC deve recolher dados de entrega/contato com consentimento e transmitir ao backend seguro. Não armazenar CPF/endereço em `localStorage`.
- Criar um pedido da SWC de forma persistente (banco de dados), com itens, SKUs, endereço, preço calculado no servidor, cotação de frete e identificador imutável. Nunca confiar em preços do navegador.
- Criar cobrança Mercado Pago no ambiente de teste com chave idempotente, gerar Pix/QR Code e informar corretamente a situação inicial de pagamento.
- Receber notificações Mercado Pago por HTTPS, validar assinatura com `MP_WEBHOOK_SECRET` e consultar o pagamento diretamente na API. **Nunca usar somente o retorno do navegador como prova de pagamento.**
- Após pagamento confirmado, gravar a transição de status no banco, garantir exatamente um envio lógico para a Gubo com referência estável e `Idempotency-Key` e pagar produção conforme política de saldo da Gubo.
- Sincronizar status/rastreamento Gubo com verificação de autenticidade e segurança.
- Testar fluxo completo, cancelar/reembolsar/falhar e somente então liberar produção.

## Checkout Pix de teste (implementado em 12/11/2026, desligado por padrão)

`POST /api/checkout-test`:

1. Valida dados (nome, e-mail, telefone, CPF com dígitos verificadores, endereço, UF e consentimento).
2. Recalcula preços pelo `data/catalog.json` e revalida variantes e frete diretamente na Gubo. Preço e frete do navegador são ignorados.
3. Cria o pedido via `swc_create_order` (transacional e idempotente).
4. Cria a order Pix no Mercado Pago (`/v1/orders`, `processing_mode: automatic`, expiração `PT30M`) com `X-Idempotency-Key: swc-pix-<order_id>` e `MP_TEST_ACCESS_TOKEN`.
5. Registra a cobrança via `swc_record_payment` e devolve QR Code, copia e cola e link.
6. Repetir a mesma chave devolve o mesmo Pix sem nova cobrança.

Ligar: no Vercel, `SWC_TEST_CHECKOUT` = `enabled` (Production) e novo deploy. Desligar: remover a variável. O formulário (`checkout-test.js`) só aparece quando `/api/mercadopago-readiness` informa `testCheckoutEnabled: true`.

O pedido fica em `awaiting_payment` até o webhook assinado confirmar o pagamento. Nenhum pedido é enviado à Gubo nesta etapa.

**Estado do site nesta etapa:** catálogo e cotação da Gubo em teste disponíveis; botão de pagamento desabilitado por segurança.

Documentação:
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/credentials
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix
- https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/optional-notifications
