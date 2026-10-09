# 本機獨有 Migration 核對報告

日期：2026-10-09。專案：`wfhaqnicwqjfgzjcfmsq`。

## 結論

8 支本機獨有檔已完成與正式 108 支 migration statements 及現行 catalog 的唯讀核對：沒有一支整檔與正式 statements 完全相等。2 支舊回報腳本被後續規則取代，1 支啟用南華的資料腳本與目前店狀態衝突，另 5 支相關結構／函式已存在但來源歷史仍有缺口。

**不能把這 8 支當作尚未上線的功能直接 db push；也不能只看到物件存在就 migration repair applied。** 本次不改檔名、不改正式歷史、不動人資／排假／業績／營業狀態資料。

## 逐支判定

| 本機版本 | 功能 | 分類 | 後續處理 |
|---|---|---|---|
| 20260716144921 | store_manager_14_day_revenue_access | 已被後續回報版本取代 | 保留歷史；以现行正式來源建立基準 |
| 20260717135922 | part_time_work_hours_staffing_coverage | 相關物件已存在，正式來源歷史缺口 | 依現行 catalog 建立隔離基準，驗證前不修正式歷史 |
| 20260729192216 | save_daily_operations_atomic | 已被後續回報版本取代 | 保留歷史；以现行正式來源建立基準 |
| 20260806140506 | reactivate_nanhua_and_set_s01_s06_demand | 會啟用目前停業南華，禁止重播 | 排除新基準的營業狀態回填；備註不一致另行處理 |
| 20260826141823 | quick_checkout_data_model | 相關物件已存在，正式來源歷史缺口 | 依現行 catalog 建立隔離基準，驗證前不修正式歷史 |
| 20260826142108 | quick_checkout_device_rpc | 相關物件已存在，正式來源歷史缺口 | 依現行 catalog 建立隔離基準，驗證前不修正式歷史 |
| 20260826143955 | quick_checkout_workspace_sync | 相關物件已存在，正式來源歷史缺口 | 依現行 catalog 建立隔離基準，驗證前不修正式歷史 |
| 20260829044859 | add_monthly_schedule_day_statuses | 相關物件已存在，正式來源歷史缺口 | 依現行 catalog 建立隔離基準，驗證前不修正式歷史 |

## 關鍵證據

### store_manager_14_day_revenue_access

- 正式 20260805003227 與 20261001130053 已重建店長日期政策；現行 SELECT／INSERT 可到上月月初至營業日，不再是 14 日。
- current_taipei_business_date 函式本體一致，但現行 search_path 已加固；daily_report_totals 有 security_invoker=true。

### part_time_work_hours_staffing_coverage

- store_staff.work_start_time/work_end_time 存在；正式 20260729053931 的回填已依賴這兩欄，但 108 支 statements 未找到 ADD 來源的完全相等檔。
- 僅確認欄位存在，無法證明原始執行時間或整支檔曾上線；補入隔離基準時須先於 20260729053931。

### save_daily_operations_atomic

- 正式 20260731134027 已建立三參數 save_daily_operations，現行也只有三參數（第三參數有 DEFAULT）。
- 現行支援報廢／員餐、numeric 營收；舊檔會新增兩參數重載，可能使省略第三參數的 RPC 選擇產生歧義，禁止補跑。

### reactivate_nanhua_and_set_s01_s06_demand

- S06 現行 operating_status=suspended、is_active=false；舊腳本會改為 active/true。
- S01-S06 demand 現為 7，但 rule_note 仍寫南華已恢復營業，與實際店狀態不一致；只列待修正，未更動任何營運資料。

### quick_checkout_data_model

- 五個主表均存在且 RLS 開啟；62 個檔案宣告欄位全部存在；兩個 trigger 函式本體與原檔一致，三個觸發器啟用。
- 正式 20260827011108 已依賴 quick_checkout_products，但建表檔的對應執行紀錄未出現在 108 支 statements；初始商品資料／完整約束語意未驗收。

### quick_checkout_device_rpc

- 裝置 workspace 表與五個 RPC 均存在；resolve/create/load/clear 本體一致，save 已被同步版本覆寫。
- resolve 禁 anon/authenticated；create 僅 authenticated；load/save/clear 有 anon/authenticated 權限並在本體驗證 token；僅 catalog 驗證，不代表 token 行為測試通過。

### quick_checkout_workspace_sync

- 现行 quick_checkout_save_workspace 本體與本機同步版一致；正式 108 支 statements 未有對應函式來源。
- 禁止僅據本體一致就標记舊版本 applied；仍需新正式基準及隔離重播。

### add_monthly_schedule_day_statuses

- monthly_leave_plans.day_statuses 存在且為 jsonb；upsert_monthly_leave_plans_new 本體一致，anon execute=false、authenticated=true。
- 正式 108 支 statements 完全未含 day_statuses；現行結構與歷史存在缺口，原始版本／時間仍未能證實。

## 驗證範圍

- 8 支原檔建立正規化 SHA-256；全部與 108 支正式 saved statements 比對，整檔相等為 0。
- 11 個函式本體對照：9 個一致、2 個不同；兩個不同為擴充後每日回報與早期 workspace save（後來同步版本體一致）。本體相等不等於完整授權、search_path、schema 或資料相等。
- 快速結帳五個主表共 62 個原檔宣告欄位全部存在；只做欄位存在檢查，不宣稱完整型別、約束、商品價格或商品初始資料完全一致。
- 現行表／欄位、函式定義、權限、觸發器、回報 RLS 與 S06 狀態保存在 `database-migration-local-only-evidence-20261009.json`。未讀取 HR 人員明細、裝置 token、實際 workspace 或密碼。
- 正式庫全程 SELECT，沒有 DDL、DML、RPC 執行、db push 或 migration repair；門店回報程式與正式資料未修改。本輪不宣稱正式回報寫入已驗收。

## 下一階段驗收門檻

1. 在獨立本機／隔離資料庫建立可重播基準，不能指向正式專案。優先補建缺失的 work_start/end、快速結帳前置結構與 day_statuses，保留正式現行 RPC 與權限。
2. 舊兩參數回報 RPC 不納入；南華啟用腳本不納入；帳號初始化以測試帳號／無生產憑證方式處理；多 statement 歷史保留邊界。
3. 比對重建後 schema、函式、RLS／grant／trigger，並跑門店回報、排假、token RPC 與跨應用依賴回歸；成功前不更動正式 Migration 歷史。
4. 南華 rule_note 與 suspended 狀態不一致列為獨立、可稽核的營運資料修正，不在本次歷史核對中擅自改正。

本次只完成 8 支分類與現行來源快照；全庫可重播、功能行為與正式部署鏈驗收尚未完成。
