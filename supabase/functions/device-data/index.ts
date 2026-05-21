import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSensorRepository } from "../shared/repositories/sensorRepository.ts";
import { handleDeviceDataUpload } from "../shared/services/sensorService.ts";
import {
  ApiError,
  errorResponse,
  handleOptions,
  jsonResponse,
} from "../shared/utils/response.ts";

// Semantic route: POST /api/device-data
// Supabase deployed route: /functions/v1/device-data
serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) {
    return optionsResponse;
  }

  try {
    if (request.method !== "POST") {
      throw new ApiError(405, "Method not allowed");
    }

    const repository = createSensorRepository();
    const result = await handleDeviceDataUpload(request, repository);
    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
});
