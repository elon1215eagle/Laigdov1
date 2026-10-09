# 2026-10-09 正式版本封存

## 正式部署

- 正式網址：https://laigdov1.vercel.app/
- Vercel deployment：`dpl_7iBHXr88xNXs8jMg9B1HCsny8rXS`
- 正式資產：`assets/index-C8xUMKtr.js`
- 部署狀態：Ready

## 維修內容

- 每日回報三個營收節點未完成時不可送出。
- 明確填寫三個 `0` 仍可正常送出。
- 只對已送出且營收資料不完整的舊回報開放門店補填。
- 正常待審核與已核定回報維持鎖定。
- `sharp` 升級至 `0.35.5`。
- `source-map-js` 升級至 `1.2.2`。

## 驗收證據

- `npm test`：316/316 通過。
- `npm audit`：0 vulnerabilities。
- `npm run build`：通過。
- 手機寬度 426px：回報、排班、調貨、報修、人力可正常載入。
- 瀏覽器 console：0 error、0 warning。
- 敏感 API 匿名請求：401。
- 正式首頁：HTTP 200，安全標頭存在。

## 發布邊界

- 未修改正式營運資料。
- 未修改人資主檔資料。
- 未執行 Supabase migration push 或 repair。
- Supabase migration 分岔尚未納入本版本基準，必須另案備份及對齊。
- `outputs/`、`tmp/`、環境檔及帳號備份不納入版本庫。
