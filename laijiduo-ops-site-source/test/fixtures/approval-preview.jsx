// Development-only fixture. Vite's production entry never imports this file.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ApprovalCenter from '../../src/modules/approvals/ApprovalCenter.jsx';
import '../../src/styles.css';
const profile = { id: 'test-cfo', role: 'cfo', full_name: '財務長（測試）', is_active: true };
let rows = [{ id: 'test-case', number: 1, owner_id: profile.id, owner_name: profile.full_name, state: 'pending', version: 3, content: { type: 'purchase', scope: 'HQ', subject: '門店設備採購及維修費用申請', payee: '設備廠商', amount: '12500', note: '測試附件與金額核對。' }, created_at: '2026-09-09T00:00:00Z', submitted_at: '2026-09-09T00:00:00Z' }];
let events = [];
const repository = {
 listRequests: async () => structuredClone(rows),
 loadDetail: async id => ({ request: structuredClone(rows.find(r => r.id === id)), events: structuredClone(events.filter(e => e.request_id === id)), attachments: [] }),
 command: async (request, action, content, reason, related) => {
  let row = rows.find(r => r.id === request.id);
  if (action === 'create') { row = { id: request.id, number: rows.length + 1, owner_id: profile.id, owner_name: profile.full_name, state: 'draft', version: 0, content: {}, created_at: new Date().toISOString(), related_id: related }; rows.push(row); }
  if (action === 'save') row.content = content;
  if (action === 'submit') row.state = 'pending';
  if (action === 'approve') { row.state = 'approved'; row.closed_at = new Date().toISOString(); }
  if (action === 'return') row.state = 'returned';
  if (action === 'withdraw') row.state = 'withdrawn';
  row.version += 1;
  events.push({ id: events.length + 1, request_id: row.id, action, actor_id: profile.id, actor_name: profile.full_name, reason, snapshot: structuredClone(row), created_at: new Date().toISOString() });
  return structuredClone(row);
 },
};
createRoot(document.getElementById('root')).render(<ApprovalCenter profile={profile} stores={[{ id: 's01', store_code: 'S01', name: '鳳山五甲店' }]} repository={repository} />);
