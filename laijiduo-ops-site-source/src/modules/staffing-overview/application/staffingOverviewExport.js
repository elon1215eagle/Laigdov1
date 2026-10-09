import { calculateLaborUnit, staffingMetrics, staffingRoleTone } from "../domain/staffingOverview.js";

const STORE_EXPORT_ORDER = ["S01", "S06", "S02", "S03", "S04", "S09", "S05", "S07", "S08", "S10", "S11"];
const TOP_LAYOUT = [8, 4, 4, 4, 4];
const BOTTOM_LAYOUT = [4, 4, 4, 4, 4, 4];

function html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function xml(value) {
  const safe = String(value ?? "").replace(/^[=+\-@]/, (prefix) => `'${prefix}`);
  return safe.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function cell(value, style = "PanelBody", mergeAcross = 0, type = "String") {
  const merge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : "";
  const data = type === "Number"
    ? String(Number.isFinite(Number(value)) ? Number(value) : 0)
    : xml(value);
  return `<Cell ss:StyleID="${style}"${merge}><Data ss:Type="${type}">${data}</Data></Cell>`;
}

function row(cells, height = 18) {
  return `<Row ss:Height="${height}">${cells.join("")}</Row>`;
}

function displayTime(value) {
  return String(value || "").replace(/(\d{2}:\d{2}):00/g, "$1");
}

function roleStyle(role) {
  const tone = staffingRoleTone(role);
  return ({ commissioned: "RoleCommissioned", manager: "RoleManager", senior: "RoleSenior", regular: "RoleRegular" })[tone] || "PanelBody";
}

function isHeadquarters(store) {
  return String(store?.store_code || "").toUpperCase() === "HQ" || String(store?.store_name || "").includes("營運總部");
}

function exportOrder(store) {
  const index = STORE_EXPORT_ORDER.indexOf(String(store?.store_code || "").toUpperCase());
  return index >= 0 ? index : STORE_EXPORT_ORDER.length + 1;
}

function activePeople(store) {
  return (store.people || []).filter((person) => person.visible !== false && !String(person.status || "").includes("停用"));
}

function countPeople(store, matcher) {
  return activePeople(store).filter((person) => matcher(`${person.role || ""} ${person.group || ""} ${person.employment_type || ""}`)).length;
}

function laborUnitRows(unit) {
  if (!unit) return [];
  const result = calculateLaborUnit(unit);
  return [
    ["下月", result.monthDays, "PanelNumber"],
    ["總日", result.totalDays, "PanelNumber"],
    ["休日", result.restDays, "PanelBlue"],
    ["工日", result.workDays, "PanelNumber"],
    ["崗位", result.staffEquivalent, "PanelBlue"],
    ["需", result.requiredDays, "PanelNumber"],
    ["餘", result.balance, result.balance < 0 ? "PanelRed" : result.balance > 0 ? "PanelBlue" : "PanelNumber"],
  ].map(([label, value, style]) => ({ label, value, style }));
}

function compactPanelRows(store, width) {
  if (!store) return Array.from({ length: 14 }, () => [cell("", "PanelEmpty", width - 1)]);
  const metrics = staffingMetrics(store);
  const people = activePeople(store);
  const laborUnits = (store.labor_units || []).map(laborUnitRows);
  const isWide = width === 8;
  const target = Number(store.target_headcount || 0);
  const fullTime = countPeople(store, (value) => value.includes("正職"));
  const backend = countPeople(store, (value) => value.includes("後勤"));
  const newcomer = countPeople(store, (value) => value.includes("新人"));
  const delivery = countPeople(store, (value) => value.includes("送貨"));
  const rows = [];

  if (isWide) {
    rows.push([
      cell("店別", "PanelStore"), cell(store.store_name, "PanelStore"),
      ...["編制", "門市", "後勤", "新人", "送貨", "總人數"].map((label) => cell(label, "PanelHeader")),
    ]);
    rows.push([
      cell("", "PanelBody"), cell("", "PanelBody"),
      ...[target, fullTime, backend, newcomer, delivery, metrics.active].map((value) => cell(value, "PanelValue", 0, "Number")),
    ]);
    rows.push([
      cell("人員", "PanelHeader"), cell("出爐", "PanelHeader"), cell(store.output_time, "PanelTime"),
      cell("關爐", "PanelHeader"), cell(store.closing_time, "PanelClose"),
      cell("", "PanelBody"), cell("", "PanelBody"), cell("", "PanelBody"),
    ]);
  } else {
    rows.push([
      cell(store.store_name, "PanelStore"), cell("編制", "PanelHeader"),
      cell("正職", "PanelHeader"), cell("崗位", "PanelHeader"),
    ]);
    rows.push([
      cell("", "PanelBody"), cell(target, "PanelValue", 0, "Number"),
      cell(fullTime, "PanelValue", 0, "Number"), cell(store.daily_demand, "PanelValue", 0, "Number"),
    ]);
    rows.push([cell("出爐", "PanelHeader"), cell(store.output_time, "PanelTime"), cell("關爐", "PanelHeader"), cell(store.closing_time, "PanelClose")]);
  }

  const namesPerRow = isWide ? 4 : 2;
  const contentCount = Math.max(7, Math.ceil(people.length / namesPerRow));
  for (let index = 0; index < contentCount; index += 1) {
    if (isWide) {
      const names = people.slice(index * 4, index * 4 + 4);
      const laborLeft = laborUnits[0]?.[index];
      const laborRight = laborUnits[1]?.[index];
      rows.push([
        ...Array.from({ length: 4 }, (_, nameIndex) => {
          const person = names[nameIndex];
          return cell(person?.name || "", person ? roleStyle(person.role) : "PanelBody");
        }),
        cell(laborLeft?.label || "", laborLeft?.style || "PanelBody"),
        cell(laborLeft?.value ?? "", laborLeft?.style || "PanelBody", 0, laborLeft ? "Number" : "String"),
        cell(laborRight?.label || "", laborRight?.style || "PanelBody"),
        cell(laborRight?.value ?? "", laborRight?.style || "PanelBody", 0, laborRight ? "Number" : "String"),
      ]);
    } else {
      const names = people.slice(index * 2, index * 2 + 2);
      const laborItem = laborUnits[0]?.[index];
      rows.push([
        ...Array.from({ length: 2 }, (_, nameIndex) => {
          const person = names[nameIndex];
          return cell(person?.name || "", person ? roleStyle(person.role) : "PanelBody");
        }),
        cell(laborItem?.label || "", laborItem?.style || "PanelBody"),
        cell(laborItem?.value ?? "", laborItem?.style || "PanelBody", 0, laborItem ? "Number" : "String"),
      ]);
    }
  }

  (store.shifts || []).slice(0, 3).forEach((shift) => {
    rows.push([cell(shift.name, "PanelShift"), cell(`${displayTime(shift.start_time)}-${displayTime(shift.end_time)}`, "PanelShift", width - 2)]);
  });
  return rows;
}

function excelGroupRows(stores, widths) {
  const panels = widths.map((width, index) => compactPanelRows(stores[index], width));
  const rowCount = Math.max(...panels.map((panel) => panel.length));
  const output = [];
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const cells = [];
    panels.forEach((panel, panelIndex) => {
      cells.push(...(panel[rowIndex] || [cell("", "PanelEmpty", widths[panelIndex] - 1)]));
    });
    output.push(row(cells, rowIndex === 0 ? 24 : 18));
  }
  return output.join("");
}

export function buildStaffingExportModel(snapshots = [], generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    stores: snapshots
      .filter((store) => !isHeadquarters(store))
      .slice()
      .sort((a, b) => exportOrder(a) - exportOrder(b) || String(a.store_code).localeCompare(String(b.store_code))),
  };
}

export function buildStaffingExcelXml(model) {
  const byCode = new Map(model.stores.map((store) => [String(store.store_code).toUpperCase(), store]));
  const ordered = STORE_EXPORT_ORDER.map((code) => byCode.get(code)).filter(Boolean);
  const worksheetRows = [
    excelGroupRows(ordered.slice(0, 5), TOP_LAYOUT),
    excelGroupRows(ordered.slice(5, 11), BOTTOM_LAYOUT),
  ].join("");
  const columns = Array.from({ length: 24 }, () => '<Column ss:Width="34"/>').join("");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>萊吉多全門店人力掌握</Title><Created>${xml(model.generatedAt)}</Created></DocumentProperties>
  <Styles>
    <Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Size="8"/></Style>
    <Style ss:ID="PanelBody"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="PanelStore"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft JhengHei" ss:Size="10" ss:Bold="1" ss:Color="#E3231B"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#111111"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#111111"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#AAAAAA"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#111111"/></Borders></Style>
    <Style ss:ID="PanelHeader"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1"/><Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/></Borders></Style>
    <Style ss:ID="PanelValue"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Size="10" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/></Borders></Style>
    <Style ss:ID="PanelNumber"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="PanelTime"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="PanelClose"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Size="9" ss:Bold="1" ss:Color="#E3231B"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#808080"/></Borders></Style>
    <Style ss:ID="PanelShift"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft JhengHei" ss:Size="7" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8D8D8"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8D8D8"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8D8D8"/></Borders></Style>
    <Style ss:ID="PanelMuted"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Microsoft JhengHei" ss:Size="7" ss:Color="#666666"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="PanelBlue"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#3478D4"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="PanelRed"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#E3231B"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="PanelEmpty"/>
    <Style ss:ID="RoleCommissioned"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#26704C"/><Interior ss:Color="#BFE5C8" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="RoleManager"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#694C7E"/><Interior ss:Color="#E5B8E8" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="RoleSenior"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#6F4700"/><Interior ss:Color="#FFD95C" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
    <Style ss:ID="RoleRegular"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#5D4A00"/><Interior ss:Color="#FFF3A0" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CFCFCF"/></Borders></Style>
  </Styles>
  <Worksheet ss:Name="全門店編制"><Table>${columns}${worksheetRows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/><PageMargins x:Bottom="0.15" x:Left="0.15" x:Right="0.15" x:Top="0.15"/></PageSetup><FitToPage/><Print><PaperSizeIndex>9</PaperSizeIndex><FitWidth>1</FitWidth><FitHeight>1</FitHeight><ValidPrinterInfo/></Print><DoNotDisplayGridlines/></WorksheetOptions></Worksheet></Workbook>`;
}

function compactPanelHtml(store, wide = false) {
  if (!store) return '<article class="store-panel empty"></article>';
  const metrics = staffingMetrics(store);
  const people = activePeople(store);
  const target = Number(store.target_headcount || 0);
  const fullTime = countPeople(store, (value) => value.includes("正職"));
  const backend = countPeople(store, (value) => value.includes("後勤"));
  const newcomer = countPeople(store, (value) => value.includes("新人"));
  const delivery = countPeople(store, (value) => value.includes("送貨"));
  const headerLabels = wide
    ? ["店別", store.store_name, "編制", "門市", "後勤", "新人", "送貨", "總人數"]
    : [store.store_name, "編制", "正職", "崗位"];
  const headerValues = wide
    ? ["", "", target, fullTime, backend, newcomer, delivery, metrics.active]
    : ["", target, fullTime, store.daily_demand];
  const header = `<div class="panel-header labels">${headerLabels.map((label, index) => `<span class="${index < (wide ? 2 : 1) ? "store-name" : ""}">${html(label)}</span>`).join("")}</div><div class="panel-header values">${headerValues.map((value) => `<span>${html(value)}</span>`).join("")}</div>`;
  const time = wide
    ? `<div class="time-row wide-time"><span>人員</span><span>出爐</span><b>${html(store.output_time)}</b><span>關爐</span><b class="closing">${html(store.closing_time)}</b><i></i><i></i><i></i></div>`
    : `<div class="time-row"><span>出爐</span><b>${html(store.output_time)}</b><span>關爐</span><b class="closing">${html(store.closing_time)}</b></div>`;
  const namesPerRow = wide ? 4 : 2;
  const nameCells = people.map((person) => `<span class="role role-${staffingRoleTone(person.role)}">${html(person.name)}</span>`).join("") || '<span class="empty-name">尚無人員</span>';
  const namePad = Array.from({ length: Math.max(0, 7 * namesPerRow - people.length) }, () => "<span></span>").join("");
  const laborTables = (wide ? [0, 1] : [0]).map((unitIndex) => {
    const rows = laborUnitRows(store.labor_units?.[unitIndex]);
    return `<table class="labor"><tbody>${Array.from({ length: 7 }, (_, index) => {
      const item = rows[index];
      return `<tr><td>${html(item?.label || "")}</td><td class="${item?.style === "PanelRed" ? "short" : item?.style === "PanelBlue" ? "blue" : ""}">${html(item?.value ?? "")}</td></tr>`;
    }).join("")}</tbody></table>`;
  }).join("");
  const shifts = (store.shifts || []).slice(0, 3).map((shift) => `<div><b>${html(shift.name)}</b><span>${html(displayTime(shift.start_time))}-${html(displayTime(shift.end_time))}</span></div>`).join("");
  return `<article class="store-panel${wide ? " wide" : ""}">${header}${time}<div class="panel-content"><div class="name-grid">${nameCells}${namePad}</div>${laborTables}</div><div class="shift-row">${shifts}</div></article>`;
}

export function buildStaffingPrintHtml(model) {
  const byCode = new Map(model.stores.map((store) => [String(store.store_code).toUpperCase(), store]));
  const ordered = STORE_EXPORT_ORDER.map((code) => byCode.get(code)).filter(Boolean);
  const top = ordered.slice(0, 5).map((store, index) => compactPanelHtml(store, index === 0)).join("");
  const bottom = ordered.slice(5, 11).map((store) => compactPanelHtml(store)).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>萊吉多全門店人力編制總覽</title><style>
  @page{size:A4 landscape;margin:3mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"Microsoft JhengHei",sans-serif}.sheet{width:291mm;height:204mm;overflow:hidden;background:#fff;border:1.5px solid #111}.top-grid,.bottom-grid{display:grid;align-items:stretch}.top-grid{grid-template-columns:2fr repeat(4,1fr)}.bottom-grid{grid-template-columns:repeat(6,1fr)}.store-panel{height:101mm;border-right:1.5px solid #111;border-bottom:1.5px solid #111;min-width:0;overflow:hidden}.panel-header{display:grid;grid-template-columns:repeat(4,1fr)}.wide .panel-header{grid-template-columns:repeat(8,1fr)}.panel-header span{height:6mm;display:flex;align-items:center;justify-content:center;border-right:1px solid #bbb;border-bottom:1px solid #999;font-size:6.5px;font-weight:800;white-space:nowrap}.panel-header .store-name{color:#e3231b;font-size:7px}.panel-header.values span{font-size:8px}.time-row{height:8mm;display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #999}.wide-time{grid-template-columns:repeat(8,1fr)}.time-row span,.time-row b,.time-row i{display:flex;align-items:center;justify-content:center;border-right:1px solid #ddd;font-size:6.5px;font-style:normal}.time-row b{font-size:7.5px}.time-row .closing{color:#e3231b}.panel-content{height:62mm;display:grid;grid-template-columns:1fr 1fr}.wide .panel-content{grid-template-columns:2fr 1fr 1fr}.name-grid{display:grid;grid-template-columns:repeat(2,1fr);align-content:start}.wide .name-grid{grid-template-columns:repeat(4,1fr)}.name-grid span{height:8.85mm;display:flex;align-items:center;justify-content:center;border-right:1px solid #ddd;border-bottom:1px solid #ddd;font-size:6.8px;font-weight:700;overflow:hidden;white-space:nowrap}.wide .name-grid span{font-size:7px}.labor{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.6px}.labor td{height:8.85mm;border-right:1px solid #bbb;border-bottom:1px solid #bbb;text-align:center;font-weight:700}.role-commissioned{background:#b7e3c1;color:#176b3c}.role-manager{background:#e5b8e8;color:#694c7e}.role-senior{background:#ffd95c;color:#6f4700}.role-regular{background:#fff19a;color:#5d4a00}.short{color:#e3231b;background:#f2f2f2}.blue{color:#3478d4}.shift-row{height:19mm;border-top:1.5px solid #111;padding:.6mm}.shift-row div{display:grid;grid-template-columns:auto 1fr;gap:1mm;font-size:5.8px;line-height:5.6mm;white-space:nowrap}.shift-row span{overflow:hidden}.top-grid,.bottom-grid{height:101mm}@media screen{body{background:#ddd;padding:6mm}.sheet{margin:auto;box-shadow:0 3px 15px #0003}}@media print{body{background:#fff}.sheet{margin:0}}
  </style></head><body><main class="sheet"><div class="top-grid">${top}</div><div class="bottom-grid">${bottom}</div></main><script>window.addEventListener('load',()=>window.print())</script></body></html>`;
}
