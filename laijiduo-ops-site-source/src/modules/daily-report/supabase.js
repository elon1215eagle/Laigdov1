import { dailyReportRepository } from "./data/supabaseDailyReportRepository.js";

export const fetchDailyReports = (...args) => dailyReportRepository.fetchByDate(...args);
export const fetchDailyReportsRange = (...args) => dailyReportRepository.fetchRange(...args);
export const upsertDailyReport = (...args) => dailyReportRepository.upsert(...args);
export const deleteDailyReport = (...args) => dailyReportRepository.deleteOne(...args);
export const deleteDailyReports = (...args) => dailyReportRepository.deleteMany(...args);
