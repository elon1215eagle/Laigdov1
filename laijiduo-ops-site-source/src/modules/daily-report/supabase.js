import { dailyReportRepository } from "./data/supabaseDailyReportRepository.js";
import { dailyOperationsService } from "./data/supabaseDailyOperationsService.js";
import { inventoryRepository } from "./data/supabaseInventoryRepository.js";
import { operationsDashboardService } from "./data/supabaseOperationsDashboardService.js";
import { wasteRepository } from "./data/supabaseWasteRepository.js";
import { employeeMealRepository } from "./data/supabaseEmployeeMealRepository.js";

export const fetchDailyReports = (...args) => dailyReportRepository.fetchByDate(...args);
export const fetchDailyReportsRange = (...args) => dailyReportRepository.fetchRange(...args);
export const upsertDailyReport = (...args) => dailyReportRepository.upsert(...args);
export const deleteDailyReport = (...args) => dailyReportRepository.deleteOne(...args);
export const deleteDailyReports = (...args) => dailyReportRepository.deleteMany(...args);
export const fetchInventoryCounts = (...args) => inventoryRepository.fetchByReport(...args);
export const fetchInventoryCountsForReports = (...args) => inventoryRepository.fetchForReports(...args);
export const upsertInventoryCounts = (...args) => inventoryRepository.upsert(...args);
export const fetchDailyReportWasteItems = (...args) => wasteRepository.fetchByReport(...args);
export const fetchDailyReportEmployeeMeals = (...args) => employeeMealRepository.fetchByReport(...args);
export const saveDailyOperations = (...args) => dailyOperationsService.save(...args);
export const fetchHqDashboardData = (...args) => operationsDashboardService.fetchRange(...args);

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function fetchPreviousInventoryCounts(storeId, reportDate) {
  if (!storeId || !reportDate) return [];
  const reports = await dailyReportRepository.fetchByDate(addDays(reportDate, -1));
  const previousReport = reports.find((report) => report.store_id === storeId);
  if (!previousReport?.id) return [];
  return inventoryRepository.fetchByReport(previousReport.id);
}
