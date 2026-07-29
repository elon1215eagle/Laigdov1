import { supabase } from "../../../lib/supabase.js";
import { createDailyOperationsService } from "./dailyOperationsService.js";
import { dailyReportRepository } from "./supabaseDailyReportRepository.js";
import { inventoryRepository } from "./supabaseInventoryRepository.js";

export const dailyOperationsService = createDailyOperationsService({
  client: supabase,
  dailyReportRepository,
  inventoryRepository,
});
