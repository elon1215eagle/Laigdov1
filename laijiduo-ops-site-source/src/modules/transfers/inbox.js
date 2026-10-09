export const INBOX_LABELS = { requested: '待我出貨', shipped: '待我收貨', disputed: '差異待處理' };

export function validateInbox(value) {
  if (!value || !Array.isArray(value.items) || !value.checked_at
    || Object.keys(INBOX_LABELS).some(key => !Number.isSafeInteger(value.counts?.[key]) || value.counts[key] < 0)
    || value.items.some(row => !row.id || !INBOX_LABELS[row.status])) {
    throw new Error('提醒資料不完整，請重新整理');
  }
  return value;
}
