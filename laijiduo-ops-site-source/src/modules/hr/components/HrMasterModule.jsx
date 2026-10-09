import { useEffect, useMemo, useState } from "react";
import { fetchStaffPositionSkills, fetchStaffStoreAssignments, fetchInactiveStoreStaff, saveStaffPositionSkills } from "../../../lib/api";
import { EMPLOYMENT_STATUS_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, HR_HEADQUARTERS_STORE, STAFF_ROLE_OPTIONS, STAFF_POSITION_OPTIONS, WORK_CATEGORY_OPTIONS, buildStaffProfile, createStaffForm, defaultWorkCategoryForRole, isStoreLeadershipRole, staffRoleRank, staffMemberToForm } from "..";
import { STORE_OPERATING_STATUS, normalizeStoreName, operatingStatusOf } from "../../../lib/storeScope";
import { canonicalStoreCode, displayStoreName, Metric, formatTime24 } from "../../../components/operationalPageSupport.jsx";

function HrMasterModule({ stores, selectedStoreId, salaryRows, storeHours, staffRoster, currentRole, canViewSalary, onUnlockSalary, onSaveStaffMember, onDeleteStaffMember, onTransferStaffMember }) {
  const selectedStore = stores.find((store) => store.store_id === selectedStoreId || store.id === selectedStoreId);
  const normalizedSelectedName = normalizeStoreName(selectedStore?.name);
  const selectedStoreName = storeHours.find((row) => normalizeStoreName(row.storeName) === normalizedSelectedName)?.storeName || storeHours[0]?.storeName || "";
  const rosterByStore = staffRoster.filter((row) => normalizeStoreName(row.storeName) === normalizeStoreName(selectedStoreName));
  const managers = staffRoster.filter((row) => isStoreLeadershipRole(row.role));
  const activeStoreNames = storeHours
    .filter((row) => {
      const store = stores.find((item) => normalizeStoreName(item.name) === normalizeStoreName(row.storeName));
      return !store || operatingStatusOf(store) === STORE_OPERATING_STATUS.ACTIVE;
    })
    .map((row) => row.storeName);
  const uncoveredStores = activeStoreNames.filter((storeName) => !managers.some((row) => normalizeStoreName(row.storeName) === normalizeStoreName(storeName)));
  const byRole = salaryRows.map((salary) => ({
    ...salary,
    base_salary: canViewSalary ? salary.base_salary : "已遮蔽",
    performance_bonus: canViewSalary ? salary.performance_bonus : "已遮蔽",
    count: staffRoster.filter((row) => row.role === salary.role).length,
  }));

  const editableStaffRoles = ["ceo", "coo", "cfo", "admin", "hq", "cso", "general_affairs"];
  const canEditStaff = editableStaffRoles.includes(currentRole);
  const storeOptions = useMemo(() => {
    const fromStores = stores.map((store) => ({ store_code: canonicalStoreCode(store), name: store.name }));
    const fromHours = storeHours.map((store) => ({ store_code: canonicalStoreCode(store), name: store.storeName }));
    return [HR_HEADQUARTERS_STORE, ...fromStores, ...fromHours]
      .filter((store) => store.store_code && store.name)
      .filter((store, index, rows) => rows.findIndex((item) => item.store_code === store.store_code) === index)
      .sort((a, b) => a.store_code.localeCompare(b.store_code));
  }, [stores, storeHours]);
  const roleOptions = useMemo(() => {
    return STAFF_ROLE_OPTIONS;
  }, []);
  const defaultStoreCode = canonicalStoreCode(selectedStore) || canonicalStoreCode({ storeName: selectedStoreName }) || storeOptions[0]?.store_code || "";
  const defaultStoreName = storeOptions.find((store) => store.store_code === defaultStoreCode)?.name || selectedStoreName || storeOptions[0]?.name || "";
  const [staffForm, setStaffForm] = useState(() => createStaffForm({
    storeCode: defaultStoreCode,
    storeName: defaultStoreName,
    roleName: roleOptions[0] || "",
  }));
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [staffSkills, setStaffSkills] = useState([]);
  const [inactiveStaff, setInactiveStaff] = useState([]);
  const [skillForm, setSkillForm] = useState({ staff_id: "", positions: [], primary_position: "" });
  const [transferForm, setTransferForm] = useState({ staff_id: "", store_code: "", effective_from: "", reason: "" });

  useEffect(() => {
    let active = true;
    fetchStaffStoreAssignments()
      .then((rows) => { if (active) setStaffAssignments(rows); })
      .catch(() => { if (active) setStaffAssignments([]); });
    fetchStaffPositionSkills()
      .then((rows) => { if (active) setStaffSkills(rows); })
      .catch(() => { if (active) setStaffSkills([]); });
    if (canEditStaff) {
      fetchInactiveStoreStaff()
        .then((rows) => { if (active) setInactiveStaff(rows); })
        .catch(() => { if (active) setInactiveStaff([]); });
    }
    return () => { active = false; };
  }, [canEditStaff]);

  useEffect(() => {
    if (staffForm.store_code || !defaultStoreCode) return;
    setStaffForm((current) => ({ ...current, store_code: defaultStoreCode, store_name: defaultStoreName }));
  }, [defaultStoreCode, defaultStoreName, staffForm.store_code]);

  const selectedFormStore = storeOptions.find((store) => store.store_code === staffForm.store_code);

  function resetStaffForm() {
    setStaffForm(createStaffForm({
      storeCode: defaultStoreCode,
      storeName: defaultStoreName,
      roleName: roleOptions[0] || "",
    }));
  }

  function editStaff(row) {
    const code = canonicalStoreCode(row);
    const store = storeOptions.find((item) => item.store_code === code);
    setStaffForm(staffMemberToForm(row, {
      storeCode: code,
      storeName: store?.name || displayStoreName(row),
    }));
  }

  async function submitStaffForm(event) {
    event.preventDefault();
    const profile = buildStaffProfile(staffForm, {
      storeName: selectedFormStore?.name || staffForm.store_name,
    });
    if (!profile.valid) return window.alert(profile.message);
    const saved = await onSaveStaffMember?.(profile.payload);
    if (saved) resetStaffForm();
  }

  async function deleteStaff(row) {
    if (!window.confirm("確定停用 " + row.employeeName + "？停用後排假表不會再列入此人員。")) return;
    await onDeleteStaffMember?.(row);
    if (staffForm.id === row.id) resetStaffForm();
  }

  async function reactivateStaff(row) {
    if (!window.confirm(`確定重新啟用 ${row.employeeName}？啟用後會重新列入人資與排假名單。`)) return;
    const saved = await onSaveStaffMember?.({
      ...staffMemberToForm(row, {
        storeCode: canonicalStoreCode(row),
        storeName: displayStoreName(row),
      }),
      employment_status: "在職",
      is_active: true,
    });
    if (saved) setInactiveStaff((current) => current.filter((person) => person.id !== row.id));
  }

  async function submitStaffTransfer(event) {
    event.preventDefault();
    const saved = await onTransferStaffMember?.(transferForm);
    if (!saved) return;
    setStaffAssignments(await fetchStaffStoreAssignments());
    setTransferForm({ staff_id: "", store_code: "", effective_from: "", reason: "" });
  }

  async function submitStaffSkills(event) {
    event.preventDefault();
    try {
      await saveStaffPositionSkills(skillForm);
      setStaffSkills(await fetchStaffPositionSkills());
    } catch (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className="workspace module-grid hr-master">
      <section className="kpi-strip">
        <Metric label="人員主檔" value={`${staffRoster.length} 人`} detail="來自 00AI人資.xlsx" />
        <Metric label="營運門店" value={`${activeStoreNames.length} 間`} detail="依門店營運狀態即時統計" />
        <Metric label="有主管門店" value={`${new Set(managers.map((row) => row.storeName)).size} 間`} detail="店長或副店長" tone="good" />
        <Metric label="主管缺口" value={`${uncoveredStores.length} 間`} detail={uncoveredStores[0] || "目前無缺口"} tone={uncoveredStores.length ? "bad" : "good"} />
        <Metric label="高峰需人力" value={`${storeHours.reduce((sum, row) => sum + Number(row.duty_staff || 0), 0)} 人`} detail="各店值班人員合計" />
      </section>

            <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>總部人員主檔維護</h2>
            <p>總部可直接編輯各店人員姓名與職稱；儲存後會同步成為排假表的人員來源。</p>
          </div>
          <div className="panel-actions">
            <button type="button" onClick={resetStaffForm}>新增人員</button>
          </div>
        </div>
        {canEditStaff ? (
          <form className="staff-admin-grid" onSubmit={submitStaffForm}>
            <label>
              門店
              <select
                value={staffForm.store_code}
                onChange={(event) => {
                  const store = storeOptions.find((item) => item.store_code === event.target.value);
                  setStaffForm({ ...staffForm, store_code: event.target.value, store_name: store?.name || "" });
                }}
              >
                {storeOptions.map((store) => (
                  <option key={store.store_code} value={store.store_code}>{store.store_code} {store.name}</option>
                ))}
              </select>
            </label>
            <label>
              人員姓名
              <input value={staffForm.employee_name} onChange={(event) => setStaffForm({ ...staffForm, employee_name: event.target.value })} placeholder="輸入姓名" />
            </label>
            <label>
              僱用型態
              <select
                value={staffForm.employment_type}
                onChange={(event) => {
                  const employmentType = event.target.value;
                  setStaffForm({
                    ...staffForm,
                    employment_type: employmentType,
                    holiday_start_time: employmentType === "兼職" ? staffForm.holiday_start_time : staffForm.weekday_start_time,
                    holiday_end_time: employmentType === "兼職" ? staffForm.holiday_end_time : staffForm.weekday_end_time,
                  });
                }}
              >
                {EMPLOYMENT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              職稱
              <select value={staffForm.role_name} onChange={(event) => {
                const roleName = event.target.value;
                const specialCategory = defaultWorkCategoryForRole(roleName);
                setStaffForm({
                  ...staffForm,
                  role_name: roleName,
                  work_category: specialCategory === "門店營運" && !["送貨", "總部"].includes(staffForm.work_category)
                    ? staffForm.work_category
                    : specialCategory,
                });
              }}>
                {roleOptions.map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}
              </select>
            </label>
            <label>
              工作類別
              <select value={staffForm.work_category} onChange={(event) => setStaffForm({ ...staffForm, work_category: event.target.value })}>
                {WORK_CATEGORY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              人員狀態
              <select value={staffForm.employment_status} onChange={(event) => setStaffForm({ ...staffForm, employment_status: event.target.value })}>
                {EMPLOYMENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              {staffForm.employment_type === "兼職" ? "平日上班（選填）" : "預設上班（選填）"}
              <input type="time" lang="en-GB" step="900" value={staffForm.weekday_start_time} onChange={(event) => setStaffForm({ ...staffForm, weekday_start_time: formatTime24(event.target.value) })} />
            </label>
            <label>
              {staffForm.employment_type === "兼職" ? "平日下班（選填）" : "預設下班（選填）"}
              <input type="time" lang="en-GB" step="900" value={staffForm.weekday_end_time} onChange={(event) => setStaffForm({ ...staffForm, weekday_end_time: formatTime24(event.target.value) })} />
            </label>
            {staffForm.employment_type === "正職" && (
              <p className="form-help">未另排單日班次時，系統使用此預設上、下班時間；兩個欄位可同時留空。</p>
            )}
            {staffForm.employment_type === "兼職" && (
              <>
                <label>
                  假日上班（選填）
                  <input type="time" lang="en-GB" step="900" value={staffForm.holiday_start_time} onChange={(event) => setStaffForm({ ...staffForm, holiday_start_time: formatTime24(event.target.value) })} />
                </label>
                <label>
                  假日下班（選填）
                  <input type="time" lang="en-GB" step="900" value={staffForm.holiday_end_time} onChange={(event) => setStaffForm({ ...staffForm, holiday_end_time: formatTime24(event.target.value) })} />
                </label>
                <p className="form-help">未設定單日班次時，系統依平日／假日預設時間計算；四個欄位皆可留空。</p>
              </>
            )}
            <label>
              預估時薪成本（選填）
              {canViewSalary
                ? <input type="number" min="0" step="1" value={staffForm.estimated_hourly_cost} onChange={(event) => setStaffForm({ ...staffForm, estimated_hourly_cost: event.target.value })} />
                : currentRole === "coo" ? <button type="button" onClick={onUnlockSalary}>限時解鎖</button> : <span>已遮蔽</span>}
            </label>
            <label>
              預估月薪成本（選填）
              {canViewSalary ? <input type="number" min="0" step="1" value={staffForm.estimated_monthly_cost} onChange={(event) => setStaffForm({ ...staffForm, estimated_monthly_cost: event.target.value })} /> : <span>已遮蔽</span>}
            </label>
            <label>
              排序
              <input type="number" min="1" value={staffForm.sort_order} onChange={(event) => setStaffForm({ ...staffForm, sort_order: event.target.value })} />
            </label>
            <div className="staff-admin-actions">
              <button className="primary" type="submit">{staffForm.id ? "儲存修改" : "新增到門店"}</button>
              {staffForm.id && <button type="button" onClick={resetStaffForm}>取消編輯</button>}
            </div>
          </form>
        ) : (
          <p className="empty-text">此帳號可查看人員主檔；新增、修改與停用需由總部授權角色操作。</p>
        )}
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>門店</th><th>人員姓名</th><th>僱用型態</th><th>職稱</th><th>工作類別</th><th>人員狀態</th><th>預設工時</th><th>排序</th><th>操作</th></tr>
            </thead>
            <tbody>
              {staffRoster
                .slice()
                .sort((a, b) => canonicalStoreCode(a).localeCompare(canonicalStoreCode(b))
                  || staffRoleRank(a.role) - staffRoleRank(b.role)
                  || Number(a.sort_order || 999) - Number(b.sort_order || 999)
                  || a.employeeName.localeCompare(b.employeeName, "zh-Hant"))
                .map((row) => (
                  <tr key={row.id}>
                    <td><strong>{canonicalStoreCode(row)}</strong><span>{displayStoreName(row)}</span></td>
                    <td>{row.employeeName}</td>
                    <td>{row.employment_type}</td>
                    <td>{row.role}</td>
                    <td>{row.work_category}</td>
                    <td>{row.employment_status}</td>
                    <td>
                      {row.employment_type === "兼職" ? (
                        <>
                          <span>平日 {formatTime24(row.weekday_start_time || row.work_start_time) || "未填"}–{formatTime24(row.weekday_end_time || row.work_end_time) || "未填"}</span>
                          <span>假日 {formatTime24(row.holiday_start_time || row.weekday_start_time || row.work_start_time) || "未填"}–{formatTime24(row.holiday_end_time || row.weekday_end_time || row.work_end_time) || "未填"}</span>
                        </>
                      ) : (
                        <span>{formatTime24(row.weekday_start_time || row.work_start_time) || "未填"}–{formatTime24(row.weekday_end_time || row.work_end_time) || "未填"}</span>
                      )}
                    </td>
                    <td>{row.sort_order || "-"}</td>
                    <td>
                      {canEditStaff ? (
                        <div className="inline-actions">
                          <button type="button" onClick={() => editStaff(row)}>編輯</button>
                          <button type="button" onClick={() => deleteStaff(row)}>停用</button>
                        </div>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              {!staffRoster.length && <tr><td colSpan="9">尚無人員資料，請由總部新增。</td></tr>}
            </tbody>
          </table>
        </div>
        {canEditStaff && (
          <details className="settings-collapsible">
            <summary>停用人員（{inactiveStaff.length}）</summary>
            <div className="table-wrap compact">
              <table>
                <thead><tr><th>門店</th><th>人員姓名</th><th>職稱</th><th>工作類別</th><th>狀態</th><th>操作</th></tr></thead>
                <tbody>
                  {inactiveStaff.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{canonicalStoreCode(row)}</strong><span>{displayStoreName(row)}</span></td>
                      <td>{row.employeeName}</td>
                      <td>{row.role}</td>
                      <td>{row.work_category}</td>
                      <td>停用</td>
                      <td><button type="button" onClick={() => reactivateStaff(row)}>重新啟用</button></td>
                    </tr>
                  ))}
                  {!inactiveStaff.length && <tr><td colSpan="6">目前沒有停用人員。</td></tr>}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
      <details className="panel wide collapsible-form">
        <summary className="collapsible-form-summary">
          <div>
            <h2>人員調店與歸屬歷程</h2>
            <p>調店依生效日建立新版本；舊門店與歷史班表不會被覆蓋。</p>
          </div>
          <span className="collapsible-form-action">展開</span>
        </summary>
        {canEditStaff && (
          <form className="staff-admin-grid" onSubmit={submitStaffTransfer}>
            <label>
              人員
              <select value={transferForm.staff_id} onChange={(event) => setTransferForm({ ...transferForm, staff_id: event.target.value })} required>
                <option value="">請選擇</option>
                {staffRoster.map((row) => <option key={row.id} value={row.id}>{canonicalStoreCode(row)} {row.employeeName}</option>)}
              </select>
            </label>
            <label>
              新歸屬門店
              <select value={transferForm.store_code} onChange={(event) => setTransferForm({ ...transferForm, store_code: event.target.value })} required>
                <option value="">請選擇</option>
                {storeOptions.map((store) => <option key={store.store_code} value={store.store_code}>{store.store_code} {store.name}</option>)}
              </select>
            </label>
            <label>
              生效日
              <input type="date" value={transferForm.effective_from} onChange={(event) => setTransferForm({ ...transferForm, effective_from: event.target.value })} required />
            </label>
            <label>
              調店原因
              <input value={transferForm.reason} onChange={(event) => setTransferForm({ ...transferForm, reason: event.target.value })} placeholder="例如：營運人力調整" required />
            </label>
            <div className="staff-admin-actions"><button className="primary" type="submit">確認調店</button></div>
          </form>
        )}
        <div className="table-wrap compact">
          <table>
            <thead><tr><th>人員</th><th>歸屬門店</th><th>生效日</th><th>結束日</th><th>原因</th></tr></thead>
            <tbody>
              {staffAssignments.map((assignment) => {
                const person = staffRoster.find((row) => String(row.id) === String(assignment.staff_id));
                return <tr key={assignment.id}><td>{person?.employeeName || assignment.staff_id}</td><td>{assignment.store_code}</td><td>{assignment.effective_from}</td><td>{assignment.effective_to || "目前"}</td><td>{assignment.reason}</td></tr>;
              })}
              {!staffAssignments.length && <tr><td colSpan="5">尚無歸屬歷程；資料庫套用後會自動建立既有人員基準。</td></tr>}
            </tbody>
          </table>
        </div>
      </details>
      <details className="panel wide collapsible-form">
        <summary className="collapsible-form-summary">
          <div><h2>工作崗位與員工技能</h2><p>每人可具備多項技能，主要崗位用於排班缺口判斷。</p></div>
          <span className="collapsible-form-action">展開</span>
        </summary>
        {canEditStaff && (
          <form className="staff-admin-grid" onSubmit={submitStaffSkills}>
            <label>
              人員
              <select value={skillForm.staff_id} onChange={(event) => {
                const staffId = event.target.value;
                const current = staffSkills.filter((row) => row.staff_id === staffId);
                setSkillForm({ staff_id: staffId, positions: current.map((row) => row.position_code), primary_position: current.find((row) => row.is_primary)?.position_code || "" });
              }} required>
                <option value="">請選擇</option>
                {staffRoster.map((row) => <option key={row.id} value={row.id}>{canonicalStoreCode(row)} {row.employeeName}</option>)}
              </select>
            </label>
            <div className="wide-field staff-chip-list">
              {STAFF_POSITION_OPTIONS.map((position) => (
                <label key={position} className="check-row"><input type="checkbox" checked={skillForm.positions.includes(position)} onChange={(event) => {
                  const positions = event.target.checked ? [...skillForm.positions, position] : skillForm.positions.filter((item) => item !== position);
                  setSkillForm({ ...skillForm, positions, primary_position: positions.includes(skillForm.primary_position) ? skillForm.primary_position : positions[0] || "" });
                }} /> {position}</label>
              ))}
            </div>
            <label>
              主要崗位
              <select value={skillForm.primary_position} onChange={(event) => setSkillForm({ ...skillForm, primary_position: event.target.value })} required>
                <option value="">請選擇</option>
                {skillForm.positions.map((position) => <option key={position} value={position}>{position}</option>)}
              </select>
            </label>
            <div className="staff-admin-actions"><button className="primary" type="submit">儲存技能</button></div>
          </form>
        )}
        <div className="table-wrap compact"><table><thead><tr><th>人員</th><th>主要崗位</th><th>其他技能</th></tr></thead><tbody>
          {staffRoster.filter((person) => staffSkills.some((skill) => skill.staff_id === person.id)).map((person) => {
            const skills = staffSkills.filter((skill) => skill.staff_id === person.id);
            return <tr key={person.id}><td>{person.employeeName}</td><td>{skills.find((skill) => skill.is_primary)?.position_code || "-"}</td><td>{skills.filter((skill) => !skill.is_primary).map((skill) => skill.position_code).join("、") || "-"}</td></tr>;
          })}
          {!staffSkills.length && <tr><td colSpan="3">尚未設定員工技能。</td></tr>}
        </tbody></table></div>
      </details>
<section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>各店營業與尖峰時間</h2>
            <p>用於排班、交接、營收回報時間與督導巡店節奏。</p>
          </div>
        </div>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>門店</th><th>營業時間</th><th>中午尖峰</th><th>晚上尖峰</th><th>值班人員</th><th>回報節點</th><th>管理狀態</th></tr>
            </thead>
            <tbody>
              {storeHours.map((row) => (
                <tr key={row.storeName}>
                  <td><strong>{row.storeName}</strong></td>
                  <td>{row.open_time} - {row.close_time}</td>
                  <td>{row.lunch_peak}</td>
                  <td>{row.dinner_peak}</td>
                  <td>{row.duty_staff} 人</td>
                  <td>{row.lunch_report_time} / {row.dinner_report_time} / {row.close_report_time}</td>
                  <td><span className={`chip ${activeStoreNames.includes(row.storeName) ? "good" : "warn"}`}>{activeStoreNames.includes(row.storeName) ? "營運中" : "暫停營業"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="panel collapsible-form">
        <summary className="collapsible-form-summary">
          <div>
            <h2>薪資職級設定</h2>
            <p>作為招募、升遷、績效獎金與人事成本控管基準。</p>
          </div>
          <span className="collapsible-form-action">展開</span>
        </summary>
        <div className="table-wrap compact">
          <table>
            <thead>
              <tr><th>職位</th><th>底薪</th><th>用工型態</th><th>保險</th><th>績效獎金</th><th>月休</th><th>實際工時</th><th>現有人數</th></tr>
            </thead>
            <tbody>
              {byRole.map((row) => (
                <tr key={row.role}>
                  <td><strong>{row.role}</strong></td>
                  <td>{row.base_salary}</td>
                  <td>{row.employment_type}</td>
                  <td>{row.insurance_note || "-"}</td>
                  <td>{row.performance_bonus || "-"}</td>
                  <td>{row.monthly_rest_days || "-"}</td>
                  <td>{row.actual_work_hours ? `${row.actual_work_hours} 小時` : "-"}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{selectedStoreName} 人員配置</h2>
            <p>選擇左側門店後，可檢查該店店長、副店長與各職級配置。</p>
          </div>
        </div>
        <div className="staff-chip-list">
          {rosterByStore.slice().sort((a, b) => staffRoleRank(a.role) - staffRoleRank(b.role) || a.employeeName.localeCompare(b.employeeName, "zh-Hant")).map((row) => (
            <div className="staff-chip" key={row.id}>
              <strong>{row.employeeName}</strong>
              <span>{row.role}</span>
            </div>
          ))}
          {!rosterByStore.length && <p className="empty-text">此門店目前無人員資料，需由總部補齊。</p>}
        </div>
      </section>
    </div>
  );
}

export { HrMasterModule };
