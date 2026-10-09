export async function readAllPages(fetchPage, pageSize = 500) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    const result = await fetchPage(start, start + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    if (!Array.isArray(result.data)) throw new Error('Incomplete approval response');
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
  }
}
