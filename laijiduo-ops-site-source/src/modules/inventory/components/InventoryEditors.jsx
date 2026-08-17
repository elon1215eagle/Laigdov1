import {
  defaultUnitForProduct,
  displayUnitForProduct,
  productKind,
  usageCount,
} from "../domain/productInventory.js";

function isBlankNumber(value) {
  return value === "" || value === null || value === undefined;
}

function numericInputValue(value) {
  return isBlankNumber(value) ? "" : value;
}

function numberText(value, digits = 2) {
  return Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: digits });
}

function updateInventoryRow(rows, onChange, index, row, patch) {
  const next = [...rows];
  next[index] = { ...row, ...patch };
  onChange(next);
}

function NumberField({ label, value, onChange, disabled = false }) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input
        type="number"
        step="0.1"
        inputMode="decimal"
        value={numericInputValue(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function UnitField({ row, field }) {
  return (
    <label className="mini-field">
      <span>單位</span>
      <input value={row[field] || defaultUnitForProduct(row.name)} disabled />
    </label>
  );
}

export function formatInventoryAmount(row, prefix) {
  const name = row.name || "";
  if (productKind(name) === "powder") {
    const key = prefix === "incoming"
      ? "incoming"
      : prefix === "previous"
        ? "previous_stock"
        : "current_stock";
    const boxes = Number(row[`${key}_boxes`] || 0);
    const packs = Number(row[`${key}_packs`] || 0);
    return `${numberText(boxes)} 箱 / ${numberText(packs)} 包`;
  }
  const field = prefix === "incoming"
    ? "incoming_count"
    : prefix === "previous"
      ? "previous_stock"
      : "current_stock";
  const unitField = prefix === "incoming"
    ? "incoming_unit"
    : prefix === "previous"
      ? "previous_stock_unit"
      : "stock_unit";
  return `${numberText(row[field])} ${row[unitField] || defaultUnitForProduct(name)}`;
}

export function InventoryEditor({ rows, onChange, disabled = false }) {
  return (
    <div className="mobile-stack">
      {rows.map((row, index) => {
        const kind = productKind(row.name);
        const isBlank = (
          isBlankNumber(row.current_stock)
          && isBlankNumber(row.current_stock_boxes)
          && isBlankNumber(row.current_stock_packs)
        );
        return (
          <div
            className={`stock-row ${kind === "powder" ? "stock-row-powder" : "stock-row-wide"}`}
            key={row.id}
          >
            <div>
              <strong>{row.name}</strong>
              <span>
                昨日 {formatInventoryAmount(row, "previous")} · 今日盤點 {formatInventoryAmount(row, "stock")}
                {" · "}使用量 {numberText(usageCount(row))} {displayUnitForProduct(row.name)}
              </span>
            </div>
            {kind === "powder" ? (
              <>
                <NumberField disabled={disabled} label="盤點箱" value={row.current_stock_boxes} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { current_stock_boxes: value })} />
                <NumberField disabled={disabled} label="盤點包" value={row.current_stock_packs} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { current_stock_packs: value })} />
              </>
            ) : (
              <>
                <NumberField disabled={disabled} label="盤點" value={row.current_stock} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { current_stock: value })} />
                <UnitField row={row} field="stock_unit" />
              </>
            )}
            <NumberField disabled={disabled} label="耗損" value={row.loss_count} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { loss_count: value })} />
            <span className={`chip ${isBlank ? "neutral" : "good"}`}>
              {isBlank ? "未填" : "已填"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function IncomingEditor({ rows, onChange, disabled = false }) {
  return (
    <div className="mobile-stack">
      {rows.map((row, index) => {
        const kind = productKind(row.name);
        return (
          <div
            className={`stock-row ${kind === "powder" ? "stock-row-incoming-powder" : "stock-row-incoming"}`}
            key={row.id}
          >
            <div>
              <strong>{row.name}</strong>
              <span>填寫今日進貨或門店調撥數量；沒有進貨可維持 0。</span>
            </div>
            {kind === "powder" ? (
              <>
                <NumberField disabled={disabled} label="進貨箱" value={row.incoming_boxes} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_boxes: value })} />
                <NumberField disabled={disabled} label="進貨包" value={row.incoming_packs} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_packs: value })} />
              </>
            ) : (
              <>
                <NumberField disabled={disabled} label="調撥／進貨" value={row.incoming_count} onChange={(value) => updateInventoryRow(rows, onChange, index, row, { incoming_count: value })} />
                <UnitField row={row} field="incoming_unit" />
              </>
            )}
            <label className="mini-field">
              <span>來源</span>
              <select
                disabled={disabled}
                value={row.incoming_source || "廠商進貨"}
                onChange={(event) => updateInventoryRow(rows, onChange, index, row, { incoming_source: event.target.value })}
              >
                <option>廠商進貨</option>
                <option>門店調撥</option>
              </select>
            </label>
            <label className="mini-field">
              <span>備註</span>
              <input
                disabled={disabled}
                value={row.transfer_note || ""}
                onChange={(event) => updateInventoryRow(rows, onChange, index, row, { transfer_note: event.target.value })}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
