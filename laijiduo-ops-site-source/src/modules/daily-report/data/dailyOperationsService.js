function isMissingOperationsRpc(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (
    code === "PGRST202"
    || code === "42883"
    || /save_daily_operations|schema cache.*function/i.test(message)
  );
}

export function createDailyOperationsService({
  client = null,
  dailyReportRepository,
  inventoryRepository,
  wasteRepository,
}) {
  async function saveSequentially(reportPayload, inventoryRows, wasteRows) {
    const report = await dailyReportRepository.upsert(reportPayload);
    const inventory = await inventoryRepository.upsert(report.id, inventoryRows);
    const waste = wasteRepository && Array.isArray(wasteRows)
      ? await wasteRepository.replace(report.id, wasteRows)
      : [];
    return { report, inventory, waste, atomic: false };
  }

  return {
    async save(reportPayload, inventoryRows = [], wasteRows = null) {
      if (!client) return saveSequentially(reportPayload, inventoryRows, wasteRows);

      const { data, error } = await client.rpc("save_daily_operations", {
        p_report: reportPayload,
        p_inventory: inventoryRows,
        p_waste: wasteRows,
      });
      if (!error) {
        return {
          report: data,
          inventory: inventoryRows,
          atomic: true,
        };
      }
      if (!isMissingOperationsRpc(error)) throw error;
      return saveSequentially(reportPayload, inventoryRows, wasteRows);
    },
  };
}

export { isMissingOperationsRpc };
