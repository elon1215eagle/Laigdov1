export function createEmployeeMealRepository(client = null) {
  return {
    async fetchByReport(reportId) {
      if (!client || !reportId) return [];
      const { data, error } = await client
        .from("daily_report_employee_meals")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },

    async replace(reportId, rows = []) {
      if (!client) return rows;
      const { error: deleteError } = await client
        .from("daily_report_employee_meals")
        .delete()
        .eq("report_id", reportId);
      if (deleteError) throw deleteError;
      if (!rows.length) return [];
      const { data, error } = await client
        .from("daily_report_employee_meals")
        .insert(rows.map((row) => ({
          report_id: reportId,
          item_code: row.item_code,
          item_name: row.item_name,
          unit_price: row.unit_price,
          quantity: row.quantity,
        })))
        .select();
      if (error) throw error;
      return data || [];
    },
  };
}
