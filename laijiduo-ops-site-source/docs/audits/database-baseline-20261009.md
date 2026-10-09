# 正式資料庫結構基準與權限稽核

## 結論

- 基準日期：2026-10-09（Asia/Taipei）
- Supabase 專案：`wfhaqnicwqjfgzjcfmsq`
- 正式專案狀態：`ACTIVE_HEALTHY`
- 檢查模式：唯讀；未執行 DDL、DML、migration repair 或 db push
- 判定：正式庫可營運，但 migration history 與本機已嚴重分岔。本分支只建立可追溯清冊、驗證 SQL 與修正草案，不更動正式庫。

## 基準範圍

| 類別 | 數量 | 結果 |
|---|---:|---|
| public tables | 79 | 79/79 已啟用 RLS |
| public views | 1 | daily_report_totals 使用 `security_invoker=true` |
| public functions | 80 | 53 支 SECURITY DEFINER |
| public triggers | 23 | 已建立清冊 |
| installed extensions | 8 | 已建立清冊 |

## Migration 對帳

| 類別 | 數量 |
|---|---:|
| 本機 migration | 45 |
| 正式庫 migration | 107 |
| 版本一致 | 2 |
| 僅本機 | 43 |
| 僅正式庫 | 105 |

一致版本：`20260827011108`、`20260827053934`。

以上數字以 release commit `ac154581adeadd6e2f519ea8e392d9edf856fc8f` 的受版控檔案為準。原主要工作目錄另有 18 個尚未納入版控的 migration 檔；若把這些草稿也計入，則本機共 63 筆、與正式庫一致 7 筆、僅本機 56 筆、僅正式庫 100 筆。未受版控檔案不得視為可部署基準。

管理規則：

1. 未完成 schema diff 前，禁止 `supabase db push`。
2. 未取得每一筆 migration 的來源證據前，禁止 `supabase migration repair`。
3. 新修正只能建立為獨立、可回滾 migration，且先在隔離環境驗證。
4. 人資主檔與營運資料不在本次修正範圍。

## 權限重點

### 匿名可執行的 SECURITY DEFINER RPC

- `laigdo_order_catalog()`
- `quick_checkout_clear_workspace(p_device_token text)`
- `quick_checkout_load_workspace(p_device_token text)`
- `quick_checkout_save_workspace(p_device_token text, p_workspace jsonb)`
- `rls_auto_enable()`

上述 RPC 不批次撤權。公開點餐與快速結帳函式可能是刻意開放；先核對 token、payload、門店範圍及 rate limit。只有 `rls_auto_enable()` 已放入撤權草案，因其為 event-trigger helper，不需暴露給前台角色。

正式庫已確認 event trigger `ensure_rls` 由 `postgres` 擁有，於 `ddl_command_end` 自動呼叫 `rls_auto_enable()`；應用程式碼沒有直接呼叫該函式。撤銷 `anon`／`authenticated` 的 EXECUTE 屬縮小暴露面，不會移除 event trigger。

### 未固定 search_path

- `current_taipei_business_date()`（SECURITY DEFINER：否）
- `set_monthly_schedule_lock_updated_at()`（SECURITY DEFINER：否）

這些函式目前不是 SECURITY DEFINER，急迫性較低；草案將固定 `search_path`，降低後續升級或誤用風險。

## 交付檔案

- `docs/audits/database-object-inventory-20261009.csv`：79 張 public 資料表與 RLS/policy 摘要
- `docs/audits/database-rpc-permission-matrix-20261009.csv`：80 支 public function 權限矩陣
- `docs/audits/database-trigger-inventory-20261009.csv`：23 個 trigger 清冊
- `supabase/production_security_catalog_audit.sql`：可重複執行的唯讀驗證 SQL
- `supabase/drafts/20261009_security_baseline_hardening.sql`：未套用的可回滾修正草案

## 已安裝 Extension

- `btree_gist` 1.7（extensions）
- `pg_cron` 1.6.4（pg_catalog）
- `pg_net` 0.20.3（extensions）
- `pg_stat_statements` 1.11（extensions）
- `pgcrypto` 1.3（extensions）
- `plpgsql` 1.0（pg_catalog）
- `supabase_vault` 0.3.1（vault）
- `uuid-ossp` 1.1（extensions）

## 驗收標準

- 正式資料不變。
- 正式 migration history 不變。
- 清冊可由 catalog SQL 重建。
- 修正草案不得直接部署；須先完成 RPC 行為測試及 rollback 演練。
