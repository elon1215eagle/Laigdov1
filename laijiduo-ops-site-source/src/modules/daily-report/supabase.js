import { dailyReportRepository } from "./data/supabaseDailyReportRepository.js";
import { inventoryRepository } from "./data/supabaseInventoryRepository.js";

export const fetchDailyReports = (...args) => dailyReportRepository.fetchByDate(...args);
export const fetchDailyReportsRange = (...args) => dailyReportRepository.fetchRange(...args);
export const upsertDailyReport = (...args) => dailyReportRepository.upsert(...args);
export const deleteDailyReport = (...args) => dailyReportRepository.deleteOne(...args);
export const deleteDailyReports = (...args) => dailyReportRepository.deleteMany(...args);
export const fetchInventoryCounts = (...args) => inventoryRepository.fetchByReport(...args);
export const fetchInventoryCountsForReports = (...args) => inventoryRepository.fetchForReports(...args);
export const upsertInventoryCounts = (...args) => inventoryRepository.upsert(...args);

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
