export const CATEGORIES = ['肉品', '點心', '南北貨', '五金'];
export const STATUS = { requested: '待出貨', shipped: '待收貨', disputed: '差異待處理', completed: '已完成', cancelled: '已取消' };
export const ACTIONS = { create: '提出申請', ship: '確認出貨', receive: '確認收貨', cancel: '取消調貨', resolve: '提出差異處理', ack_sender: '出貨店確認處理', ack_receiver: '收貨店確認處理', correction_note: '追加更正說明' };
export const directStore = code => /^S(0[1-9]|1[01])$/.test(code || '');
export const transferSource = code => code === 'HQ' || directStore(code);
export const allowsStockPickup = product => product.category === '肉品' || product.name === '地瓜';
export function productAllowsRoute(product, sender, receiver) {
  return product.active && sender !== receiver
    && (sender === 'HQ' || product.stores.includes(sender)) && product.stores.includes(receiver)
    && (product.sender_stores || product.stores).includes(sender)
    && (product.receiver_stores || product.stores).includes(receiver);
}
export function validQuantity(value, allowZero = false) {
  if (String(value).trim() === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= (allowZero ? 0 : 0.001) && n <= 1000000 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-7;
}
export function draftError(draft) {
  if (!directStore(draft.receiver) || !transferSource(draft.sender) || draft.receiver === draft.sender) return '請選擇直營收貨店及不同的出貨來源';
  if (!draft.date) return '請選擇調貨日期';
  if (!draft.lines.length) return '請加入調貨品項';
  if (new Set(draft.lines.map(x => x.product_id)).size !== draft.lines.length) return '同一品項只可加入一次';
  if (draft.lines.some(x => !x.unit || !validQuantity(x.quantity))) return '請為每個品項選擇單位及填寫有效數量';
  return '';
}
export function permissions(actor, row) {
  const sender = actor.is_hq || actor.store === row.sender;
  const receiver = actor.is_hq || actor.store === row.receiver;
  return { ship: sender && row.status === 'requested', receive: receiver && row.status === 'shipped',
    cancel: (sender || receiver) && row.status === 'requested', resolve: sender && row.status === 'disputed',
    ack_sender: sender && row.status === 'disputed' && !!row.data.resolution && !row.data.sender_ack,
    ack_receiver: receiver && row.status === 'disputed' && !!row.data.resolution && !row.data.receiver_ack,
    correction_note: actor.is_hq && row.status === 'completed' };
}
export function quantityChanged(original, current) {
  return original.some(x => Number(x.quantity) !== Number(current.find(y => y.product_id === x.product_id)?.quantity));
}
export function orderNumber(number) { return `TR-${String(number).padStart(6, '0')}`; }
export function localDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
