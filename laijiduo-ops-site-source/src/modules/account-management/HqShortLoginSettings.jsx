import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const actions = { reset: "重設短密碼", enable: "啟用短登入", disable: "停用短登入", login: "登入成功", login_failed: "登入失敗", initialize: "建立短登入" };
export default function HqShortLoginSettings() {
  const [data, setData] = useState({ accounts: [], events: [] });
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState("reset");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const result = await supabase.rpc("hq_short_list");
    if (result.error) throw result.error;
    setData(result.data);
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);
  async function save(event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("hq_short_manage", { p_alias: selected.alias, p_action: action, p_reason: reason, p_password: action === "reset" ? password : null });
      if (error) throw error;
      setPassword(""); setSelected(null); setReason("");
      await load(); setMessage("已儲存，原 Email 密碼未變更。");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <details className="account-group">
    <summary><strong>總部短帳號設定</strong><span>COO 專用</span></summary>
    <p>停用僅阻止新的短帳號登入，不影響原 Email 登入或已登入的工作階段。</p>
    {message && <p role="status">{message}</p>}
    <div className="account-table-wrap"><table className="account-table">
      <thead><tr><th>短帳號</th><th>原帳號</th><th>狀態</th><th>最近短登入</th><th>操作</th></tr></thead>
      <tbody>{data.accounts.map((row) => <tr key={row.alias}>
        <td data-label="短帳號">{row.alias}</td><td data-label="原帳號">{row.email}</td>
        <td data-label="狀態">{!row.enabled ? "停用" : row.blocked_until && new Date(row.blocked_until) > new Date() ? "暫時鎖定" : "啟用"}</td>
        <td data-label="最近短登入">{row.last_login_at ? new Date(row.last_login_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "尚未使用"}</td>
        <td data-label="操作"><button type="button" onClick={() => { setSelected(row); setAction("reset"); setPassword(""); setReason(""); }}>設定</button></td>
      </tr>)}</tbody>
    </table></div>
    {selected && <form onSubmit={save} className="hq-short-form">
      <h3>{selected.alias} 短登入設定</h3>
      <label>動作<select value={action} onChange={(e) => setAction(e.target.value)}>{["reset", selected.enabled ? "disable" : "enable"].map((key) => <option key={key} value={key}>{actions[key]}</option>)}</select></label>
      {action === "reset" && <label>新短密碼<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
      <label>調整原因<input required minLength={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button disabled={busy} type="submit">{busy ? "儲存中" : "確認儲存"}</button>
      <button disabled={busy} type="button" onClick={() => { setSelected(null); setPassword(""); }}>取消</button>
    </form>}
    <details><summary>最近操作紀錄</summary>{data.events.map((event) => <p key={event.id}>{new Date(event.created_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} · {event.alias} · {actions[event.action] || event.action} · {event.actor || "系統"} · {event.reason}</p>)}</details>
  </details>;
}
