# 部署鏈安全整理與隔離驗證

日期：2026-10-09。

## 已實作

- 三支舊腳本已從 supabase/migrations 移至 supabase/history，SQL 原文保留、正規化雜湊不變。歷史來源快照仍維持原位置記錄；新位置映射見 maintenance/database-plan.json。
- 測試 fixture 引用已改到歷史目錄，保留舊版本回歸；不修改 src、API、人資主檔或正式資料。
- 新增 db:check：核對 8 支原始來源、100 份歷史封存與三支排除項目；不讀環境帳密、不開網路連線。
- 新增 db:test：PGlite 記憶體組件基準，驗證上月補報、跨店阻擋、舊月份阻擋、單一三參數 RPC 與原子交易回滾。
- --production 入口一律拒絕，production_ready 維持 false；修正舊部署文件的兩參數 RPC 與過時撤銷權限指令。

## 驗證

db:check 通過；db:test 20/20 通過；完整 npm test 324/324 通過；npm run build 通過（仍有既有大型 bundle 警告）。正式端本輪零查詢、零 DDL/DML/RPC；未執行 Supabase CLI 或網站部署指令。

## 尚未完成

不是完整正式部署鏈：supabase/migrations 仍保留同名異時間的來源，五支缺少歷史的功能只列為隔離基準候選；不可直接 db push。安全檢查入口不會攔截其他人手動 CLI。

此輪建立每日回報組件隔離基準，尚未重建全庫；快速結帳、排假、LINE、加盟叫貨的整體重播與全權限驗收需接續完成。

既有回報測試亦記錄兩項未修風險：沒有舊資料版本的併發檢查，以及重送會重建報廢子資料 ID。通過的是現況描述測試，不代表已修正併發／冪等性。正式修改前必須另作回歸與相容設計。

## 操作入口

```powershell
npm.cmd run db:check
npm.cmd run db:test
```

下一階段擴充隔離基準；在全庫重播與回歸通過前，不更動正式 Migration 歷史、門店帳密或營業狀態。
