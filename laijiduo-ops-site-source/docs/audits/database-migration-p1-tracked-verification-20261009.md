# P1 受版控 Migration 比對報告

日期：2026-10-09。專案：`wfhaqnicwqjfgzjcfmsq`。

## 結論

35 支同名但不同時間版本的受版控 Migration 已核對：33 支正規化後完全一致、1 支僅排版不同、1 支有歷史 SQL 差異。正式來源全部封存，不變更部署目錄及版本。

## 實際差異

- `add_appointed_store_manager_role`：欄位、VALUES 與 IN 清單的分行排版不同；逐項審查值及語句一致。不是逐字相等，證據保留雙方 SHA-256 與行差異。
- `store_operating_settings_center`：本機早期檔已合併 baseline/lunch/dinner 需求欄位、需求寫入、五段人力需求規則與初始需求值；正式歷史先建立設定中心，再由 `20260806141934_store_peak_staffing_demands` 補上欄位、回填與覆寫函式。
- 本次唯讀確認正式庫三個需求欄位為 integer，現行 `save_store_operating_configuration(text,jsonb,text)` 包含午峰、晚峰需求及分段規則。此證據只證明指定結構／邏輯存在，不宣稱整個現行函式逐字一致或完整功能驗收通過。
- 本機與正式初始化過程仍不同，不應直接改名或重跑設定中心；重建部署鏈需依正式順序驗證資料初始化及後續覆寫。

## 逐筆結果

| 功能 | 本機版本 | 正式版本 | 結果 |
|---|---|---|---|
| store_identity_and_operating_scope | 20260729054000 | 20260729053929 | 內容一致 |
| part_time_default_and_daily_shifts | 20260729054100 | 20260729053931 | 內容一致 |
| store_schedule_privacy_and_support_summary | 20260729054200 | 20260729053936 | 內容一致 |
| schedule_lock_closed_loop | 20260729054500 | 20260729053938 | 內容一致 |
| schedule_group_change_requests | 20260729060000 | 20260729061002 | 內容一致 |
| daily_report_lock_closed_loop | 20260731133904 | 20260731134022 | 內容一致 |
| daily_report_operational_details | 20260731133908 | 20260731134027 | 內容一致 |
| workforce_staff_classification | 20260802111742 | 20260802141841 | 內容一致 |
| staff_store_assignment_history | 20260802112233 | 20260802141843 | 內容一致 |
| staff_transfer_hq_write_policy | 20260802112331 | 20260802141844 | 內容一致 |
| effective_store_management_relations | 20260802113845 | 20260802141846 | 內容一致 |
| staff_positions_and_skills | 20260802115527 | 20260802141847 | 內容一致 |
| staffing_demand_rules | 20260802115728 | 20260802141848 | 內容一致 |
| multi_segment_daily_staff_shifts | 20260802120237 | 20260802141849 | 內容一致 |
| scoped_schedule_change_approvals | 20260802121315 | 20260802141915 | 內容一致 |
| support_shift_approval_closed_loop | 20260802121842 | 20260802141921 | 內容一致 |
| workforce_safe_cutover_control | 20260802122444 | 20260802141922 | 內容一致 |
| staff_estimated_cost_fields | 20260802123110 | 20260802141923 | 內容一致 |
| revoke_anon_workforce_rpcs | 20260802123320 | 20260802141924 | 內容一致 |
| personal_schedule_links | 20260802124010 | 20260802141926 | 內容一致 |
| secure_legacy_public_tables | 20260802124430 | 20260802141927 | 內容一致 |
| harden_public_schedule_token_rpc | 20260802124620 | 20260802141929 | 內容一致 |
| workforce_performance_indexes | 20260802124900 | 20260802141930 | 內容一致 |
| standard_shift_templates | 20260802143000 | 20260802141931 | 內容一致 |
| leave_audit_and_demand_requests | 20260802150000 | 20260802141932 | 內容一致 |
| secure_salary_access | 20260802153000 | 20260802141934 | 內容一致 |
| enforce_workforce_single_writer | 20260802160000 | 20260802141935 | 內容一致 |
| secure_line_internal_tables | 20260802170000 | 20260802141936 | 內容一致 |
| harden_identity_helper_rpcs | 20260802171000 | 20260802141937 | 內容一致 |
| secure_store_staff_upsert | 20260803100000 | 20260802213557 | 內容一致 |
| store_manager_current_month_revenue_view | 20260805090000 | 20260805003227 | 內容一致 |
| store_operating_settings_center | 20260806141200 | 20260806141652 | 歷史 SQL 差異，後續補齊已核對 |
| store_peak_staffing_demands | 20260806141839 | 20260806141934 | 內容一致 |
| store_backoffice_matrix_and_role_salary_settings | 20260806144355 | 20260806144829 | 內容一致 |
| add_appointed_store_manager_role | 20260806145951 | 20260806150028 | 僅排版差異 |

## 驗證與邊界

正式 statements 封存於 `production-migration-history/`；證據 JSON 包含雙方 SHA-256、版本映射及分類。兩支非逐字一致檔另附 `.comparison.txt`，LOCAL 為本機、PROD 為正式庫保存語句。

本輪正式庫僅 SELECT；沒有 DDL、DML、db push、migration repair。應用程式、人資主檔與門店回報程式均未修改，沒有進行正式回報寫入測試。35 支封存不放入 supabase/migrations，避免重複執行。

加上前輪 13 支，本次 P1 同名異版本共 48 支已完成內容分類及來源封存；不代表可重播部署鏈已完成。尚有 52 支正式庫獨有來源及 8 支本機獨有檔待追查；接續先做唯讀來源封存，再建立隔離重播驗證。
