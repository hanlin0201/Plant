import type { SensorRepository } from "../repositories/sensorRepository.ts";
import type { PlantEventType, PlantState } from "../types.ts";
import { PLANT_SYSTEM_PROMPT } from "../prompts/plantSystemPrompt.ts";
import { getPlantContext, type PlantContext } from "./plantContextService.ts";
import { ApiError } from "../utils/response.ts";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface GeneratePlantReplyParams {
  deviceId: string;
  messages: ChatMessage[];
  repository: SensorRepository;
}

export interface GeneratePlantReplyResult {
  reply: string;
  plant_state: PlantState;
  event_type: PlantEventType;
}

interface SiliconFlowConfig {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
}

export async function generatePlantReply(
  params: GeneratePlantReplyParams,
): Promise<GeneratePlantReplyResult> {
  validateChatMessages(params.messages);

  const config = getAiConfig();
  const plantContext = await getPlantContext(params.deviceId, params.repository);
  const reply = await requestSiliconFlowReply({
    config,
    messages: buildModelMessages(params.messages, plantContext),
  });

  return {
    reply,
    plant_state: plantContext.state,
    event_type: plantContext.event_type,
  };
}

export function validateChatMessages(messages: unknown): asserts messages is ChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ApiError(400, "messages is required and must be a non-empty array");
  }

  for (const message of messages) {
    if (
      !message ||
      typeof message !== "object" ||
      !["user", "assistant", "system"].includes((message as ChatMessage).role) ||
      typeof (message as ChatMessage).content !== "string" ||
      (message as ChatMessage).content.trim() === ""
    ) {
      throw new ApiError(400, "Each message must include role and content");
    }
  }

  const lastMessage = messages[messages.length - 1] as ChatMessage;
  if (lastMessage.role !== "user") {
    throw new ApiError(400, "The last message must have role=user");
  }
}

function getAiConfig(): SiliconFlowConfig {
  const apiKey = Deno.env.get("AI_API_KEY");
  const apiBaseUrl = Deno.env.get("AI_API_BASE_URL");
  const model = Deno.env.get("AI_MODEL");

  console.log("[chatService] AI_API_KEY present:", Boolean(apiKey));
  console.log("[chatService] AI_API_BASE_URL present:", Boolean(apiBaseUrl));
  console.log("[chatService] AI_MODEL present:", Boolean(model));

  const missing = [
    !apiKey ? "AI_API_KEY" : null,
    !apiBaseUrl ? "AI_API_BASE_URL" : null,
    !model ? "AI_MODEL" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new ApiError(500, "Missing SiliconFlow environment variables", {
      missing,
    });
  }

  return {
    apiKey: apiKey!,
    apiBaseUrl: apiBaseUrl!,
    model: model!,
  };
}

function buildModelMessages(
  userMessages: ChatMessage[],
  plantContext: PlantContext,
): ChatMessage[] {
  const sanitizedConversation = userMessages.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  const firstUserIndex = sanitizedConversation.findIndex(
    (message) => message.role === "user",
  );
  const normalizedConversation =
    firstUserIndex >= 0
      ? sanitizedConversation.slice(firstUserIndex)
      : sanitizedConversation;

  // SiliconFlow expects system instructions at the beginning.
  // Keep exactly one system message to avoid provider-side format errors.
  const modelMessages: ChatMessage[] = [
    {
      role: "system",
      content: `${PLANT_SYSTEM_PROMPT.trim()}\n\n${buildPlantContextMessage(plantContext)}\n\n请只输出给用户看的最终回复，不要输出思考过程。`,
    },
    ...normalizedConversation,
  ];

  console.log(
    "[chatService] outgoing roles:",
    modelMessages.map((message) => message.role).join(" -> "),
  );

  return modelMessages;
}

function buildPlantContextMessage(plantContext: PlantContext): string {
  const sensorData = plantContext.sensor_data;

  if (!sensorData) {
    return [
      "当前植物状态上下文：",
      "- state: unknown",
      "- event_type: unknown",
      "- sensor_data: 暂无",
    ].join("\n");
  }

  return [
    "当前植物状态上下文：",
    `- state: ${plantContext.state}`,
    `- event_type: ${plantContext.event_type}`,
    `- soil_moisture: ${sensorData.soil_moisture}`,
    `- temperature: ${sensorData.temperature}`,
    `- light: ${sensorData.light ?? "unknown"}`,
    `- air_humidity: ${sensorData.air_humidity ?? "unknown"}`,
    `- battery: ${sensorData.battery ?? "unknown"}`,
    `- created_at: ${plantContext.created_at ?? "unknown"}`,
    "请把这些当作内部上下文，不要直接用技术字段名回答用户。",
  ].join("\n");
}

async function requestSiliconFlowReply(params: {
  config: SiliconFlowConfig;
  messages: ChatMessage[];
}): Promise<string> {
  let response: Response;

  try {
    response = await fetch(params.config.apiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.config.apiKey}`,
      },
      body: JSON.stringify({
        model: params.config.model,
        messages: params.messages,
        enable_thinking: false,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });
  } catch (error) {
    throw new ApiError(502, "Failed to connect to SiliconFlow API", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const body = await safeJson(response);

  if (!response.ok) {
    const bodyText = JSON.stringify(body ?? null).slice(0, 500);
    console.error("[chatService] SiliconFlow request failed");
    console.error("[chatService] status:", response.status);
    console.error("[chatService] body_preview:", bodyText);
    throw new ApiError(502, "SiliconFlow API request failed", {
      status: response.status,
      body,
    });
  }

  const choice = body?.choices?.[0];
  const message = choice?.message ?? {};
  const reply = message?.content;
  const hasReasoning = typeof message?.reasoning_content === "string" &&
    message.reasoning_content.trim() !== "";
  const finishReason = choice?.finish_reason ?? null;

  const isReplyEmpty = typeof reply !== "string" || reply.trim() === "";
  console.log("[chatService] reply_content_empty:", isReplyEmpty);
  console.log("[chatService] reasoning_content_present:", hasReasoning);
  console.log("[chatService] finish_reason:", finishReason);

  if (isReplyEmpty) {
    return "我刚刚有点走神了，可以再问我一次吗？";
  }

  return reply.trim();
}

async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
