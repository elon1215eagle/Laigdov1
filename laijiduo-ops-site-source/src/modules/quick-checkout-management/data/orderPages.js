export async function readOrderPages(makeQuery, pageSize = 500) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const result = await makeQuery().range(start, start + pageSize - 1);
    if (result.error) throw new Error(`訂單資料載入失敗：${result.error.message}`);
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
