export function createWasteRepository(client = null) {
  return {
    async fetchByReport(reportId) {
      if (!client || !reportId) return [];
      const { data, error } = await client
        .from("daily_report_waste_items")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },

    async replace(reportId, rows = []) {
      if (!client) return rows;
      const { error: deleteError } = await client
        .from("daily_report_waste_items")
        .delete()
        .eq("report_id", reportId);
      if (deleteError) throw deleteError;
      if (!rows.length) return [];
      const { data, error } = await client
        .from("daily_report_waste_items")
        .insert(rows.map((row) => ({ ...row, report_id: reportId })))
        .select();
      if (error) throw error;
      return data || [];
    },
  };
}
