# 每日營運回報維護入口

更新日期：2026-10-09。

## 正式狀態

現行正式庫使用三參數 `save_daily_operations(jsonb,jsonb,jsonb)`，後兩參數具預設值。舊兩參數腳本已被取代，保存於 `history/20260729192216_save_daily_operations_atomic.sql`，僅供歷史測試，不得重新部署或建立兩參數重載。

本文件取代早期「尚未套用正式專案」說明；不得依舊版文件撤銷正式 RPC 權限或補跑旧 SQL。

## 安全驗證指令

```powershell
npm.cmd run db:check
npm.cmd run db:test
```

第一個指令只檢查本機來源、封存 SHA-256 與隔離清單。第二個使用無連線網址、無帳密的 PGlite 記憶體資料庫，驗證回報、上月補報、跨店阻擋與交易回滾。

```powershell
npm.cmd run db:check -- --production
```

此指令必須失敗，因完整隔離基準與部署驗收未完成。這是維護入口的防護，不是對手動執行 Supabase CLI 的全面攔截。`supabase/migrations` 仍不是可直接部署的正式鏈。

## 驗收邊界

組件測試通過不等於全庫重建完成；現行角色、其他應用及全部 RPC 的端對端回歸仍須補齊。正式維修前需有核准範圍、備份、最小變更與回復方案。
