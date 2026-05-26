const DEFAULT_TIMEOUT_MS = 12000;

export async function callSupabaseFunction(functionName, options = {}) {
  const {
    method = "GET",
    query = undefined,
    body = undefined,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const config = getSupabaseRuntimeConfig();
  const url = buildFunctionUrl(config.supabaseUrl, functionName, query);
  const requestHeaders = buildRequestHeaders(config.anonKey, method, body, headers);
  const signal = AbortSignal.timeout(timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: shouldSendBody(method, body) ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    console.error("[supabaseFunctionClient] network error", {
      functionName,
      method,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("数据服务暂时不可用，请稍后重试。");
  }

  const responseBody = await safeJson(response);
  if (!response.ok) {
    console.error("[supabaseFunctionClient] function error", {
      functionName,
      method,
      status: response.status,
      body: responseBody,
    });

    const message =
      responseBody?.error?.message ||
      responseBody?.message ||
      `Supabase function request failed: ${response.status}`;
    throw new Error(message);
  }

  return responseBody;
}

function getSupabaseRuntimeConfig() {
  const runtimeConfig = window.plantPet?.getRuntimeConfig?.() || {};
  const supabaseUrl = runtimeConfig.supabaseUrl || runtimeConfig.VITE_SUPABASE_URL || "";
  const anonKey = runtimeConfig.supabaseAnonKey || runtimeConfig.VITE_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !anonKey) {
    const missing = [
      !supabaseUrl ? "VITE_SUPABASE_URL" : null,
      !anonKey ? "VITE_SUPABASE_ANON_KEY" : null,
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Missing runtime config: ${missing}`);
  }

  return { supabaseUrl, anonKey };
}

function buildFunctionUrl(baseUrl, functionName, query) {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${normalizedBase}/functions/v1/${functionName}`);

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
