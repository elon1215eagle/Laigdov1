export async function readReportInputs(readers) {
  const entries = await Promise.all(Object.entries(readers).map(async ([key, { label, read }]) => {
    try {
      const rows = await read();
      if (!Array.isArray(rows)) throw new Error('Incomplete response');
      return [key, rows];
    } catch {
      throw new Error(`${label}讀取失敗，尚未允許儲存。請重新讀取。`);
    }
  }));
  return Object.fromEntries(entries);
}

export function reportInputsReady(state, key) {
  return state?.key === key && state.phase === 'ready';
}
