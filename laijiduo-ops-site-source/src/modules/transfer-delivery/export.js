import { excelXml, imageSegments } from './model.js';
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function downloadExcel(model) {
  saveBlob(new Blob([excelXml(model)], { type: 'application/vnd.ms-excel;charset=utf-8' }), `每日送貨表-${model.date}-${model.waveName}.xml`);
}
function wrapped(ctx, text, width) {
  const lines = []; let line = '';
  for (const ch of String(text)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (line && ctx.measureText(line + ch).width > width) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}
export async function renderImages(model) {
  await document.fonts.ready;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '26px "Microsoft JhengHei", sans-serif';
  const segments = imageSegments(model).map(row => {
    const text = [
      `${row.position}${row.continued ? '（續）' : ''}  ${row.sender} → ${row.receiver}　${row.driver}`,
      ...row.lines.map(l => `${l.name}${l.stock_pickup ? '（庫存取貨）' : ''}　${l.quantity} ${l.unit}`),
      ...(row.note ? [`備註：${row.note}`] : []),
      `${row.status}　${row.picked ? '■' : '□'} 已取　${row.delivered ? '■' : '□'} 已送　${row.number}`,
    ].flatMap(s => wrapped(measure, s, 1032));
    return text;
  });
  const pages = []; let current = []; let used = 0;
  // Split at line boundaries even for unusually long notes.
  for (const segment of segments) {
    for (let i = 0; i < segment.length; i += 36) {
      const text = segment.slice(i, i + 36); const height = text.length * 38 + 40;
      if (used + height > 1650 && current.length) { pages.push(current); current = []; used = 0; }
      current.push(text); used += height;
    }
  }
  if (current.length) pages.push(current);
  return Promise.all(pages.map(async (page, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1120; canvas.height = 180 + page.reduce((n,t) => n + t.length * 38 + 40, 0);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#163b37'; ctx.font = 'bold 34px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`每日送貨表　${model.date}`, 32, 52);
    ctx.font = '26px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`${model.waveName}　${model.driver}　${index + 1} / ${pages.length}`, 32, 94);
    ctx.font = '20px sans-serif'; ctx.fillText(`匯出：${model.generatedAt}`,32,126);
    let y = 158;
    for (const text of page) {
      ctx.fillStyle = '#edf6f4'; ctx.fillRect(24,y,1072,text.length*38+24);
      ctx.fillStyle = '#182c29'; ctx.font = '26px "Microsoft JhengHei", sans-serif';
      text.forEach((line,i) => ctx.fillText(line,40,y+34+i*38));
      y += text.length*38+40;
    }
    return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('圖片產生失敗')), 'image/png'));
  }));
}
