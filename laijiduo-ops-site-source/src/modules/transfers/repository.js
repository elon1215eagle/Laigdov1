import { supabase } from '../../lib/supabase.js';

export const transferRepository = {
  async call(action, payload = {}) {
    if (!supabase) throw new Error('尚未連接正式資料庫');
    const { data, error } = action === 'inbox'
      ? await supabase.rpc('ops_transfer_inbox')
      : action === 'product_history'
      ? await supabase.rpc('ops_transfer_product_history', { p_product_id: payload.id })
      : await supabase.rpc('ops_transfer_api', { p_action: action, p_payload: payload });
    if (error) throw new Error(error.message || '調貨資料讀取失敗');
    return data;
  },
};
