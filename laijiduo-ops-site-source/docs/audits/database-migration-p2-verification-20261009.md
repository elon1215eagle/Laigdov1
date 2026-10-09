# P2 正式庫獨有 Migration 來源核對

日期：2026-10-09。Supabase：`wfhaqnicwqjfgzjcfmsq`。

## 結論

52 支來源已取回並逐筆建立封存與 SHA-256。原本「僅正式庫有名稱紀錄」只針對標準 migrations 檔名：擴大比對 86 支版控 SQL 後，15 支可與舊式檔案正規化後完全對上，不應視為来源遺失。

- 48 支完整內容封存：44 支單 statement SQL，4 支原始 statements JSON。
- 4 支含敏感帳號初始化資訊，僅保存遮蔽檢閱版及原始來源雜湊；禁止將遮蔽檔當作可還原 SQL。
- 正式歷史仍為 108 支，最新版本 `20261009034937`。沒有執行正式資料庫寫入或變更部署鏈。

## 管理判定

1. 歷史帳號初始化有密碼／可推導密碼內容：CSO／主管、管理員、門店短帳號、配送帳號共四支。所有單引號字串遮蔽，不公開原始值或可推導公式的字串。未驗證歷史密碼是否仍有效，也未擅自更換密碼，避免中斷門店登入；後續須建立受控憑證輪替流程。
2. 此資料庫同時包含營運、加盟叫貨、LINE／配送與線上點餐資料。不得只按營運 APP 需求移除跨應用 Migration。
3. `franchise_orders_weekday_arrival_check` 的週一至週五限制已被後續週末到貨版本改為 1..7，本輪唯讀檢查現行 CHECK 相符。保留歷史，不單獨重跑早期約束。
4. 訂單稽核不是整個模組移除：四個 capture 觸發器目前不存在，`prevent_franchise_change_audit_mutation_trigger` 仍啟用。保存建表／修正／停用三階段歷史，不能只重跑前段而重新阻塞叫貨。
5. `enable_order_notification_scheduler` 只安裝 pg_cron／pg_net；不代表排程 job 已存在或通知成功。通知執行健康與完整功能驗收另行處理。
6. 舊式政策與資料回填仍需依後續正式順序驗證。封存不等於生命週期全部完成，也不等於隔離重建成功；不宣稱全部現行權限已驗收。

## 逐筆清冊

| 正式版本 | 功能／用途 | statement 數 | 本機舊式來源／處理 |
|---|---|---:|---|
| 20260615110026 | executive_role_enum：高階主管角色列舉 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_15_executive_role_enum.sql |
| 20260615110259 | handover_performance_clean：交接與績效資料表 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260615110354 | executive_permissions_v2：高階主管權限政策 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_15_executive_permissions.sql |
| 20260615122218 | create_monthly_leave_plans_v2：每月排假資料表與早期政策 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260615125629 | add_leave_type_to_monthly_leave_plans：排假假別欄位 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_15_monthly_leave_type.sql |
| 20260616011843 | add_cso_role_enum：CSO 角色列舉 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260616012017 | configure_cso_and_executive_supervisor_v3：CSO／主管權限與歷史帳號初始化 | 1 | 敏感帳號來源：遮蔽檢閱版 |
| 20260616015955 | hq_task_dispatch_and_admin_account：總部任務與歷史管理帳號初始化 | 1 | 敏感帳號來源：遮蔽檢閱版 |
| 20260619233653 | app_security_settings：應用安全設定表 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_20_app_security_settings.sql |
| 20260622082942 | store_manager_daily_report_write：門店回報寫入政策 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_22_store_manager_daily_report_write.sql |
| 20260622083049 | store_manager_daily_report_resubmit：門店回報重送政策 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_22_store_manager_daily_report_resubmit.sql |
| 20260622084913 | fix_store_codes_and_profiles：歷史店碼／個人檔關聯修正 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_22_fix_store_codes_and_profiles.sql |
| 20260622085811 | leave_source_colors_and_s05_s06：假別來源與歷史門店／帳號設定 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_22_leave_source_colors_and_s05_s06.sql |
| 20260622090453 | inventory_incoming_source：庫存進貨來源欄位 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_22_inventory_incoming_source.sql |
| 20260622161513 | franchise_app_schema：加盟應用資料模型與 RLS | 1 | 舊式 SQL 完全一致：laijiduo-franchise-app-source/supabase/migration_2026_06_22_franchise_app_schema.sql |
| 20260622164725 | franchise_investor_enum：加盟投資人角色 | 1 | 舊式 SQL 完全一致：laijiduo-franchise-app-source/supabase/migration_2026_06_23_01_franchise_investor_enum.sql |
| 20260622164735 | franchise_investor_policies：加盟投資人存取政策 | 1 | 舊式 SQL 完全一致：laijiduo-franchise-app-source/supabase/migration_2026_06_23_02_franchise_investor_policies.sql |
| 20260623041420 | franchise_admin_delete_only：加盟刪除權限 | 1 | 舊式 SQL 完全一致：laijiduo-franchise-app-source/supabase/migration_2026_06_23_03_franchise_admin_delete_only.sql |
| 20260623093054 | hq_daily_report_management：總部業績管理政策 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_23_hq_daily_report_management.sql |
| 20260623101627 | review_actions_hq_access：總部審核存取政策 | 1 | 舊式 SQL 完全一致：laijiduo-ops-site-source/supabase/migration_2026_06_23_review_actions_hq_access.sql |
| 20260630061906 | store_staff_master：人資主檔基礎表與政策 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260704084220 | line_bot_store_settings_report_audit：LINE 訊息／任務／店設定模型 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260704090313 | line_report_requests_interactive_store_selection：LINE 回報選店流程欄位 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260708052829 | franchise_inventory_management：加盟庫存模型與政策 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260708083943 | franchise_order_pricing_module：加盟訂單／商品／價格模型 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260708084819 | franchise_orders_weekday_arrival_check：早期週一至週五到貨限制 | 1 | 早期約束已被取代，保留歷史 |
| 20260709044314 | allow_cfo_update_franchise_orders：CFO 訂單更新政策 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260709144309 | allow_franchise_orders_weekend_arrival_dates：週末到貨限制放寬 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260712150450 | franchise_order_closed_loop_hardening：訂單狀態轉換與事件閉環 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260729063447 | product_price_history：商品價格歷史与同步觸發器 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260729063528 | restrict_product_price_sync_function：價格同步函式存取限制 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260729084159 | order_timing_and_backfill：訂單時間規則與歷史回填 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260729084344 | fix_order_timing_existing_order_updates：既有訂單更新時限修正 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260813091303 | fix_monthly_leave_plan_audit_trigger_rls：排假稽核觸發器權限修正 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260813101658 | add_store_short_alias_accounts：歷史門店短帳號初始化 | 1 | 敏感帳號來源：遮蔽檢閱版 |
| 20260817104225 | franchise_order_category_locks：訂單品類鎖定與事件 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260829012304 | franchise_order_overview_summary：加盟訂單彙總函式 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260829015124 | atomic_franchise_order_detail_save：訂單明細原子寫入函式 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260830031837 | monday_meat_cutoff_rule：週一肉品截止規則 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260901032855 | enforce_franchise_ordering_membership：加盟叫貨會員資格政策 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260921053141 | add_delivery_specialist_role：配送專員角色 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260921053151 | delivery_specialist_access：配送 RPC 與總部短登入存取 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20260921053201 | create_delivery_specialist_account：歷史配送帳號／短登入初始化 | 1 | 敏感帳號來源：遮蔽檢閱版 |
| 20261001120105 | franchise_order_line_notification_outbox：叫貨通知 outbox 與領取函式 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20261001122200 | enable_order_notification_scheduler：pg_cron／pg_net 擴充啟用 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20261006124355 | laigdo_online_ordering：線上點餐資料模型與 API | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20261007052326 | online_order_three_step_packing_flow：點餐三段包裝流程 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20261007054533 | daily_four_digit_order_numbers：每日四位訂單編號 | 1 | 正式來源封存；重播／生命週期待驗證 |
| 20261008022942 | add_franchise_order_and_product_audit_trail：訂單與商品變更稽核／防竄改 | 30 | 正式來源封存；重播／生命週期待驗證 |
| 20261008083500 | fix_franchise_audit_dynamic_order_id：稽核函式訂單 ID 修正 | 4 | 正式來源封存；重播／生命週期待驗證 |
| 20261008091308 | disable_blocking_franchise_change_audit：解除四個同步稽核觸發器 | 5 | 正式來源封存；重播／生命週期待驗證 |
| 20261008094345 | add_franchise_notification_summary_queue：叫貨通知摘要佇列 | 20 | 正式來源封存；重播／生命週期待驗證 |

## 證據與驗證

`database-migration-p2-evidence-20261009.json` 記錄原始來源 SHA-256、封存檔 SHA-256、statement 數與本機來源映射。原始來源雜湊由正式庫內建 SHA-256 以 UTF-8 計算；封存雜湊使用去 BOM、統一 LF、去首尾空白後的 UTF-8；二者用途不同，不能要求兩者總是相等。

多 statement Migration 不任意串接成可執行 SQL：保留 statements JSON 原始字串與邊界，避免原 statements 沒有分號造成串接錯誤。這些封存全部位於 docs/audits/production-migration-history，不納入自動部署目錄。

52/52 封存檔讀回比對通過；4/4 多 statement 陣列比對通過；15 支舊式來源內容相等（只正規化 BOM、換行、首尾空白）。4 支遮蔽檔僅對照遮蔽轉換結果，不宣稱原文一致。

本輪正式庫僅 SELECT；人資主檔、營運資料、門店回報程式未修改。沒有正式登入、回報寫入或全系統功能測試；文件／歷史封存變更不需應用重新部署。

## 下一階段

追查 8 支本機獨有 Migration 是否已被其他正式版本取代；其後建立隔離、無生產憑證的正式基準與重播測試。仍禁止整批 db push 或猜測式 migration repair。4 支敏感歷史來源與多 statement 邊界需在重建方案中明確處理。
