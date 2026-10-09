# Migration 歷史來源分類清冊

## 結論

- 基準日期：2026-10-09（Asia/Taipei）
- Supabase 專案：`wfhaqnicwqjfgzjcfmsq`
- 正式庫 migration：108 支
- 本機受版控 migration：51 支
- 本機未版控 migration：13 支
- 本次為唯讀分類；未執行 DDL、DML、`db push` 或 `migration repair`
- 正式庫 108 支 migration 的 rollback 記錄均為空；後續新 migration 應附回滾方案，或明確標記不可逆與復原程序。

## 分類結果

| 分類 | 數量 | 管理判定 |
|---|---:|---|
| 正式版本與受版控檔完全同版本 | 8 | 已建立正式基準 |
| 正式版本與未版控檔完全同版本 | 0 | P0 已結案 |
| 同名但受版控版本時間不同 | 35 | P1：必須做 SQL 差異比對 |
| 同名但未版控版本時間不同 | 13 | P1：不得直接改名或推送 |
| 僅正式庫有名稱紀錄 | 52 | P2：補取來源並判定生命週期 |
| 僅本機受版控 | 8 | 禁止直接部署，先證明是否已被正式庫其他版本取代 |
| 僅本機未版控 | 0 | 目前為 0 |

## P0：正式版本一致檔案納入版控（已結案）

- `20260910053806_transfer_inbox_readonly.sql`：laijiduo-ops-site-source/supabase/migrations/20260910053806_transfer_inbox_readonly.sql
- `20260910064414_transfer_web_push.sql`：laijiduo-ops-site-source/supabase/migrations/20260910064414_transfer_web_push.sql
- `20260910152944_transfer_delivery_sheets.sql`：laijiduo-ops-site-source/supabase/migrations/20260910152944_transfer_delivery_sheets.sql
- `20260910152954_transfer_decimal_kg_hq_source.sql`：laijiduo-ops-site-source/supabase/migrations/20260910152954_transfer_decimal_kg_hq_source.sql
- `20260910152956_transfer_stock_pickup_note.sql`：laijiduo-ops-site-source/supabase/migrations/20260910152956_transfer_stock_pickup_note.sql

五支檔案已逐字比對正式庫保存的 statement。四支原始內容完全一致；`20260910152944_transfer_delivery_sheets.sql` 原本少了正式版第一行的 API 基準雜湊保護，補回後已與正式 statement 完全一致。五支檔案均已納入版控，沒有重跑 migration，也沒有修改正式資料庫。

## 僅本機受版控

- `20260716144921_store_manager_14_day_revenue_access.sql`
- `20260717135922_part_time_work_hours_staffing_coverage.sql`
- `20260729192216_save_daily_operations_atomic.sql`
- `20260806140506_reactivate_nanhua_and_set_s01_s06_demand.sql`
- `20260826141823_quick_checkout_data_model.sql`
- `20260826142108_quick_checkout_device_rpc.sql`
- `20260826143955_quick_checkout_workspace_sync.sql`
- `20260829044859_add_monthly_schedule_day_statuses.sql`

以上 8 支不得用 `db push` 補到正式庫。先確認是否已用不同時間版本上線、已被後續 migration 取代，或只是本機草稿。

## 決策規則

1. 版本完全一致不代表 SQL 內容一定一致；必須再做 statement 對檔。
2. 同名但時間不同只列為候選關聯，不得改名偽造成正式歷史。
3. 正式庫獨有 migration 先保存來源，再標記為「應補回版控」、「已被取代」或「僅歷史保留」。
4. 完成逐支 SQL 比對前，持續禁止批次 `supabase db push`。
5. 沒有原始證據時，持續禁止 `supabase migration repair`。
6. 人資主檔與營運資料不在本次處理範圍。

## 明細

完整逐筆對照請見 `database-migration-source-map-20261009.csv`。

