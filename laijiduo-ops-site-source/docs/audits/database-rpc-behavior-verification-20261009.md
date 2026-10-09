# RPC 行為與權限驗證報告

## 結論

- 原始清冊中的 5 支匿名 SECURITY DEFINER RPC 已完成 5 / 5 權限與負向行為驗證。
- 原始清冊中的 39 支登入者 SECURITY DEFINER RPC 已完成 39 / 39 權限與無身分行為驗證。
- 驗證發現 3 支登入 RPC 的未登入判斷順序不完整；已於 migration `20261009034937_harden_authenticated_rpc_guards` 修正並完成回滾驗收。
- 正式營運資料、人資主檔與門店回報資料均未異動；全系統測試 316 / 316 通過。

## 匿名 RPC：5 / 5

| RPC | 驗證 | 結果 |
|---|---|---|
| `laigdo_order_catalog()` | 匿名讀取公開目錄、檢查必要欄位 | 通過，回傳 8 間已發布門店 |
| `quick_checkout_load_workspace(text)` | 無效裝置 token | 拒絕：`invalid or revoked device` |
| `quick_checkout_save_workspace(text,jsonb)` | 無效裝置 token | 拒絕：`invalid or revoked device` |
| `quick_checkout_clear_workspace(text)` | 無效裝置 token | 拒絕：`invalid or revoked device` |
| `rls_auto_enable()` | `anon` EXECUTE 權限 | 已撤銷，無法由 API 呼叫 |

快速結帳驗證前後筆數一致：workspace 6、orders 20、order lines 52、events 206。

## 登入 RPC：39 / 39

原始 39 支包括 38 支目前仍開放給 `authenticated` 的 RPC，以及已撤權的 `rls_auto_enable()`。

| 類別 | 數量 | 結果 |
|---|---:|---|
| 已撤權的內部 helper | 1 | `authenticated` 無 EXECUTE 權限 |
| 無身分時回傳安全中性值 | 8 | 僅回傳 `NULL`、0 或 `false`，無資料洩漏 |
| 無身分時拒絕 | 26 | 由登入、角色、token 或輸入驗證拒絕 |
| 匿名與登入共用、由公開資料或裝置 token 控制 | 4 | 目錄形狀與無效 token 行為均通過 |
| 合計 | 39 | 39 / 39 完成 |

安全中性值 RPC：

- `current_franchise_role()`
- `current_franchise_store_id()`
- `current_profile_role()`
- `current_profile_store_id()`
- `get_staff_role_salary_settings_secure()`
- `get_store_staff_secure()`
- `has_salary_access()`
- `ops_repair_photo_access(text,boolean)`

實測中性結果：四個身分 helper 均為 `NULL`；薪資設定與門店人員均為 0 列；薪資權限與報修照片權限均為 `false`。

## 修正項目

| RPC | 原問題 | 修正 | 驗收 |
|---|---|---|---|
| `request_coo_salary_access(text)` | 無身分時因 SQL `NULL` 判斷可能進入寫入流程 | 第一行先檢查 `auth.uid()`；角色比對改為 fail closed | 未登入先拒絕；COO 路徑於回滾交易通過 |
| `review_staffing_demand_change_request(uuid,text,text)` | 無身分時角色 `NOT IN` 可能得到 `NULL` 而略過拒絕 | 第一行先檢查 `auth.uid()` | 未登入先拒絕；COO 路徑進入正確業務判斷 |
| `revoke_personal_schedule_link(uuid)` | 先查資料再檢查管理權限，可能洩漏連結是否存在 | 第一行先檢查 `auth.uid()` | 未登入先拒絕；COO 撤銷路徑於回滾交易通過 |

三支函式維持 `anon=false`、`authenticated=true`；函式 `search_path` 固定。migration 先比對正式函式雜湊，若版本漂移即中止。

## 資料不變證據

| 資料 | 維修前 | 維修後 |
|---|---:|---:|
| `salary_access_events` | 0 | 0 |
| `staffing_demand_change_requests` | 0 | 0 |
| `schedule_personal_links` | 5 | 5 |
| `daily_reports` | 538 | 538 |

- 驗證日營業日：2026-10-09。
- 2026-10-08 回報完成：10 / 10 營業門店。
- 合法角色寫入路徑全部包在 `BEGIN ... ROLLBACK`，未留下測試資料。
- 未送出任何假業績；人資主檔未讀寫。

## 回歸驗收

- `npm test`：316 / 316 通過。
- 每日回報交易、門店隔離、核准後鎖定、潮二店 S11 範圍與回報欄位測試均通過。
- Supabase Security Advisor：匿名 SECURITY DEFINER 4 支、登入 SECURITY DEFINER 38 支，與刻意保留的正式 API 清冊一致。
- Advisor 顯示的 38 支登入 RPC 是風險提醒，不等於漏洞；本報告驗證其無身分邊界，後續仍應把「每角色合法動作及跨店拒絕」列入每次重大版本回歸。
