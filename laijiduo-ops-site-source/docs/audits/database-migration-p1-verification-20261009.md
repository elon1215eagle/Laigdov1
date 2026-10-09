# P1 Migration 內容比對與正式歷史封存

日期：2026-10-09。專案：wfhaqnicwqjfgzjcfmsq。

13 支同名不同版本的未版控 SQL，全部與正式庫 statements 內容一致。比對只正規化 BOM、換行與首尾空白，保留全部 SQL、註解、字串及權限宣告。

| 功能 | 本機版本 | 正式版本 | 結果 |
|---|---|---|---|
| cross_app_account_memberships | 20260901030000 | 20260901024853 | 內容一致 |
| add_hq_franchise_ordering_memberships | 20260901031921 | 20260901031948 | 內容一致 |
| approval_center | 20260909072051 | 20260909072823 | 內容一致 |
| approval_attachment_policy_fix | 20260909073611 | 20260909073646 | 內容一致 |
| hq_short_login | 20260909081622 | 20260909082332 | 內容一致 |
| transfer_center | 20260909124828 | 20260909130153 | 內容一致 |
| transfer_product_audit_reader | 20260909130943 | 20260909131115 | 內容一致 |
| transfer_add_pork_chop | 20260909233801 | 20260909233826 | 內容一致 |
| transfer_product_store_directions | 20260909234011 | 20260909234155 | 內容一致 |
| ops_store_repairs | 20260911124558 | 20260911124650 | 內容一致 |
| simplify_store_repairs | 20260911132933 | 20260911133851 | 內容一致 |
| staffing_overview | 20260927093000 | 20260928022859 | 內容一致 |
| allow_store_manager_previous_month_daily_reports | 20261001125849 | 20261001130053 | 內容一致 |

正式庫原始 SQL 已使用正式版本存入 production-migration-history/，並附 database-migration-p1-evidence-20261009.json。每筆證據包含原檔位置、正式版本、封存位置與正規化 SHA-256，供獨立復核。

本次未更改本機原檔版本，也未將兩組版本放入自動部署目錄。supabase/migrations 的受版控數量仍為 51，原有 13 支未版控 SQL 保留。歷史封存與可重播的部署鏈是兩個不同驗收項目，整體 migration history 尚未收斂。

驗證：13/13 本機與正式 SQL 比對通過；13/13 封存檔與本機內容再次比對通過。正式資料庫僅 SELECT，沒有 DDL、DML、migration repair 或 db push。應用程式、人資主檔與門店回報流程未修改。

後續工作：比對 35 支已版控但同名不同版本的 SQL；完成全部差異分類後，再建立可重播的正式基準與測試所需歷史檔案映射。不得將已上線 SQL 當作新 migration 重跑。
