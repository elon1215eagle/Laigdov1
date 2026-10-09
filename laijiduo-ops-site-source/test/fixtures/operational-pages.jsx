import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';

// Block all production traffic before importing the application modules.
const nativeFetch = window.fetch.bind(window);
window.fetch = (url, options) => {
  const target = new URL(typeof url === 'string' ? url : url.url, location.href);
  if (target.origin !== location.origin) return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  return nativeFetch(url, options);
};
const { ScheduleModule } = await import('../../src/modules/scheduling/components/ScheduleModule.jsx');
const { HrMasterModule } = await import('../../src/modules/hr/components/HrMasterModule.jsx');
const { StoreSettingsModule } = await import('../../src/modules/store-settings/components/StoreSettingsModule.jsx');
const { storesSeed, staffRosterSeed, salaryStructureSeed, storeHoursSeed, scheduleSeed } = await import('../../src/lib/mockData.js');

const currentWujiaStaff = [
  ['fixture-s01-11', '阿暄', '委任店經理', '正職', '門店營運', 11],
  ['fixture-s01-12', '穎德', '資深人員', '正職', '門店營運', 12],
  ['fixture-s01-15', '冠友', '新進人員', '正職', '門店營運', 15],
  ['fixture-s01-17', '婕允', '新進人員', '正職', '門店營運', 17],
  ['fixture-s01-20', '娟姨', '兼職人員', '兼職', '後勤', 20],
  ['fixture-s01-21', '斌媽', '兼職人員', '兼職', '後勤', 21],
  ['fixture-s01-22', '欣樺', '兼職人員', '兼職', '門店營運', 22],
  ['fixture-s01-23', '晹晹', '兼職人員', '兼職', '後勤', 23],
  ['fixture-s01-24', '彥璋', '兼職人員', '兼職', '送貨', 24],
  ['fixture-s01-70', '晉銘', '送貨人員', '正職', '送貨', 70],
].map(([id, employeeName, role, employment_type, work_category, sort_order]) => ({
  id,
  storeCode: 'S01',
  storeName: '鳳山五甲店',
  employeeName,
  role,
  employment_type,
  work_category,
  employment_status: '在職',
  is_active: true,
  sort_order,
}));

const fixtureStaffRoster = [
  ...staffRosterSeed.filter((person) => person.storeName !== '鳳山五甲店'),
  ...currentWujiaStaff,
];

function Fixture() {
  const [page, setPage] = useState('schedule');
  const storePreview = new URLSearchParams(location.search).has('store');
  const currentRole = storePreview ? 'store_manager' : 'coo';
  const common = { stores: storesSeed, staffRoster: fixtureStaffRoster, salaryRows: salaryStructureSeed, storeHours: storeHoursSeed, selectedStoreId: 'S01', currentRole, canViewSalary: false, onUnlockSalary() {} };
  return <main className={storePreview ? 'store-manager-app' : 'hq-app'} style={{ padding: storePreview ? 8 : 12 }}><nav>{!storePreview && [['schedule','排班'],['hr','人資'],['settings','門店設定']].map(([id,label]) => <button key={id} onClick={() => setPage(id)}>{label}</button>)}</nav>
    {page === 'schedule' && <ScheduleModule {...common} scheduleRows={scheduleSeed} profile={{ role: currentRole, store_code: 'S01' }} storeRelationGroups={[]} workforceViews={[]} onNotify={() => {}} />}
    {page === 'hr' && <HrMasterModule {...common} onSaveStaffMember={async()=>{}} onDeleteStaffMember={async()=>{}} onTransferStaffMember={async()=>{}} />}
    {page === 'settings' && <StoreSettingsModule {...common} relationGroups={[]} configurationData={{ settings: [], demands: [], workforceViews: [], salarySettings: [] }} onSaved={async()=>{}} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
