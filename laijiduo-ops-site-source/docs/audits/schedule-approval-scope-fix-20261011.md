# 排班核准跨店誤關閉：最小修補候選

日期：2026-10-11（台北時間）

## 結論

正式資料庫唯讀確認：核准消耗函數確實缺少操作人的門店管理範圍限制。已完成最小 SQL 修補候選、版本防護、回復檔及隔離驗證，**尚未部署正式系統**。

本輪正式 SQL 只有 SELECT；人資、回報、帳密、業務資料及 Migration 歷史均未修改。沒有恢復先前已被誤關閉的核准紀錄。

## 原因與修補

`private.consume_schedule_change_approval()` 原本依月份、日期／人員／班次及有效期限關閉所有匹配核准，沒有檢查該核准是否屬於操作人可以管理的店別或群組。

候選只新增一個 EXISTS 條件：有效的店長／副店長身分，經 `private.store_owns_schedule_request_scope()` 驗證其可管理核准所屬範圍，才消耗核准。這與正式寫入授權所使用的範圍判斷一致，不自行改寫五甲／南華的群組權限。

函數名稱、參數、SECURITY DEFINER、search_path、既有授權與兩個觸發器綁定保持不變；不新增解除鎖定權限、不修改核准期限、不改人資資料及營收 RPC。自有門店與合法合併群組同日匹配的核准仍依既有邏輯消耗，本輪僅阻止無權管理的門店核准被連帶關閉。

## 唯讀證據

專案：`wfhaqnicwqjfgzjcfmsq`。

| 正式函數 | 2026-10-11 prosrc MD5 |
| --- | --- |
| consume_schedule_change_approval | f6c9a497e33975e911b5ed70b049b309 |
| store_owns_schedule_request_scope | e38c23ff5ab80103cc4252d93c3e480f |

候選函數內容 MD5：`92f1ba305489d5f4f14cbeafd5c50f3a`。版本檢查先排除 CR 字元，避免 Windows 換行造成誤判；MD5 僅作版本識別，不是密碼保護。

正式群組 S01-S06、S02-S03 均為啟用且共用排班；S01 管理 S06、S02 管理 S03 的 schedule_management 關係均有效。正式範圍判斷包含管理關係啟用與生效期間，測試已使用此次取得的原函數快照，並核對函數內容雜湊。

## 交付與驗證

- 修補候選：`supabase/drafts/schedule-approval-consumption-scope.sql`。
- 回復候選：`supabase/drafts/schedule-approval-consumption-scope-rollback.sql`。
- 正式範圍函數快照：`test/fixtures/scheduleScopeProduction-20261011.sql`。
- 專項測試：`test/scheduleApprovalConsumptionFix.test.js`，12/12 通過（含父測試容器）。
- 資料庫測試 54/54；全套測試 359/359；建置通過。數量包含既有缺陷特徵測試，不表示所有缺陷已修復。
- 來源核對仍為 8 個本地來源、3 個隔離歷史來源、100 個封存來源；正式部署門檻 `production_ready` 仍為 false。

驗證涵蓋：跨店同日核准不被關閉、合法群組核准可用、過期群組不能解鎖、月排假人員核准及單班更新核准仍可消耗、總部寫入不消耗門店核准、重複套用不改函數識別或授權、來源漂移會停止、回復可還原正式原函數且可重新套用。

測試是在本機 PGlite 以虛構身分／表格執行，不等於 Supabase Auth、PostgREST 或正式用戶驗收。正式環境沒有執行業務寫入測試。

## 另一項待修問題

隔離測試重現：shift 範圍核准引用班次時，刪除班次可能因 `ON DELETE SET NULL` 與「未關閉核准必須保留 target_shift_id」的 CHECK 衝突而失敗。正式環境已唯讀確認同樣的 FK／CHECK 組合，但沒有在正式資料上執行刪除重現。

此項未修，交易會回滾，沒有把刪除失敗當成成功。應另做獨立最小修補，不能為通過測試而放寬核准約束或刪掉稽核紀錄。

## 正式套用門檻

1. 由資料庫維護負責人複核候選及回復檔，另取得正式變更核准；不得直接 db push 重播整批舊 Migration。
2. 套用前再次唯讀確認函數版本、觸發器及群組規則；版本漂移時候選會拒絕執行。
3. 按核准的單一函數變更方式安排套用與監控，保持 Migration 歷史一致，不繞過目前未完成的正式部署審核。
4. 套用後唯讀核對函數內容與授權；由受影響門店在正常操作中驗收，確認其他店核准不再誤關閉。
5. 必要時依已核准程序執行回復檔。回復會恢復舊函數及已知缺陷，不會自動恢復被關閉的核准資料。
