import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSensorRepository } from "../shared/repositories/sensorRepository.ts";
import {
  generatePlantReply,
  validateChatMessages,
} from "../shared/services/chatService.ts";
import {
  ApiError,
  errorResponse,
  handleOptions,
  jsonResponse,
} from "../shared/utils/response.ts";
import { assertValidDeviceId } from "../shared/utils/validation.ts";

// Semantic route: POST /api/chat
// Supabase deployed route: /functions/v1/chat
serve(async (request) => {
  try {
    const optionsResponse = handleOptions(request);
    if (optionsResponse) {
      return optionsResponse;
    }

    try {
      if (request.method !== "POST") {
        throw new ApiError(405, "Method not allowed");
      }

      const body = await readChatBody(request);
      const deviceId = getDeviceId(body);
      const messages = body.messages;
      validateChatMessages(messages);

      const repository = createSensorRepository();
      const result = await generatePlantReply({
        deviceId,
        messages,
        repository,
      });

      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  } catch (error) {
    const err = error as Error;
    console.error("[chat] unhandled error");
    console.error(err?.message ?? String(error));
    console.error(err?.stack ?? "no-stack");
    return jsonResponse(
      {
        error: {
          message: "Chat function internal error",
          details: err?.message ?? String(error),
        },
      },
      500,
    );
  }
});

async function readChatBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "Request body must be a JSON object");
    }

    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(400, "Invalid JSON request body");
  }
}

function getDeviceId(body: Record<string, unknown>): string {
  if (body.device_id === undefined || body.device_id === null || body.device_id === "") {
    return "sensor_001";
  }

  if (typeof body.device_id !== "string") {
    throw new ApiError(400, "device_id must be a string");
  }

  const deviceId = body.device_id.trim() || "sensor_001";
  assertValidDeviceId(deviceId);
  return deviceId;
}
