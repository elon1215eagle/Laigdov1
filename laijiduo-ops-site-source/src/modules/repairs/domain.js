export const REPAIR_STATUS = Object.freeze({
  pending: '待處理', processing: '處理中', awaiting_confirmation: '待門店確認',
  completed: '已處理', withdrawn: '已撤銷',
});
export const REPAIR_CATEGORIES = Object.freeze(['炸爐', '冰箱', '排煙', '水電', '其他']);
export const REPAIR_URGENCY = Object.freeze({ normal: '一般', business: '影響營業', safety: '安全疑慮' });

const directStore = value => /^S(0[1-9]|1[01])$/.test(value || '');
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// Actor capabilities must come from the authenticated repair backend, not form fields.
export function canReadRepair(actor, repair) {
  return actor?.active === true && (actor.manageRepairs === true
    || (directStore(actor.store) && actor.store === repair.store));
}

export function repairActions(actor, repair) {
  if (!canReadRepair(actor, repair)) return [];
  const manager = actor.manageRepairs === true;
  const ownStore = directStore(actor.store) && actor.store === repair.store;
  switch (repair.status) {
    case 'pending': return [...(manager ? ['start'] : []), 'withdraw', 'comment'];
    case 'processing': return [...(manager ? ['update_work', 'finish'] : []), 'comment'];
    case 'awaiting_confirmation': return [...(ownStore ? ['confirm', 'reject'] : []), ...(manager ? ['update_cost'] : []), 'comment'];
    case 'completed': return [...(manager ? ['update_cost'] : []), 'comment'];
    case 'withdrawn': return [];
    default: return [];
  }
}

export function repairDraftError(draft) {
  if (!directStore(draft.store)) return '請選擇有效的直營門店';
  if (!REPAIR_CATEGORIES.includes(draft.category)) return '請選擇報修項目';
  if (!nonempty(draft.description) || draft.description.length > 2000) return '請填寫問題說明（最多 2000 字）';
  if (!Object.hasOwn(REPAIR_URGENCY, draft.urgency)) return '請選擇急迫程度';
  if (typeof draft.contact !== 'string' || draft.contact.length > 100) return '聯絡人格式不正確';
  if (typeof draft.phone !== 'string' || draft.phone.length > 40) return '聯絡電話格式不正確';
  return '';
}

// Pure transition validation: persistence must also enforce this inside a transaction.
export function transitionRepair(repair, command, actor) {
  if (!repairActions(actor, repair).includes(command.action)) throw new Error('沒有操作權限或狀態已變更');
  if (!Number.isSafeInteger(command.version) || command.version !== repair.version) throw new Error('資料已更新，請重新載入');
  if (!nonempty(command.note) || command.note.length > 2000) throw new Error('請填寫處理內容或原因（最多 2000 字）');
  const next = { start: 'processing', finish: 'awaiting_confirmation', confirm: 'completed', reject: 'processing', withdraw: 'withdrawn' };
  return { ...repair, status: next[command.action] || repair.status, version: repair.version + 1 };
}

export function repairSummary(rows) {
  const counts = { pending: 0, processing: 0, awaiting_confirmation: 0, completed: 0, withdrawn: 0 };
  for (const row of rows) {
    if (!Object.hasOwn(counts, row.status)) throw new Error('未知報修狀態');
    counts[row.status] += 1;
  }
  return counts;
}

export function validRepairCost(value) {
  return value === '' || value === null || /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(String(value));
}
export function repairCostLabel(value) {
  if (value === '' || value === null || value === undefined) return '未填';
  return `NT$ ${Number(value).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
}
