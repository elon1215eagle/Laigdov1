# 萊吉多加盟店 APP

這是獨立於直營總部營運 APP 的加盟店回報系統，不與直營門店資料混用。

## 主要用途

- 加盟店每日 14:00 前營收回報
- 加盟店每日 14:00-19:00 營收回報
- 加盟店每日打烊總營收回報
- 系統自動計算 19:00-打烊營收
- 加盟店每日支出登錄
- 總部可查看加盟店月彙總
- 加盟店帳號只能查看與填寫自己的店

## 資料表

所有資料表都使用 `franchise_` 前綴，避免與原直營 APP 混用。

- `franchise_stores`
- `franchise_profiles`
- `franchise_daily_reports`
- `franchise_expenses`

## 本機啟動

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```

## 環境變數

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Supabase 建表

請套用：

```text
supabase/migration_2026_06_22_franchise_app_schema.sql
```

## 權限原則

- `franchise_admin`：總部管理者，可看全部加盟店資料。
- `franchise_owner`：加盟店帳號，只能看自己綁定的加盟店資料。

未綁定 `franchise_profiles.franchise_store_id` 的加盟店帳號，不會看到任何門店資料。
