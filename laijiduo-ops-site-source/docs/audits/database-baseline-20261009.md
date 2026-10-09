# 正式資料庫結構基準與權限稽核

## 結論

- 基準日期：2026-10-09（Asia/Taipei）
- Supabase 專案：`wfhaqnicwqjfgzjcfmsq`
- 正式專案狀態：`ACTIVE_HEALTHY`
- 檢查模式：唯讀；未執行 DDL、DML、migration repair 或 db push
- 判定：正式庫可營運，但 migration history 與本機已嚴重分岔。本分支建立可追溯清冊與驗證 SQL；2026-10-09 11:42（Asia/Taipei）已依核准完成低風險安全維修。

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
- `supabase/production_maintenance_20261009_security_baseline_hardening.sql`：已套用的維修與回滾紀錄

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
- 後續新增修正仍須先完成 RPC 行為測試及 rollback 演練。

## 維修結果

### 已套用

1. `current_taipei_business_date()` 固定 `search_path=pg_catalog`。
2. `set_monthly_schedule_lock_updated_at()` 固定 `search_path=pg_catalog`。
3. 撤銷 `anon` 與 `authenticated` 對 `rls_auto_enable()` 的執行權；保留 `service_role`。

### 門店回報保護證據

| 驗證項目 | 維修前 | 維修後 | 結果 |
|---|---|---|---|
| 營業日 | 2026-10-09 | 2026-10-09 | 一致 |
| 昨日已回報門店 | 10 / 10 | 10 / 10 | 一致 |
| 回報 RLS policy hash | `d34e17f9e13040bd4cbf61daf3ce1623` | 同左 | 未變更 |
| 回報 table grants hash | `b3dea5663c8b1f6106a60bbea8bffe2e` | 同左 | 未變更 |
| `ensure_rls` event trigger | 啟用 | 啟用 | 正常 |
| 匿名可執行 SECURITY DEFINER 警示 | 5 | 4 | 減少 1 |
| 登入者可執行 SECURITY DEFINER 警示 | 39 | 38 | 減少 1 |
| Mutable search-path 警示 | 2 | 0 | 已排除 |

### 功能驗證

- 門店回報核心測試：22 / 22 通過。
- 正式 APP：鳳山五甲店與屏東潮二店的營業日、14:00、19:00、全日總營收、現金差異及送出按鈕均正常。
- 瀏覽器 console：0 個 error／warning。
- 驗證過程未送出測試業績，未新增、修改或刪除營運資料。
- 人資主檔未讀寫、未變更。
