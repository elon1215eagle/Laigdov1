import { supabase } from "../../../lib/supabase.js";

function unavailable(error) {
  return ["PGRST202", "42883"].includes(error?.code);
}

export const staffingOverviewRepository = {
  async read(storeCode) {
    if (!supabase) return { storageReady: false, record: null, events: [] };
    const { data, error } = await supabase.rpc("ops_staffing_display_api", {
      p_action: "read",
      p_payload: { store_code: storeCode },
    });
    if (unavailable(error)) return { storageReady: false, record: null, events: [] };
    if (error) throw new Error(error.message || "人力掌握資料讀取失敗");
    return { storageReady: true, record: data?.record || null, events: data?.events || [] };
  },

  async readMany(storeCodes) {
    const codes = [...new Set((storeCodes || []).filter(Boolean))];
    const rows = await Promise.all(codes.map(async (storeCode) => ({ storeCode, ...(await this.read(storeCode)) })));
    if (rows.some((row) => !row.storageReady)) throw new Error("人力掌握正式儲存尚未啟用，無法產生完整匯出");
    return rows;
  },

  async saveDraft({ storeCode, expectedVersion, content, reason }) {
    if (!supabase) throw new Error("正式資料庫尚未連線，無法儲存草稿");
    return this.command("save_draft", { store_code: storeCode, expected_version: expectedVersion, content, reason });
  },

  async publish({ storeCode, expectedVersion, reason }) {
    if (!supabase) throw new Error("正式資料庫尚未連線，無法發布");
    return this.command("publish", { store_code: storeCode, expected_version: expectedVersion, reason });
  },

  async command(action, payload) {
    const commandId = globalThis.crypto?.randomUUID?.();
    if (!commandId) throw new Error("瀏覽器無法建立安全請求編號");
    const { data, error } = await supabase.rpc("ops_staffing_display_api", {
      p_action: action,
      p_payload: { ...payload, command_id: commandId },
    });
    if (unavailable(error)) throw new Error("人力掌握儲存尚未啟用，請先完成資料庫 migration");
    if (error) throw new Error(error.message || "結果待確認，請重新讀取後確認");
    if (!data?.record || !Number.isInteger(data.record.version)) throw new Error("回傳資料不完整，結果待確認");
    return data;
  },
};
