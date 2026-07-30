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
  employeeMealRepository,
}) {
  async function saveSequentially(reportPayload, inventoryRows, wasteRows, employeeMealRows) {
    const report = await dailyReportRepository.upsert(reportPayload);
    const inventory = await inventoryRepository.upsert(report.id, inventoryRows);
    const waste = wasteRepository && Array.isArray(wasteRows)
      ? await wasteRepository.replace(report.id, wasteRows)
      : [];
    const employeeMeals = employeeMealRepository && Array.isArray(employeeMealRows)
      ? await employeeMealRepository.replace(report.id, employeeMealRows)
      : [];
    return {
      report,
      inventory,
      waste,
      employeeMeals,
      atomic: false,
    };
  }

  return {
    async save(reportPayload, inventoryRows = [], wasteRows = null, employeeMealRows = null) {
      if (!client) {
        return saveSequentially(reportPayload, inventoryRows, wasteRows, employeeMealRows);
      }

      const { data, error } = await client.rpc("save_daily_operations", {
        p_report: {
          ...reportPayload,
          employee_meals: employeeMealRows,
        },
        p_inventory: inventoryRows,
        p_waste: wasteRows,
      });
      if (!error) {
        return {
          report: data,
          inventory: inventoryRows,
          waste: wasteRows,
          employeeMeals: employeeMealRows,
          atomic: true,
        };
      }
      if (!isMissingOperationsRpc(error)) throw error;
      return saveSequentially(reportPayload, inventoryRows, wasteRows, employeeMealRows);
    },
  };
}

export { isMissingOperationsRpc };
