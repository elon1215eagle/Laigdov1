import React from 'react';
import { createRoot } from 'react-dom/client';
import RepairPage from '../../src/modules/repairs/RepairPage.jsx';
const repository = { list: async () => ({ complete: true, actor: { active: true, manageRepairs: true }, stores: [{ code: 'S01', name: '五甲店' }], rows: [
  { id: 'fixture-only', number: '預覽單', store: 'S01', storeName: '五甲店', status: 'pending', category: '冰箱', description: '隔離預覽資料，不是正式報修。', urgency: 'business', createdAt: '2026-09-11T02:00:00Z', version: 1 },
] }) };
createRoot(document.getElementById('root')).render(<div className="store-manager-app"><RepairPage repository={repository} /></div>);
