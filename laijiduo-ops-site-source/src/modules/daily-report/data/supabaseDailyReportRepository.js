import { storesSeed } from "../../../lib/mockData.js";
import { supabase } from "../../../lib/supabase.js";
import { createDailyReportRepository } from "./dailyReportRepository.js";

export const dailyReportRepository = createDailyReportRepository(supabase, {
  fallbackReports: storesSeed,
});
