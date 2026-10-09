export const ROLE_LABELS = {
  ceo: "執行長 CEO",
  coo: "營運長 COO",
  cfo: "財務長 CFO",
  general_affairs: "總務",
  cso: "督導長 CSO",
  admin: "總部管理員",
  hq: "總部管理員",
  supervisor: "督導",
  store_manager: "門店店長",
};

const ROLE_MODULES = {
  ceo: ["ops", "onlineOrdering", "handover", "schedule", "checkoutManagement", "accountManagement", "storeSettings", "anomaly", "tasks", "staffingOverview", "hr", "hrFlow", "performance", "inspection", "system", "security"],
  coo: ["ops", "onlineOrdering", "handover", "schedule", "checkoutManagement", "accountManagement", "storeSettings", "anomaly", "tasks", "staffingOverview", "hr", "hrFlow", "performance", "inspection", "system", "security"],
  cfo: ["ops", "staffingOverview", "anomaly", "system"],
  general_affairs: ["ops", "handover", "schedule", "storeSettings", "anomaly", "tasks", "staffingOverview", "hr", "hrFlow", "inspection", "system"],
  cso: ["ops", "handover", "schedule", "checkoutManagement", "anomaly", "tasks", "staffingOverview", "performance", "inspection", "system"],
  admin: ["ops", "onlineOrdering", "handover", "schedule", "checkoutManagement", "accountManagement", "storeSettings", "anomaly", "tasks", "staffingOverview", "hr", "hrFlow", "performance", "inspection", "system"],
  hq: ["ops", "onlineOrdering", "handover", "schedule", "checkoutManagement", "accountManagement", "storeSettings", "anomaly", "tasks", "staffingOverview", "hr", "hrFlow", "performance", "inspection", "system"],
  supervisor: ["ops", "handover", "schedule", "anomaly", "tasks", "staffingOverview", "performance", "inspection", "system"],
  store_manager: ["ops", "onlineOrdering", "handover", "schedule", "staffingOverview", "system"],
};

const HIDDEN_MODULES = new Set([
  "handover",
  "anomaly",
  "tasks",
  "hrFlow",
  "performance",
  "inspection",
  "system",
]);
const HIDDEN_VIEW_MODES = new Set(["review", "inspection"]);

export const MODULE_GROUPS = [
  {
    title: "每日作業",
    items: [
      ["ops", "每日營運回報"],
      ["onlineOrdering", "線上點餐"],
      ["handover", "交接管理"],
      ["schedule", "排班管理"],
      ["transfers", "調貨中心"],
      ["repairs", "門店報修"],
    ],
  },
  {
    title: "總部管理",
    items: [
      ["approvals", "簽核中心"],
      ["checkoutManagement", "點單管理"],
      ["accountManagement", "帳號管理"],
      ["anomaly", "異常中心"],
      ["tasks", "任務派遣"],
      ["storeSettings", "門店營運設定"],
      ["security", "系統安全"],
    ],
  },
  {
    title: "人資資料",
    items: [
      ["staffingOverview", "人力掌握"],
      ["hr", "人資主檔"],
      ["hrFlow", "人資異動"],
      ["performance", "人資績效"],
    ],
  },
  {
    title: "巡檢制度",
    items: [
      ["inspection", "巡檢管理"],
      ["system", "制度中心"],
    ],
  },
];

const ROLE_VIEW_OPTIONS = {
  ceo: ["hq", "store", "review", "inspection"],
  coo: ["hq", "store", "review", "inspection"],
  admin: ["hq", "store", "review", "inspection"],
  hq: ["hq", "store", "review", "inspection"],
  cfo: ["hq"],
  general_affairs: ["hq", "store", "inspection"],
  cso: ["review", "inspection"],
  supervisor: ["review", "inspection"],
  store_manager: ["store"],
};

export function visibleViewModesForRole(roleName) {
  if (!Object.hasOwn(ROLE_VIEW_OPTIONS, roleName)) return [];
  const modes = (ROLE_VIEW_OPTIONS[roleName] || ["hq"])
    .filter((mode) => !HIDDEN_VIEW_MODES.has(mode));
  return modes.length ? modes : ["hq"];
}

export function profileRole(profile) {
  return profile?.role || "";
}

export function appViewForRole(roleName) {
  if (!Object.hasOwn(ROLE_MODULES, roleName)) return "entry";
  return roleName === "store_manager" ? "store" : "hq";
}

export function modulesForRole(roleName) {
  if (!Object.hasOwn(ROLE_MODULES, roleName)) return [];
  const modules = ROLE_MODULES[roleName]
    .filter((moduleName) => !HIDDEN_MODULES.has(moduleName));
  if (["ceo", "coo", "cfo", "general_affairs", "cso", "admin", "hq", "supervisor"].includes(roleName)) {
    return [...modules, "approvals", "transfers", "repairs"];
  }
  return roleName === "store_manager" ? [...modules, "transfers", "repairs"] : modules;
}

export function canAccessModule(roleName, moduleName) {
  return modulesForRole(roleName).includes(moduleName);
}

export function defaultModuleForRole(roleName) {
  if (roleName === "cfo") return "approvals";
  return modulesForRole(roleName)[0] || "ops";
}

export function canExportRole(roleName) {
  return ["ceo", "coo", "cfo", "admin", "hq"].includes(roleName);
}

export function canEditMonthlyTargets(roleName) {
  return ["ceo", "coo", "cfo", "admin", "hq"].includes(roleName);
}

export function canManageSecurity(roleName) {
  return ["ceo", "coo"].includes(roleName);
}

export function canManageDailyReportData(roleName) {
  return ["ceo", "coo", "admin", "hq"].includes(roleName);
}

export function canConfirmDailyReports(roleName) {
  return ["ceo", "coo", "cfo", "admin", "hq", "cso"].includes(roleName);
}
