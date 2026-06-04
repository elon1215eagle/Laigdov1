# Laigdov1

萊吉多炸雞營運回報網站。

專案原始碼與完整部署說明位於 [`laijiduo-ops-site-source`](./laijiduo-ops-site-source)。

## Vercel

匯入此 GitHub repository 時，請設定：

- Root Directory：`laijiduo-ops-site-source`
- Framework Preset：`Vite`
- Build Command：`npm run build`
- Output Directory：`dist`
- Environment Variables：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

部署前請先在 Supabase SQL Editor 執行：

```text
laijiduo-ops-site-source/supabase/schema.sql
```
