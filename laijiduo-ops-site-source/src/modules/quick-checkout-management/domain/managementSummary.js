const FINAL_EXCEPTION_STATUSES = new Set(["cancelled", "voided"]);

export const QUICK_CHECKOUT_STATUS_LABELS = {
  draft: "進行中",
  packing: "打包核對中",
  packed: "打包完成待收款",
  paid: "已收款待打包",
  completed: "已完成",
  cancelled: "已取消",
  voided: "已作廢",
};

export function buildQuickCheckoutManagementSummary(devices = [], orders = []) {
  const boundStores = new Set(devices.map((device) => device.storeCode).filter(Boolean));
  const employeeCodes = new Set(
    orders
      .map((order) => `${order.storeCode || ""}:${order.operatorCode || ""}`)
      .filter((value) => !value.endsWith(":")),
  );

  return {
    boundStoreCount: boundStores.size,
    deviceCount: devices.length,
    activeDeviceCount: devices.filter((device) => device.isActive && !device.revokedAt).length,
    employeeCodeCount: employeeCodes.size,
    orderCount: orders.length,
    exceptionCount: orders.filter((order) => FINAL_EXCEPTION_STATUSES.has(order.status)).length,
  };
}

export function buildDeviceRows(devices = [], orders = []) {
  const metrics = new Map();
  orders.forEach((order) => {
    const current = metrics.get(order.deviceId) || { orderCount: 0, employeeCodes: new Set() };
    current.orderCount += 1;
    if (order.operatorCode) current.employeeCodes.add(order.operatorCode);
    metrics.set(order.deviceId, current);
  });

  return devices.map((device) => {
    const deviceMetrics = metrics.get(device.id) || { orderCount: 0, employeeCodes: new Set() };
    return {
      ...device,
      orderCount: deviceMetrics.orderCount,
      employeeCodeCount: deviceMetrics.employeeCodes.size,
      status: device.revokedAt ? "revoked" : device.isActive ? "active" : "disabled",
    };
  });
}

export function buildEmployeeCodeRows(orders = []) {
  const rows = new Map();
  orders.forEach((order) => {
    if (!order.operatorCode) return;
    const key = `${order.storeCode || order.storeId}:${order.operatorCode}`;
    const current = rows.get(key) || {
      key,
      storeCode: order.storeCode,
      storeName: order.storeName,
      operatorCode: order.operatorCode,
      operatorName: order.operatorName,
      orderCount: 0,
      completedCount: 0,
      exceptionCount: 0,
      totalAmount: 0,
      lastUsedAt: null,
    };
    current.orderCount += 1;
    current.completedCount += order.status === "completed" ? 1 : 0;
    current.exceptionCount += FINAL_EXCEPTION_STATUSES.has(order.status) ? 1 : 0;
    current.totalAmount += Number(order.total || 0);
    if (!current.lastUsedAt || new Date(order.updatedAt) > new Date(current.lastUsedAt)) {
      current.lastUsedAt = order.updatedAt;
    }
    rows.set(key, current);
  });

  return [...rows.values()].sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt));
}

export function filterQuickCheckoutOrders(orders = [], filters = {}) {
  const employeeCode = String(filters.employeeCode || "").trim().toLowerCase();
  return orders.filter((order) => {
    if (filters.storeCode && order.storeCode !== filters.storeCode) return false;
    if (filters.status && order.status !== filters.status) return false;
    if (employeeCode && !String(order.operatorCode || "").toLowerCase().includes(employeeCode)) return false;
    return true;
  });
}
