// Staged protocol: enable only after the matching idempotent/versioned backend is verified.
export function createDailyOperationCommands({ repository, journal, newId = () => crypto.randomUUID() }) {
  const active = new Map();
  const terminalCodes = new Set(['version_conflict', 'forbidden', 'invalid_command', 'request_mismatch']);

  async function prepare({ expectedVersion, reason, report, inventory = [], waste = null, employeeMeals = null }) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error('需要有效的資料版本。');
    if (!reason?.trim()) throw new Error('請填寫儲存原因。');
    if (!report?.store_id || !report?.report_date) throw new Error('缺少門店或營業日期。');
    if (!Array.isArray(inventory) || (waste !== null && !Array.isArray(waste))
      || (employeeMeals !== null && !Array.isArray(employeeMeals))) throw new Error('明細格式錯誤。');
    const cleanReport = structuredClone(report);
    // The backend supplies identity and timestamps from the authenticated session.
    for (const field of ['submitted_by', 'submitted_at', 'created_by', 'updated_by', 'actor_id']) delete cleanReport[field];
    const command = structuredClone({ requestId: newId(), expectedVersion, reason: reason.trim(),
      report: cleanReport, inventory, waste, employeeMeals });
    await journal.put({ command, state: 'prepared' });
    return command.requestId;
  }

  async function load(requestId) {
    const entry = await journal.get(requestId);
    if (!entry || entry.command.requestId !== requestId) throw new Error('找不到原始儲存請求，請勿另建單重送。');
    return entry;
  }

  function once(requestId, work) {
    if (active.has(requestId)) return active.get(requestId);
    const promise = Promise.resolve().then(work).finally(() => active.delete(requestId));
    active.set(requestId, promise);
    return promise;
  }

  function verifyResult(command, result) {
    if (result?.requestId !== command.requestId || !result.report
      || !Number.isSafeInteger(result.version) || result.version <= command.expectedVersion) {
      throw new Error('無法確認伺服器儲存結果。');
    }
  }

  async function rememberSuccess(entry, result) {
    verifyResult(entry.command, result);
    const saved = { ...entry, state: 'succeeded', result: structuredClone(result) };
    await journal.put(saved);
    return saved;
  }

  function send(requestId) {
    return once(requestId, async () => {
      const entry = await load(requestId);
      if (entry.state === 'succeeded' || entry.state === 'rejected') return entry;
      // Persist the original request before any network write, including explicit retries.
      await journal.put({ ...entry, state: 'pending' });
      try {
        return await rememberSuccess(entry, await repository.submit(structuredClone(entry.command)));
      } catch (error) {
        const rejected = terminalCodes.has(error?.code);
        const outcome = { ...entry, state: rejected ? 'rejected' : 'pending',
          errorCode: rejected ? error.code : 'result_unknown' };
        await journal.put(outcome);
        return outcome;
      }
    });
  }

  function reconcile(requestId) {
    return once(requestId, async () => {
      const entry = await load(requestId);
      if (entry.state === 'succeeded' || entry.state === 'rejected') return entry;
      try {
        const result = await repository.lookup(requestId);
        if (result) return await rememberSuccess(entry, result);
      } catch {
        // A failed lookup or absent row cannot prove that an in-flight transaction failed.
      }
      const outcome = { ...entry, state: 'pending', errorCode: 'result_unknown' };
      await journal.put(outcome);
      return outcome;
    });
  }

  return { prepare, send, reconcile };
}
