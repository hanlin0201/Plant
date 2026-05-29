import { getSupabaseRuntimeConfig } from "./supabaseFunctionClient.js";

const DEFAULT_TIMEOUT_MS = 12000;

export async function requestSupabaseTable(path, options = {}) {
  const {
    method = "GET",
    query = undefined,
    body = undefined,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const config = getSupabaseRuntimeConfig();
  const url = buildRestUrl(config.supabaseUrl, path, query);
  const signal = AbortSignal.timeout(timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: buildRequestHeaders(config.anonKey, method, body, headers),
      body: shouldSendBody(method, body) ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    console.error("[supabaseRestClient] network error", {
      path,
      method,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("数据库暂时不可用，请稍后重试。");
  }

  const responseBody = await safeJson(response);
  if (!response.ok) {
    console.error("[supabaseRestClient] table request error", {
      path,
      method,
      status: response.status,
      body: responseBody,
    });

    const message =
      responseBody?.message ||
      responseBody?.error_description ||
      responseBody?.hint ||
      `Supabase table request failed: ${response.status}`;
    throw new Error(message);
  }

  return responseBody;
}

function buildRestUrl(baseUrl, path, query) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const url = new URL(`${normalizedBase}/rest/v1/${normalizedPath}`);

  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function buildRequestHeaders(anonKey, method, body, customHeaders) {
  const requestHeaders = {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    Accept: "application/json",
    ...customHeaders,
  };

  if (shouldSendBody(method, body)) {
    requestHeaders["Content-Type"] = "application/json";
  }

  return requestHeaders;
}

function shouldSendBody(method, body) {
  return method.toUpperCase() !== "GET" && body !== undefined;
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
