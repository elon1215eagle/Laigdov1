import { useEffect, useMemo, useState } from "react";
import "./styles.css";

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const stores = [
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

async function createDemoParse({ storeId, date, supervisor, files }) {
  const store = stores.find((item) => item.id === storeId) || stores[0];
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

function exportCsv(records) {
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
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = `巡檢問題匯整_${today}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function App() {
  const [page, setPage] = useState("stores");
  const [inspections, setInspections] = useState(loadSavedInspections);
  const [selectedId, setSelectedId] = useState(() => loadSavedInspections()[0]?.id || seedInspections[0].id);
  const selected = inspections.find((item) => item.id === selectedId) || inspections[0];

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(inspections));
  }, [inspections]);

  function addInspection(record) {
    setInspections((current) => [record, ...current]);
    setSelectedId(record.id);
    setPage("review");
  }

  function updateInspection(nextRecord) {
    setInspections((current) => current.map((item) => (item.id === nextRecord.id ? nextRecord : item)));
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
          <button className={page === "upload" ? "active" : ""} onClick={() => setPage("upload")}>巡檢表上傳</button>
          <button className={page === "review" ? "active" : ""} onClick={() => setPage("review")}>解析確認</button>
          <button className={page === "tracking" ? "active" : ""} onClick={() => setPage("tracking")}>問題追蹤</button>
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
          <strong>上傳 → 解析 → 確認 → 追蹤</strong>
          <p>此版本先保留人工確認，避免手寫辨識錯字直接進入正式資料。</p>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <p>{today} · {selected?.storeName || "尚未選擇門市"}</p>
            <h1>{pageTitle(page)}</h1>
          </div>
          <div className="top-actions">
            <button onClick={() => exportCsv(inspections)}>匯出 CSV</button>
            <button className="primary" onClick={() => setPage("upload")}>新增巡檢</button>
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
            onSelectStore={(storeId) => {
              const inspection = inspections.find((item) => item.storeId === storeId);
              if (inspection) setSelectedId(inspection.id);
              setPage(inspection ? "review" : "upload");
            }}
          />
        )}
        {page === "upload" && <UploadPanel onAdd={addInspection} />}
        {page === "review" && selected && <ReviewPanel record={selected} onChange={updateInspection} />}
        {page === "tracking" && (
          <TrackingPanel
            inspections={inspections}
            onSelect={(id) => {
              setSelectedId(id);
              setPage("review");
            }}
          />
        )}
      </main>
    </div>
  );
}

function pageTitle(page) {
  return {
    stores: "門店管理",
    upload: "巡檢表上傳",
    review: "解析結果確認",
    tracking: "問題追蹤總覽",
  }[page] || "門店管理";
}

function StoreManagementPanel({ inspections, onSelectStore }) {
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

function UploadPanel({ onAdd }) {
  const [storeId, setStoreId] = useState(stores[0].id);
  const [date, setDate] = useState(today);
  const [supervisor, setSupervisor] = useState("");
  const [files, setFiles] = useState([]);
  const [parsing, setParsing] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!files.length) return;
    setParsing(true);
    const parsed = await createDemoParse({ storeId, date, supervisor: supervisor || "未填寫", files });
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

function ReviewPanel({ record, onChange }) {
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
          <span className={`chip ${record.status === "已完成" ? "good" : "warn"}`}>{record.status}</span>
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
