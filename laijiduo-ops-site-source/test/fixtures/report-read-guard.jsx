import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';

// Isolated UI fixture. Every external request is intercepted before module imports.
let failing = 'inventory_counts';
let writes = 0;
const originalFetch = window.fetch.bind(window);
window.fetch = async (url, options = {}) => {
  const target = new URL(typeof url === 'string' ? url : url.url, location.href);
  if (target.origin === location.origin) return originalFetch(url, options);
  if ((options.method || 'GET').toUpperCase() !== 'GET') writes++;
  const failed = failing && target.pathname.includes(failing);
  return new Response(JSON.stringify(failed ? { message: 'Isolated simulated failure', code: 'TEST' } : []), {
    status: failed ? 500 : 200, headers: { 'Content-Type': 'application/json' },
  });
};
const { StoreReportPage } = await import('../../src/modules/daily-report/components/StoreReportPage.jsx');
const { HqReportRecords } = await import('../../src/App.jsx');
const { productsSeed } = await import('../../src/lib/mockData.js');
const report = { id: '00000000-0000-4000-8000-000000000010', store_id: 'S01', store_code: 'S01', name: '隔離驗收門店',
  status: 'draft', report_date: '2026-09-10', opened_to_1400_revenue: 100, revenue_1400_to_1900: 200,
  revenue_1900_to_close: 300, target: 1000, scheduled_staff_count: 2 };
const staff = [];
const reportRows = [report];
function Fixture() {
  const [page, setPage] = useState('store');
  const [saved, setSaved] = useState(0);
  return <main style={{ padding: 8 }}>
    <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, position: 'relative', zIndex: 10001 }}>
      <button onClick={() => setPage('store')}>驗收門店</button><button onClick={() => setPage('hq')}>驗收總部</button>
      <button onClick={() => { failing = ''; }}>恢復模擬連線</button>
      <button onClick={() => { failing = 'daily_report_employee_meals'; setPage('none'); }}>模擬員餐失敗</button>
    </nav>
    <output>模擬儲存 {saved} 次；攔截寫入 {writes} 次</output>
    {page === 'store' && <StoreReportPage report={report} storeCode="S01" reportDate="2026-09-10" products={productsSeed}
      currentRole="store_manager" staffRoster={staff} today="2026-09-10" onDateChange={async () => false}
      onSave={async () => { setSaved(n => n + 1); return true; }} />}
    {page === 'hq' && <HqReportRecords reports={reportRows} products={productsSeed} canManageReports canConfirmReports={false}
      onSaveReport={async () => { setSaved(n => n + 1); return true; }} onNotify={() => {}} />}
  </main>;
}
const width = Number(new URLSearchParams(location.search).get('width'));
createRoot(document.getElementById('root')).render(width
  ? <iframe title="手機驗收" src="./report-read-guard.html" style={{ width, height: 1200, border: 0 }} />
  : <Fixture />);
