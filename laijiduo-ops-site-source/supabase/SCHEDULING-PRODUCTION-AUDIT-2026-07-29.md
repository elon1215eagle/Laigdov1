# 排班正式資料閉環稽核

稽核日期：2026-07-29

Supabase 專案：`wfhaqnicwqjfgzjcfmsq`（萊吉多 Project）

## 結論

正式環境目前只完成月排假、總部鎖定及修改申請的部分結構，尚未具備
兼職單日班次、資料驅動店群與匿名臨時支援摘要，因此尚不能判定排班
閉環完成。

## 正式環境現況

| 項目 | 結果 |
| --- | --- |
| `monthly_leave_plans` | 已存在，約 86 筆 |
| `monthly_schedule_locks` | 已存在，2026-07 已確認 |
| `monthly_schedule_change_requests` | 已存在，目前 0 筆 |
| `daily_staff_shifts` | 不存在 |
| `get_temporary_support_summary(date)` | 不存在 |
| `store_relation_groups` | 不存在 |
| `store_relation_group_members` | 不存在 |
| `stores.operating_status` | 不存在 |
| 兼職平日／假日預設欄位 | 不存在 |

## 關鍵風險

1. `monthly_leave_plans` 對所有 authenticated 帳號提供無條件新增、修改及
   刪除，門店可跨店修改排假資料。
2. 目前「總部確認後鎖定」主要由前端控制，資料庫政策尚未以
   `monthly_schedule_locks` 與核可申請共同限制門店寫入。
3. 門店修改申請使用 upsert，但正式政策只有 INSERT，既有申請再次送出
   時可能因缺少門店 UPDATE 政策而失敗。
4. `current_profile_role()` 是 `SECURITY DEFINER`，且 anon 仍有 EXECUTE，
   Supabase Security Advisor 已提出警告。
5. 現有草稿彼此有部署順序依賴，不能跳過店群與兼職欄位直接建立 RPC。

## 正式閉環驗收標準

1. 總部未確認：門店只能修改自己的排班範圍。
2. 總部確認：門店的月排假與單日班次在資料庫層均禁止修改。
3. 門店送出原因：只能建立或更新自己的 pending 申請。
4. 總部核可：僅該門店／店群可恢復修改。
5. 總部再次確認：核可申請自動 closed，門店再次鎖定。
6. 門店只能讀取自己或核定店群的姓名、排假及班次。
7. 臨時支援摘要可顯示各店缺口，但不得回傳員工姓名與個別請假明細。
8. S01／S06 與 S02／S03 店群規則正確，S06 維持暫停營業。

## 安全部署順序

1. 建立 development branch。
2. 套用門店營運狀態與店群資料。
3. 套用兼職平假日欄位與 `daily_staff_shifts`。
4. 收斂月排假、班次及修改申請 RLS。
5. 建立匿名臨時支援摘要 RPC。
6. 執行 Security Advisor 並修正排班範圍警告。
7. 以總部、S01、S05、S06、S09 帳號跑完整閉環。
8. 驗收通過後才套用 production。
