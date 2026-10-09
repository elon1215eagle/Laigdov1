import { hasSupabaseConfig, supabase } from "../../../lib/supabase.js";

import { checkoutQueryRange } from "../domain/queryRange.js";
import { readOrderPages } from "./orderPages.js";

function unwrapRows(result, label) {
  if (result.error) throw new Error(`${label}：${result.error.message}`);
  return result.data || [];
}

export async function fetchQuickCheckoutManagement({ startDate, endDate }) {
  if (!hasSupabaseConfig || !supabase) throw new Error("尚未設定 Supabase，無法載入正式點單資料");
  const range = checkoutQueryRange(startDate, endDate);

  const [storesResult, devicesResult, ordersResult, deviceEventsResult] = await Promise.all([
    supabase.from("stores").select("id, store_code, name").order("store_code"),
    supabase
      .from("quick_checkout_devices")
      .select("id, store_id, label, is_active, last_seen_at, revoked_at, created_at")
      .order("created_at", { ascending: false }),
    readOrderPages(() => supabase
      .from("quick_checkout_orders")
      .select(`
        id, client_order_id, order_number, store_id, device_id,
        operator_code, operator_name, status, subtotal, discount, total,
        received, change_due, review_confirmed, paid_at, completed_at,
        cancelled_at, voided_at, created_at, updated_at,
        quick_checkout_order_lines (
          product_code, product_name, quantity, unit_price, line_total,
          seasonings, fixed_weight_grams, packed
        ),
        quick_checkout_order_events (
          event_type, reason, details, created_at
        )
      `)
      .gte("created_at", range.from)
      .lt("created_at", range.until)
      .order("created_at", { ascending: false }).order("id")),
    supabase
      .from("quick_checkout_device_events")
      .select("id, device_id, store_id, event_type, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const stores = unwrapRows(storesResult, "門店資料載入失敗");
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const devicesRaw = unwrapRows(devicesResult, "裝置資料載入失敗");
  const deviceMap = new Map(devicesRaw.map((device) => [device.id, device]));
  const devices = devicesRaw.map((device) => {
    const store = storeMap.get(device.store_id) || {};
    return {
      id: device.id,
      storeId: device.store_id,
      storeCode: store.store_code || "",
      storeName: store.name || "未命名門店",
      label: device.label,
      isActive: device.is_active,
      lastSeenAt: device.last_seen_at,
      revokedAt: device.revoked_at,
      createdAt: device.created_at,
    };
  });

  const orders = unwrapRows(ordersResult, "訂單資料載入失敗").map((order) => {
    const store = storeMap.get(order.store_id) || {};
    const device = deviceMap.get(order.device_id) || {};
    return {
      id: order.id,
      clientOrderId: order.client_order_id,
      orderNumber: order.order_number,
      storeId: order.store_id,
      storeCode: store.store_code || "",
      storeName: store.name || "未命名門店",
      deviceId: order.device_id,
      deviceLabel: device.label || "未知裝置",
      operatorCode: order.operator_code,
      operatorName: order.operator_name,
      status: order.status,
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      received: order.received,
      changeDue: order.change_due,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      lines: order.quick_checkout_order_lines || [],
      events: order.quick_checkout_order_events || [],
    };
  });

  return {
    stores,
    devices,
    orders,
    deviceEvents: unwrapRows(deviceEventsResult, "裝置稽核紀錄載入失敗"),
  };
}

export async function manageQuickCheckoutDevice({ deviceId, action, reason }) {
  if (!hasSupabaseConfig || !supabase) throw new Error("尚未設定 Supabase");
  const { data, error } = await supabase.rpc("quick_checkout_manage_device", {
    p_device_id: deviceId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(`裝置狀態更新失敗：${error.message}`);
  return data;
}
