export const APPROVAL_ROLES = ['ceo', 'coo', 'cfo', 'admin', 'hq', 'general_affairs', 'cso', 'supervisor'];
export const STATES = { draft: '草稿', pending: '待財務長審核', returned: '待補正', approved: '核准結案', withdrawn: '已撤回' };
export const ACTIONS = { create: '建立草稿', save: '儲存內容', submit: '送出申請', approve: '核准結案', return: '退回補正', withdraw: '撤回申請', attach: '加入附件' };
export const TYPES = { payment: '請款', purchase: '採購' };
export const blankContent = () => ({ type: 'payment', scope: 'HQ', subject: '', payee: '', amount: '', note: '' });
export function sameContent(left, right) {
  return Object.keys(blankContent()).every(key => String(left?.[key] ?? blankContent()[key]) === String(right?.[key] ?? blankContent()[key]));
}
export function approvalHistory(events) {
  let edition = 0;
  const operations = [...events].sort((a, b) => Number(a.id) - Number(b.id)).map(event => {
    if (event.action === 'submit') edition += 1;
    return { ...event, edition, label: event.action === 'submit' && edition > 1 ? '重新送出申請' : ACTIONS[event.action] || event.action };
  });
  return { edition, operations, milestones: operations.filter(event => ['submit', 'return', 'approve', 'withdraw'].includes(event.action)) };
}
export function permissions(profile, request) {
  const allowed = Boolean(profile?.id && profile.is_active && APPROVAL_ROLES.includes(profile.role));
  const owner = allowed && request?.owner_id === profile.id;
  return {
    allowed,
    review: allowed && profile.role === 'cfo' && request?.state === 'pending',
    edit: owner && ['draft', 'returned'].includes(request?.state),
    withdraw: owner && ['draft', 'returned', 'pending'].includes(request?.state),
  };
}
export function validateContent(content) {
  if (!TYPES[content.type] || !content.scope) return '請選擇類型與歸屬。';
  if (!content.subject.trim() || !content.payee.trim()) return '請填寫事由及收款人／廠商。';
  if (!/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(String(content.amount)) || Number(content.amount) <= 0) return '金額須大於 0，最多兩位小數。';
  return '';
}
export const caseNumber = (row) => `AP-${String(row.number).padStart(6, '0')}`;
export const money = (value) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 2 }).format(Number(value) || 0);
export const time = (value) => value ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '-';
export function exportCsv(rows) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + [['案件編號', '類型', '申請人', '歸屬', '事由', '收款人／廠商', '金額 TWD', '狀態', '建立時間', '結案時間'], ...rows.map(r => [caseNumber(r), TYPES[r.content.type], r.owner_name, r.content.scope, r.content.subject, r.content.payee, r.content.amount, STATES[r.state], time(r.created_at), time(r.closed_at)])].map(row => row.map(cell).join(',')).join('\r\n');
}
