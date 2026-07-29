import { createOperationsDashboardService } from "./operationsDashboardService.js";
import { dailyReportRepository } from "./supabaseDailyReportRepository.js";
import { inventoryRepository } from "./supabaseInventoryRepository.js";

export const operationsDashboardService = createOperationsDashboardService({
  dailyReportRepository,
  inventoryRepository,
});
