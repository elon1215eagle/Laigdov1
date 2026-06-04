# 萊吉多炸雞營運回報網站

給門店、總部與營運督導使用的每日營運回報系統。前端使用 React + Vite，資料與登入使用 Supabase，部署目標為 Vercel。

## 功能

- Supabase Email / Password 登入
- 依角色切換門店、總部、營運督導介面
- 門店填寫 14:00、19:00、打烊三段營收
- 門店回報庫存、安全庫存、報廢、進貨與調撥備註
- 總部查看每日營收、達成率、現金差異與回報狀態
- 營運督導審核回報，支援通過、退回修改、指派追蹤
- 未設定 Supabase 時自動使用示範資料

## 本機開發

```bash
npm install
npm run dev
```

## Supabase 設定

1. 建立 Supabase 專案。
2. 到 Supabase SQL Editor 執行 `supabase/schema.sql`。
3. 到 Authentication 建立使用者。
4. 在 `profiles` 資料表新增對應資料。

角色建議：

- 門店：`role = store_manager`，必須設定 `store_id`
- 總部：`role = hq`
- 營運督導：`role = supervisor`
- 管理員：`role = admin`

建立門店帳號 profile 範例：

```sql
insert into public.profiles (id, full_name, role, store_id)
select
  '貼上 auth.users 裡的 user id',
  '林店長',
  'store_manager',
  stores.id
from public.stores
where stores.store_code = 'S01';
```

## 環境變數

本機請複製 `.env.example` 為 `.env.local`：

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Vercel 也要設定同樣兩個環境變數。

## Vercel 部署

1. 將專案推到 GitHub repo。
2. 在 Vercel 匯入該 GitHub repo。
3. Framework Preset 選 `Vite`。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. Environment Variables 新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. Deploy。

本專案已包含 `vercel.json`，Vercel 會依此使用 Vite 建置並輸出 `dist`。
