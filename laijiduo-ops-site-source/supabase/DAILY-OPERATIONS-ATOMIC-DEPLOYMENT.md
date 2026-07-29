# 每日營運回報原子儲存部署驗收

## 目前狀態

- 前端已改用 `saveDailyOperations` 統一儲存營收與庫存。
- Supabase RPC migration 已建立，但尚未套用任何正式專案。
- RPC 尚未存在時，程式會相容退回既有兩段式寫入。
- RPC 存在後，營收與庫存會在同一個資料庫交易內完成或一起失敗。

## Migration

`migrations/20260729192216_save_daily_operations_atomic.sql`

## 安全設計

- 函式使用 `security invoker`，不繞過既有 RLS。
- `PUBLIC` 無執行權限。
- 僅授權 `authenticated` 執行。
- 門店、總部仍受 `daily_reports` 與 `inventory_counts` 現有政策約束。
- 權限錯誤不會自動重試成兩段式寫入。

## 開發分支驗收順序

1. 確認操作目標是 Supabase 開發分支，不是正式專案。
2. 套用 migration。
3. 重新整理 PostgREST schema cache，或等待自動更新。
4. 使用總部帳號修改一筆測試日期的營收與庫存。
5. 確認 `daily_reports` 與 `inventory_counts` 同時更新。
6. 使用門店帳號更新自己門店的測試資料。
7. 確認門店無法更新其他門店資料。
8. 製造一筆無效 `product_id`，確認營收與庫存均未留下部分更新。
9. 執行 Supabase Security Advisor，確認沒有新增警告。

## 正式部署條件

- 開發分支完成總部與門店帳號驗收。
- 原子失敗案例確認沒有部分資料。
- RLS 與函式執行權限驗收通過。
- 完成正式資料庫備份或還原點。
- 再將同一 migration 套用正式專案。

## 回復方式

若正式啟用後需要暫停 RPC，可撤銷執行權限：

```sql
revoke execute on function public.save_daily_operations(jsonb, jsonb)
from authenticated;
```

前端偵測到權限錯誤時會停止寫入，不會在不明狀態下改走兩段式寫入。
