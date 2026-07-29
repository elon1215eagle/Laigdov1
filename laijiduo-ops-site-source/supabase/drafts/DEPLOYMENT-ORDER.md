# Supabase 草案部署順序

目前兩份 SQL 都是草案，尚未套用正式資料庫。

## 執行前

1. 確認 Supabase project id：`wfhaqnicwqjfgzjcfmsq`。
2. 備份受影響資料表的結構、RLS policies 與關鍵資料。
3. 先在測試或 development branch 驗證。
4. SQL Editor 需貼入檔案內容，不可只貼檔案路徑。

## 執行順序

1. `store_identity_and_operating_scope.sql`
   - 建立門店營運狀態及資料驅動的店群關聯。
   - 固定 S05 隆興、S06 南華。
   - 設定 S06 為暫停營業。

2. 驗證門店代碼、狀態及店群資料。

3. `store_schedule_privacy_and_support_summary.sql`
   - 收斂排班、請假與人資資料的 RLS。
   - 建立不含姓名及請假細節的臨時支援摘要 RPC。

4. 以總部、一般門店、S01、S05、S06、S09 帳號做權限驗證。

5. 驗證通過後才部署相依的前端版本。

## 停止條件

出現下列任一情況時，停止後續執行：

- 門店可讀取其他店員工姓名、完整班表或請假明細。
- S05/S06 名稱或代碼發生交換。
- S06 被納入正常營運 KPI 或可自行新增營運資料。
- 總部角色失去必要管理權限。
- 匿名支援摘要回傳人員姓名或個別請假資料。

