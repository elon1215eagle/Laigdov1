# 萊吉多加盟庫存系統

獨立於萊吉多營運 APP 的加盟店庫存管理系統。第一階段只處理「加盟店每日庫存回報」與「總部 / CFO / COO 庫存總覽」，不混入直營門店營運資料。

## 核心功能

- 加盟店每日填寫庫存、進貨、報廢與備註。
- 主商品可選單位：箱 / 大包 / 小包。
- 總部、CFO、COO 可查看全部加盟店庫存總覽。
- 總部可看到未回報、低庫存、異常耗用、今日進貨量。
- 加盟店帳號只能查看與填寫自己綁定門店。

## 主要資料表

- `franchise_stores`
- `franchise_profiles`
- `franchise_inventory_products`
- `franchise_inventory_reports`
- `franchise_inventory_items`

## Supabase Migration

請套用：

```text
supabase/migration_2026_07_08_franchise_inventory_management.sql
```

## 角色

- `franchise_admin` / `franchise_hq`：總部管理。
- `franchise_coo`：COO，可查看全部與管理庫存。
- `franchise_cfo`：CFO，可查看全部庫存總覽與風險。
- `franchise_owner`：加盟店，只能看自己門店。

## 本機開發

```bash
npm install
npm run dev
```

## 建置

```bash
npm run build
```
