export const DELIVERY_STATES = { planned: '待取貨', picked: '配送中', delivered: '已送達', cancelled: '配送已取消' };
export const DELIVERY_WAVES = {
  primary: { label: '第一趟', detail: '11:30 主配送' },
  additional: { label: '追加配送', detail: '11:30 後至 15:00' },
  late: { label: '逾時追加', detail: '15:00 後' },
};
const BASE_ROUTE_RANK = new Map([
  ['S01>S05', 1],
  ['S02>S04', 2],
  ['S08>S03', 3],
  ['S07>S09', 4],
]);

function taipeiDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(parsed).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

export function deliveryWave(request, deliveryDate) {
  const created = taipeiDateTime(request?.created_at);
  if (!created) return 'primary';
  if (created.date < deliveryDate) return 'primary';
  if (created.date > deliveryDate) return 'late';
  if (created.minutes < 11 * 60 + 30) return 'primary';
  if (created.minutes < 15 * 60) return 'additional';
  return 'late';
}

export function waveLabel(wave) {
  return DELIVERY_WAVES[wave]?.label || DELIVERY_WAVES.primary.label;
}

export function deliveryOrderTone(request) {
  const source = String(request?.number ?? request?.id ?? '0');
  return [...source].reduce((total, character) => total + character.charCodeAt(0), 0) % 6;
}

export function baseRouteRank(request) {
  return BASE_ROUTE_RANK.get(`${request?.sender}>${request?.receiver}`) || 999;
}
export function statusLabel(task) {
  if (task.state === 'cancelled') return DELIVERY_STATES.cancelled;
  if (task.request.status === 'cancelled') return '調貨已取消';
  if (task.request.status === 'disputed') return '收貨差異';
  if (task.request.status === 'completed') return '收貨已確認';
  return DELIVERY_STATES[task.state] || '待確認';
}
export function selectedTasks(data, driverId, wave, date) {
  return data.tasks.filter(task => (!driverId || task.driver_id === driverId)
    && (!wave || deliveryWave(task.request, date || task.delivery_date) === wave));
}
export function deliveryCandidatesForDate(data, date) {
  return (data?.candidates || [])
    .filter(request => String(request?.data?.date || '').slice(0, 10) === date)
    .sort((left, right) => baseRouteRank(left) - baseRouteRank(right)
      || String(left.created_at || '').localeCompare(String(right.created_at || ''))
      || Number(left.number || 0) - Number(right.number || 0));
}
export function deliveryCandidatesForWave(data, date, wave) {
  return deliveryCandidatesForDate(data, date).filter(request => deliveryWave(request, date) === wave);
}
export function deliveryWaveCounts(data, date) {
  const counts = { primary: 0, additional: 0, late: 0 };
  const assigned = (data?.tasks || []).filter(task => task.state !== 'cancelled');
  for (const request of [...assigned.map(task => task.request), ...deliveryCandidatesForDate(data, date)]) {
    counts[deliveryWave(request, date)] += 1;
  }
  return counts;
}
export function dailyAssignmentCommands(candidates, driverId, date, startPosition = 0, idFactory = () => crypto.randomUUID()) {
  if (!driverId || !date) return [];
  return candidates.map((request, index) => ({
    action: 'assign',
    payload: {
      request_id: request.id,
      request_version: request.version,
      driver_id: driverId,
      date,
      position: startPosition + index + 1,
      reason: '安排當日送貨',
      command_id: idFactory(),
    },
  }));
}
export function deliveryModel(data, date, driverId, generatedAt = new Date().toISOString(), wave = '') {
  return { date, generatedAt, wave, waveName: wave ? waveLabel(wave) : '全部趟次', driver: data.drivers.find(d => d.id === driverId)?.name || '全部人員',
    rows: selectedTasks(data, driverId, wave, date).filter(t => t.state !== 'cancelled').map(t => ({
      id: t.id, wave: deliveryWave(t.request, date), tone: deliveryOrderTone(t.request), position: t.position, driver: t.driver_name,
      number: `TR-${String(t.request.number).padStart(6, '0')}`,
      sender: t.request.data.sender_name || t.request.sender,
      receiver: t.request.data.receiver_name || t.request.receiver,
      lines: t.request.data.shipped || t.request.data.lines || [],
      note: t.request.data.note || '', status: statusLabel(t),
      picked: Boolean(t.picked_at), delivered: Boolean(t.delivered_at),
    })) };
}
export function exportLines(model) {
  return model.rows.flatMap(row => row.lines.map((line, index) => [
    index ? '' : waveLabel(row.wave), index ? '' : row.position, index ? '' : row.driver,
    index ? '' : row.sender, index ? '' : row.receiver,
    `${line.name}${line.stock_pickup ? '（庫存取貨）' : ''}`, line.quantity, line.unit,
    index ? '' : row.status, index ? '' : (row.picked ? '已取' : '□ 已取'),
    index ? '' : (row.delivered ? '已送' : '□ 已送'), index ? '' : row.note,
    index ? '' : row.number,
  ]));
}
const escapeXml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
export function excelXml(model) {
  const cell = (v, style = 'Body') => `<Cell ss:StyleID="${style}"><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${escapeXml(v)}</Data></Cell>`;
  const headings = ['趟次','順序','送貨人員','出貨店','收貨店','品項','數量','單位','進度','取貨','送達','備註','調貨單號'];
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Body"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft JhengHei" ss:Size="14"/></Style><Style ss:ID="Head" ss:Parent="Body"><Font ss:Bold="1" ss:Size="14"/><Interior ss:Color="#E2F2F0" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="每日送貨表"><Table>${[85,45,85,115,115,130,55,55,100,65,65,190,110].map(w=>`<Column ss:Width="${w}"/>`).join('')}
<Row ss:Height="32">${cell('每日送貨表','Head')}${cell(model.date)}${cell(model.waveName)}${cell(model.driver)}</Row>
<Row ss:Height="28">${cell('匯出時間')}${cell(model.generatedAt)}</Row>
<Row ss:Height="30">${headings.map(v=>cell(v,'Head')).join('')}</Row>
${exportLines(model).map(row=>`<Row ss:AutoFitHeight="1" ss:Height="32">${row.map(v=>cell(v)).join('')}</Row>`).join('')}
</Table></Worksheet></Workbook>`;
}

// Limit each image to a readable page; long orders continue without dropping items.
export function imageSegments(model) {
  return model.rows.flatMap(row => {
    const parts = [];
    for (let i = 0; i < row.lines.length; i += 6) parts.push({ ...row, lines: row.lines.slice(i, i + 6), continued: i > 0 });
    return parts;
  });
}
