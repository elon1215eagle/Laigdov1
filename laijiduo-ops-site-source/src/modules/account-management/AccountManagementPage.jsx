import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCrossAppAccounts } from "./data/accountManagementRepository.js";
import {
  ACCOUNT_STATUS_LABELS,
  groupAccountSummaries,
  summarizeAccounts,
} from "./domain/accountSummary.js";
import "./AccountManagement.css";
import HqShortLoginSettings from "./HqShortLoginSettings.jsx";

function formatDateTime(value) {
  if (!value) return "尚未登入";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function AccountManagementPage({ profile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await fetchCrossAppAccounts());
    } catch (loadError) {
      setError(loadError.message || "帳號資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => summarizeAccounts(rows), [rows]);
  const groups = useMemo(() => groupAccountSummaries(rows), [rows]);

  return (
    <section className="panel account-management-page">
      <div className="account-management-heading">
        <div>
          <h2>跨 APP 帳號管理</h2>
          <p>集中檢查帳號所屬系統、角色與門店綁定；本頁不顯示密碼，也不互授不同 APP 的權限。</p>
        </div>
        <button type="button" onClick={load} disabled={loading}>{loading ? "載入中" : "重新整理"}</button>
      </div>

      {error && <div className="account-management-error" role="alert">{error}</div>}
      {profile?.role === "coo" && profile?.is_active && <HqShortLoginSettings />}

      <div className="account-management-kpis">
        <Metric label="帳號歸屬" value={`${summary.total} 筆`} />
        <Metric label="正常" value={`${summary.normal} 筆`} tone="normal" />
        <Metric label="待補設定" value={`${summary.pending} 筆`} tone={summary.pending ? "warning" : "normal"} />
        <Metric label="未分類" value={`${summary.unclassified} 筆`} tone={summary.unclassified ? "danger" : "normal"} />
        <Metric label="停用" value={`${summary.inactive} 筆`} />
      </div>

      <div className="account-management-notice">
        <strong>權限隔離正常運作</strong>
        <span>Auth 只負責登入身分；營運、加盟業績與加盟叫貨仍分別依各自權限資料判斷。</span>
      </div>

      {groups.map((group) => (
        <details className="account-group" open key={group.appCode}>
          <summary><strong>{group.label}</strong><span>{group.rows.length} 筆</span></summary>
          <div className="account-table-wrap">
            <table className="account-table">
              <thead><tr><th>帳號</th><th>角色</th><th>綁定門店</th><th>權限資料</th><th>狀態</th><th>最近登入</th></tr></thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={`${row.userId}-${row.appCode}`}>
                    <td data-label="帳號"><strong>{row.email}</strong></td>
                    <td data-label="角色">{row.roleLabel}</td>
                    <td data-label="綁定門店">{row.storeCode ? `${row.storeCode} ${row.storeName}` : "-"}</td>
                    <td data-label="權限資料">{row.appCode === "unclassified" ? "尚未指定 APP" : row.profileComplete ? "完整" : "缺少所屬 APP 權限資料"}</td>
                    <td data-label="狀態"><span className={`account-status ${row.status}`}>{ACCOUNT_STATUS_LABELS[row.status] || row.status}</span></td>
                    <td data-label="最近登入">{formatDateTime(row.lastSignInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!group.rows.length && <div className="account-empty">目前沒有此類帳號</div>}
          </div>
        </details>
      ))}
    </section>
  );
}

function Metric({ label, value, tone = "" }) {
  return <div className={`account-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
