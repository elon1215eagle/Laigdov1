const INVENTORY_REPORT_FIELDS = [
  "report_id",
  "product_id",
  "current_stock",
  "safety_stock",
  "loss_count",
  "incoming_count",
  "stock_unit",
  "incoming_unit",
  "current_stock_boxes",
  "current_stock_packs",
  "incoming_boxes",
  "incoming_packs",
  "incoming_source",
  "transfer_note",
  "is_shortage",
  "products(name, unit, sort_order)",
].join(", ");

const LEGACY_INVENTORY_REPORT_FIELDS = [
  "report_id",
  "product_id",
  "current_stock",
  "safety_stock",
  "loss_count",
  "incoming_count",
  "incoming_source",
  "transfer_note",
  "is_shortage",
  "products(name, unit, sort_order)",
].join(", ");

export function normalizeInventoryRow(row) {
  return {
    ...row,
    stock_unit: row.stock_unit || row.unit || row.products?.unit || "件",
    incoming_unit: row.incoming_unit || row.unit || row.products?.unit || "件",
    current_stock_boxes: Number(row.current_stock_boxes || 0),
    current_stock_packs: Number(row.current_stock_packs || 0),
    incoming_boxes: Number(row.incoming_boxes || 0),
    incoming_packs: Number(row.incoming_packs || 0),
    incoming_source: row.incoming_source || "廠商進貨",
    transfer_note: row.transfer_note || "",
  };
}

export function stripNewInventoryFields(rows) {
  return rows.map((row) => {
    const {
      stock_unit,
      incoming_unit,
      current_stock_boxes,
      current_stock_packs,
      incoming_boxes,
      incoming_packs,
      incoming_source,
      transfer_note,
      ...legacyRow
    } = row;
    return legacyRow;
  });
}

export function isInventorySchemaCacheError(error) {
  const message = String(error?.message || "");
  return /schema cache|column|stock_unit|incoming_unit|current_stock_boxes|current_stock_packs|incoming_boxes|incoming_packs|incoming_source|transfer_note/.test(message);
}

export function createInventoryRepository(client = null) {
  return {
    async fetchByReport(reportId) {
      if (!client || !reportId) return [];
      const { data, error } = await client
        .from("inventory_counts")
        .select("*")
        .eq("report_id", reportId);
      if (error) throw error;
      return (data || []).map(normalizeInventoryRow);
    },

    async fetchForReports(reportIds) {
      const ids = reportIds?.filter(Boolean) || [];
      if (!client || !ids.length) return [];
      const result = await client
        .from("inventory_counts")
        .select(INVENTORY_REPORT_FIELDS)
        .in("report_id", ids);
      const resolved = result.error
        ? await client
          .from("inventory_counts")
          .select(LEGACY_INVENTORY_REPORT_FIELDS)
          .in("report_id", ids)
        : result;
      if (resolved.error) throw resolved.error;
      return (resolved.data || []).map((row) => normalizeInventoryRow({
        ...row,
        name: row.products?.name,
        unit: row.products?.unit,
        sort_order: row.products?.sort_order,
      }));
    },

    async upsert(reportId, rows) {
      if (!client) return rows;
      const payload = rows.map((row) => ({ ...row, report_id: reportId }));
      const result = await client
        .from("inventory_counts")
        .upsert(payload, { onConflict: "report_id,product_id" })
        .select();
      if (!result.error) return (result.data || []).map(normalizeInventoryRow);
      if (!isInventorySchemaCacheError(result.error)) throw result.error;

      const fallbackResult = await client
        .from("inventory_counts")
        .upsert(stripNewInventoryFields(payload), { onConflict: "report_id,product_id" })
        .select();
      if (fallbackResult.error) throw fallbackResult.error;
      return (fallbackResult.data || []).map(normalizeInventoryRow);
    },
  };
}
