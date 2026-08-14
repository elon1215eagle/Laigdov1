function leaveDaysFromDraft(draft = {}) {
  const source = Array.isArray(draft.dates)
    ? draft.dates
    : String(draft.dates || "").split(/[、，,\s]+/);
  return new Set(
    source
      .map((value) => {
        if (Number.isInteger(value)) return value;
        const match = String(value).match(/(\d{1,2})(?!.*\d)/);
        return match ? Number(match[1]) : null;
      })
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31),
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function buildScheduleExportModel({
  periodMonth,
  storeGroups,
  drafts,
  dailyShifts = [],
  version = 1,
  needsReconfirmation = false,
  generatedAt = new Date().toISOString(),
}) {
  const [year, month] = periodMonth.split("-").map(Number);
  const dayCount = new Date(year, month, 0).getDate();
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const weekendDays = days.filter((day) => [0, 6].includes(new Date(year, month - 1, day).getDay()));
  return {
    periodMonth,
    version: Number(version || 1),
    needsReconfirmation: Boolean(needsReconfirmation),
    generatedAt,
    days,
    weekendDays,
    stores: storeGroups.map((store) => ({
      code: store.code,
      name: store.name,
      sourceCodes: store.sourceCodes || [store.code],
      openTime: store.open_time || "10:00",
      closeTime: store.close_time || store.close_report_time || "23:00",
      demand: Number(store.demand || 0),
      staff: store.staff.map((person) => ({
        id: String(person.id),
        name: person.employeeName || person.employee_name || "",
        role: person.role || person.role_name || "",
        homeStoreCode: person.store_code || person.storeCode || store.code,
        employmentType: person.employment_type || person.employmentType || "",
        weekdayStartTime: person.weekday_start_time || person.work_start_time || "",
        weekdayEndTime: person.weekday_end_time || person.work_end_time || "",
        holidayStartTime: person.holiday_start_time || person.weekday_start_time || person.work_start_time || "",
        holidayEndTime: person.holiday_end_time || person.weekday_end_time || person.work_end_time || "",
        leaveDays: [...leaveDaysFromDraft(drafts[`${periodMonth}:${person.id}`])],
      })),
      shifts: dailyShifts.filter((shift) => store.sourceCodes.includes(shift.home_store_code) || store.sourceCodes.includes(shift.assigned_store_code)),
    })),
  };
}

export function buildStoreDailyStaffingSummary(model, store) {
  return model.days.map((day) => {
    const effective = store.staff.filter((person) => !person.leaveDays.includes(day)).length;
    const demand = Number(store.demand || 0);
    return { day, effective, demand, balance: effective - demand };
  });
}

function excelXmlEscape(value) {
  return String(value ?? "").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function excelCell(value, style = "") {
  const styleAttribute = style ? ` ss:StyleID="${style}"` : "";
  const type = typeof value === "number" ? "Number" : "String";
  return `<Cell${styleAttribute}><Data ss:Type="${type}">${excelXmlEscape(value)}</Data></Cell>`;
}

export function buildScheduleExcelXml(model) {
  const firstColumnWidth = 116.25; // Excel 欄寬約 22.09
  const dateColumnWidth = 30.75; // Excel 欄寬約 5.73
  const storeTitleHeight = 25;
  const tableRowHeight = 17.5;
  const rows = [];
  model.stores.forEach((store, storeIndex) => {
    const summaries = buildStoreDailyStaffingSummary(model, store);
    rows.push(`<Row ss:Height="${storeTitleHeight}">${excelCell(`${store.code} ${store.name}`, "StoreTitle")}</Row>`);
    rows.push(`<Row ss:Height="${tableRowHeight}">${excelCell("人員", "Header")}${model.days.map((day) => excelCell(`${day}日`, model.weekendDays.includes(day) ? "Weekend" : "Header")).join("")}</Row>`);
    store.staff.forEach((person) => {
      rows.push(`<Row ss:Height="${tableRowHeight}">${excelCell(`${person.name} ${person.role}`)}${model.days.map((day) => excelCell(person.leaveDays.includes(day) ? "休" : "", person.leaveDays.includes(day) ? "Leave" : "")).join("")}</Row>`);
    });
    rows.push(`<Row ss:Height="${tableRowHeight}">${excelCell("有效人力", "Summary")}${summaries.map((row) => excelCell(row.effective, "Summary")).join("")}</Row>`);
    rows.push(`<Row ss:Height="${tableRowHeight}">${excelCell("店面需求", "Summary")}${summaries.map((row) => excelCell(row.demand, "Summary")).join("")}</Row>`);
    rows.push(`<Row ss:Height="${tableRowHeight}">${excelCell("缺口小計", "Summary")}${summaries.map((row) => excelCell(row.balance, row.balance > 0 ? "Positive" : row.balance < 0 ? "Negative" : "Zero")).join("")}</Row>`);
    if (storeIndex < model.stores.length - 1) rows.push("<Row/>");
  });
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Size="11"/></Style>
<Style ss:ID="StoreTitle"><Font ss:FontName="Microsoft JhengHei" ss:Size="14" ss:Bold="1"/></Style>
<Style ss:ID="Header"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1"/><Interior ss:Color="#FBEFE8" ss:Pattern="Solid"/></Style>
<Style ss:ID="Weekend"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#D92D20"/><Interior ss:Color="#FBEFE8" ss:Pattern="Solid"/></Style>
<Style ss:ID="Leave"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#D92D20"/></Style>
<Style ss:ID="Summary"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1"/></Style>
<Style ss:ID="Positive"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#175CD3"/></Style>
<Style ss:ID="Negative"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#D92D20"/></Style>
<Style ss:ID="Zero"><Alignment ss:Horizontal="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Bold="1" ss:Color="#000000"/></Style>
</Styles><Worksheet ss:Name="${excelXmlEscape(model.periodMonth)}排假表"><Table><Column ss:Width="${firstColumnWidth}"/>${model.days.map(() => `<Column ss:Width="${dateColumnWidth}"/>`).join("")}${rows.join("")}</Table></Worksheet></Workbook>`;
}

export function personalScheduleExpiry(periodMonth) {
  const [year, month] = String(periodMonth).split("-").map(Number);
  if (!year || !month) throw new Error("班表月份格式不正確");
  return new Date(Date.UTC(year, month, 7, 15, 59, 59, 999)).toISOString();
}

export function buildPersonalScheduleSnapshot(model, staffId) {
  for (const store of model.stores) {
    const person = store.staff.find((row) => String(row.id) === String(staffId));
    if (!person) continue;
    const rows = model.days.map((day) => {
      const date = `${model.periodMonth}-${String(day).padStart(2, "0")}`;
      if (person.leaveDays.includes(day)) return { date, status: "leave", label: "休假", shifts: [] };
      const explicit = store.shifts
        .filter((shift) => String(shift.staff_id) === String(person.id) && shift.shift_date === date)
        .map((shift) => ({
          start_time: String(shift.start_time || "").slice(0, 5),
          end_time: String(shift.end_time || "").slice(0, 5),
          store_code: shift.assigned_store_code || person.homeStoreCode,
          shift_type: shift.shift_type || "override",
        }));
      if (explicit.length) return { date, status: "work", label: "上班", shifts: explicit };
      return { date, status: "unscheduled", label: "待排", shifts: [] };
    });
    return {
      period_month: model.periodMonth,
      schedule_version: model.version,
      employee_name: person.name,
      role_name: person.role,
      home_store_code: person.homeStoreCode,
      rows,
    };
  }
  throw new Error("找不到指定人員的班表");
}

export function buildPrintableScheduleHtml(model) {
  const status = model.needsReconfirmation ? "異動後待總部重新確認" : "已核定版本";
  const stores = model.stores.map((store) => {
    const rows = store.staff.map((person) => `<tr><th>${escapeHtml(person.name)}<small>${escapeHtml(person.role)}</small></th>${model.days.map((day) => `<td class="${person.leaveDays.includes(day) ? "leave" : ""}">${person.leaveDays.includes(day) ? "休" : ""}</td>`).join("")}</tr>`).join("");
    const shifts = store.shifts.length ? `<h3>特殊班次／跨店支援</h3><ul>${store.shifts.map((shift) => `<li>${escapeHtml(shift.shift_date)} ${escapeHtml(shift.employee_name)} ${escapeHtml(shift.home_store_code)} → ${escapeHtml(shift.assigned_store_code)} ${escapeHtml(String(shift.start_time).slice(0, 5))}–${escapeHtml(String(shift.end_time).slice(0, 5))}</li>`).join("")}</ul>` : "";
    return `<section><h2>${escapeHtml(store.code)} ${escapeHtml(store.name)}</h2><table><thead><tr><th>人員</th>${model.days.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>${shifts}</section>`;
  }).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>萊吉多 ${escapeHtml(model.periodMonth)} 班表</title><style>
  @page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:"Microsoft JhengHei",sans-serif;color:#231815;margin:0}header{border-bottom:3px solid #e63b21;padding-bottom:8px;margin-bottom:10px}h1{font-size:22px;margin:0 0 5px}header p{margin:2px 0;font-size:11px}section{page-break-after:always}section:last-child{page-break-after:auto}h2{font-size:17px;margin:8px 0}h3{font-size:13px;margin:10px 0 4px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:9px}th,td{border:1px solid #888;text-align:center;padding:3px 1px}th:first-child{width:90px;text-align:left;padding-left:4px}th small{display:block;font-weight:400;color:#666}.leave{background:#ffe0d8;color:#c42e18;font-weight:700}ul{columns:2;font-size:10px;margin-top:4px}.warn{color:#b42318;font-weight:700}@media print{button{display:none}}
  </style></head><body><header><h1>萊吉多 ${escapeHtml(model.periodMonth)} 月班表</h1><p>版本 V${model.version} · ${status}</p><p>產生時間：${escapeHtml(new Date(model.generatedAt).toLocaleString("zh-TW"))}</p></header>${stores}</body></html>`;
}

export function selectScheduleImageStores(model, storeCode = "") {
  const stores = Array.isArray(model?.stores) ? model.stores : [];
  if (!storeCode) return stores;
  return stores.filter((store) => store.code === storeCode);
}

export function renderScheduleCanvas(model, storeCode = "") {
  const stores = selectScheduleImageStores(model, storeCode);
  if (!stores.length) throw new Error("目前沒有可輸出的門店班表");
  const width = 1600;
  const rowHeight = 54;
  const sectionHeaderHeight = 140;
  const summaryRows = 3;
  const sectionGap = 48;
  const height = 60 + stores.reduce(
    (total, store) => total + sectionHeaderHeight + (Math.max(store.staff.length, 1) + summaryRows) * rowHeight + sectionGap,
    0,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  const nameWidth = 210;
  const dayWidth = (width - nameWidth - 40) / model.days.length;
  context.strokeStyle = "#777";

  let sectionTop = 36;
  stores.forEach((store) => {
    context.fillStyle = "#231815";
    context.font = "bold 34px Microsoft JhengHei";
    context.fillText(`萊吉多 ${model.periodMonth} ${store.code} ${store.name} 班表`, 36, sectionTop + 36);
    context.font = "20px Microsoft JhengHei";
    context.fillText(`V${model.version} · ${model.needsReconfirmation ? "異動後待重新確認" : "已核定"} · ${new Date(model.generatedAt).toLocaleString("zh-TW")}`, 36, sectionTop + 70);
    context.font = "18px Microsoft JhengHei";
    model.days.forEach((day, index) => {
      context.fillStyle = model.weekendDays.includes(day) ? "#d92d20" : "#231815";
      context.fillText(String(day), nameWidth + index * dayWidth + 8, sectionTop + 113);
    });

    const staffRows = store.staff.length ? store.staff : [{ name: "尚無人員", role: "", leaveDays: [] }];
    staffRows.forEach((person, rowIndex) => {
      const y = sectionTop + sectionHeaderHeight + rowIndex * rowHeight;
      context.fillStyle = "#231815";
      context.fillText(`${person.name} ${person.role}`.trim(), 36, y + 34);
      model.days.forEach((day, dayIndex) => {
        const x = nameWidth + dayIndex * dayWidth;
        context.strokeRect(x, y, dayWidth, rowHeight);
        if (person.leaveDays.includes(day)) {
          context.fillStyle = "#ffe0d8";
          context.fillRect(x + 1, y + 1, dayWidth - 2, rowHeight - 2);
          context.fillStyle = "#c42e18";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText("休", x + dayWidth / 2, y + rowHeight / 2);
          context.textAlign = "start";
          context.textBaseline = "alphabetic";
        }
      });
    });

    const summaries = buildStoreDailyStaffingSummary(model, store);
    const summaryStartY = sectionTop + sectionHeaderHeight + staffRows.length * rowHeight;
    [
      { label: "有效人力", value: (row) => row.effective, color: () => "#231815" },
      { label: "店面需求", value: (row) => row.demand, color: () => "#231815" },
      { label: "缺口小計", value: (row) => row.balance, color: (row) => row.balance > 0 ? "#175cd3" : row.balance < 0 ? "#d92d20" : "#000000" },
    ].forEach((summary, summaryIndex) => {
      const y = summaryStartY + summaryIndex * rowHeight;
      context.fillStyle = "#f7f7f7";
      context.fillRect(20, y, width - 40, rowHeight);
      context.fillStyle = "#231815";
      context.font = "bold 18px Microsoft JhengHei";
      context.fillText(summary.label, 36, y + 34);
      summaries.forEach((row, dayIndex) => {
        const x = nameWidth + dayIndex * dayWidth;
        context.strokeRect(x, y, dayWidth, rowHeight);
        context.fillStyle = summary.color(row);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(summary.value(row)), x + dayWidth / 2, y + rowHeight / 2);
        context.textAlign = "start";
        context.textBaseline = "alphabetic";
      });
    });

    sectionTop += sectionHeaderHeight + (staffRows.length + summaryRows) * rowHeight + sectionGap;
  });
  return canvas;
}

export function renderScheduleStoreCanvas(model, storeIndex = 0) {
  const store = model.stores[storeIndex];
  if (!store) throw new Error("目前沒有可輸出的門店班表");
  return renderScheduleCanvas(model, store.code);
}
