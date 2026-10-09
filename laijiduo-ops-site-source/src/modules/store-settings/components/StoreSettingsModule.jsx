import { useEffect, useState } from "react";
import { normalizeStoreName } from "../../../lib/storeScope";
import { STORE_SETTING_TABS, createStoreSettingsDraft, normalizeSalarySetting, saveStaffRoleSalarySetting, saveStoreOperatingConfiguration, saveStoreWorkforceView, settingsPayload, validateSalarySetting, validateStoreSettingsDraft } from "..";
import { money } from "../../../components/operationalPageSupport.jsx";

function StoreSettingsModule({ stores, storeHours, relationGroups, configurationData, salaryRows, canViewSalary, onUnlockSalary, onSaved }) {
  const [storeCode, setStoreCode] = useState(stores[0]?.store_code || "");
  const [tab, setTab] = useState("basic");
  const [draft, setDraft] = useState(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [salaryDrafts, setSalaryDrafts] = useState([]);
  const [salarySavingRole, setSalarySavingRole] = useState("");

  const selectedStore = stores.find((store) => store.store_code === storeCode) || stores[0];
  const selectedSetting = configurationData.settings.find((row) => row.store_code === selectedStore?.store_code);
  const selectedDemand = configurationData.demands.find((row) => row.store_code === selectedStore?.store_code && row.rule_type === "baseline" && row.is_active !== false);
  const selectedRelation = relationGroups.find((group) => group.sourceCodes.includes(selectedStore?.store_code));
  const selectedFallback = storeHours.find((row) => normalizeStoreName(row.storeName) === normalizeStoreName(selectedStore?.name));
  const selectedAudits = configurationData.audits.filter((row) => row.store_code === selectedStore?.store_code);
  const selectedWorkforceView = configurationData.workforceViews?.find((row) => row.store_code === selectedStore?.store_code && row.view_type === "backoffice");

  useEffect(() => {
    if (!selectedStore) return;
    setDraft(createStoreSettingsDraft({
      store: selectedStore,
      setting: selectedSetting,
      demand: selectedDemand,
      relation: selectedRelation,
      fallback: selectedFallback,
      workforceView: selectedWorkforceView,
    }));
    setReason("");
    setError("");
  }, [selectedStore?.store_code, selectedSetting?.updated_at, selectedDemand?.required_count, selectedRelation?.demand, selectedWorkforceView?.is_enabled]);

  useEffect(() => {
    setSalaryDrafts((salaryRows || []).map(normalizeSalarySetting));
  }, [salaryRows]);

  if (!selectedStore || !draft) return <section className="panel"><p>目前沒有可設定的門店。</p></section>;

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    const validationError = validateStoreSettingsDraft(draft, reason);
    if (validationError) return setError(validationError);
    setSaving(true);
    setError("");
    try {
      await saveStoreOperatingConfiguration(selectedStore.store_code, settingsPayload(draft), reason.trim());
      if (selectedStore.store_code === "S01") {
        await saveStoreWorkforceView("S01", "backoffice", draft.backoffice_matrix_enabled, reason.trim());
      }
      await onSaved?.();
      setReason("");
    } catch (saveError) {
      setError(`儲存失敗：${saveError.message}`);
    } finally {
      setSaving(false);
    }
  }

  function updateSalary(roleName, key, value) {
    setSalaryDrafts((rows) => rows.map((row) => row.role_name === roleName ? { ...row, [key]: value } : row));
  }

  async function saveSalary(row) {
    const validationError = validateSalarySetting(row);
    if (validationError) return setError(validationError);
    if (String(reason || "").trim().length < 3) return setError("薪資修改原因至少需要三個字");
    setSalarySavingRole(row.role_name);
    setError("");
    try {
      await saveStaffRoleSalarySetting(normalizeSalarySetting(row), reason.trim());
      await onSaved?.();
      setReason("");
    } catch (saveError) {
      setError(`薪資設定儲存失敗：${saveError.message}`);
    } finally {
      setSalarySavingRole("");
    }
  }

  return (
    <div className="workspace module-grid store-settings-center">
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>門店營運設定中心</h2>
            <p>統一維護門店狀態、營業時間、人力需求、營收目標與管理關係；儲存後保留異動紀錄。</p>
          </div>
          <span className={`chip ${draft.operating_status === "active" ? "good" : "warn"}`}>{draft.operating_status === "active" ? "營運中" : draft.operating_status === "suspended" ? "暫停營業" : "結束營業"}</span>
        </div>
        <div className="settings-store-picker">
          <label>設定門店
            <select value={selectedStore.store_code} onChange={(event) => setStoreCode(event.target.value)}>
              {stores.map((store) => <option key={store.store_code} value={store.store_code}>{store.store_code} {store.name}</option>)}
            </select>
          </label>
          <div className="settings-summary">
            <span>基準需求 <strong>{draft.baseline_demand} 人</strong></span>
            <span>月目標 <strong>{money(draft.target_monthly_revenue)}</strong></span>
            <span>生效日 <strong>{draft.effective_from}</strong></span>
          </div>
        </div>
        <div className="settings-tabs" role="tablist" aria-label="門店營運設定分類">
          {STORE_SETTING_TABS.map(([key, label]) => (
            <button type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>{label}</button>
          ))}
        </div>

        <form onSubmit={submit}>
          {tab === "basic" && <div className="settings-form-grid">
            <label>店碼<input value={selectedStore.store_code} disabled /></label>
            <label>門店名稱<input value={selectedStore.name} disabled /></label>
            <label>負責人<input value={draft.manager_name} onChange={(event) => update("manager_name", event.target.value)} /></label>
            <label>營運狀態<select value={draft.operating_status} onChange={(event) => update("operating_status", event.target.value)}><option value="active">營運中</option><option value="suspended">暫停營業</option><option value="closed">結束營業</option></select></label>
            <label>設定生效日<input type="date" value={draft.effective_from} onChange={(event) => update("effective_from", event.target.value)} /></label>
          </div>}

          {tab === "hours" && <div className="settings-form-grid">
            <label>平日開店<input type="time" value={draft.weekday_open_time} onChange={(event) => update("weekday_open_time", event.target.value)} /></label>
            <label>平日打烊<input type="time" value={draft.weekday_close_time} onChange={(event) => update("weekday_close_time", event.target.value)} /></label>
            <label>假日開店<input type="time" value={draft.holiday_open_time} onChange={(event) => update("holiday_open_time", event.target.value)} /></label>
            <label>假日打烊<input type="time" value={draft.holiday_close_time} onChange={(event) => update("holiday_close_time", event.target.value)} /></label>
            <label>14:00 回報時間<input type="time" value={draft.lunch_report_time} onChange={(event) => update("lunch_report_time", event.target.value)} /></label>
            <label>19:00 回報時間<input type="time" value={draft.dinner_report_time} onChange={(event) => update("dinner_report_time", event.target.value)} /></label>
            <label>打烊回報時間<input type="time" value={draft.close_report_time} onChange={(event) => update("close_report_time", event.target.value)} /></label>
          </div>}

          {tab === "staffing" && <div className="settings-form-grid">
            <label>每日基準需求人數<input type="number" min="0" step="1" value={draft.baseline_demand} onChange={(event) => update("baseline_demand", event.target.value)} /></label>
            <label>午峰開始<input type="time" step="1800" value={draft.lunch_peak_start} onChange={(event) => update("lunch_peak_start", event.target.value)} /></label>
            <label>午峰結束<input type="time" step="1800" value={draft.lunch_peak_end} onChange={(event) => update("lunch_peak_end", event.target.value)} /></label>
            <label>午峰需求人數<input type="number" min="0" step="1" value={draft.lunch_peak_demand} onChange={(event) => update("lunch_peak_demand", event.target.value)} /></label>
            <label>晚峰開始<input type="time" step="1800" value={draft.dinner_peak_start} onChange={(event) => update("dinner_peak_start", event.target.value)} /></label>
            <label>晚峰結束<input type="time" step="1800" value={draft.dinner_peak_end} onChange={(event) => update("dinner_peak_end", event.target.value)} /></label>
            <label>晚峰需求人數<input type="number" min="0" step="1" value={draft.dinner_peak_demand} onChange={(event) => update("dinner_peak_demand", event.target.value)} /></label>
            {selectedStore.store_code === "S01" && <label className="settings-toggle-field"><input type="checkbox" checked={draft.backoffice_matrix_enabled} onChange={(event) => update("backoffice_matrix_enabled", event.target.checked)} />啟用五甲後勤人力矩陣</label>}
            <div className="settings-inline-note">星期別及特殊日期需求仍由排班管理的「人力需求調整」建立，優先於本基準。</div>
          </div>}

          {tab === "target" && <div className="settings-form-grid">
            <label>本月營業額目標<input type="number" min="0" step="1000" value={draft.target_monthly_revenue} onChange={(event) => update("target_monthly_revenue", event.target.value)} /></label>
            <label>自動換算每日目標<input value={money(settingsPayload(draft).target_daily_revenue)} disabled /></label>
            <div className="settings-inline-note">儲存時寫入門店月目標與每日目標，營運看板及達成率同步使用。</div>
          </div>}

          {tab === "relation" && <div className="settings-form-grid">
            <label>管理群組<input value={selectedRelation?.name || "未加入群組"} disabled /></label>
            <label>統籌門店<input value={selectedRelation?.coordinatingStoreCode || selectedStore.store_code} disabled /></label>
            <label>群組需求人數<input type="number" min="0" step="1" disabled={!selectedRelation} value={draft.group_demand} onChange={(event) => update("group_demand", event.target.value)} /></label>
            <label className="wide-field">管理規則<textarea disabled={!selectedRelation} value={draft.relation_rule_note} onChange={(event) => update("relation_rule_note", event.target.value)} /></label>
            <div className="settings-inline-note">新增、移除門店關係涉及跨店資料權限，第一版只允許維護既有群組需求與規則，避免誤改可見範圍。</div>
          </div>}

          {tab === "salary" && (
            canViewSalary ? <div className="salary-settings-editor">
              <div className="settings-inline-note">薪資設定為全公司職級共用，不隨門店切換；每次修改均須填寫原因並留下稽核紀錄。</div>
              <div className="table-wrap"><table><thead><tr><th>職級</th><th>薪資類型</th><th>底薪</th><th>時薪</th><th>績效獎金</th><th>月休</th><th>總工時</th><th>休息</th><th>實際工時</th><th>操作</th></tr></thead><tbody>
                {salaryDrafts.map((row) => <tr key={row.role_name}>
                  <td><strong>{row.role_name}</strong></td>
                  <td><select value={row.salary_type} onChange={(event) => updateSalary(row.role_name, "salary_type", event.target.value)}><option value="monthly">月薪</option><option value="hourly">時薪</option><option value="negotiable">待設定</option></select></td>
                  <td><input type="number" min="0" value={row.base_salary ?? ""} onChange={(event) => updateSalary(row.role_name, "base_salary", event.target.value)} /></td>
                  <td><input type="number" min="0" value={row.hourly_rate ?? ""} onChange={(event) => updateSalary(row.role_name, "hourly_rate", event.target.value)} /></td>
                  <td><input type="number" min="0" value={row.performance_bonus ?? ""} onChange={(event) => updateSalary(row.role_name, "performance_bonus", event.target.value)} /></td>
                  <td><input type="number" min="0" step="0.5" value={row.monthly_rest_days ?? ""} onChange={(event) => updateSalary(row.role_name, "monthly_rest_days", event.target.value)} /></td>
                  <td><input type="number" min="0" step="0.5" value={row.work_hours ?? ""} onChange={(event) => updateSalary(row.role_name, "work_hours", event.target.value)} /></td>
                  <td><input type="number" min="0" step="0.5" value={row.break_hours ?? ""} onChange={(event) => updateSalary(row.role_name, "break_hours", event.target.value)} /></td>
                  <td>{row.work_hours === null ? "-" : Math.max(0, Number(row.work_hours || 0) - Number(row.break_hours || 0))}</td>
                  <td><button type="button" onClick={() => saveSalary(row)} disabled={salarySavingRole === row.role_name}>{salarySavingRole === row.role_name ? "儲存中" : "儲存"}</button></td>
                </tr>)}
              </tbody></table></div>
            </div> : <div className="salary-locked-state"><strong>薪資資料已遮蔽</strong><p>僅 CEO、CFO 或限時解鎖後的 COO 可查看與修改。</p>{onUnlockSalary && <button type="button" onClick={onUnlockSalary}>限時解鎖</button>}</div>
          )}

          {tab === "audit" && <div className="table-wrap compact settings-audit-table"><table><thead><tr><th>時間</th><th>修改原因</th><th>狀態</th><th>需求</th></tr></thead><tbody>
            {selectedAudits.map((row) => <tr key={row.id}><td>{new Date(row.changed_at).toLocaleString("zh-TW", { hour12: false })}</td><td>{row.change_reason}</td><td>{row.after_data?.store?.operating_status || "-"}</td><td>{row.after_data?.baseline_demand ?? "-"}</td></tr>)}
            {!selectedAudits.length && <tr><td colSpan="4">目前尚無異動紀錄</td></tr>}
          </tbody></table></div>}

          {tab !== "audit" && <div className="settings-save-bar">
            <label>修改原因<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="必填，例如：調整八月門店人力基準" /></label>
            {tab !== "salary" && <button className="primary" type="submit" disabled={saving}>{saving ? "儲存中" : "確認儲存並同步"}</button>}
          </div>}
          {error && <p className="form-error">{error}</p>}
        </form>
      </section>
    </div>
  );
}

export { StoreSettingsModule };
