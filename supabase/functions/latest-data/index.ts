import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSensorRepository } from "../shared/repositories/sensorRepository.ts";
import { handleLatestDataRequest } from "../shared/services/sensorService.ts";
import {
  ApiError,
  errorResponse,
  handleOptions,
  jsonResponse,
} from "../shared/utils/response.ts";

// Semantic route: GET /api/latest-data?device_id=sensor_001
// Supabase deployed route: /functions/v1/latest-data?device_id=sensor_001
serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) {
    return optionsResponse;
  }

  try {
    if (request.method !== "GET") {
      throw new ApiError(405, "Method not allowed");
    }

    const repository = createSensorRepository();
    const result = await handleLatestDataRequest(request, repository);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});
