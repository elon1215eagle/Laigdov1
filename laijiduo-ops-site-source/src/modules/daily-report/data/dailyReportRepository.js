const REPORT_FIELDS = [
  "id",
  "store_id",
  "report_date",
  "opened_to_1400_revenue",
  "revenue_1400_to_1900",
  "revenue_1900_to_close",
  "cash_difference",
  "delivery_revenue",
  "employee_meal_total",
  "scheduled_staff_count",
  "actual_staff_count",
  "staffing_variance_reason",
  "customer_complaint_count",
  "customer_complaint_detail",
  "equipment_issue",
  "equipment_issue_detail",
  "special_event",
  "status",
  "manager_note",
  "total_revenue",
  "stores(name, area, store_code, manager_name, target_daily_revenue, target_monthly_revenue)",
].join(", ");

const LEGACY_REPORT_FIELDS = [
  "id",
  "store_id",
  "report_date",
  "opened_to_1400_revenue",
  "revenue_1400_to_1900",
  "revenue_1900_to_close",
  "cash_difference",
  "status",
  "manager_note",
  "total_revenue",
  "stores(name, area, store_code, manager_name, target_daily_revenue)",
].join(", ");

export function normalizeDailyReportRow(report) {
  return {
    ...report,
    name: report.stores?.name,
    area: report.stores?.area,
    store_code: report.stores?.store_code,
    manager_name: report.stores?.manager_name,
    target: report.stores?.target_daily_revenue,
    target_monthly_revenue: report.stores?.target_monthly_revenue,
  };
}

export function createDailyReportRepository(client = null, { fallbackReports = [] } = {}) {
  async function fetchRows({ reportDate, dateFrom, dateTo }) {
    const buildQuery = (fields) => {
      let query = client.from("daily_report_totals").select(fields);
      if (reportDate) query = query.eq("report_date", reportDate);
      if (dateFrom) query = query.gte("report_date", dateFrom);
      if (dateTo) query = query.lte("report_date", dateTo);
      if (!reportDate) query = query.order("report_date");
      return query.order("store_id");
    };

    const result = await buildQuery(REPORT_FIELDS);
    if (!result.error) return (result.data || []).map(normalizeDailyReportRow);

    const legacyResult = await buildQuery(LEGACY_REPORT_FIELDS);
    if (legacyResult.error) throw legacyResult.error;
    return (legacyResult.data || []).map(normalizeDailyReportRow);
  }

  return {
    async fetchByDate(reportDate) {
      if (!client) return fallbackReports;
      return fetchRows({ reportDate });
    },

    async fetchRange(dateFrom, dateTo) {
      if (!client) return [];
      return fetchRows({ dateFrom, dateTo });
    },

    async upsert(payload) {
      if (!client) return payload;
      const { data, error } = await client
        .from("daily_reports")
        .upsert(payload, { onConflict: "store_id,report_date" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async deleteOne(reportId) {
      if (!client || !reportId) return [];
      const { data, error } = await client
        .from("daily_reports")
        .delete()
        .eq("id", reportId)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("刪除失敗：資料庫未回傳已刪除的每日回報");
      }
      return data;
    },

    async deleteMany(reportIds) {
      const ids = reportIds?.filter(Boolean) || [];
      if (!client || !ids.length) return [];
      const { data, error } = await client
        .from("daily_reports")
        .delete()
        .in("id", ids)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("批次刪除失敗：資料庫未回傳已刪除的每日回報");
      }
      if (data.length !== ids.length) {
        throw new Error(`批次刪除不完整：預期 ${ids.length} 筆，實際刪除 ${data.length} 筆`);
      }
      return data;
    },
  };
}
