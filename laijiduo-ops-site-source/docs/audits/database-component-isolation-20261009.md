# 排班與快速結帳隔離驗證

日期：2026-10-09

## 結論

已新增可重複執行的本機 PostgreSQL 行為測試，沒有部署、連線或修改正式資料庫，也沒有改人資主檔、門店回報、帳密及正式 Migration 歷史。

本輪是測試防護與問題重現，不代表已修復正式功能，亦不代表全部匿名／登入 RPC 或全系統資料庫重建已驗收。

## 實際交付

- `test/helpers/maintenanceComponentDatabase.js`：記憶體 PGlite、虛構兩店與三個帳號；所有身分與資料只存在本機。
- `test/scheduleDatabaseIsolation.test.js`：11 個情境，涵蓋新寫入入口、日狀態、跨店阻擋、月份鎖定、核准期限／對象／單次使用、重新確認、每日班次及停用身分。
- `test/checkoutDatabaseIsolation.test.js`：9 個情境，涵蓋綁定範圍、匿名權限、裝置隔離、伺服器店別正規化、錯誤回滾、終態訂單不可覆寫、清除範圍及撤銷 token。
- `npm run db:test` 納入兩組測試；共 42/42 通過，包含父測試容器。
- 全套 `npm test`：347/347 通過，包含輔助模組載入測試。
- `npm run db:check`：8 個本地來源、3 個隔離歷史檔及 100 個封存來源核對通過；`production_ready` 仍為 `false`。
- `npm run build` 通過；既有主 bundle 超過 500 kB 警告仍存在，本輪未更動打包方式。

## 新增待修問題

**排班同日核准可能跨店被一併消耗。**

來源：`docs/audits/production-migration-history/20260802141915_scoped_schedule_change_approvals.sql` 的 `private.consume_schedule_change_approval()`。

該函數有算出 `row_store`，但關閉核准的 UPDATE 沒有店別範圍條件。以 T01、T02 各自店長申請同日核准的虛構資料重現：T01 寫入自己的班次後，兩店的核准都變為 closed／used。

測試名稱明確標示 `characterization`，只記錄既有缺陷，並非把錯誤行為當作安全驗收。此次未重新讀取正式函數，故仍須唯讀確認正式版本與群組範圍後，才可規劃正式修復。

建議下一步：確認正式函數與五甲／南華群組權限，新增「只消耗本次操作所屬範圍核准」的最小修補與反向測試；先在隔離環境通過，再安排正式變更。不得重播舊 Migration 或全面解除鎖定。

## 測試邊界

1. 測試載入原始 SQL，不重寫 RLS／RPC 邏輯，但相依表格與身分查詢函數是最小虛構骨架，不等於正式完整 schema、Supabase Auth 或 PostgREST 驗證。
2. 排班載入鎖定、群組核准、精準核准、模組切換、單一寫入入口五支封存 SQL，以及日狀態候選 SQL。沒有驗證所有後續模組或真實營運群組資料。
3. 結帳載入資料模型、裝置 RPC、工作區同步三支本地候選 SQL，未涵蓋後續總部管理及打包付款 Migration。
4. PGlite 無 pgcrypto；SHA256 使用內建函數包裝，隨機 token 產生使用測試替身。不得把這組測試當作正式加密強度或 pgcrypto 相容性驗收。
5. 終態訂單不可覆寫僅指正規化訂單與明細；工作區 JSON 仍可存下客戶端不同狀態。未宣稱工作區與訂單永遠一致。
6. 通過數包含缺陷特徵測試。原有報表舊內容覆寫與重送重建耗損子資料的限制仍存在，並未在此修復。

## 正式變更紀錄

正式 SQL 寫入：0。業務資料寫入：0。人資主檔修改：0。部署：0。Migration repair：0。
