import {
  createEmployeeMealRows,
  employeeMealTotal,
} from "../index.js";

const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;

export function EmployeeMealEditor({ rows, onChange, disabled = false }) {
  function updateQuantity(itemCode, value) {
    const quantity = value === "" ? "" : Math.max(0, Math.floor(Number(value) || 0));
    onChange(rows.map((row) => (
      row.item_code === itemCode
        ? {
          ...row,
          quantity,
          subtotal: Number(quantity || 0) * row.unit_price,
        }
        : row
    )));
  }

  const displayRows = rows.length ? rows : createEmployeeMealRows();

  return (
    <section className="employee-meal-editor">
      <div className="panel-head">
        <div>
          <h3>員工餐</h3>
          <p>填寫今日供應數量，系統依固定單價自動計算。</p>
        </div>
      </div>
      <div className="employee-meal-table" role="table" aria-label="員工餐品項">
        <div className="employee-meal-row employee-meal-header" role="row">
          <strong role="columnheader">品項</strong>
          <strong role="columnheader">數量</strong>
          <strong role="columnheader">金額小計</strong>
        </div>
        {displayRows.map((row) => (
          <div className="employee-meal-row" role="row" key={row.item_code}>
            <div role="cell">
              <strong>{row.item_name}</strong>
              <small>單價 {money(row.unit_price)}</small>
            </div>
            <label role="cell">
              <span className="sr-only">{row.item_name}數量</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                disabled={disabled}
                value={row.quantity}
                onChange={(event) => updateQuantity(row.item_code, event.target.value)}
              />
            </label>
            <strong role="cell">{money(Number(row.quantity || 0) * row.unit_price)}</strong>
          </div>
        ))}
      </div>
      <div className="employee-meal-total">
        <span>員工餐總價</span>
        <strong>{money(employeeMealTotal(displayRows))}</strong>
      </div>
    </section>
  );
}
