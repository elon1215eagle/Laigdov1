import { useEffect, useMemo, useState } from "react";
import { staffingOverviewRepository } from "./data/staffingOverviewRepository.js";
import {
  buildStaffingExcelXml,
  buildStaffingExportModel,
  buildStaffingPrintHtml,
} from "./application/staffingOverviewExport.js";
import {
  MANAGER_AUTHORITY_OPTIONS,
  STAFFING_GROUP_OPTIONS,
  STAFFING_STATUS_OPTIONS,
  buildStaffingSnapshot,
  calculateLaborUnit,
  canManageStaffingOverview,
  canViewAllStaffingStores,
  normalizeStaffingSnapshot,
  resolvePublishedStaffingSnapshot,
  resolveStaffingDraftSnapshot,
  staffingMetrics,
  staffingRoleTone,
  staffingStoreCode,
  staffingStoreName,
  validateStaffingSnapshot,
} from "./domain/staffingOverview.js";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function downloadTextFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function gapLabel(gap) {
  if (gap < 0) return `缺 ${Math.abs(gap)} 人`;
  if (gap > 0) return `多 ${gap} 人`;
  return "剛好達標";
}

function personTone(status) {
  if (status === "在職") return "active";
  if (status === "待到職") return "waiting";
  if (status === "留職停薪") return "leave";
  return "inactive";
}

function displayWorkTime(value) {
  return String(value || "").replace(/(\d{2}:\d{2}):00/g, "$1");
}

function StaffGroup({ title, people }) {
  return (
    <section className="staffing-people-group">
      <div className="staffing-section-title"><h3>{title}</h3><span>{people.length} 人</span></div>
      <div className="staffing-person-list">
        {people.map((person) => (
          <article className={`staffing-person-card role-${staffingRoleTone(person.role)}`} key={person.id}>
            <div className={`staffing-person-avatar role-${staffingRoleTone(person.role)}`} aria-hidden="true">{person.name.slice(0, 1)}</div>
            <div className="staffing-person-main">
              <div><strong>{person.name}</strong><span className={`staffing-status ${personTone(person.status)}`}>{person.status}</span></div>
              <p className="staffing-person-meta">
                <span className={`staffing-role role-${staffingRoleTone(person.role)}`}>{person.role}</span>
                {person.employment_type && <span className="staffing-employment">{person.employment_type}</span>}
              </p>
              {person.work_time && <small>預設工時 {displayWorkTime(person.work_time)}</small>}
              {person.note && <small>{person.note}</small>}
            </div>
          </article>
        ))}
        {!people.length && <p className="staffing-empty">目前沒有顯示人員</p>}
      </div>
    </section>
  );
}

function OperationDetails({ snapshot }) {
  return (
    <>
      <section className="staffing-operation-overview">
        <div className="staffing-service-times">
          <div><span>出爐時間</span><strong>{snapshot.output_time}</strong></div>
          <div><span>關爐時間</span><strong>{snapshot.closing_time}</strong></div>
        </div>
        <div className="staffing-shift-schedule">
          <div className="staffing-section-title"><h3>各班別上班時間</h3><span>{snapshot.shifts.length} 班</span></div>
          <div className="staffing-shift-list">
            {snapshot.shifts.map((shift) => (
              <div key={shift.id}><strong>{shift.name}</strong><span>{shift.start_time}－{shift.end_time}</span></div>
            ))}
          </div>
        </div>
      </section>
      <section className="staffing-labor-trial">
        <div className="staffing-section-title"><h3>工時試算</h3><span>以工日估算</span></div>
        <div className="staffing-labor-units">
          {snapshot.labor_units.map((unit) => {
            const result = calculateLaborUnit(unit);
            return (
              <article key={unit.id}>
                <h4>{unit.name}</h4>
                <div className="staffing-labor-grid">
                  <div><span>下月天數</span><strong>{result.monthDays}</strong></div>
                  <div><span>可排人力</span><strong>{result.staffEquivalent}</strong></div>
                  <div><span>可排總工日</span><strong>{result.totalDays}</strong></div>
                  <div><span>預計休假</span><strong>{result.restDays}</strong></div>
                  <div><span>可工作日</span><strong>{result.workDays}</strong></div>
                  <div><span>每日崗位</span><strong>{result.positions}</strong></div>
                  <div><span>需求工日</span><strong>{result.requiredDays}</strong></div>
                  <div className={`staffing-labor-balance ${result.balance < 0 ? "short" : result.balance > 0 ? "surplus" : "ok"}`}><span>餘缺工日</span><strong>{result.balance > 0 ? `+${result.balance}` : result.balance}</strong></div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

export function PhoneView({ snapshot, record }) {
  const metrics = staffingMetrics(snapshot);
  const visiblePeople = snapshot.people.filter((person) => person.visible !== false);
  return (
    <div className="staffing-phone-view">
      <header className="staffing-store-head">
        <div><span>{snapshot.store_code}</span><h2>{snapshot.store_name}</h2></div>
        <span className={`staffing-gap ${metrics.gap < 0 ? "short" : metrics.gap > 0 ? "surplus" : "ok"}`}>{gapLabel(metrics.gap)}</span>
      </header>
      <div className="staffing-kpis">
        <div><span>核定編制</span><strong>{metrics.target}</strong><small>人</small></div>
        <div><span>目前在職</span><strong>{metrics.active}</strong><small>人</small></div>
        <div><span>留停</span><strong>{metrics.leave}</strong><small>人</small></div>
        <div><span>店面需求</span><strong>{snapshot.daily_demand}</strong><small>人／日</small></div>
      </div>
      <section className="staffing-manager-line">
        <div><span>門店主管</span><strong>{snapshot.manager_name || "尚未指定"}</strong></div>
        <span>{snapshot.manager_authority}</span>
      </section>
      {snapshot.note && <p className="staffing-store-note">{snapshot.note}</p>}
      <OperationDetails snapshot={snapshot} />
      <StaffGroup title="門店人員" people={visiblePeople.filter((person) => person.group === "門店")} />
      <StaffGroup title="後勤人員" people={visiblePeople.filter((person) => person.group === "後勤")} />
      <StaffGroup title="送貨人員" people={visiblePeople.filter((person) => person.group === "送貨")} />
      <footer className="staffing-version-note">
        {record?.published_at ? `發布時間：${new Date(record.published_at).toLocaleString("zh-TW")}` : "目前依人資主檔產生，尚未發布獨立顯示版本"}
      </footer>
    </div>
  );
}

function PersonEditor({ person, index, total, onChange, onMove, onToggle }) {
  return (
    <article className={`staffing-person-editor ${person.visible === false ? "hidden" : ""}`}>
      <div className="staffing-editor-head">
        <div className="staffing-editor-person">
          <strong>{person.name || "新增人員"}</strong>
          <span className={`staffing-role role-${staffingRoleTone(person.role)}`}>{person.role || "未設定職級"}</span>
        </div>
        <div className="staffing-editor-actions">
          <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)}>上移</button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(index, 1)}>下移</button>
          <button type="button" onClick={() => onToggle(index)}>{person.visible === false ? "顯示" : "隱藏"}</button>
        </div>
      </div>
      <div className="staffing-editor-grid">
        <label>姓名<input value={person.name} maxLength="50" onChange={(event) => onChange(index, "name", event.target.value)} /></label>
        <label>職務<input value={person.role} maxLength="50" onChange={(event) => onChange(index, "role", event.target.value)} /></label>
        <label>分組<select value={person.group} onChange={(event) => onChange(index, "group", event.target.value)}>{STAFFING_GROUP_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>狀態<select value={person.status} onChange={(event) => onChange(index, "status", event.target.value)}>{STAFFING_STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>僱用型態<select value={person.employment_type} onChange={(event) => onChange(index, "employment_type", event.target.value)}><option>正職</option><option>兼職</option></select></label>
        <label>預設工時<input value={person.work_time} placeholder="例：10:00–21:00" maxLength="30" onChange={(event) => onChange(index, "work_time", event.target.value)} /></label>
        <label className="wide">顯示備註<input value={person.note} maxLength="200" onChange={(event) => onChange(index, "note", event.target.value)} /></label>
      </div>
    </article>
  );
}

export default function StaffingOverviewPage({ stores, staffRoster, selectedStoreId, profile, currentRole, onSelectStore, onRefresh }) {
  const canManage = canManageStaffingOverview(currentRole);
  const canViewAll = canViewAllStaffingStores(currentRole);
  const storeOptions = useMemo(() => stores
    .filter((store) => staffingStoreCode(store))
    .slice()
    .sort((a, b) => staffingStoreCode(a).localeCompare(staffingStoreCode(b))), [stores]);
  const selectedStore = storeOptions.find((store) => store.id === selectedStoreId || store.store_id === selectedStoreId || staffingStoreCode(store) === String(selectedStoreId || "").toUpperCase());
  const profileStore = storeOptions.find((store) => store.id === profile?.store_id || store.store_id === profile?.store_id || staffingStoreCode(store) === String(profile?.store_code || "").toUpperCase());
  const scopedStore = canViewAll ? (selectedStore || profileStore || storeOptions[0]) : profileStore;
  const [storeCode, setStoreCode] = useState(() => staffingStoreCode(scopedStore));
  const [mode, setMode] = useState("view");
  const [record, setRecord] = useState(null);
  const [events, setEvents] = useState([]);
  const [draft, setDraft] = useState(null);
  const [published, setPublished] = useState(null);
  const [storageReady, setStorageReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("更新人力顯示資料");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const currentStore = storeOptions.find((store) => staffingStoreCode(store) === storeCode) || scopedStore;
  const fallback = useMemo(() => buildStaffingSnapshot({ store: currentStore, stores: storeOptions, staff: staffRoster }), [currentStore, storeOptions, staffRoster]);

  useEffect(() => {
    const nextCode = staffingStoreCode(scopedStore);
    if (nextCode && nextCode !== storeCode) setStoreCode(nextCode);
  }, [selectedStoreId]);

  useEffect(() => {
    if (!storeCode) return;
    let active = true;
    setLoading(true);
    setMessage("");
    staffingOverviewRepository.read(storeCode)
      .then((result) => {
        if (!active) return;
        const nextRecord = result.record;
        setStorageReady(result.storageReady);
        setRecord(nextRecord);
        setEvents(result.events || []);
        setPublished(resolvePublishedStaffingSnapshot(nextRecord?.published_content, fallback));
        setDraft(resolveStaffingDraftSnapshot(nextRecord?.draft_content, nextRecord?.published_content, fallback));
        setDirty(false);
      })
      .catch((error) => {
        if (!active) return;
        setRecord(null);
        setPublished(null);
        setDraft(copy(fallback));
        setMessage(error.message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => { active = false; };
  }, [storeCode, fallback, refreshVersion]);

  function refreshData() {
    setRefreshing(true);
    setMessage("");
    setRefreshVersion((value) => value + 1);
  }

  function chooseStore(nextCode) {
    if (dirty && !window.confirm("目前草稿尚未儲存，仍要切換門店嗎？")) return;
    setStoreCode(nextCode);
    const store = storeOptions.find((item) => staffingStoreCode(item) === nextCode);
    onSelectStore?.(store?.id || store?.store_id || nextCode);
  }

  function moveStore(offset) {
    const index = storeOptions.findIndex((store) => staffingStoreCode(store) === storeCode);
    const next = storeOptions[index + offset];
    if (next) chooseStore(staffingStoreCode(next));
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  function updatePerson(index, field, value) {
    setDraft((current) => ({ ...current, people: current.people.map((person, personIndex) => personIndex === index ? { ...person, [field]: value } : person) }));
    setDirty(true);
  }

  function movePerson(index, offset) {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= draft.people.length) return;
    const people = draft.people.slice();
    [people[index], people[nextIndex]] = [people[nextIndex], people[index]];
    updateDraft("people", people.map((person, personIndex) => ({ ...person, sort_order: personIndex + 1 })));
  }

  function addPerson() {
    updateDraft("people", [...draft.people, {
      id: `display-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      name: "", role: "門店人員", group: "門店", employment_type: "正職", status: "在職", work_time: "", note: "", visible: true, sort_order: draft.people.length + 1,
    }]);
  }

  function updateShift(index, field, value) {
    updateDraft("shifts", draft.shifts.map((shift, shiftIndex) => shiftIndex === index ? { ...shift, [field]: value } : shift));
  }

  function addShift() {
    updateDraft("shifts", [...draft.shifts, { id: globalThis.crypto?.randomUUID?.() || `shift-${Date.now()}`, name: "新班別", start_time: "09:00", end_time: "18:00" }]);
  }

  function removeShift(index) {
    updateDraft("shifts", draft.shifts.filter((_, shiftIndex) => shiftIndex !== index));
  }

  function updateLaborUnit(index, field, value) {
    updateDraft("labor_units", draft.labor_units.map((unit, unitIndex) => unitIndex === index ? { ...unit, [field]: value } : unit));
  }

  function addLaborUnit() {
    updateDraft("labor_units", [...draft.labor_units, { id: globalThis.crypto?.randomUUID?.() || `labor-${Date.now()}`, name: "門店", month_days: 30, staff_equivalent: 0, rest_days: 0, positions: 0 }]);
  }

  function removeLaborUnit(index) {
    updateDraft("labor_units", draft.labor_units.filter((_, unitIndex) => unitIndex !== index));
  }

  async function saveDraft({ quiet = false } = {}) {
    const validation = validateStaffingSnapshot(draft);
    if (validation) throw new Error(validation);
    if (!storageReady) throw new Error("資料庫儲存尚未啟用，目前只能預覽");
    setSaving(true);
    try {
      const result = await staffingOverviewRepository.saveDraft({ storeCode, expectedVersion: record?.version || 0, content: draft, reason });
      setRecord(result.record);
      setDraft(normalizeStaffingSnapshot(result.record.draft_content, fallback));
      setEvents(result.events || events);
      setDirty(false);
      if (!quiet) setMessage("草稿已儲存，門店尚未看到這次修改");
      return result.record;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    try { await saveDraft(); } catch (error) { setMessage(error.message); }
  }

  async function handlePublish() {
    try {
      let workingRecord = record;
      if (dirty || !workingRecord?.draft_content) workingRecord = await saveDraft({ quiet: true });
      setSaving(true);
      const result = await staffingOverviewRepository.publish({ storeCode, expectedVersion: workingRecord.version, reason });
      setRecord(result.record);
      setPublished(normalizeStaffingSnapshot(result.record.published_content, fallback));
      setDraft(normalizeStaffingSnapshot(result.record.draft_content, fallback));
      setEvents(result.events || events);
      setDirty(false);
      setMode("view");
      setMessage("已發布，門店重新整理後即可看到");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function loadAllStoreSnapshots() {
    const rows = await Promise.all(storeOptions.map(async (store) => {
      const code = staffingStoreCode(store);
      return { storeCode: code, ...(await staffingOverviewRepository.read(code)) };
    }));
    if (rows.some((row) => !row.storageReady)) throw new Error("人力掌握正式儲存尚未啟用，無法產生完整匯出");
    return rows.map(({ storeCode: code, record: storeRecord }) => {
      const store = storeOptions.find((item) => staffingStoreCode(item) === code);
      const storeFallback = buildStaffingSnapshot({ store, stores: storeOptions, staff: staffRoster });
      const publishedSnapshot = resolvePublishedStaffingSnapshot(storeRecord?.published_content, storeFallback);
      if (!publishedSnapshot) throw new Error(`${code} 尚未發布人力掌握，無法產生正式匯出`);
      return publishedSnapshot;
    });
  }

  async function handleExcelExport() {
    setExporting(true);
    setMessage("");
    try {
      const model = buildStaffingExportModel(await loadAllStoreSnapshots());
      downloadTextFile(buildStaffingExcelXml(model), `萊吉多全門店人力掌握_${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel;charset=utf-8");
      setMessage(`已匯出 ${model.stores.length} 間門店，集中於單一工作表，可用 A4 橫式單頁列印`);
    } catch (error) {
      setMessage(error.message || "全門店匯出失敗");
    } finally {
      setExporting(false);
    }
  }

  async function handlePrintAll() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setMessage("瀏覽器已阻擋列印視窗，請允許彈出式視窗後重試");
      return;
    }
    printWindow.document.write('<!doctype html><html lang="zh-Hant"><body style="font-family:sans-serif;padding:24px">正在整理全部門店資料...</body></html>');
    setExporting(true);
    setMessage("");
    try {
      const model = buildStaffingExportModel(await loadAllStoreSnapshots());
      printWindow.document.open();
      printWindow.document.write(buildStaffingPrintHtml(model));
      printWindow.document.close();
      setMessage(`已建立 ${model.stores.length} 間門店的 A4 橫式單頁總覽`);
    } catch (error) {
      printWindow.close();
      setMessage(error.message || "A4 列印版建立失敗");
    } finally {
      setExporting(false);
    }
  }

  if (!currentStore) return <section className="panel"><h2>人力掌握</h2><p>目前沒有可顯示的門店。</p></section>;

  return (
    <div className="staffing-overview-module">
      <section className="staffing-toolbar panel">
        <div>
          <span>逐店查看</span>
          <strong>{storeCode} {staffingStoreName(currentStore)}</strong>
        </div>
        <div className="staffing-store-switcher">
          {canViewAll && <button type="button" onClick={() => moveStore(-1)} disabled={storeOptions.findIndex((store) => staffingStoreCode(store) === storeCode) <= 0}>上一店</button>}
          {canViewAll ? (
            <select value={storeCode} onChange={(event) => chooseStore(event.target.value)}>
              {storeOptions.map((store) => <option key={staffingStoreCode(store)} value={staffingStoreCode(store)}>{staffingStoreCode(store)} {staffingStoreName(store)}</option>)}
            </select>
          ) : <span className="staffing-fixed-store">僅顯示本店</span>}
          {!canViewAll && <button type="button" disabled={refreshing} onClick={refreshData}>{refreshing ? "同步中" : "同步"}</button>}
          {canViewAll && <button type="button" onClick={() => moveStore(1)} disabled={storeOptions.findIndex((store) => staffingStoreCode(store) === storeCode) >= storeOptions.length - 1}>下一店</button>}
        </div>
        {canManage && <div className="staffing-mode-switch"><button type="button" className={mode === "view" ? "active" : ""} onClick={() => setMode("view")}>手機檢視</button><button type="button" className={mode === "manage" ? "active" : ""} onClick={() => setMode("manage")}>後台維護</button></div>}
        {canViewAll && <div className="staffing-export-actions"><button type="button" disabled={exporting} onClick={handleExcelExport}>匯出全部門店 Excel</button><button type="button" disabled={exporting} onClick={handlePrintAll}>A4 橫式列印</button></div>}
      </section>

      {message && <div className="staffing-message" role="status">{message}</div>}
      {loading || !draft ? <section className="panel"><p>人力資料載入中...</p></section> : mode === "view" || !canManage ? (
        published
          ? <PhoneView snapshot={published} record={record} />
          : <section className="panel"><h2>尚未發布</h2><p>此門店尚無總部發布的人力掌握版本，請由總部完成設定並發布。</p></section>
      ) : (
        <div className="staffing-admin-layout">
          <section className="panel staffing-admin-form">
            <div className="panel-head"><div><h2>顯示內容維護</h2><p>修改只影響本頁；不會回寫人資主檔或排班。</p></div><button type="button" onClick={() => { setDraft(copy(fallback)); setDirty(true); }}>依目前人資重建</button></div>
            {!storageReady && <div className="notice">資料庫儲存尚未啟用。現在可以預覽，但套用 migration 前不能發布。</div>}
            <div className="staffing-settings-grid">
              <label>門店名稱<input value={draft.store_name} maxLength="80" onChange={(event) => updateDraft("store_name", event.target.value)} /></label>
              <label>核定編制<input type="number" min="0" step="0.5" value={draft.target_headcount} onChange={(event) => updateDraft("target_headcount", event.target.value)} /></label>
              <label>每日需求<input type="number" min="0" step="0.5" value={draft.daily_demand} onChange={(event) => updateDraft("daily_demand", event.target.value)} /></label>
              <label>主管姓名<input value={draft.manager_name} maxLength="50" onChange={(event) => updateDraft("manager_name", event.target.value)} /></label>
              <label>主管狀態<select value={draft.manager_authority} onChange={(event) => updateDraft("manager_authority", event.target.value)}>{MANAGER_AUTHORITY_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="wide">門店說明<input value={draft.note} maxLength="300" onChange={(event) => updateDraft("note", event.target.value)} /></label>
            </div>
            <div className="staffing-admin-section-head"><div><h3>營運與班別時間</h3><p>手機頁會完整顯示各店實際時段。</p></div><button type="button" onClick={addShift}>新增班別</button></div>
            <div className="staffing-time-settings">
              <label>出爐時間<input type="time" value={draft.output_time} onChange={(event) => updateDraft("output_time", event.target.value)} /></label>
              <label>關爐時間<input type="time" value={draft.closing_time} onChange={(event) => updateDraft("closing_time", event.target.value)} /></label>
            </div>
            <div className="staffing-shift-editors">
              {draft.shifts.map((shift, index) => (
                <div className="staffing-shift-editor" key={shift.id}>
                  <label>班別名稱<input value={shift.name} maxLength="30" onChange={(event) => updateShift(index, "name", event.target.value)} /></label>
                  <label>上班<input type="time" value={shift.start_time} onChange={(event) => updateShift(index, "start_time", event.target.value)} /></label>
                  <label>下班<input type="time" value={shift.end_time} onChange={(event) => updateShift(index, "end_time", event.target.value)} /></label>
                  <button type="button" disabled={draft.shifts.length <= 1} onClick={() => removeShift(index)}>移除</button>
                </div>
              ))}
            </div>
            <div className="staffing-admin-section-head"><div><h3>工時試算設定</h3><p>輸入基礎數字，其餘結果自動計算。</p></div><button type="button" onClick={addLaborUnit}>新增試算組</button></div>
            <div className="staffing-labor-editors">
              {draft.labor_units.map((unit, index) => {
                const result = calculateLaborUnit(unit);
                return (
                  <div className="staffing-labor-editor" key={unit.id}>
                    <div className="staffing-labor-inputs">
                      <label>組別<input value={unit.name} maxLength="30" onChange={(event) => updateLaborUnit(index, "name", event.target.value)} /></label>
                      <label>下月天數<input type="number" min="0" max="31" step="1" value={unit.month_days} onChange={(event) => updateLaborUnit(index, "month_days", event.target.value)} /></label>
                      <label>可排人力<input type="number" min="0" step="0.5" value={unit.staff_equivalent} onChange={(event) => updateLaborUnit(index, "staff_equivalent", event.target.value)} /></label>
                      <label>預計休假<input type="number" min="0" step="0.5" value={unit.rest_days} onChange={(event) => updateLaborUnit(index, "rest_days", event.target.value)} /></label>
                      <label>每日崗位<input type="number" min="0" step="0.5" value={unit.positions} onChange={(event) => updateLaborUnit(index, "positions", event.target.value)} /></label>
                      <button type="button" disabled={draft.labor_units.length <= 1} onClick={() => removeLaborUnit(index)}>移除</button>
                    </div>
                    <p>可工作 {result.workDays} 工日 · 需求 {result.requiredDays} 工日 · <strong className={result.balance < 0 ? "danger" : "success"}>餘缺 {result.balance > 0 ? `+${result.balance}` : result.balance}</strong></p>
                  </div>
                );
              })}
            </div>
            <div className="staffing-admin-section-head"><div><h3>顯示人員</h3><p>可調整分組、職務、狀態及顯示順序。</p></div><button type="button" onClick={addPerson}>新增顯示人員</button></div>
            <div className="staffing-person-editors">
              {draft.people.map((person, index) => <PersonEditor key={person.id} person={person} index={index} total={draft.people.length} onChange={updatePerson} onMove={movePerson} onToggle={(personIndex) => updatePerson(personIndex, "visible", draft.people[personIndex].visible === false)} />)}
            </div>
            <label className="staffing-reason">修改原因<input value={reason} maxLength="200" onChange={(event) => setReason(event.target.value)} /></label>
            <div className="staffing-publish-actions">
              <button type="button" disabled={saving || !dirty || !storageReady} onClick={handleSave}>儲存草稿</button>
              <button className="primary" type="button" disabled={saving || !storageReady} onClick={handlePublish}>發布到手機頁</button>
            </div>
          </section>
          <aside className="staffing-live-preview">
            <span>即時預覽</span>
            <PhoneView snapshot={draft} record={record} />
            <details><summary>最近異動紀錄</summary>{events.map((event) => <p key={event.id || `${event.action}-${event.created_at}`}><strong>{event.action === "publish" ? "發布" : "儲存草稿"}</strong> · {event.actor_name || "使用者"}<br /><small>{new Date(event.created_at).toLocaleString("zh-TW")} {event.reason || ""}</small></p>)}{!events.length && <p>尚無異動紀錄</p>}</details>
          </aside>
        </div>
      )}
    </div>
  );
}
