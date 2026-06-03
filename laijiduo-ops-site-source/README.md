# 萊吉多炸雞營運回報

這是正式可部署網站版本的前端專案，已預留 Supabase 登入、角色權限與資料庫讀寫。

## 目前完成

- Supabase 連線設定
- Email / 密碼登入
- 店長、總部、營運督導角色導向
- 店長每日回報表單
- 今日業績 = 14:00 + 19:00 + 打烊
- 盤點品項
- 總部總覽
- 營運督導審核
- 無 Supabase 時可用示範資料預覽

## 上線前設定

1. 到 Supabase 建立專案。
2. 執行 `supabase/schema.sql`。
3. 複製 `.env.example` 成 `.env.local`。
4. 填入：

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 本機啟動

```bash
npm install
npm run dev
```

## 部署

建議部署到 Vercel：

1. 將專案推到 GitHub。
2. Vercel 匯入 GitHub repo。
3. 在 Vercel 專案設定加入同樣的環境變數。
4. Deploy。

## Supabase 帳號資料

建立 Auth 使用者後，需要在 `profiles` 表建立對應資料：

- 店長：`role = store_manager`，且要填 `store_id`
- 總部：`role = hq`
- 營運督導：`role = supervisor`
- 管理員：`role = admin`
