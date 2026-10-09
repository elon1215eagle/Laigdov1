export function selectLockableReports(rows = []) {
  return rows.filter((report) => report?.id && report.status === "submitted");
}
