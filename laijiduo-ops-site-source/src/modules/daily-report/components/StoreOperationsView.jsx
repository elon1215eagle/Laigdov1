const money = (value) => `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
const pct = (value) => `${Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 1 })}%`;

export function StoreOperationsView({ rows, loading }) {
  const visibleRows = rows.filter((row) => row.currentTotal || row.previousTotal);
  if (loading) {
    return <div className="empty-text">門店營運資料讀取中...</div>;
  }

  return (
    <div className="mobile-stack">
      <div className="target-card">
        <span>門店營運視圖</span>
        <strong>本週 vs 上週同日</strong>
        <p>依星期對照 14:00、19:00、打烊與全日營收。</p>
      </div>
      {visibleRows.map((row) => (
        <div className="input-card" key={`${row.storeCode}-${row.currentDate}`}>
          <span>{row.weekday}<small>{row.currentDate} 對比 {row.previousDate}</small></span>
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr><th></th><th>14:00</th><th>19:00</th><th>打烊</th><th>全日</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>本週</td>
                  <td>{money(row.current?.opened_to_1400_revenue)}</td>
                  <td>{money(row.current?.revenue_1400_to_1900)}</td>
                  <td>{money(row.current?.revenue_1900_to_close)}</td>
                  <td><strong>{money(row.currentTotal)}</strong></td>
                </tr>
                <tr>
                  <td>上週</td>
                  <td>{money(row.previous?.opened_to_1400_revenue)}</td>
                  <td>{money(row.previous?.revenue_1400_to_1900)}</td>
                  <td>{money(row.previous?.revenue_1900_to_close)}</td>
                  <td><strong>{money(row.previousTotal)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <strong className={row.delta < 0 ? "negative" : row.delta > 0 ? "positive" : ""}>
            營收差額 {money(row.delta)} / {pct(row.growth)}
          </strong>
        </div>
      ))}
      {!visibleRows.length && (
        <div className="empty-text">目前沒有可比較的本週與上週同日營收。</div>
      )}
    </div>
  );
}
