import { supabase } from '../../lib/supabase.js';
export const deliveryRepository = {
  async call(action, payload = {}) {
    if (!supabase) throw new Error('尚未連接正式資料庫');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await supabase.rpc('ops_delivery_api', { p_action: action, p_payload: payload }).abortSignal(controller.signal);
      if (controller.signal.aborted || (error && !error.code)) throw new Error('結果待確認，請用「重試原操作」查回結果。');
      if (error) {
        const failure = new Error(error.code === 'PGRST202' ? '每日送貨表尚未啟用，原調貨功能不受影響。' : error.message);
        failure.definite = true;
        throw failure;
      }
      if (!data || typeof data !== 'object' || (action === 'day' &&
          !['drivers','tasks','candidates'].every(key => Array.isArray(data[key])))) {
        throw new Error('資料回傳不完整，結果待確認，請重試原操作。');
      }
      return data;
    } finally { clearTimeout(timer); }
  },
};
