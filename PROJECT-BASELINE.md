# 萊吉多 APP 專案基準

## 1. 正式工作區

- Git repository：`C:\Users\ecosw\OneDrive\文件\萊吉多營運APP\Laigdov1`
- 營運 APP：`laijiduo-ops-site-source`
- 加盟店 APP：`laijiduo-franchise-app-source`
- GitHub：`https://github.com/elon1215eagle/Laigdov1`
- 營運 APP 正式網址：`https://laigdov1.vercel.app`
- Supabase project id：`wfhaqnicwqjfgzjcfmsq`

後續開發、測試、版本比對與交付，一律以本工作區為準。

## 2. 來源基準

營運 APP 原始碼是由 2026-07-17 正式 Vercel 部署內容復原，再接回 GitHub
`main` 分支歷史。Git 狀態中的既有差異代表正式營運版相對於舊 GitHub
基準的功能，不得視為無用變更或任意還原。

加盟店 APP 已保留於同一 repository 的獨立資料夾。修改營運 APP 時，不得
連帶修改加盟店 APP，除非任務明確指定。

## 3. 資料與權限基準

- S05 永久代表隆興店。
- S06 永久代表南華店，目前狀態為暫停營業。
- S01 五甲與 S06 南華僅合併排班、人力與臨時支援範圍。
- S02 凱旋與 S03 武廟同屬排班支援群組，但各店只能修改自己的班表。
- 營收、庫存、日報、巡檢仍以各店獨立計算。
- 門店可看各店匿名臨時支援摘要，不可看其他門店員工姓名、完整班表或請假明細。
- 同一門店可有多個登入帳號；一個門店帳號只對應一個主要門店。
- 門店代碼與 UUID 不得重複使用或重新指派。

## 4. 機密資料

下列內容不得提交 Git：

- `.env`
- `.env.local`
- Supabase service role key
- Vercel token
- 使用者密碼或登入憑證

正式環境變數只存放於 Vercel/Supabase 管理介面；本機使用 `.env.local`。

## 5. 現況限制

- `supabase/drafts` 內 SQL 尚未套用正式資料庫。
- 正式資料庫現有部分排班及人資 RLS 權限過寬，需依部署順序另行核准執行。
- 前端大型 bundle 仍有超過 500 kB 的建置警告，但不影響目前建置成功。

