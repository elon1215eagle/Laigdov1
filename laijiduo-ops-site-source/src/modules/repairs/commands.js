// Journal the exact command before any network write. Scoped to the signed-in actor.
export function createRepairCommands({ repository, storage, actorId, uuid = () => crypto.randomUUID() }) {
  if (!actorId) throw new Error('缺少登入身分');
  const key = `repair-command:${actorId}`;
  let busy = false;
  function pending() {
    const value = storage.getItem(key);
    if (!value) return null;
    const command = JSON.parse(value);
    if (command.actorId !== actorId || !command.payload?.command_id || !command.action) throw new Error('待確認操作資料不完整');
    return command;
  }
  async function execute(command) {
    if (busy) throw new Error('操作仍在進行中');
    busy = true;
    try {
      const result = await repository.command(command.action, command.payload);
      if (!result?.id || !Number.isInteger(result.version)) throw new Error('回傳不完整，結果待確認');
      storage.removeItem(key);
      return result;
    } catch (error) {
      if (error.definite === true) storage.removeItem(key);
      throw error;
    } finally { busy = false; }
  }
  return {
    pending,
    async send(action, payload) {
      if (busy || pending()) throw new Error('請先確認上一筆操作的結果');
      const command = JSON.parse(JSON.stringify({ actorId, action, payload: { ...payload, command_id: uuid() } }));
      const serialized = JSON.stringify(command);
      storage.setItem(key, serialized);
      if (storage.getItem(key) !== serialized) throw new Error('無法保留重試資料，尚未送出');
      return execute(command);
    },
    async retry() {
      const command = pending();
      if (!command) throw new Error('沒有待確認操作');
      return execute(command);
    },
  };
}
