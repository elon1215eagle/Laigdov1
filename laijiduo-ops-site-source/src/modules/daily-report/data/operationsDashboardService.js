function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousStockFields(row) {
  return {
    previous_stock: Number(row?.current_stock || 0),
    previous_stock_boxes: Number(row?.current_stock_boxes || 0),
    previous_stock_packs: Number(row?.current_stock_packs || 0),
    previous_stock_unit: row?.stock_unit || row?.unit || row?.products?.unit || "",
  };
}

export function enrichInventoryWithPrevious(reports, inventoryRows) {
  const reportsById = new Map(reports.map((report) => [report.id, report]));
  const sortedRows = inventoryRows
    .map((row) => ({ ...row, report: reportsById.get(row.report_id) }))
    .filter((row) => row.report)
    .sort((a, b) => (
      String(a.report.store_id).localeCompare(String(b.report.store_id))
      || String(a.product_id).localeCompare(String(b.product_id))
      || String(a.report.report_date).localeCompare(String(b.report.report_date))
    ));
  const latestByStoreProduct = new Map();

  return sortedRows.map((row) => {
    const key = `${row.report.store_id}-${row.product_id}`;
    const previous = latestByStoreProduct.get(key);
    latestByStoreProduct.set(key, row);
    const { report, ...cleanRow } = row;
    return {
      ...cleanRow,
      ...previousStockFields(previous),
    };
  });
}

export function createOperationsDashboardService({
  dailyReportRepository,
  inventoryRepository,
}) {
  return {
    async fetchRange(dateFrom, dateTo) {
      const contextReports = await dailyReportRepository.fetchRange(addDays(dateFrom, -1), dateTo);
      const reportIds = contextReports.map((report) => report.id).filter(Boolean);
      const inventoryRows = await inventoryRepository.fetchForReports(reportIds);
      const enrichedRows = enrichInventoryWithPrevious(contextReports, inventoryRows);
      const visibleReports = contextReports.filter(
        (report) => report.report_date >= dateFrom && report.report_date <= dateTo,
      );
      const visibleReportIds = new Set(visibleReports.map((report) => report.id));

      return {
        reports: visibleReports,
        inventoryRows: enrichedRows.filter((row) => visibleReportIds.has(row.report_id)),
      };
    },
  };
}
