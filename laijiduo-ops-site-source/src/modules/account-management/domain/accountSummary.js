export const ACCOUNT_APP_ORDER = ["operations", "franchise_performance", "franchise_ordering", "unclassified"];

export const ACCOUNT_APP_LABELS = {
  operations: "營運 APP",
  franchise_performance: "加盟業績計算 APP",
  franchise_ordering: "加盟叫貨 APP",
  unclassified: "未分類帳號",
};

export const ACCOUNT_STATUS_LABELS = {
  normal: "正常",
  pending_configuration: "待補設定",
  unclassified: "未分類",
  inactive: "停用",
};

export const ACCOUNT_ROLE_LABELS = {
  ceo: "執行長 CEO",
  coo: "營運長 COO",
  cfo: "財務長 CFO",
  cso: "督導長 CSO",
  admin: "總部管理員",
  hq: "總部管理員",
  general_affairs: "總務／行政",
  supervisor: "督導",
  store_manager: "門店店長",
  franchise_admin: "加盟總部管理員",
  franchise_coo: "加盟營運長",
  franchise_cfo: "加盟財務長",
  franchise_investor: "加盟股東",
  franchise_owner: "加盟店",
};

export function normalizeAccountSummaryRow(row = {}) {
  const appCode = row.appCode || row.app_code || "unclassified";
  const role = row.roleLabel || row.role_label || "";
  return {
    userId: row.userId || row.user_id || "",
    email: row.email || "",
    appCode,
    appLabel: row.appLabel || row.app_label || ACCOUNT_APP_LABELS[appCode] || ACCOUNT_APP_LABELS.unclassified,
    roleLabel: ACCOUNT_ROLE_LABELS[role] || role || "-",
    storeCode: row.storeCode || row.store_code || "",
    storeName: row.storeName || row.store_name || "",
    isActive: Boolean(row.isActive ?? row.is_active),
    lastSignInAt: row.lastSignInAt || row.last_sign_in_at || null,
    profileComplete: Boolean(row.profileComplete ?? row.profile_complete),
    status: row.status || "unclassified",
  };
}

export function groupAccountSummaries(rows = []) {
  const groups = new Map(ACCOUNT_APP_ORDER.map((appCode) => [appCode, []]));
  rows.map(normalizeAccountSummaryRow).forEach((row) => {
    const group = groups.get(row.appCode) || groups.get("unclassified");
    group.push(row);
  });
  return ACCOUNT_APP_ORDER
    .map((appCode) => ({ appCode, label: ACCOUNT_APP_LABELS[appCode], rows: groups.get(appCode) }))
    .filter((group) => group.rows.length || group.appCode !== "unclassified");
}

export function summarizeAccounts(rows = []) {
  const normalized = rows.map(normalizeAccountSummaryRow);
  return {
    total: normalized.length,
    normal: normalized.filter((row) => row.status === "normal").length,
    pending: normalized.filter((row) => row.status === "pending_configuration").length,
    unclassified: normalized.filter((row) => row.status === "unclassified").length,
    inactive: normalized.filter((row) => row.status === "inactive").length,
  };
}
