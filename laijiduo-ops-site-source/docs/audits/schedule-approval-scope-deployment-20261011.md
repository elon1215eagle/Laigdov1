# 排班核准範圍修補：正式部署紀錄

日期：2026-10-11（台北時間）；套用時間：09:37:30（依 Migration 版本時間）。

## 結論

已依 Elon「核准，審核通過後套用」的授權，完成單一函數人工複核並正式套用。
正式專案：`wfhaqnicwqjfgzjcfmsq`。
新增 Migration：`20261011013730_fix_schedule_approval_consumption_scope`。

只替換 `private.consume_schedule_change_approval()`，讓核准消耗與現有寫入授權使用相同的門店管理範圍。阻止其他無權管理門店的匹配核准被連帶關閉；保留合法自店與共用排班群組的行為。

## 審核依據

- 候選來源：提交 `14f7394bdbc268f984f6f50f18ca685723a596fb`；候選與回復檔已在隔離資料庫驗證。
- 本輪資料庫測試 54/54 通過；該提交先前全套測試 359/359、建置通過。未改應用程式程式碼，不需重新部署前端。
- 正式目錄確認：profiles／stores 欄位型別相容；有效操作人檢查與 current_profile_role 一致。
- 正式 store_can_manage_schedule_entry 已使用同一個 store_owns_schedule_request_scope 判斷，因此本修補不自行建立新群組規則。
- 保留函數名稱、參數、回傳型別、SECURITY DEFINER、search_path、owner、ACL 與兩個觸發器綁定。
- SQL 內建原版本／已修版本與範圍 helper 的防漂移檢查。
- 自動安全風險工具受 Windows Application Control 阻擋，未取得其審核結果；沒有繞過作業系統政策。本次通過的是人工限定範圍複核及隔離測試，不是自動安全工具認證。

## 正式套用與驗證

使用 Supabase apply_migration 套用單一候選；回傳 success=true。
唯讀核對 Migration 歷史，確認新版本及記錄 SQL 與候選一致；沒有重播、覆寫或修復舊 Migration 歷史。

| 項目 | 結果 |
| --- | --- |
| 目標函數內容 MD5（忽略 CR） | f6c9a497e33975e911b5ed70b049b309 → 92f1ba305489d5f4f14cbeafd5c50f3a |
| 目標函數 OID | 20392，未改變 |
| 既有授權、owner、search_path、安全屬性 | 前後一致 |
| consume_leave_schedule_approval／consume_shift_schedule_approval | 定義前後一致 |
| current_profile_role | 內容與 metadata 未改變 |
| store_owns_schedule_request_scope | 內容與 metadata 未改變 |
| store_can_manage_schedule_entry | 內容與 metadata 未改變 |
| save_daily_operations（營收回報） | 內容與 metadata 未改變；MD5 0ec03d0a74822787c0261e9faebe1397 |
| Supabase 安全檢查 | 前後結果一致，排除 observed_at 後逐項比對通過 |

既有安全提示仍在，未因本修補新增：
- [RLS 已啟用、無政策](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)：33 項 INFO。
- [匿名 SECURITY DEFINER RPC](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)：4 項 WARN。
- [登入 SECURITY DEFINER RPC](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)：38 項 WARN。
- [洩漏密碼保護未啟用](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)：1 項 WARN。

這些提示不等於已全部修復，也不能據此宣稱整個系統沒有安全風險。

## 保持不變與驗收限制

本輪沒有寫入、刪除或恢復人資主檔、營收、帳密及既有核准業務紀錄。修補影響的是未來正常排班操作時的核准消耗範圍，不能復原歷史誤關閉紀錄。

正式環境未進行業務寫入測試，尚不能宣稱 Supabase Auth／PostgREST 或門店手機端已完成端到端驗收。下一次門店正常執行核准排班異動時，應確認自店核准正常消耗、無關店核准維持原狀；不要為驗收更動其他店資料。

`maintenance/database-plan.json` 的 `production_ready=false` 維持不變，代表整批歷史 Migration 重建與對齊仍未通過。此次單一函數另行核准、單獨記錄，不代表允許整批 db push。

## 回復與待修

回復檔：`supabase/drafts/schedule-approval-consumption-scope-rollback.sql`。僅於需要且取得核准後，透過另一筆獨立 Migration 套用，不能刪掉這次正式歷史。回復會恢復舊函數及跨店誤關閉缺陷，不會復原已消耗核准。

仍有獨立待修項：shift 範圍核准的 target_shift_id FK「刪除設為 NULL」與 CHECK 約束可能衝突，造成刪除班次失敗並回滾。此項不在本次套用範圍，不放寬約束、不刪稽核紀錄。

證據：`schedule-approval-scope-deployment-20261011.json`。
已套用 SQL 封存於 `supabase/history/20261011013730_fix_schedule_approval_consumption_scope.sql`，僅供追溯，不加入未對齊的批次重播來源。

