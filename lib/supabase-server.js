// Acesso server-side às tabelas privadas da Swamp Chill.
// Este arquivo é exclusivo do backend: nunca importá-lo em script.js ou no navegador.
"use strict";

const PROJECT_HOST = "sclerlfknowmjwceehwh.supabase.co";
const TABLES = new Set([
  "swc_orders",
  "swc_order_items",
  "swc_payments",
  "swc_fulfillments",
  "swc_webhook_events",
  "swc_order_events"
]);
const METHODS = new Set(["GET", "POST", "PATCH"]);

function config() {
  const key = process.env.SUPABASE_SECRET_KEY;
  const configuredUrl = process.env.SUPABASE_URL;
  if (!key || typeof key !== "string" || !configuredUrl) {
    throw new Error("supabase_not_configured");
  }
  let url;
  try { url = new URL(configuredUrl); }
  catch { throw new Error("supabase_url_invalid"); }
  if (url.protocol !== "https:" || url.hostname !== PROJECT_HOST ||
      (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("supabase_project_mismatch");
  }
  return { key, root: url.origin };
}

async function dbRequest(table, options = {}) {
  if (!TABLES.has(table)) throw new Error("invalid_database_table");
  const method = String(options.method || "GET").toUpperCase();
  if (!METHODS.has(method)) throw new Error("invalid_database_method");

  const { key, root } = config();
  const url = new URL(root + "/rest/v1/" + table);
  if (options.params) {
    for (const [name, value] of Object.entries(options.params)) {
      if (typeof name !== "string" || !/^[a-z0-9_]{1,70}$/i.test(name) ||
          typeof value !== "string" || value.length > 1500) {
        throw new Error("invalid_database_filter");
      }
      url.searchParams.set(name, value);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 7000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        apikey: key,
        ...(key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}),
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.prefer ? { Prefer: options.prefer } : {})
      },
      body: method === "GET" ? undefined : JSON.stringify(options.data),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    // Não incluir conteúdo da resposta em logs: pode conter dados de clientes.
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error("supabase_request_failed");
      error.status = response.status;
      error.code = typeof data?.code === "string" ? data.code : null;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Funções Postgres transacionais permitidas (execução restrita ao service_role).
const RPCS = new Set(["swc_create_order", "swc_record_payment"]);

async function dbRpc(fn, payload, timeoutMs = 8000) {
  if (!RPCS.has(fn)) throw new Error("invalid_database_function");
  const { key, root } = config();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const argName = fn === "swc_create_order" ? "p_order" : "p_payment";
    const response = await fetch(root + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        apikey: key,
        ...(key.startsWith("eyJ") ? { Authorization: "Bearer " + key } : {}),
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ [argName]: payload }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error("supabase_rpc_failed");
      error.status = response.status;
      // A mensagem do banco é um código curto definido nas funções (ex.: amount_mismatch).
      error.code = typeof data?.message === "string" && /^[a-z_]{3,40}$/.test(data.message) ? data.message : null;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { dbRequest, dbRpc, isConfigured: () => {
  try { config(); return true; } catch { return false; }
} };
