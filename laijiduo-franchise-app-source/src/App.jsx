import { useEffect, useMemo, useState } from "react";
import {
  clearDailyData,
  createExpense,
  deleteExpense,
  fetchDailyExpenses,
  fetchDailyReport,
  fetchExpenses,
  fetchFranchiseStores,
  fetchMonthlySummary,
  getSessionProfile,
  hasSupabaseConfig,
  signIn,
  signOut,
  upsertDailyReport,
} from "./lib/franchiseApi";

const taipeiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

function todayInTaipei() {
  const parts = taipeiFormatter.formatToParts(new Date());
  const part = (type) => Number(parts.find((item) => item.type === type)?.value || 0);
  const dateAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"));
  const businessDate = part("hour") < 6 ? new Date(dateAsUtc - 86400000) : new Date(dateAsUtc);
  return businessDate.toISOString().slice(0, 10);
}

const today = todayInTaipei();
const currentMonth = today.slice(0, 7);
const expenseCategories = ["食材", "包材", "人事", "水電", "維修", "租金", "行銷", "雜支", "其他"];
const paymentMethods = ["現金", "轉帳", "刷卡", "行動支付", "其他"];
const demoProfile = {
  full_name: "加盟店管理者",
  role: "franchise_owner",
  franchise_store_id: "demo-franchise-store",
};

function money(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function numberValue(value) {
  return value === "" || value === null || value === undefined ? 0 : Number(value);
}

function monthRange(month) {
  const start = `${month}-01`;
  const date = new Date(`${start}T00:00:00Z`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function roleLabel(role) {
  if (role === "franchise_admin") return "總部";
  if (role === "franchise_investor") return "股東";
  return "加盟店";
}

export function App() {
  const [profile, setProfile] = useState(null);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [activeTab, setActiveTab] = useState("sales");
  const [reportDate, setReportDate] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState({ reports: [] });
  const [expenses, setExpenses] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const canWrite = profile?.role !== "franchise_investor";

  function notify(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2000);
  }

  async function refresh(nextProfile = profile, nextStoreId = selectedStoreId, nextMonth = month) {
    const storeRows = await fetchFranchiseStores();
    const role = nextProfile?.role || "franchise_owner";
    const visibleStores = role === "franchise_owner"
      ? storeRows.filter((store) => store.id === nextProfile?.franchise_store_id)
      : storeRows;
    const resolvedStoreId = role === "franchise_owner"
      ? visibleStores[0]?.id || ""
      : nextStoreId || visibleStores[0]?.id || "";
    const range = monthRange(nextMonth);
    const [summaryRows, expenseRows] = await Promise.all([
      fetchMonthlySummary({ storeId: resolvedStoreId, from: range.start, to: range.end }),
      fetchExpenses({ storeId: resolvedStoreId, from: range.start, to: range.end }),
    ]);
    setStores(visibleStores);
    setSelectedStoreId(resolvedStoreId);
    setSummary(summaryRows);
    setExpenses(expenseRows);
  }

  useEffect(() => {
    async function boot() {
      try {
        const sessionProfile = hasSupabaseConfig ? await getSessionProfile() : demoProfile;
        setProfile(sessionProfile);
        if (sessionProfile?.role === "franchise_investor") setActiveTab("summary");
        if (sessionProfile) await refresh(sessionProfile);
      } catch (error) {
        notify(`載入失敗：${error.message}`);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  async function handleLogin(email, password) {
    setLoading(true);
    try {
      await signIn(email, password);
      const sessionProfile = await getSessionProfile();
      setProfile(sessionProfile);
      setActiveTab(sessionProfile?.role === "franchise_investor" ? "summary" : "sales");
      await refresh(sessionProfile);
      notify("登入完成");
    } catch (error) {
      notify(`登入失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    setProfile(null);
    setStores([]);
    setSelectedStoreId("");
  }

  async function handleStoreChange(storeId) {
    setSelectedStoreId(storeId);
    await refresh(profile, storeId, month);
  }

  async function handleMonthChange(nextMonth) {
    setMonth(nextMonth);
    await refresh(profile, selectedStoreId, nextMonth);
  }

  async function saveDailyReport(form) {
    if (!canWrite) {
      notify("此帳號為唯讀權限，不能送出營收。");
      return false;
    }
    if (!selectedStoreId) {
      notify("此帳號尚未綁定加盟店，請聯繫總部設定。");
      return false;
    }
    try {
      await upsertDailyReport({
        franchise_store_id: selectedStoreId,
        report_date: form.report_date,
        opened_to_1400_revenue: numberValue(form.opened_to_1400_revenue),
        revenue_1400_to_1900: numberValue(form.revenue_1400_to_1900),
        full_day_revenue: numberValue(form.full_day_revenue),
        cash_revenue: numberValue(form.cash_revenue),
        delivery_revenue: numberValue(form.delivery_revenue),
        other_revenue: numberValue(form.other_revenue),
        note: form.note || "",
      });
      await refresh(profile, selectedStoreId, month);
      notify("每日營收已送出");
      return true;
    } catch (error) {
      notify(`送出失敗：${error.message}`);
      return false;
    }
  }

  async function saveExpense(form) {
    if (!canWrite) {
      notify("此帳號為唯讀權限，不能儲存支出。");
      return false;
    }
    if (!selectedStoreId) {
      notify("此帳號尚未綁定加盟店，請聯繫總部設定。");
      return false;
    }
    try {
      await createExpense({
        franchise_store_id: selectedStoreId,
        expense_date: form.expense_date,
        category: form.category,
        amount: numberValue(form.amount),
        payment_method: form.payment_method,
        vendor: form.vendor || "",
        receipt_note: form.receipt_note || "",
        note: form.note || "",
      });
      await refresh(profile, selectedStoreId, month);
      notify("支出已儲存");
      return true;
    } catch (error) {
      notify(`儲存失敗：${error.message}`);
      return false;
    }
  }

  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const totals = useMemo(() => buildTotals(summary.reports, expenses), [summary, expenses]);
  const isAdmin = profile?.role === "franchise_admin";

  if (loading) return <main className="loading-screen">載入中...</main>;
  if (!profile) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">加</div>
          <div>
            <strong>萊吉多加盟店 APP</strong>
            <span>每日營收與支出回報</span>
          </div>
        </div>
        <nav>
          {canWrite && <button className={activeTab === "sales" ? "active" : ""} onClick={() => setActiveTab("sales")}>營收回報</button>}
          {canWrite && <button className={activeTab === "expenses" ? "active" : ""} onClick={() => setActiveTab("expenses")}>支出登錄</button>}
          <button className={activeTab === "summary" ? "active" : ""} onClick={() => setActiveTab("summary")}>月彙總</button>
          {isAdmin && <button className={activeTab === "admin" ? "active" : ""} onClick={() => setActiveTab("admin")}>總部管理</button>}
        </nav>
        <div className="user-box">
          <span>{roleLabel(profile.role)}｜{profile.full_name || "加盟店帳號"}</span>
          <strong>{selectedStore?.name || "尚未綁定門店"}</strong>
          <button onClick={handleSignOut}>登出</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p>營業日：{reportDate}</p>
            <h1>加盟店每日回報</h1>
          </div>
          <div className="toolbar">
            <label>
              月份
              <input type="month" value={month} onChange={(event) => handleMonthChange(event.target.value)} />
            </label>
            <label>
              加盟店
              <select value={selectedStoreId} onChange={(event) => handleStoreChange(event.target.value)} disabled={stores.length <= 1}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.store_code} {store.name}</option>)}
                {!stores.length && <option value="">未綁定</option>}
              </select>
            </label>
          </div>
        </header>

        <section className="kpi-grid">
          <Metric label="本月營收" value={money(totals.revenue)} />
          <Metric label="本月支出" value={money(totals.expense)} tone="warn" />
          <Metric label="本月淨額" value={money(totals.net)} tone={totals.net >= 0 ? "good" : "bad"} />
          <Metric label="已回報天數" value={`${summary.reports.length} 天`} />
        </section>

        {activeTab === "sales" && canWrite && <DailySalesForm reportDate={reportDate} setReportDate={setReportDate} onSave={saveDailyReport} />}
        {activeTab === "expenses" && canWrite && <ExpenseForm onSave={saveExpense} />}
        {activeTab === "summary" && <SummaryView expenses={expenses} reports={summary.reports} totals={totals} />}
        {activeTab === "admin" && isAdmin && (
          <AdminDailyControl
            selectedStoreId={selectedStoreId}
            stores={stores}
            onRefresh={() => refresh(profile, selectedStoreId, month)}
            notify={notify}
          />
        )}
      </main>
      {message && <div className="toast" role="alert">{message}</div>}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand-mark">加</div>
        <h1>萊吉多加盟店 APP</h1>
        <p>加盟店每日填寫 14:00、19:00、打烊營收與支出，總部統一查看。</p>
        <label>帳號<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>密碼<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button onClick={() => onLogin(email, password)}>登入</button>
      </section>
    </main>
  );
}

function DailySalesForm({ reportDate, setReportDate, onSave }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    report_date: reportDate,
    opened_to_1400_revenue: "",
    revenue_1400_to_1900: "",
    full_day_revenue: "",
    cash_revenue: "",
    delivery_revenue: "",
    other_revenue: "",
    note: "",
  });
  const closingRevenue = Math.max(0, numberValue(form.full_day_revenue) - numberValue(form.opened_to_1400_revenue) - numberValue(form.revenue_1400_to_1900));
  const invalid = numberValue(form.full_day_revenue) < numberValue(form.opened_to_1400_revenue) + numberValue(form.revenue_1400_to_1900);

  function patch(patchValue) {
    const next = { ...form, ...patchValue };
    setForm(next);
    if (patchValue.report_date) setReportDate(patchValue.report_date);
  }

  async function submit() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <section className="panel form-panel">
      <div className="panel-head">
        <div>
          <h2>每日營收回報</h2>
          <p>輸入 14:00 前、14:00-19:00、打烊總營收，系統自動計算 19:00-打烊營收。</p>
        </div>
      </div>
      <div className="form-grid">
        <label>日期<input type="date" max={today} value={form.report_date} onChange={(event) => patch({ report_date: event.target.value })} /></label>
        <NumberInput label="14:00 前營收" value={form.opened_to_1400_revenue} onChange={(value) => patch({ opened_to_1400_revenue: value })} />
        <NumberInput label="14:00-19:00 營收" value={form.revenue_1400_to_1900} onChange={(value) => patch({ revenue_1400_to_1900: value })} />
        <NumberInput label="打烊總營收" value={form.full_day_revenue} onChange={(value) => patch({ full_day_revenue: value })} />
        <div className="calculated">
          <span>19:00-打烊自動計算</span>
          <strong>{money(closingRevenue)}</strong>
        </div>
        <NumberInput label="現金收入" value={form.cash_revenue} onChange={(value) => patch({ cash_revenue: value })} />
        <NumberInput label="外送 / 平台收入" value={form.delivery_revenue} onChange={(value) => patch({ delivery_revenue: value })} />
        <NumberInput label="其他收入" value={form.other_revenue} onChange={(value) => patch({ other_revenue: value })} />
        <label className="wide">備註<textarea value={form.note} onChange={(event) => patch({ note: event.target.value })} /></label>
      </div>
      {invalid && <div className="alert danger">打烊總營收不可小於 14:00 前與 14:00-19:00 的合計。</div>}
      <button className="primary" disabled={saving || invalid} onClick={submit}>{saving ? "送出中..." : "送出每日營收"}</button>
    </section>
  );
}

function ExpenseForm({ onSave }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    expense_date: today,
    category: "食材",
    amount: "",
    payment_method: "現金",
    vendor: "",
    receipt_note: "",
    note: "",
  });
  const patch = (patchValue) => setForm((current) => ({ ...current, ...patchValue }));
  async function submit() {
    setSaving(true);
    const success = await onSave(form);
    setSaving(false);
    if (success) setForm((current) => ({ ...current, amount: "", vendor: "", receipt_note: "", note: "" }));
  }
  return (
    <section className="panel form-panel">
      <div className="panel-head">
        <div>
          <h2>每日支出登錄</h2>
          <p>支出用分類方式紀錄，方便總部每月比對營收、費用與淨額。</p>
        </div>
      </div>
      <div className="form-grid">
        <label>日期<input type="date" max={today} value={form.expense_date} onChange={(event) => patch({ expense_date: event.target.value })} /></label>
        <label>分類<select value={form.category} onChange={(event) => patch({ category: event.target.value })}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <NumberInput label="金額" value={form.amount} onChange={(value) => patch({ amount: value })} />
        <label>付款方式<select value={form.payment_method} onChange={(event) => patch({ payment_method: event.target.value })}>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>廠商 / 對象<input value={form.vendor} onChange={(event) => patch({ vendor: event.target.value })} /></label>
        <label>憑證備註<input value={form.receipt_note} onChange={(event) => patch({ receipt_note: event.target.value })} /></label>
        <label className="wide">備註<textarea value={form.note} onChange={(event) => patch({ note: event.target.value })} /></label>
      </div>
      <button className="primary" disabled={saving || !form.amount} onClick={submit}>{saving ? "儲存中..." : "儲存支出"}</button>
    </section>
  );
}

function AdminDailyControl({ selectedStoreId, stores, onRefresh, notify }) {
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dailyExpenses, setDailyExpenses] = useState([]);
  const [confirmText, setConfirmText] = useState("");
  const [reportForm, setReportForm] = useState(emptyReportForm(today));
  const [expenseForm, setExpenseForm] = useState({
    expense_date: today,
    category: "食材",
    amount: "",
    payment_method: "現金",
    vendor: "",
    receipt_note: "",
    note: "",
  });
  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const closingRevenue = Math.max(
    0,
    numberValue(reportForm.full_day_revenue) -
      numberValue(reportForm.opened_to_1400_revenue) -
      numberValue(reportForm.revenue_1400_to_1900),
  );
  const invalid = numberValue(reportForm.full_day_revenue) < numberValue(reportForm.opened_to_1400_revenue) + numberValue(reportForm.revenue_1400_to_1900);

  async function loadDailyData(nextDate = date) {
    if (!selectedStoreId) {
      notify("請先選擇加盟店。");
      return;
    }
    setLoading(true);
    try {
      const [report, expenses] = await Promise.all([
        fetchDailyReport({ storeId: selectedStoreId, date: nextDate }),
        fetchDailyExpenses({ storeId: selectedStoreId, date: nextDate }),
      ]);
      setReportForm(report ? reportToForm(report) : emptyReportForm(nextDate));
      setExpenseForm((current) => ({ ...current, expense_date: nextDate }));
      setDailyExpenses(expenses);
      notify(report || expenses.length ? "當日資料已載入" : "當日尚無資料，可直接新增");
    } catch (error) {
      notify(`載入失敗：${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDateChange(nextDate) {
    setDate(nextDate);
    setConfirmText("");
    await loadDailyData(nextDate);
  }

  function patchReport(patchValue) {
    setReportForm((current) => ({ ...current, ...patchValue }));
  }

  function patchExpense(patchValue) {
    setExpenseForm((current) => ({ ...current, ...patchValue }));
  }

  async function saveReport() {
    if (!selectedStoreId) {
      notify("請先選擇加盟店。");
      return;
    }
    setSaving(true);
    try {
      await upsertDailyReport({
        franchise_store_id: selectedStoreId,
        report_date: date,
        opened_to_1400_revenue: numberValue(reportForm.opened_to_1400_revenue),
        revenue_1400_to_1900: numberValue(reportForm.revenue_1400_to_1900),
        full_day_revenue: numberValue(reportForm.full_day_revenue),
        cash_revenue: numberValue(reportForm.cash_revenue),
        delivery_revenue: numberValue(reportForm.delivery_revenue),
        other_revenue: numberValue(reportForm.other_revenue),
        note: reportForm.note || "",
      });
      await loadDailyData(date);
      await onRefresh();
      notify("當日營收已修改完成");
    } catch (error) {
      notify(`修改失敗：${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function addExpense() {
    if (!selectedStoreId) {
      notify("請先選擇加盟店。");
      return;
    }
    if (!expenseForm.amount) {
      notify("請輸入支出金額。");
      return;
    }
    setSaving(true);
    try {
      await createExpense({
        franchise_store_id: selectedStoreId,
        expense_date: date,
        category: expenseForm.category,
        amount: numberValue(expenseForm.amount),
        payment_method: expenseForm.payment_method,
        vendor: expenseForm.vendor || "",
        receipt_note: expenseForm.receipt_note || "",
        note: expenseForm.note || "",
      });
      setExpenseForm((current) => ({ ...current, amount: "", vendor: "", receipt_note: "", note: "" }));
      await loadDailyData(date);
      await onRefresh();
      notify("當日支出已新增");
    } catch (error) {
      notify(`新增支出失敗：${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(expenseId) {
    setSaving(true);
    try {
      await deleteExpense(expenseId);
      await loadDailyData(date);
      await onRefresh();
      notify("單筆支出已刪除");
    } catch (error) {
      notify(`刪除失敗：${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function clearSelectedDay() {
    if (confirmText !== "CLEAR") {
      notify("請輸入 CLEAR 才能清除當日資料。");
      return;
    }
    if (!selectedStoreId) {
      notify("請先選擇加盟店。");
      return;
    }
    setSaving(true);
    try {
      await clearDailyData({ storeId: selectedStoreId, date });
      setConfirmText("");
      await loadDailyData(date);
      await onRefresh();
      notify("當日營收與支出已清除");
    } catch (error) {
      notify(`清除失敗：${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel form-panel">
      <div className="panel-head">
        <div>
          <h2>總部當日資料管理</h2>
          <p>限總部使用，可針對選定加盟店與日期載入、修改或清除當日資料。</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <label>
          管理門店
          <input value={selectedStore ? `${selectedStore.store_code} ${selectedStore.name}` : "尚未選擇"} disabled />
        </label>
        <label>
          管理日期
          <input type="date" max={today} value={date} onChange={(event) => handleDateChange(event.target.value)} />
        </label>
        <button onClick={() => loadDailyData(date)} disabled={loading || !selectedStoreId}>
          {loading ? "載入中..." : "載入當日資料"}
        </button>
      </div>

      <div className="admin-section">
        <h3>當日營收修改</h3>
        <div className="form-grid">
          <NumberInput label="14:00 前營收" value={reportForm.opened_to_1400_revenue} onChange={(value) => patchReport({ opened_to_1400_revenue: value })} />
          <NumberInput label="14:00-19:00 營收" value={reportForm.revenue_1400_to_1900} onChange={(value) => patchReport({ revenue_1400_to_1900: value })} />
          <NumberInput label="打烊總營收" value={reportForm.full_day_revenue} onChange={(value) => patchReport({ full_day_revenue: value })} />
          <div className="calculated">
            <span>19:00-打烊自動計算</span>
            <strong>{money(closingRevenue)}</strong>
          </div>
          <NumberInput label="現金收入" value={reportForm.cash_revenue} onChange={(value) => patchReport({ cash_revenue: value })} />
          <NumberInput label="外送 / 平台收入" value={reportForm.delivery_revenue} onChange={(value) => patchReport({ delivery_revenue: value })} />
          <NumberInput label="其他收入" value={reportForm.other_revenue} onChange={(value) => patchReport({ other_revenue: value })} />
          <label className="wide">備註<textarea value={reportForm.note} onChange={(event) => patchReport({ note: event.target.value })} /></label>
        </div>
        {invalid && <div className="alert danger">打烊總營收不可小於 14:00 前與 14:00-19:00 的合計。</div>}
        <button className="primary" disabled={saving || invalid || !selectedStoreId} onClick={saveReport}>
          {saving ? "處理中..." : "儲存當日營收修改"}
        </button>
      </div>

      <div className="admin-section">
        <h3>當日支出修改</h3>
        <div className="form-grid">
          <label>分類<select value={expenseForm.category} onChange={(event) => patchExpense({ category: event.target.value })}>{expenseCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <NumberInput label="金額" value={expenseForm.amount} onChange={(value) => patchExpense({ amount: value })} />
          <label>付款方式<select value={expenseForm.payment_method} onChange={(event) => patchExpense({ payment_method: event.target.value })}>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>廠商 / 對象<input value={expenseForm.vendor} onChange={(event) => patchExpense({ vendor: event.target.value })} /></label>
          <label>憑證備註<input value={expenseForm.receipt_note} onChange={(event) => patchExpense({ receipt_note: event.target.value })} /></label>
          <label className="wide">備註<textarea value={expenseForm.note} onChange={(event) => patchExpense({ note: event.target.value })} /></label>
        </div>
        <button className="primary" disabled={saving || !selectedStoreId || !expenseForm.amount} onClick={addExpense}>
          新增當日支出
        </button>
        <div className="table-wrap admin-table">
          <table>
            <thead><tr><th>分類</th><th>金額</th><th>付款</th><th>廠商</th><th>備註</th><th>操作</th></tr></thead>
            <tbody>
              {dailyExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.category}</td>
                  <td>{money(expense.amount)}</td>
                  <td>{expense.payment_method}</td>
                  <td>{expense.vendor || "-"}</td>
                  <td>{expense.note || expense.receipt_note || "-"}</td>
                  <td><button className="danger-button" disabled={saving} onClick={() => removeExpense(expense.id)}>刪除</button></td>
                </tr>
              ))}
              {!dailyExpenses.length && <tr><td colSpan="6">當日尚無支出資料</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="danger-zone">
        <h3>清除當日資料</h3>
        <p>會清除選定門店在選定日期的營收回報與全部支出，不影響其他日期。</p>
        <div className="admin-toolbar">
          <label>
            確認文字
            <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="輸入 CLEAR" />
          </label>
          <button className="danger-button" disabled={saving || confirmText !== "CLEAR" || !selectedStoreId} onClick={clearSelectedDay}>
            清除當日資料
          </button>
        </div>
      </div>
    </section>
  );
}

function SummaryView({ reports, expenses, totals }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>月彙總</h2>
          <p>彙整本月營收、支出與淨額，提供總部與股東追蹤加盟店營運狀況。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>類型</th><th>日期</th><th>項目</th><th>金額</th><th>備註</th></tr></thead>
          <tbody>
            {reports.map((row) => (
              <tr key={`report-${row.id || row.report_date}`}>
                <td>營收</td>
                <td>{row.report_date}</td>
                <td>打烊總營收</td>
                <td>{money(row.full_day_revenue)}</td>
                <td>{row.note || "-"}</td>
              </tr>
            ))}
            {expenses.map((row) => (
              <tr key={`expense-${row.id}`}>
                <td>支出</td>
                <td>{row.expense_date}</td>
                <td>{row.category}</td>
                <td>{money(row.amount)}</td>
                <td>{row.note || row.vendor || "-"}</td>
              </tr>
            ))}
            {!reports.length && !expenses.length && <tr><td colSpan="5">本月尚無資料</td></tr>}
          </tbody>
          <tfoot>
            <tr><td>合計</td><td>-</td><td>淨額</td><td>{money(totals.net)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function NumberInput({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input type="number" inputMode="numeric" min="0" step="1" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildTotals(reports, expenses) {
  const revenue = reports.reduce((sum, row) => sum + Number(row.full_day_revenue || 0), 0);
  const expense = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { revenue, expense, net: revenue - expense };
}

function emptyReportForm(date) {
  return {
    report_date: date,
    opened_to_1400_revenue: "",
    revenue_1400_to_1900: "",
    full_day_revenue: "",
    cash_revenue: "",
    delivery_revenue: "",
    other_revenue: "",
    note: "",
  };
}

function reportToForm(report) {
  return {
    report_date: report.report_date,
    opened_to_1400_revenue: report.opened_to_1400_revenue ?? "",
    revenue_1400_to_1900: report.revenue_1400_to_1900 ?? "",
    full_day_revenue: report.full_day_revenue ?? "",
    cash_revenue: report.cash_revenue ?? "",
    delivery_revenue: report.delivery_revenue ?? "",
    other_revenue: report.other_revenue ?? "",
    note: report.note || "",
  };
}
