import { createClient } from "@supabase/supabase-js";

const DEVICE_KEY = "laigdo-quick-checkout-device-v1";

export function loadQuickCheckoutDevice(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(DEVICE_KEY) || "null");
    return value?.deviceToken && value?.storeCode ? value : null;
  } catch {
    return null;
  }
}

export function saveQuickCheckoutDevice(device, storage = globalThis.localStorage) {
  storage?.setItem(DEVICE_KEY, JSON.stringify(device));
  return device;
}

export function clearQuickCheckoutDevice(storage = globalThis.localStorage) {
  storage?.removeItem(DEVICE_KEY);
}

export async function bindQuickCheckoutDevice({ email, password, storeCode, label }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("正式資料庫尚未設定");

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error("管理者帳號或密碼不正確");

  try {
    const { data, error } = await client.rpc("quick_checkout_create_device", {
      p_store_code: storeCode,
      p_label: label,
    });
    if (error) throw error;
    return saveQuickCheckoutDevice(data);
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
