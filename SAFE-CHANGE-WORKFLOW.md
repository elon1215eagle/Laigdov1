# 萊吉多 APP 安全修改 SOP

## 一、修改前

1. 確認目前位置：

   ```powershell
   cd "C:\Users\ecosw\OneDrive\文件\萊吉多營運APP\Laigdov1"
   git status --short --branch
   ```

2. 確認本次修改屬於營運 APP 或加盟店 APP，不跨資料夾連動修改。
3. 先閱讀 `PROJECT-BASELINE.md` 與營運 APP 的 `CONTEXT.md`。
4. 不得用 `git reset --hard`、大量覆蓋或直接刪除既有差異。
5. 資料庫變更先寫成 SQL 檔並審核，不直接在正式資料庫試錯。

## 二、修改中

1. 每次只處理一個明確功能或問題。
2. 權限、店別範圍、營收歷史限制等規則，優先寫進可測試的共用模組。
3. 保持營運 APP 與加盟店 APP 的環境變數、部署設定及資料流互不污染。
4. 新增 SQL 時，同步註明目的、前置條件、驗證查詢與回復方式。

## 三、修改後驗證

營運 APP：

```powershell
cd "C:\Users\ecosw\OneDrive\文件\萊吉多營運APP\Laigdov1\laijiduo-ops-site-source"
npm test
npm run build
```

再回 repository 根目錄確認差異：

```powershell
cd "C:\Users\ecosw\OneDrive\文件\萊吉多營運APP\Laigdov1"
git diff --check
git status --short
```

最低驗收角色：

- 總部：CEO、COO、總部管理員
- 門店：一般店長帳號
- 督導：CSO/督導帳號
- 特殊店別：S01、S05、S06、S09
- 裝置：手機寬度與桌機寬度

## 四、資料庫及部署

1. SQL 先在 Supabase SQL Editor 分段執行，禁止貼入檔案路徑當 SQL。
2. 執行前確認 project id 為 `wfhaqnicwqjfgzjcfmsq`。
3. 先執行結構與資料，再執行 RLS/RPC，最後跑驗證查詢。
4. 資料庫完成且驗證通過後，才能部署前端。
5. Vercel 部署前確認專案 owner、repository、Root Directory 與環境變數。
6. 未經明確核准，不推送 GitHub、不執行正式 SQL、不部署正式站。

## 五、回復原則

- 前端問題：以 Git commit 或 Vercel 前一版部署回復。
- 資料庫問題：使用事先準備的回復 SQL，不用刪表或清空資料處理。
- 發現跨店資料可見、權限外洩或帳號錯綁時，先停止相關功能，再修正 RLS 與帳號關聯。

