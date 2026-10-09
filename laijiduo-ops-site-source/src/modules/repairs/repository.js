// This adapter is not connected to production navigation until release verification.
export function createRepairRepository(client, rpc = 'ops_repair_api') {
  return {
    async command(action, payload) {
      if (!client) throw new Error('尚未連接資料庫');
      const { data, error } = await client.rpc(rpc, { p_action: action, p_payload: payload });
      if (error) {
        const failure = new Error(error.message || '結果待確認，請重試原操作');
        // Only database rejections or a missing RPC are definitive. Transport errors are uncertain.
        failure.definite = error.code === 'PGRST202' || /^[0-9A-Z]{5}$/.test(error.code || '');
        throw failure;
      }
      return data;
    },
    async detail(id) {
      if (!client) throw new Error('尚未連接資料庫');
      const { data, error } = await client.rpc(rpc, { p_action: 'detail', p_payload: { id } });
      if (error || !data?.ticket || !Array.isArray(data.events)) throw new Error('報修詳情讀取失敗');
      return data;
    },
    async list() {
      if (!client) throw new Error('尚未連接資料庫');
      const { data, error } = await client.rpc(rpc, { p_action: 'list', p_payload: {} });
      if (error) throw new Error(error.code === 'PGRST202' ? '門店報修尚未啟用' : '報修資料讀取失敗，請重試');
      if (!data || !Array.isArray(data.rows) || !Array.isArray(data.stores) || !data.actor || data.complete !== true) {
        throw new Error('報修資料不完整，請重試');
      }
      return data;
    },
  };
}
