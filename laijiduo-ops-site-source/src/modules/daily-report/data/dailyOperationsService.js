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
}) {
  async function saveSequentially(reportPayload, inventoryRows) {
    const report = await dailyReportRepository.upsert(reportPayload);
    const inventory = await inventoryRepository.upsert(report.id, inventoryRows);
    return { report, inventory, atomic: false };
  }

  return {
    async save(reportPayload, inventoryRows = []) {
      if (!client) return saveSequentially(reportPayload, inventoryRows);

      const { data, error } = await client.rpc("save_daily_operations", {
        p_report: reportPayload,
        p_inventory: inventoryRows,
      });
      if (!error) {
        return {
          report: data,
          inventory: inventoryRows,
          atomic: true,
        };
      }
      if (!isMissingOperationsRpc(error)) throw error;
      return saveSequentially(reportPayload, inventoryRows);
    },
  };
}

export { isMissingOperationsRpc };
