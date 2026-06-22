import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStoreInspection,
  fetchStoreInspections,
  fetchStores,
  hasSupabaseConfig,
  updateStoreInspection,
} from "./lib/api";
import "./styles.css";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekRange(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  const start = addDays(dateText, 1 - day);
  return { start, end: addDays(start, 6) };
}

function getMonthRange(dateText) {
  const date = new Date(`${dateText}T00:00:00Z`);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

const fallbackStores = [
  { id: "fongshan-wujia", name: "鳳山五甲店", area: "高雄", manager: "未設定" },
  { id: "fongshan-kaixuan", name: "鳳山凱旋店", area: "高雄", manager: "未設定" },
  { id: "fongshan-wumiao", name: "鳳山武廟店", area: "高雄", manager: "未設定" },
  { id: "fongshan-zhongshan", name: "鳳山中山店", area: "高雄", manager: "未設定" },
  { id: "qianzhen-longxing", name: "前鎮隆興店", area: "高雄", manager: "未設定" },
  { id: "fongshan-nanhua", name: "鳳山南華店", area: "高雄", manager: "未設定" },
  { id: "sanmin-dingshan", name: "三民鼎山店", area: "高雄", manager: "未設定" },
  { id: "sanmin-dachang", name: "三民大昌店", area: "高雄", manager: "未設定" },
  { id: "sanmin-yihua", name: "三民義華店", area: "高雄", manager: "未設定" },
  { id: "pingtung-chaozhou", name: "屏東潮洲店", area: "屏東", manager: "未設定" },
  { id: "pingtung-chaozhou-2", name: "屏東潮洲店", area: "屏東", manager: "未設定" },
];

const categoryOptions = [
  "營運管理",
  "產品品質",
  "前台服務",
  "冰箱整潔",
  "作業區衛生",
  "店內衛生",
  "店外環境",
  "設備安全",
  "其他",
];

const severityOptions = ["一般", "重要", "緊急"];
const statusOptions = ["待確認", "待改善", "已改善"];

const inspectionSections = [
  {
    id: "product",
    title: "一、營運管理 - 產品品質",
    maxScore: 50,
    type: "product",
    columns: ["外觀", "口感", "熟度", "時效", "顏色"],
    items: ["雞翅", "地瓜", "三角骨", "米花", "腿排", "點心類", "雞腿", "雞排", "雞皮", "雞脖子"].map((name) => ({
      id: `product-${name}`,
      name,
      maxScore: 5,
    })),
  },
  {
    id: "process",
    title: "二、營運管理 - 營運流程",
    maxScore: 5,
    type: "basic",
    items: [
      "開店 / 閉店流程執行正確",
      "現場人員出勤與服裝整潔",
      "銷售數據、庫存紀錄正確",
      "現場人員編制合理性",
      "店面連絡用手機運作正常",
    ].map((name, index) => ({ id: `process-${index}`, name, maxScore: 1 })),
  },
  {
    id: "service",
    title: "三、前台服務",
    maxScore: 10,
    type: "basic",
    items: [
      { name: "櫃面商品擺放整齊美觀", maxScore: 3 },
      { name: "員工服務態度親切積極", maxScore: 3 },
      { name: "顧客意見處理與回饋（現場與 Google 評論）", maxScore: 2 },
      { name: "銷售出餐速度與效率", maxScore: 2 },
    ].map((item, index) => ({ id: `service-${index}`, ...item })),
  },
  {
    id: "fridge",
    title: "四、冰箱整潔（食材存放）",
    maxScore: 5,
    type: "basic",
    items: [
      "冰箱整潔無結霜、異味、黑痕",
      "食材保存與標示規範",
      "食材使用：先進先出",
      "溫控管制確實",
      "冰箱膠條片壓條槽清潔",
    ].map((name, index) => ({ id: `fridge-${index}`, name, maxScore: 1 })),
  },
  {
    id: "workarea",
    title: "五、作業區衛生",
    maxScore: 21,
    type: "basic",
    items: [
      { name: "煙罩汙垢、鐵管汙漬、前台桌面清潔", maxScore: 3 },
      { name: "三角斗未刮、粉槽污漬、出口鐵面清潔", maxScore: 3 },
      { name: "炸爐面板、蓋板與外觀油污", maxScore: 3 },
      { name: "手推垃圾、洗手槽、清洗區清潔", maxScore: 3 },
      { name: "室內地板、排煙風管、電風扇清潔", maxScore: 3 },
      { name: "熱風機、排風扇與備品區整潔", maxScore: 2 },
      { name: "食材交叉污染防範", maxScore: 3 },
      { name: "油品更換品質", maxScore: 1 },
    ].map((item, index) => ({ id: `workarea-${index}`, ...item })),
  },
  {
    id: "inside",
    title: "六、店內衛生",
    maxScore: 4,
    type: "basic",
    items: [
      { name: "通風口、天花板、照明設備", maxScore: 2 },
      { name: "垃圾分類及定期消毒滅蟲", maxScore: 2 },
    ].map((item, index) => ({ id: `inside-${index}`, ...item })),
  },
  {
    id: "outside",
    title: "七、店外周遭環境（整潔、設備與安全）",
    maxScore: 5,
    type: "basic",
    items: [
      "周邊環境維持整潔",
      "社區溝通",
      "排煙、炸爐、冰箱、監控等設備運作正常",
      "消防、急救、緊急出口設備齊全並定期檢查",
      "店面外觀、照明、招牌整潔維護",
    ].map((name, index) => ({ id: `outside-${index}`, name, maxScore: 1 })),
  },
  {
    id: "other",
    title: "八、其他（不計分）",
    maxScore: 0,
    type: "basic",
    items: [
      "上次巡檢缺失改善情況",
      "其他需特別注意事項",
      "其他",
    ].map((name, index) => ({ id: `other-${index}`, name, maxScore: 0 })),
  },
];

const checkOptions = ["良好", "需改善", "不適用"];
const productCheckOptions = ["良好", "普通", "需改善", "不適用"];

const seedInspections = [
  {
    id: "sample-1",
    storeId: "fongshan-kaixuan",
    storeName: "鳳山凱旋店",
    date: "2026-06-02",
    supervisor: "郭承廷",
    manager: "孫協政",
    score: 82,
    status: "待確認",
    imageNames: [
      "LINE_ALBUM_2026年6月份巡檢表_260605_1.jpg",
      "LINE_ALBUM_2026年6月份巡檢表_260605_2.jpg",
      "LINE_ALBUM_2026年6月份巡檢表_260605_3.jpg",
    ],
    images: [],
    summary: "冰箱、作業區與店外環境有多項清潔及設備事項需要追蹤。",
    issues: [
      {
        category: "產品品質",
        title: "部分品項時效與熟成需確認",
        description: "地瓜、三角骨與腿排等品項有時效性或熟成不足的紀錄。",
        suggestion: "由店長重新確認保存時效、熟成狀態與報廢紀錄。",
        severity: "重要",
        dueDate: "2026-06-09",
        status: "待改善",
      },
      {
        category: "冰箱整潔",
        title: "冰箱內有菌痕、血水與墊片汙垢",
        description: "冰箱內部、玻璃側邊與墊片有清潔不足紀錄。",
        suggestion: "安排每日閉店清潔，督導下次巡檢複查。",
        severity: "重要",
        dueDate: "2026-06-09",
        status: "待改善",
      },
      {
        category: "作業區衛生",
        title: "地板血水、油汙與設備表面需清潔",
        description: "炸爐、地板、粉槽與洗手槽周邊有油汙或粉塵。",
        suggestion: "補強尖峰後清潔流程，拍照回傳改善結果。",
        severity: "重要",
        dueDate: "2026-06-08",
        status: "待改善",
      },
      {
        category: "店外環境",
        title: "周邊環境有菸頭與垃圾",
        description: "店外周邊發現菸頭、垃圾等環境整潔問題。",
        suggestion: "每日開店與交班巡視門口周邊。",
        severity: "一般",
        dueDate: "2026-06-10",
        status: "待改善",
      },
      {
        category: "設備安全",
        title: "滅火器過期需更換",
        description: "巡檢紀錄標註滅火器過期。",
        suggestion: "立即更換並補拍有效期限照片。",
        severity: "緊急",
        dueDate: "2026-06-06",
        status: "待改善",
      },
    ],
  },
];

const storageKey = "laijiduo-inspections-v1";

function createBlankIssue() {
  return {
    category: "其他",
    title: "",
    description: "",
    suggestion: "",
    severity: "一般",
    dueDate: "",
    status: "待確認",
  };
}

function createBlankInspectionForm() {
  const sections = Object.fromEntries(
    inspectionSections.map((section) => [
      section.id,
      {
        items: Object.fromEntries(
          section.items.map((item) => [
            item.id,
            {
              score: item.maxScore,
              maxScore: item.maxScore,
              status: item.maxScore ? "良好" : "OK",
              checks: section.type === "product"
                ? Object.fromEntries(section.columns.map((column) => [column, "良好"]))
                : {},
              note: "",
              suggestion: "",
            },
          ]),
        ),
      },
    ]),
  );
  return {
    sections,
    customFindings: [
      { title: "", score: 0, maxScore: 0, status: "待確認", note: "", suggestion: "" },
      { title: "", score: 0, maxScore: 0, status: "待確認", note: "", suggestion: "" },
    ],
    conclusion: "",
  };
}

function getFormScore(form) {
  const fixed = inspectionSections.reduce(
    (total, section) => {
      section.items.forEach((item) => {
        const row = form.sections?.[section.id]?.items?.[item.id];
        total.score += Number(row?.score || 0);
        total.maxScore += Number(item.maxScore || 0);
      });
      return total;
    },
    { score: 0, maxScore: 0 },
  );
  const custom = (form.customFindings || []).reduce(
    (total, item) => ({
      score: total.score + Number(item.score || 0),
      maxScore: total.maxScore + Number(item.maxScore || 0),
    }),
    { score: 0, maxScore: 0 },
  );
  return {
    score: Math.round((fixed.score + custom.score) * 10) / 10,
    maxScore: fixed.maxScore + custom.maxScore,
  };
}

function getSectionScore(section, form) {
  return section.items.reduce((sum, item) => {
    const row = form.sections?.[section.id]?.items?.[item.id];
    return sum + Number(row?.score || 0);
  }, 0);
}

function scoreTone(score, maxScore) {
  const rate = maxScore ? score / maxScore : 1;
  if (rate >= 0.9) return "good";
  if (rate >= 0.75) return "warn";
  return "bad";
}

function makeIssuesFromForm(form, date) {
  const issues = [];
  inspectionSections.forEach((section) => {
    section.items.forEach((item) => {
      const row = form.sections?.[section.id]?.items?.[item.id];
      if (!row) return;
      const hasDeduction = Number(row.score || 0) < Number(item.maxScore || 0);
      const hasNote = row.note?.trim() || row.suggestion?.trim();
      if (!hasDeduction && !hasNote) return;
      issues.push({
        category: section.title.replace(/^[一二三四五六七八]、/, "").replace(/（.*）/, ""),
        title: item.name,
        description: row.note || `本項得分 ${row.score} / ${item.maxScore}`,
        suggestion: row.suggestion || "請店長於期限內完成改善，督導下次巡檢複查。",
        severity: Number(row.score || 0) <= Number(item.maxScore || 0) * 0.5 ? "重要" : "一般",
        dueDate: date,
        status: "待改善",
      });
    });
  });
  (form.customFindings || []).forEach((item, index) => {
    if (!item.title?.trim() && !item.note?.trim()) return;
    issues.push({
      category: "其他",
      title: item.title || `督導自填巡檢結果 ${index + 1}`,
      description: item.note || "",
      suggestion: item.suggestion || "",
      severity: item.status === "緊急" ? "緊急" : "一般",
      dueDate: date,
      status: "待改善",
    });
  });
  return issues.length ? issues : [createBlankIssue()];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadSavedInspections() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return seedInspections;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed : seedInspections;
  } catch {
    return seedInspections;
  }
}

function normalizeAiIssues(issues) {
  if (!Array.isArray(issues) || !issues.length) return null;
  return issues.map((issue) => ({
    category: categoryOptions.includes(issue.category) ? issue.category : "其他",
    title: issue.title || "未命名問題",
    description: issue.description || "",
    suggestion: issue.suggestion || "",
    severity: severityOptions.includes(issue.severity) ? issue.severity : "一般",
    dueDate: issue.dueDate || "",
    status: statusOptions.includes(issue.status) ? issue.status : "待確認",
  }));
}

async function requestAiParse({ store, date, supervisor, imageRows }) {
  const response = await fetch("/api/parse-inspection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: store.name,
      manager: store.manager,
      date,
      supervisor,
      images: imageRows,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "AI 解析服務暫時無法使用");
  }
  return data;
}

async function createDemoParse({ storeId, date, supervisor, files, stores }) {
  const store = stores.find((item) => item.id === storeId) || stores[0] || fallbackStores[0];
  const imageRows = await Promise.all(
    Array.from(files).map(async (file) => ({
      name: file.name,
      url: await fileToDataUrl(file),
    })),
  );
  try {
    const aiResult = await requestAiParse({ store, date, supervisor, imageRows });
    return {
      id: crypto.randomUUID(),
      storeId: store.id,
      storeName: aiResult.storeName || store.name,
      date: aiResult.date || date,
      supervisor: aiResult.supervisor || supervisor,
      manager: aiResult.manager || store.manager,
      score: Number(aiResult.score || 0),
      status: "待確認",
      sourceType: "upload",
      imageNames: imageRows.map((image) => image.name),
      images: imageRows,
      summary: aiResult.summary || "AI 已完成初步解析，請確認手寫內容與問題分類。",
      issues: normalizeAiIssues(aiResult.issues) || [createBlankIssue()],
    };
  } catch (error) {
    return {
      id: crypto.randomUUID(),
      storeId: store.id,
      storeName: store.name,
      date,
      supervisor,
      manager: store.manager,
      score: 80,
      status: "待確認",
      sourceType: "upload",
      imageNames: Array.from(files).map((file) => file.name),
      images: imageRows,
      summary: `尚未連上 AI 解析服務，已建立示範草稿。原因：${error.message}`,
      issues: [
        {
          category: "冰箱整潔",
          title: "冰箱內部與墊片清潔需確認",
          description: "由巡檢表照片判讀，冰箱清潔欄位有待加強或備註。",
          suggestion: "請確認手寫內容後，指派門市完成清潔並回傳照片。",
          severity: "重要",
          dueDate: date,
          status: "待確認",
        },
        {
          category: "作業區衛生",
          title: "作業區清潔需複查",
          description: "作業區衛生區塊有多項手寫備註，需人工補正完整內容。",
          suggestion: "確認炸爐、工作台、地板、洗手槽等項目。",
          severity: "重要",
          dueDate: date,
          status: "待確認",
        },
        {
          category: "店外環境",
          title: "店外環境需巡視",
          description: "店外周邊環境區塊有手寫備註，需確認是否列入追蹤。",
          suggestion: "確認是否有菸頭、垃圾、照明或設備安全問題。",
          severity: "一般",
          dueDate: date,
          status: "待確認",
        },
      ],
    };
  }
}

function buildCsv(records) {
  const headers = ["巡檢日期", "門市", "督導", "店長", "分類", "問題", "說明", "改善建議", "嚴重度", "期限", "狀態"];
  const rows = records.flatMap((record) =>
    record.issues.map((issue) => [
      record.date,
      record.storeName,
      record.supervisor,
      record.manager,
      issue.category,
      issue.title,
      issue.description,
      issue.suggestion,
      issue.severity,
      issue.dueDate,
      issue.status,
    ]),
  );
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function downloadCsv(csv) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  link.href = url;
  link.download = `巡檢問題匯整_${today}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fileSafeName(value) {
  return String(value || "巡檢表").replace(/[\\/:*?"<>|]/g, "-");
}

function downloadBlob(content, filename, type) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildInspectionExportRows(record) {
  if (!record.formData) return [];
  return inspectionSections.flatMap((section) =>
    section.items.map((item) => {
      const row = record.formData.sections?.[section.id]?.items?.[item.id] || {};
      const checks = section.type === "product"
        ? section.columns.map((column) => `${column}:${row.checks?.[column] || ""}`).join(" / ")
        : row.status || "";
      return {
        section: section.title,
        item: item.name,
        score: row.score ?? "",
        maxScore: item.maxScore,
        status: checks,
        note: row.note || "",
        suggestion: row.suggestion || "",
      };
    }),
  );
}

function buildSingleInspectionHtml(record, output = "document") {
  const scoreMax = record.maxScore || (record.formData ? getFormScore(record.formData).maxScore : 100);
  const scoreRate = scoreMax ? Math.round((Number(record.score || 0) / scoreMax) * 1000) / 10 : 0;
  const scoreLevel = scoreRate >= 90 ? "優良" : scoreRate >= 80 ? "合格" : scoreRate >= 70 ? "需追蹤" : "需立即改善";
  const rows = buildInspectionExportRows(record);
  const sectionRows = record.formData
    ? inspectionSections.map((section) => {
      const score = getSectionScore(section, record.formData);
      const rate = section.maxScore ? Math.round((score / section.maxScore) * 1000) / 10 : 100;
      return `<tr><td>${htmlEscape(section.title)}</td><td class="num">${htmlEscape(score)}</td><td class="num">${htmlEscape(section.maxScore)}</td><td class="num">${htmlEscape(rate)}%</td></tr>`;
    }).join("")
    : "";
  const detailRows = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${htmlEscape(row.section)}</td>
        <td>${htmlEscape(row.item)}</td>
        <td class="num">${htmlEscape(row.score)}</td>
        <td class="num">${htmlEscape(row.maxScore)}</td>
        <td>${htmlEscape(row.status)}</td>
        <td>${htmlEscape(row.note)}</td>
        <td>${htmlEscape(row.suggestion)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">此紀錄由照片解析建立，無線上填表逐項分數。</td></tr>`;
  const issueRows = (record.issues || []).map((issue) => `
    <tr>
      <td>${htmlEscape(issue.category)}</td>
      <td>${htmlEscape(issue.title)}</td>
      <td>${htmlEscape(issue.description)}</td>
      <td>${htmlEscape(issue.suggestion)}</td>
      <td>${htmlEscape(issue.severity)}</td>
      <td>${htmlEscape(issue.dueDate)}</td>
      <td>${htmlEscape(issue.status)}</td>
    </tr>
  `).join("");
  const printStyle = output === "pdf" ? "@page { size: A4; margin: 12mm; }" : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(record.storeName)} 巡檢表</title>
  <style>
    ${printStyle}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Microsoft JhengHei", Arial, sans-serif; color: #202020; background: #fff; }
    .sheet { max-width: 1120px; margin: 0 auto; padding: 22px; }
    .report-head { display: grid; grid-template-columns: 1fr 210px; gap: 16px; align-items: start; border-bottom: 3px solid #202020; padding-bottom: 14px; margin-bottom: 14px; }
    .brand { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: 1px; }
    h1 { margin: 4px 0 8px; font-size: 26px; }
    .subtitle { margin: 0; color: #555; font-size: 12px; }
    .score-box { border: 2px solid #202020; padding: 12px; text-align: center; }
    .score-box span { display: block; font-size: 12px; color: #555; }
    .score-box strong { display: block; margin: 4px 0; font-size: 30px; }
    .score-box em { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #f2f2f2; font-style: normal; font-weight: 800; }
    h2 { margin: 22px 0 8px; padding-left: 8px; border-left: 5px solid #df3e24; font-size: 17px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; table-layout: fixed; }
    th, td { border: 1px solid #999; padding: 7px 8px; font-size: 12px; line-height: 1.45; vertical-align: top; word-break: break-word; }
    th { background: #f2f2f2; font-weight: 800; text-align: left; }
    .meta th { width: 14%; background: #f7f7f7; }
    .meta td { width: 36%; font-size: 14px; }
    .num { text-align: right; white-space: nowrap; }
    .section-table th:nth-child(1) { width: 58%; }
    .section-table th:nth-child(2), .section-table th:nth-child(3), .section-table th:nth-child(4) { width: 14%; }
    .detail-table th:nth-child(1) { width: 20%; }
    .detail-table th:nth-child(2) { width: 13%; }
    .detail-table th:nth-child(3), .detail-table th:nth-child(4) { width: 7%; }
    .detail-table th:nth-child(5) { width: 18%; }
    .detail-table th:nth-child(6), .detail-table th:nth-child(7) { width: 17.5%; }
    .issue-table th:nth-child(1) { width: 13%; }
    .issue-table th:nth-child(2) { width: 17%; }
    .issue-table th:nth-child(3), .issue-table th:nth-child(4) { width: 22%; }
    .issue-table th:nth-child(5), .issue-table th:nth-child(6), .issue-table th:nth-child(7) { width: 8%; }
    .note-box { min-height: 74px; border: 1px solid #999; padding: 10px; white-space: pre-wrap; }
    .sign-table td { height: 88px; text-align: center; vertical-align: middle; }
    .signature-img { max-width: 240px; max-height: 76px; object-fit: contain; }
    .footer { margin-top: 10px; color: #666; font-size: 11px; text-align: right; }
    @media print {
      .sheet { padding: 0; }
      h2 { break-after: avoid; }
      tr, .score-box { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
  <div class="report-head">
    <div>
      <p class="brand">LAIJIDUO OPERATIONS</p>
      <h1>萊吉多店面督導巡檢表</h1>
      <p class="subtitle">單店巡檢紀錄、評分明細與改善追蹤表</p>
    </div>
    <div class="score-box">
      <span>巡檢總分</span>
      <strong>${htmlEscape(record.score)} / ${htmlEscape(scoreMax)}</strong>
      <em>${htmlEscape(scoreLevel)}｜${htmlEscape(scoreRate)}%</em>
    </div>
  </div>
  <table class="meta">
    <tr><th>巡檢日期</th><td>${htmlEscape(record.date)}</td><th>門市名稱</th><td>${htmlEscape(record.storeName)}</td></tr>
    <tr><th>店長名稱</th><td>${htmlEscape(record.manager)}</td><th>督導名稱</th><td>${htmlEscape(record.supervisor)}</td></tr>
    <tr><th>巡檢狀態</th><td>${htmlEscape(record.status)}</td><th>匯出日期</th><td>${htmlEscape(today)}</td></tr>
  </table>
  <h2>評分分類總覽</h2>
  <table class="section-table">
    <thead><tr><th>區段</th><th>得分</th><th>滿分</th><th>達成率</th></tr></thead>
    <tbody>${sectionRows || `<tr><td colspan="4">無分類分數資料</td></tr>`}</tbody>
  </table>
  <h2>巡檢逐項明細</h2>
  <table class="detail-table">
    <thead><tr><th>區段</th><th>項目</th><th>得分</th><th>滿分</th><th>狀態 / 檢核</th><th>說明</th><th>改善建議</th></tr></thead>
    <tbody>${detailRows}</tbody>
  </table>
  <h2>問題追蹤明細</h2>
  <table class="issue-table">
    <thead><tr><th>分類</th><th>問題</th><th>說明</th><th>改善建議</th><th>嚴重度</th><th>期限</th><th>狀態</th></tr></thead>
    <tbody>${issueRows || `<tr><td colspan="7">無待追蹤問題</td></tr>`}</tbody>
  </table>
  <h2>巡檢建議與總結</h2>
  <div class="note-box">${htmlEscape(record.summary || "")}</div>
  <h2>簽核確認</h2>
  <table class="sign-table">
    <thead><tr><th>督導簽名</th><th>店長簽名</th><th>總部複核</th></tr></thead>
    <tbody><tr><td></td><td>${record.managerSignature ? `<img class="signature-img" src="${htmlEscape(record.managerSignature)}" />` : ""}</td><td></td></tr></tbody>
  </table>
  <p class="footer">本表由萊吉多營運 APP 匯出，作為門店巡檢、改善追蹤與週會檢討依據。</p>
  </div>
</body>
</html>`;
}

function exportInspectionExcel(record) {
  const filename = `${fileSafeName(record.date)}_${fileSafeName(record.storeName)}_巡檢表.xls`;
  downloadBlob(`\uFEFF${buildSingleInspectionHtml(record, "excel")}`, filename, "application/vnd.ms-excel;charset=utf-8");
}

function exportInspectionWord(record) {
  const filename = `${fileSafeName(record.date)}_${fileSafeName(record.storeName)}_巡檢表.doc`;
  downloadBlob(`\uFEFF${buildSingleInspectionHtml(record, "word")}`, filename, "application/msword;charset=utf-8");
}

function exportInspectionPdf(record) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(buildSingleInspectionHtml(record, "pdf"));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function countBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    if (!map.has(key)) map.set(key, { key, count: 0, rows: [] });
    const item = map.get(key);
    item.count += 1;
    item.rows.push(row);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "zh-Hant"));
}

function buildInspectionAnalytics(inspections, filters, stores) {
  const filtered = inspections
    .filter((record) => record.date >= filters.from && record.date <= filters.to)
    .filter((record) => filters.storeId === "all" || record.storeId === filters.storeId)
    .sort((a, b) => b.date.localeCompare(a.date) || a.storeName.localeCompare(b.storeName, "zh-Hant"));
  const issues = filtered.flatMap((record) =>
    (record.issues || []).map((issue) => ({ ...issue, record })),
  );
  const storeMap = new Map();
  stores.forEach((store) => {
    storeMap.set(store.id, {
      storeId: store.id,
      storeName: store.name,
      records: [],
      issues: [],
      avgScore: 0,
      latestDate: "",
      commonIssue: "-",
    });
  });
  filtered.forEach((record) => {
    const storeId = record.storeId || record.storeName;
    if (!storeMap.has(storeId)) {
      storeMap.set(storeId, { storeId, storeName: record.storeName, records: [], issues: [], avgScore: 0, latestDate: "", commonIssue: "-" });
    }
    const row = storeMap.get(storeId);
    row.records.push(record);
    row.latestDate = row.latestDate && row.latestDate > record.date ? row.latestDate : record.date;
  });
  issues.forEach((issue) => {
    const storeId = issue.record.storeId || issue.record.storeName;
    storeMap.get(storeId)?.issues.push(issue);
  });
  const storeRows = Array.from(storeMap.values())
    .filter((row) => row.records.length)
    .map((row) => {
      const avgScore = row.records.reduce((sum, record) => sum + Number(record.score || 0), 0) / row.records.length;
      const commonIssue = countBy(row.issues, (issue) => issue.category)[0]?.key || "-";
      return {
        ...row,
        avgScore: Math.round(avgScore * 10) / 10,
        issueCount: row.issues.length,
        pendingCount: row.issues.filter((issue) => issue.status !== "已改善").length,
        urgentCount: row.issues.filter((issue) => issue.severity === "緊急").length,
        commonIssue,
      };
    })
    .sort((a, b) => a.avgScore - b.avgScore || b.issueCount - a.issueCount);
  const commonIssues = countBy(issues, (issue) => `${issue.category}｜${issue.title}`).slice(0, 10);
  const improvements = countBy(
    issues.filter((issue) => issue.suggestion),
    (issue) => issue.suggestion,
  ).slice(0, 8);
  const avgScore = filtered.length
    ? Math.round((filtered.reduce((sum, record) => sum + Number(record.score || 0), 0) / filtered.length) * 10) / 10
    : 0;
  return {
    filtered,
    issues,
    storeRows,
    commonIssues,
    improvements,
    avgScore,
    pendingCount: issues.filter((issue) => issue.status !== "已改善").length,
    urgentCount: issues.filter((issue) => issue.severity === "緊急").length,
  };
}

export function InspectionApp({ onBack }) {
  const [page, setPage] = useState("stores");
  const [inspectionStores, setInspectionStores] = useState(fallbackStores);
  const [inspections, setInspections] = useState(loadSavedInspections);
  const [selectedId, setSelectedId] = useState(() => loadSavedInspections()[0]?.id || seedInspections[0].id);
  const [csvExport, setCsvExport] = useState(null);
  const [syncMessage, setSyncMessage] = useState("");
  const selected = inspections.find((item) => item.id === selectedId) || inspections[0];

  useEffect(() => {
    if (!hasSupabaseConfig) localStorage.setItem(storageKey, JSON.stringify(inspections));
  }, [inspections]);

  useEffect(() => {
    let active = true;
    async function loadCloudData() {
      if (!hasSupabaseConfig) return;
      try {
        const storeRows = await fetchStores();
        if (!active) return;
        setInspectionStores(storeRows.map((store) => ({
          id: store.id,
          name: store.name,
          area: store.area,
          manager: store.manager_name || "未設定",
        })));
        const cloudInspections = await fetchStoreInspections();
        if (!active || !cloudInspections) return;
        setInspections(cloudInspections.length ? cloudInspections : []);
        setSelectedId(cloudInspections[0]?.id || "");
        setSyncMessage("巡檢資料已連接 Supabase");
      } catch (error) {
        if (!active) return;
        setSyncMessage(`Supabase 巡檢資料讀取失敗，暫用本機資料：${error.message}`);
      }
    }
    loadCloudData();
    return () => {
      active = false;
    };
  }, []);

  async function addInspection(record) {
    try {
      const saved = hasSupabaseConfig ? await createStoreInspection(record) : record;
      setInspections((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedId(saved.id);
      setSyncMessage(hasSupabaseConfig ? "巡檢資料已儲存至 Supabase" : "巡檢資料已儲存在本機");
    } catch (error) {
      setInspections((current) => [record, ...current]);
      setSelectedId(record.id);
      setSyncMessage(`Supabase 儲存失敗，已暫存本機：${error.message}`);
    }
    setPage("review");
  }

  function updateInspection(nextRecord) {
    setInspections((current) => current.map((item) => (item.id === nextRecord.id ? nextRecord : item)));
  }

  async function persistInspection(record) {
    try {
      if (hasSupabaseConfig) await updateStoreInspection(record);
      setSyncMessage(hasSupabaseConfig ? "巡檢修改已同步 Supabase" : "巡檢修改已儲存在本機");
    } catch (error) {
      setSyncMessage(`巡檢修改同步失敗：${error.message}`);
    }
  }

  const stats = useMemo(() => {
    const issues = inspections.flatMap((item) => item.issues);
    return {
      inspections: inspections.length,
      issues: issues.length,
      urgent: issues.filter((issue) => issue.severity === "緊急").length,
      pending: issues.filter((issue) => issue.status !== "已改善").length,
    };
  }, [inspections]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">萊</div>
          <div>
            <strong>萊吉多門店管理</strong>
            <span>督導巡檢中心</span>
          </div>
        </div>
        <nav className="side-nav">
          <button className={page === "stores" ? "active" : ""} onClick={() => setPage("stores")}>門店管理</button>
          <button className={page === "form" ? "active" : ""} onClick={() => setPage("form")}>線上填表</button>
          <button className={page === "upload" ? "active" : ""} onClick={() => setPage("upload")}>巡檢表上傳</button>
          <button className={page === "review" ? "active" : ""} onClick={() => setPage("review")}>解析確認</button>
          <button className={page === "tracking" ? "active" : ""} onClick={() => setPage("tracking")}>問題追蹤</button>
          <button className={page === "analytics" ? "active" : ""} onClick={() => setPage("analytics")}>彙整分析</button>
        </nav>
        <label className="field-label">巡檢紀錄</label>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {inspections.map((inspection) => (
            <option key={inspection.id} value={inspection.id}>
              {inspection.date} {inspection.storeName}
            </option>
          ))}
        </select>
        <div className="sidebar-note">
          <span>目前流程</span>
          <strong>現場填表 → 自動算分 → 產生追蹤</strong>
          <p>{syncMessage || "督導現場以點選為主，必要時再補備註與改善建議。"}</p>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <p>{today} · {selected?.storeName || "尚未選擇門市"}</p>
            <h1>{pageTitle(page)}</h1>
          </div>
          <div className="top-actions">
            {onBack && <button onClick={onBack}>回營運回報</button>}
            <button
              onClick={() => {
                const csv = buildCsv(inspections);
                setCsvExport(csv);
                downloadCsv(csv);
              }}
            >
              匯出 CSV
            </button>
            <button className="primary" onClick={() => setPage("form")}>新增巡檢</button>
          </div>
        </header>

        <section className="kpi-strip">
          <Metric label="巡檢紀錄" value={`${stats.inspections} 筆`} detail="已上傳或待確認" />
          <Metric label="問題明細" value={`${stats.issues} 項`} detail="可追蹤改善事項" />
          <Metric label="緊急事項" value={`${stats.urgent} 項`} detail="需優先處理" tone="bad" />
          <Metric label="待處理" value={`${stats.pending} 項`} detail="尚未標記已改善" tone="warn" />
        </section>

        {page === "stores" && (
          <StoreManagementPanel
            inspections={inspections}
            stores={inspectionStores}
            onSelectStore={(storeId) => {
              const inspection = inspections.find((item) => item.storeId === storeId);
              if (inspection) setSelectedId(inspection.id);
              setPage(inspection ? "review" : "upload");
            }}
          />
        )}
        {page === "form" && <OnlineInspectionForm stores={inspectionStores} onAdd={addInspection} />}
        {page === "upload" && <UploadPanel stores={inspectionStores} onAdd={addInspection} />}
        {page === "review" && selected && <ReviewPanel record={selected} onChange={updateInspection} onPersist={persistInspection} />}
        {page === "tracking" && (
          <TrackingPanel
            inspections={inspections}
            onSelect={(id) => {
              setSelectedId(id);
              setPage("review");
            }}
          />
        )}
        {page === "analytics" && <InspectionAnalyticsPanel inspections={inspections} onSelect={(id) => {
          setSelectedId(id);
          setPage("review");
        }} stores={inspectionStores} />}
        {csvExport && <CsvExportPanel csv={csvExport} onClose={() => setCsvExport(null)} />}
      </main>
    </div>
  );
}

function CsvExportPanel({ csv, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copyCsv() {
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="csv-export-panel">
      <div className="panel-head">
        <div>
          <h2>CSV 已產生</h2>
          <p>若瀏覽器沒有自動下載，可在這裡再次下載或複製內容。</p>
        </div>
        <button onClick={onClose}>關閉</button>
      </div>
      <div className="csv-actions">
        <button className="primary" onClick={() => downloadCsv(csv)}>下載 CSV</button>
        <button onClick={copyCsv}>{copied ? "已複製" : "複製內容"}</button>
      </div>
      <textarea readOnly value={csv} />
    </section>
  );
}

function pageTitle(page) {
  return {
    stores: "門店管理",
    form: "線上巡檢填表",
    upload: "巡檢表上傳",
    review: "解析結果確認",
    tracking: "問題追蹤總覽",
    analytics: "巡檢彙整分析",
  }[page] || "門店管理";
}

function OnlineInspectionForm({ stores, onAdd }) {
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [date, setDate] = useState(today);
  const [supervisor, setSupervisor] = useState("");
  const [manager, setManager] = useState("");
  const [form, setForm] = useState(createBlankInspectionForm);
  const [managerSignature, setManagerSignature] = useState("");
  const selectedStore = stores.find((store) => store.id === storeId) || stores[0] || fallbackStores[0];
  const total = getFormScore(form);

  useEffect(() => {
    if (!storeId && stores[0]?.id) setStoreId(stores[0].id);
  }, [storeId, stores]);

  function patchItem(sectionId, itemId, patch) {
    setForm((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [sectionId]: {
          ...current.sections[sectionId],
          items: {
            ...current.sections[sectionId].items,
            [itemId]: {
              ...current.sections[sectionId].items[itemId],
              ...patch,
            },
          },
        },
      },
    }));
  }

  function patchProductCheck(sectionId, itemId, column, value) {
    setForm((current) => {
      const row = current.sections[sectionId].items[itemId];
      return {
        ...current,
        sections: {
          ...current.sections,
          [sectionId]: {
            ...current.sections[sectionId],
            items: {
              ...current.sections[sectionId].items,
              [itemId]: {
                ...row,
                checks: { ...row.checks, [column]: value },
              },
            },
          },
        },
      };
    });
  }

  function quickSet(section, item, status) {
    const score = status === "良好" ? item.maxScore : status === "不適用" ? item.maxScore : 0;
    patchItem(section.id, item.id, { status, score });
  }

  function patchCustom(index, patch) {
    const customFindings = [...form.customFindings];
    customFindings[index] = { ...customFindings[index], ...patch };
    setForm({ ...form, customFindings });
  }

  function submit(event) {
    event.preventDefault();
    const issues = makeIssuesFromForm(form, date);
    onAdd({
      id: crypto.randomUUID(),
      storeId,
      storeName: selectedStore.name,
      date,
      supervisor: supervisor.trim(),
      manager: manager.trim(),
      score: total.score,
      maxScore: total.maxScore,
      status: "已完成",
      imageNames: [],
      images: [],
      summary: form.conclusion || `線上巡檢完成，總分 ${total.score} / ${total.maxScore}，待改善 ${issues.filter((issue) => issue.title).length} 項。`,
      formData: form,
      managerSignature,
      issues,
    });
    setForm(createBlankInspectionForm());
    setManagerSignature("");
  }

  return (
    <form className="workspace inspection-form-grid" onSubmit={submit}>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>線上巡檢填表</h2>
            <p>現場以點選與填分為主；有扣分或備註的項目會自動進入問題追蹤。</p>
          </div>
          <div className={`inspection-score ${scoreTone(total.score, total.maxScore)}`}>
            <span>總分</span>
            <strong>{total.score} / {total.maxScore}</strong>
          </div>
        </div>
        <div className="form-grid compact-form">
          <label>
            門市
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label>巡檢日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>督導姓名<input value={supervisor} onChange={(event) => setSupervisor(event.target.value)} placeholder="請輸入督導姓名" /></label>
          <label>店長姓名<input value={manager} onChange={(event) => setManager(event.target.value)} placeholder="請輸入店長姓名" /></label>
        </div>
      </section>

      <section className="panel inspection-scorecard">
        <div className="panel-head">
          <div>
            <h2>評分總覽</h2>
            <p>分類分數即時計算，低分項目優先複查。</p>
          </div>
        </div>
        <div className="inspection-summary-list">
          {inspectionSections.map((section) => {
            const score = getSectionScore(section, form);
            return (
              <div className={`inspection-summary-row ${scoreTone(score, section.maxScore)}`} key={section.id}>
                <span>{section.title}</span>
                <strong>{score} / {section.maxScore}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="inspection-form-sections">
        {inspectionSections.map((section) => (
          <InspectionSection
            key={section.id}
            section={section}
            form={form}
            onQuickSet={quickSet}
            onPatchItem={patchItem}
            onPatchProductCheck={patchProductCheck}
          />
        ))}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>督導自填巡檢結果</h2>
              <p>保留 2 個現場彈性欄位，給固定表單未涵蓋的事項使用。</p>
            </div>
          </div>
          <div className="custom-finding-grid">
            {form.customFindings.map((item, index) => (
              <article className="custom-finding" key={index}>
                <label>項目<input value={item.title} onChange={(event) => patchCustom(index, { title: event.target.value })} placeholder={`自填欄位 ${index + 1}`} /></label>
                <div className="form-grid">
                  <label>得分<select value={item.score} onChange={(event) => patchCustom(index, { score: Number(event.target.value) })}>
                    {scoreOptions(item.maxScore).map((score) => <option key={score} value={score}>{score}</option>)}
                  </select></label>
                  <label>滿分<input type="number" step="1" min="0" value={item.maxScore} onChange={(event) => {
                    const maxScore = Math.max(0, Number.parseInt(event.target.value || "0", 10));
                    patchCustom(index, { maxScore, score: Math.min(Number(item.score || 0), maxScore) });
                  }} /></label>
                  <label>狀態<select value={item.status} onChange={(event) => patchCustom(index, { status: event.target.value })}>
                    <option>待確認</option>
                    <option>一般</option>
                    <option>緊急</option>
                  </select></label>
                </div>
                <label>說明<textarea value={item.note} onChange={(event) => patchCustom(index, { note: event.target.value })} /></label>
                <label>改善建議<textarea value={item.suggestion} onChange={(event) => patchCustom(index, { suggestion: event.target.value })} /></label>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <label className="wide-field">巡檢建議與總結<textarea value={form.conclusion} onChange={(event) => setForm({ ...form, conclusion: event.target.value })} placeholder="例如：本次主要問題集中在作業區清潔與冰箱管理，下次複查前需由店長每日拍照回傳。" /></label>
          <SignaturePad
            title="店長電子簽名"
            value={managerSignature}
            onChange={setManagerSignature}
          />
          <button className="submit-button static" type="submit">儲存巡檢結果並產生追蹤</button>
        </section>
      </section>
    </form>
  );
}

function InspectionAnalyticsPanel({ inspections, stores, onSelect }) {
  const week = getWeekRange(today);
  const month = getMonthRange(today);
  const [mode, setMode] = useState("week");
  const [from, setFrom] = useState(week.start);
  const [to, setTo] = useState(week.end);
  const [storeId, setStoreId] = useState("all");

  function applyMode(nextMode) {
    setMode(nextMode);
    if (nextMode === "day") {
      setFrom(today);
      setTo(today);
    }
    if (nextMode === "week") {
      setFrom(week.start);
      setTo(week.end);
    }
    if (nextMode === "month") {
      setFrom(month.start);
      setTo(month.end);
    }
  }

  const analytics = useMemo(
    () => buildInspectionAnalytics(inspections, { from, to, storeId }, stores),
    [inspections, from, to, storeId, stores],
  );

  return (
    <div className="workspace inspection-analytics">
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>巡檢彙整分析</h2>
            <p>可按日、週、月或指定區間查詢巡檢結果，快速掌握各店分數、缺失與改善重點。</p>
          </div>
        </div>
        <div className="analytics-filters">
          <div className="segments">
            {[
              ["day", "日"],
              ["week", "週"],
              ["month", "月"],
              ["custom", "自訂"],
            ].map(([key, label]) => (
              <button type="button" className={mode === key ? "active" : ""} key={key} onClick={() => applyMode(key)}>{label}</button>
            ))}
          </div>
          <label>起日<input type="date" value={from} onChange={(event) => { setMode("custom"); setFrom(event.target.value); }} /></label>
          <label>迄日<input type="date" value={to} onChange={(event) => { setMode("custom"); setTo(event.target.value); }} /></label>
          <label>門店<select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            <option value="all">全部門店</option>
            {stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}
          </select></label>
        </div>
      </section>

      <section className="kpi-strip">
        <Metric label="巡檢筆數" value={`${analytics.filtered.length} 筆`} detail={`${from} 至 ${to}`} />
        <Metric label="平均分數" value={`${analytics.avgScore}`} detail="區間內所有巡檢平均" tone={analytics.avgScore >= 85 ? "good" : analytics.avgScore >= 75 ? "warn" : "bad"} />
        <Metric label="待改善" value={`${analytics.pendingCount} 項`} detail="尚未標記已改善" tone="warn" />
        <Metric label="緊急事項" value={`${analytics.urgentCount} 項`} detail="需優先追蹤" tone={analytics.urgentCount ? "bad" : "good"} />
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>各店巡檢結果與分數排名</h2>
            <p>排序以低分與問題數優先，方便總部安排複查與改善輔導。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>排名</th><th>門店</th><th>巡檢筆數</th><th>平均分數</th><th>最近巡檢</th><th>待改善</th><th>緊急</th><th>主要缺失類別</th></tr>
            </thead>
            <tbody>
              {analytics.storeRows.map((row, index) => (
                <tr key={row.storeId}>
                  <td>{index + 1}</td>
                  <td><strong>{row.storeName}</strong></td>
                  <td>{row.records.length}</td>
                  <td><strong>{row.avgScore}</strong></td>
                  <td>{row.latestDate}</td>
                  <td>{row.pendingCount}</td>
                  <td className={row.urgentCount ? "negative" : ""}>{row.urgentCount}</td>
                  <td>{row.commonIssue}</td>
                </tr>
              ))}
              {!analytics.storeRows.length && <tr><td colSpan="8">此區間尚無巡檢紀錄。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel analytics-half">
        <div className="panel-head"><h2>常見缺失</h2><p>依分類與問題名稱彙整。</p></div>
        <div className="analytics-list">
          {analytics.commonIssues.map((item, index) => (
            <div className="analytics-list-row" key={item.key}>
              <span>{index + 1}</span>
              <strong>{item.key}</strong>
              <em>{item.count} 次</em>
            </div>
          ))}
          {!analytics.commonIssues.length && <p className="empty-text">此區間無缺失資料。</p>}
        </div>
      </section>

      <section className="panel analytics-half">
        <div className="panel-head"><h2>可改進方向</h2><p>依改善建議出現頻率彙整。</p></div>
        <div className="analytics-list">
          {analytics.improvements.map((item, index) => (
            <div className="analytics-list-row" key={item.key}>
              <span>{index + 1}</span>
              <strong>{item.key}</strong>
              <em>{item.count} 次</em>
            </div>
          ))}
          {!analytics.improvements.length && <p className="empty-text">此區間無改善建議資料。</p>}
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>巡檢紀錄明細</h2>
            <p>點選任一筆可回到單一巡檢表檢視、匯出或追蹤。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>日期</th><th>門店</th><th>督導</th><th>店長</th><th>分數</th><th>問題數</th><th>待改善</th><th>狀態</th></tr>
            </thead>
            <tbody>
              {analytics.filtered.map((record) => {
                const issues = record.issues || [];
                return (
                  <tr key={record.id} onClick={() => onSelect(record.id)}>
                    <td>{record.date}</td>
                    <td><strong>{record.storeName}</strong></td>
                    <td>{record.supervisor}</td>
                    <td>{record.manager}</td>
                    <td>{record.score}</td>
                    <td>{issues.length}</td>
                    <td>{issues.filter((issue) => issue.status !== "已改善").length}</td>
                    <td><span className={`chip ${record.status === "已完成" ? "good" : "warn"}`}>{record.status}</span></td>
                  </tr>
                );
              })}
              {!analytics.filtered.length && <tr><td colSpan="8">此區間尚無巡檢紀錄。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SignaturePad({ title, value, onChange }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const context = canvasNode.getContext("2d");
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.strokeStyle = "#1f1f1f";
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvasNode.width, canvasNode.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvasNode.width, canvasNode.height);
    image.src = value;
  }, [value]);

  function point(event) {
    const canvasNode = canvasRef.current;
    const rect = canvasNode.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasNode.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasNode.height,
    };
  }

  function start(event) {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    event.preventDefault();
    const context = canvasNode.getContext("2d");
    const next = point(event);
    context.beginPath();
    context.moveTo(next.x, next.y);
    setDrawing(true);
  }

  function move(event) {
    const canvasNode = canvasRef.current;
    if (!drawing || !canvasNode) return;
    event.preventDefault();
    const context = canvasNode.getContext("2d");
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  function end() {
    const canvasNode = canvasRef.current;
    if (!canvasNode || !drawing) return;
    setDrawing(false);
    onChange(canvasNode.toDataURL("image/png"));
  }

  function clear() {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const context = canvasNode.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvasNode.width, canvasNode.height);
    onChange("");
  }

  return (
    <div className="signature-pad">
      <div className="signature-head">
        <strong>{title}</strong>
        <button type="button" onClick={clear}>清除簽名</button>
      </div>
      <canvas
        ref={canvasRef}
        width="720"
        height="220"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <p>請店長於現場確認巡檢結果後簽名。</p>
    </div>
  );
}

function scoreOptions(maxScore) {
  const max = Math.max(0, Math.floor(Number(maxScore) || 0));
  return Array.from({ length: max + 1 }, (_, index) => index);
}

function InspectionSection({ section, form, onQuickSet, onPatchItem, onPatchProductCheck }) {
  const score = getSectionScore(section, form);
  return (
    <section className="panel inspection-section">
      <div className="panel-head">
        <div>
          <h2>{section.title}</h2>
          <p>小計 {score} / {section.maxScore}</p>
        </div>
        <span className={`chip ${scoreTone(score, section.maxScore)}`}>{score} / {section.maxScore}</span>
      </div>
      <div className="inspection-items">
        {section.items.map((item) => {
          const row = form.sections[section.id].items[item.id];
          return (
            <article className="inspection-item" key={item.id}>
              <div className="inspection-item-main">
                <strong>{item.name}</strong>
                <span>滿分 {item.maxScore}</span>
              </div>
              {section.type === "product" && (
                <div className="product-checks">
                  {section.columns.map((column) => (
                    <label key={column}>
                      <span>{column}</span>
                      <select value={row.checks[column]} onChange={(event) => onPatchProductCheck(section.id, item.id, column, event.target.value)}>
                        {productCheckOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <div className="inspection-item-controls">
                <label>
                  <span>狀態</span>
                  <select value={row.status} onChange={(event) => onQuickSet(section, item, event.target.value)}>
                    {checkOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  <span>得分</span>
                  <select value={row.score} onChange={(event) => onPatchItem(section.id, item.id, { score: Number(event.target.value) })}>
                    {scoreOptions(item.maxScore).map((score) => <option key={score} value={score}>{score}</option>)}
                  </select>
                </label>
                <label>
                  <span>說明 / 改善建議</span>
                  <input value={row.note} onChange={(event) => onPatchItem(section.id, item.id, { note: event.target.value })} placeholder="扣分原因或現場狀況" />
                </label>
                <label>
                  <span>改善方式</span>
                  <input value={row.suggestion} onChange={(event) => onPatchItem(section.id, item.id, { suggestion: event.target.value })} placeholder="店長需完成的動作" />
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function StoreManagementPanel({ inspections, stores, onSelectStore }) {
  const storeRows = stores.map((store) => {
    const storeInspections = inspections.filter((inspection) => inspection.storeId === store.id);
    const issues = storeInspections.flatMap((inspection) => inspection.issues);
    const latest = [...storeInspections].sort((a, b) => b.date.localeCompare(a.date))[0];
    return {
      ...store,
      latestDate: latest?.date || "尚未巡檢",
      inspectionCount: storeInspections.length,
      pendingCount: issues.filter((issue) => issue.status !== "已改善").length,
      urgentCount: issues.filter((issue) => issue.severity === "緊急").length,
      score: latest?.score ?? "-",
    };
  });

  return (
    <div className="workspace store-management-grid">
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>門市主檔</h2>
            <p>從門市角度查看巡檢紀錄、待改善事項與最新分數。</p>
          </div>
        </div>
        <div className="store-card-grid">
          {storeRows.map((store) => (
            <button className="store-card" key={store.id} onClick={() => onSelectStore(store.id)}>
              <div>
                <strong>{store.name}</strong>
                <span>{store.area} · 店長 {store.manager}</span>
              </div>
              <div className="store-card-metrics">
                <Metric label="最新巡檢" value={store.latestDate} detail={`分數 ${store.score}`} />
                <Metric label="巡檢筆數" value={`${store.inspectionCount} 筆`} detail="累積紀錄" />
                <Metric label="待改善" value={`${store.pendingCount} 項`} detail="未結案問題" tone={store.pendingCount ? "warn" : "good"} />
                <Metric label="緊急" value={`${store.urgentCount} 項`} detail="優先處理" tone={store.urgentCount ? "bad" : "good"} />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function UploadPanel({ stores, onAdd }) {
  const [storeId, setStoreId] = useState(stores[0]?.id || "");
  const [date, setDate] = useState(today);
  const [supervisor, setSupervisor] = useState("");
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    if (!storeId && stores[0]?.id) setStoreId(stores[0].id);
  }, [storeId, stores]);

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    setParsing(true);
    const parsed = await createDemoParse({ storeId, date, supervisor: supervisor || "未填寫", files, stores });
    onAdd(parsed);
    setFiles([]);
    setParsing(false);
  }

  return (
    <div className="workspace upload-grid">
      <form className="panel upload-panel" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>上傳一間店的巡檢表</h2>
            <p>可一次上傳正面、背面、補充手寫頁等多張照片。</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            門市
            <select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </label>
          <label>
            巡檢日期
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            督導姓名
            <input value={supervisor} onChange={(event) => setSupervisor(event.target.value)} placeholder="例如：郭承廷" />
          </label>
          <label className="file-drop">
            <span>巡檢表照片</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
            />
            <em>{files.length ? `已選擇 ${files.length} 張` : "選擇照片或掃描檔"}</em>
          </label>
        </div>
        <button className="submit-button static" type="submit" disabled={!files.length || parsing}>
          {parsing ? "解析草稿建立中..." : "建立解析草稿"}
        </button>
      </form>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>解析策略</h2>
            <p>先把照片變成可修改的問題清單，確認後再納入追蹤。</p>
          </div>
        </div>
        <div className="flow-list">
          <span>1. 督導上傳巡檢表照片</span>
          <span>2. 系統建立文字與問題草稿</span>
          <span>3. 主管確認手寫內容</span>
          <span>4. 追蹤改善期限與狀態</span>
        </div>
      </section>
    </div>
  );
}

function ReviewPanel({ record, onChange, onPersist }) {
  function patchRecord(patch) {
    onChange({ ...record, ...patch });
  }

  function patchIssue(index, patch) {
    const issues = [...record.issues];
    issues[index] = { ...issues[index], ...patch };
    patchRecord({ issues });
  }

  function addIssue() {
    patchRecord({ issues: [...record.issues, createBlankIssue()] });
  }

  function removeIssue(index) {
    patchRecord({ issues: record.issues.filter((_, currentIndex) => currentIndex !== index) });
  }

  return (
    <div className="workspace review-workspace">
      <section className="panel image-panel">
        <div className="panel-head">
          <div>
            <h2>原始巡檢表</h2>
            <p>{record.imageNames.length} 張照片</p>
          </div>
        </div>
        <div className="inspection-images">
          {record.images.length ? (
            record.images.map((image) => <img key={image.url} src={image.url} alt={image.name} />)
          ) : (
            record.imageNames.map((name) => <div className="image-placeholder" key={name}>{name}</div>)
          )}
        </div>
      </section>

      <section className="panel review-main">
        <div className="panel-head">
          <div>
            <h2>巡檢主檔</h2>
            <p>確認門市、日期、督導與摘要。</p>
          </div>
          <div className="inspection-export-actions">
            <button onClick={() => onPersist(record)}>同步</button>
            <button onClick={() => exportInspectionExcel(record)}>Excel</button>
            <button onClick={() => exportInspectionWord(record)}>Word</button>
            <button onClick={() => exportInspectionPdf(record)}>PDF</button>
            <span className={`chip ${record.status === "已完成" ? "good" : "warn"}`}>{record.status}</span>
          </div>
        </div>
        <div className="form-grid compact-form">
          <label>門市<input value={record.storeName} onChange={(event) => patchRecord({ storeName: event.target.value })} /></label>
          <label>巡檢日期<input type="date" value={record.date} onChange={(event) => patchRecord({ date: event.target.value })} /></label>
          <label>督導<input value={record.supervisor} onChange={(event) => patchRecord({ supervisor: event.target.value })} /></label>
          <label>店長<input value={record.manager} onChange={(event) => patchRecord({ manager: event.target.value })} /></label>
          <label>分數<input type="number" value={record.score} onChange={(event) => patchRecord({ score: Number(event.target.value) })} /></label>
          <label>狀態<select value={record.status} onChange={(event) => patchRecord({ status: event.target.value })}>
            <option>待確認</option>
            <option>已完成</option>
          </select></label>
          <label className="wide-field">摘要<textarea value={record.summary} onChange={(event) => patchRecord({ summary: event.target.value })} /></label>
        </div>
        {record.formData && (
          <div className="inspection-summary-list review-summary">
            {inspectionSections.map((section) => {
              const score = getSectionScore(section, record.formData);
              return (
                <div className={`inspection-summary-row ${scoreTone(score, section.maxScore)}`} key={section.id}>
                  <span>{section.title}</span>
                  <strong>{score} / {section.maxScore}</strong>
                </div>
              );
            })}
          </div>
        )}
        <div className="signature-review">
          <strong>店長電子簽名</strong>
          {record.managerSignature ? (
            <img src={record.managerSignature} alt="店長電子簽名" />
          ) : (
            <span>尚未簽名</span>
          )}
        </div>

        <div className="panel-head issue-head">
          <div>
            <h2>問題明細</h2>
            <p>每一列都會進入後續追蹤。</p>
          </div>
          <button onClick={addIssue}>新增問題</button>
        </div>
        <div className="issue-editor-list">
          {record.issues.map((issue, index) => (
            <article className="issue-editor" key={`${issue.title}-${index}`}>
              <div className="issue-editor-top">
                <select value={issue.category} onChange={(event) => patchIssue(index, { category: event.target.value })}>
                  {categoryOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
                <select value={issue.severity} onChange={(event) => patchIssue(index, { severity: event.target.value })}>
                  {severityOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
                <select value={issue.status} onChange={(event) => patchIssue(index, { status: event.target.value })}>
                  {statusOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
                <button onClick={() => removeIssue(index)}>刪除</button>
              </div>
              <label>問題<input value={issue.title} onChange={(event) => patchIssue(index, { title: event.target.value })} /></label>
              <label>說明<textarea value={issue.description} onChange={(event) => patchIssue(index, { description: event.target.value })} /></label>
              <label>改善建議<textarea value={issue.suggestion} onChange={(event) => patchIssue(index, { suggestion: event.target.value })} /></label>
              <label>改善期限<input type="date" value={issue.dueDate} onChange={(event) => patchIssue(index, { dueDate: event.target.value })} /></label>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function TrackingPanel({ inspections, onSelect }) {
  const rows = inspections.flatMap((inspection) =>
    inspection.issues.map((issue, index) => ({ ...issue, inspection, rowId: `${inspection.id}-${index}` })),
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>問題追蹤</h2>
          <p>依門市、分類、嚴重度與改善狀態查看所有巡檢缺失。</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>門市</th>
              <th>日期</th>
              <th>分類</th>
              <th>問題</th>
              <th>嚴重度</th>
              <th>期限</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rowId} onClick={() => onSelect(row.inspection.id)}>
                <td><strong>{row.inspection.storeName}</strong><span>{row.inspection.supervisor}</span></td>
                <td>{row.inspection.date}</td>
                <td>{row.category}</td>
                <td>{row.title}</td>
                <td><span className={`chip ${row.severity === "緊急" ? "bad" : row.severity === "重要" ? "warn" : ""}`}>{row.severity}</span></td>
                <td>{row.dueDate}</td>
                <td><span className={`chip ${row.status === "已改善" ? "good" : "warn"}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, detail, tone = "neutral" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
