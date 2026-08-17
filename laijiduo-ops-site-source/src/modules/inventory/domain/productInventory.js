export const VARIABLE_UNIT_PRODUCTS = [
  "雞翅",
  "雞腿",
  "雞排",
  "腿排",
  "雞米花",
  "三角骨",
  "雞脖子",
  "地瓜",
];

export const FIXED_PACK_PRODUCTS = ["米血", "花枝丸", "熱狗", "雞塊", "黑輪"];
export const POWDER_PRODUCTS = ["湯翅粉", "醃粉", "薯脆粉"];
export const STORE_UNIT_POLICY_EFFECTIVE_FROM = "2026-08-18";
export const PIECE_UNIT_STORES = ["S01", "S05", "S06"];
export const SWEET_POTATO_PIECE_UNIT_STORES = ["S01", "S06"];
export const PACKS_PER_PIECE_RULES = Object.freeze({
  default: Object.freeze([{ effectiveFrom: STORE_UNIT_POLICY_EFFECTIVE_FROM, packsPerPiece: 3 }]),
  地瓜: Object.freeze([{ effectiveFrom: STORE_UNIT_POLICY_EFFECTIVE_FROM, packsPerPiece: 3 }]),
});
export const PRODUCT_ORDER = [
  ...VARIABLE_UNIT_PRODUCTS,
  ...FIXED_PACK_PRODUCTS,
  "雞皮",
  "炸油",
  ...POWDER_PRODUCTS,
];

export function productKind(name = "") {
  if (VARIABLE_UNIT_PRODUCTS.includes(name)) return "variable";
  if (FIXED_PACK_PRODUCTS.includes(name)) return "pack";
  if (name === "雞皮") return "skewer";
  if (name === "炸油") return "barrel";
  if (POWDER_PRODUCTS.includes(name)) return "powder";
  return "unit";
}

export function defaultUnitForProduct(name) {
  const kind = productKind(name);
  if (kind === "variable") return "件";
  if (kind === "pack" || kind === "powder") return "包";
  if (kind === "skewer") return "串";
  if (kind === "barrel") return "桶";
  return "件";
}

export function inventoryUnitForStoreProduct(storeCode, name) {
  const code = String(storeCode || "").toUpperCase();
  if (FIXED_PACK_PRODUCTS.includes(name)) return "包";
  if (!VARIABLE_UNIT_PRODUCTS.includes(name)) return defaultUnitForProduct(name);
  if (name === "地瓜") return SWEET_POTATO_PIECE_UNIT_STORES.includes(code) ? "件" : "包";
  return PIECE_UNIT_STORES.includes(code) ? "件" : "包";
}

export function packsPerPieceForProduct(name, reportDate = STORE_UNIT_POLICY_EFFECTIVE_FROM) {
  const rules = PACKS_PER_PIECE_RULES[name] || PACKS_PER_PIECE_RULES.default;
  return [...rules]
    .filter((rule) => !reportDate || rule.effectiveFrom <= reportDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.packsPerPiece || 3;
}

export function storeUnitPolicyApplies(reportDate = "") {
  return !reportDate || reportDate >= STORE_UNIT_POLICY_EFFECTIVE_FROM;
}

function convertVariableUnitCount(value, fromUnit, toUnit, name, reportDate) {
  if (
    productKind(name) !== "variable"
    || value === ""
    || value === null
    || value === undefined
    || fromUnit === toUnit
  ) return value;
  const count = Number(value);
  if (!Number.isFinite(count)) return value;
  const packsPerPiece = packsPerPieceForProduct(name, reportDate);
  if (toUnit === "包" && (fromUnit === "件" || fromUnit === "箱")) return count * packsPerPiece;
  if ((toUnit === "件" || toUnit === "箱") && fromUnit === "包") return count / packsPerPiece;
  return value;
}

export function displayUnitForProduct(name) {
  const kind = productKind(name);
  if (kind === "variable") return "件";
  if (kind === "pack" || kind === "powder") return "包";
  if (kind === "skewer") return "串";
  if (kind === "barrel") return "桶";
  return defaultUnitForProduct(name);
}

export function toManagementQuantity(row, field) {
  const name = row.name || "";
  const kind = productKind(name);
  if (kind === "powder") {
    const boxes = Number(row[`${field}_boxes`] || 0);
    const packs = Number(row[`${field}_packs`] || 0);
    return boxes * 10 + packs;
  }

  const count = Number(row[field] || 0);
  const unitField = field === "incoming_count"
    ? "incoming_unit"
    : field === "previous_stock"
      ? "previous_stock_unit"
      : "stock_unit";
  const unit = row[unitField] || defaultUnitForProduct(name);
  if (kind === "variable") {
    return unit === "包" ? count / packsPerPieceForProduct(name, row.report_date || row.reportDate) : count;
  }
  return count;
}

export function usageCount(row) {
  return toManagementQuantity(row, "previous_stock")
    - toManagementQuantity(row, "current_stock");
}

function numericValue(value) {
  return value === "" || value === null || value === undefined ? 0 : Number(value);
}

export function buildInventorySaveRows(inventoryRows) {
  return inventoryRows.map((row) => ({
    product_id: row.product_id || row.id,
    current_stock: numericValue(row.current_stock),
    safety_stock: 0,
    loss_count: numericValue(row.loss_count),
    incoming_count: numericValue(row.incoming_count),
    stock_unit: row.stock_unit || defaultUnitForProduct(row.name),
    incoming_unit: row.incoming_unit || defaultUnitForProduct(row.name),
    current_stock_boxes: numericValue(row.current_stock_boxes),
    current_stock_packs: numericValue(row.current_stock_packs),
    incoming_boxes: numericValue(row.incoming_boxes),
    incoming_packs: numericValue(row.incoming_packs),
    incoming_source: row.incoming_source || "廠商進貨",
    transfer_note: row.transfer_note || "",
    is_shortage: false,
  }));
}

export function blankInventoryProduct(product, options = {}) {
  const unit = options?.storeCode
    ? inventoryUnitForStoreProduct(options.storeCode, product.name)
    : defaultUnitForProduct(product.name);
  return {
    ...product,
    stock_unit: unit,
    incoming_unit: unit,
    previous_stock: "",
    previous_stock_boxes: "",
    previous_stock_packs: "",
    current_stock: "",
    loss_count: "",
    incoming_count: "",
    current_stock_boxes: "",
    current_stock_packs: "",
    incoming_boxes: "",
    incoming_packs: "",
  };
}

export function mergeInventoryRows(products, savedRows, previousRows, options = {}) {
  const savedByProduct = new Map(savedRows.map((row) => [row.product_id, row]));
  const previousByProduct = new Map(previousRows.map((row) => [row.product_id, row]));
  return products.map((product) => {
    const saved = savedByProduct.get(product.id);
    const previous = previousByProduct.get(product.id);
    const policyUnit = inventoryUnitForStoreProduct(options.storeCode, product.name);
    const applyPolicy = Boolean(options.storeCode) && storeUnitPolicyApplies(options.reportDate);
    const savedStockUnit = saved?.stock_unit || product.unit || defaultUnitForProduct(product.name);
    const savedIncomingUnit = saved?.incoming_unit || product.unit || defaultUnitForProduct(product.name);
    return {
      ...blankInventoryProduct(product, options),
      ...saved,
      current_stock: applyPolicy
        ? convertVariableUnitCount(saved?.current_stock ?? "", savedStockUnit, policyUnit, product.name, options.reportDate)
        : saved?.current_stock ?? "",
      incoming_count: applyPolicy
        ? convertVariableUnitCount(saved?.incoming_count ?? "", savedIncomingUnit, policyUnit, product.name, options.reportDate)
        : saved?.incoming_count ?? "",
      stock_unit: applyPolicy ? policyUnit : savedStockUnit,
      incoming_unit: applyPolicy ? policyUnit : savedIncomingUnit,
      report_date: options.reportDate || saved?.report_date || "",
      previous_stock: previous?.current_stock ?? "",
      previous_stock_boxes: previous?.current_stock_boxes ?? "",
      previous_stock_packs: previous?.current_stock_packs ?? "",
      previous_stock_unit: (
        previous?.stock_unit
        || previous?.unit
        || product.unit
        || defaultUnitForProduct(product.name)
      ),
    };
  });
}
