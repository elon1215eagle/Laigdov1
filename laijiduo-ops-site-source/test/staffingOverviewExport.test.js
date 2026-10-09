import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStaffingExcelXml,
  buildStaffingExportModel,
  buildStaffingPrintHtml,
} from "../src/modules/staffing-overview/application/staffingOverviewExport.js";

function store(code, name, role) {
  return {
    store_code: code,
    store_name: name,
    target_headcount: 3,
    daily_demand: 2,
    manager_name: "主管",
    manager_authority: "委任",
    output_time: "11:00",
    closing_time: "21:30",
    shifts: [{ id: `${code}-shift`, name: "開早班", start_time: "10:00", end_time: "21:00" }],
    labor_units: [{ id: `${code}-labor`, name: "門店", month_days: 30, staff_equivalent: 3, rest_days: 18, positions: 3 }],
    people: [{ id: `${code}-person`, group: "門店", name: "人員", role, employment_type: "正職", status: "在職", work_time: "10:00:00–21:00:00", note: "", visible: true }],
  };
}

test("全門店 Excel 集中在單一 A4 橫式工作表", () => {
  const model = buildStaffingExportModel([store("S02", "凱旋店", "店長"), store("S01", "五甲店", "委任店經理")], "2026-09-28T00:00:00.000Z");
  const output = buildStaffingExcelXml(model);
  assert.match(output, /ss:Name="全門店編制"/);
  assert.equal((output.match(/<Worksheet /g) || []).length, 1);
  assert.equal((output.match(/<Column ss:Width="34"\/>/g) || []).length, 24);
  assert.ok(output.indexOf("五甲店") < output.indexOf("凱旋店"));
  assert.ok(output.indexOf(">店別<") < output.indexOf(">五甲店<"));
  assert.equal((output.match(/x:Orientation="Landscape"/g) || []).length, 1);
  assert.equal((output.match(/<FitWidth>1<\/FitWidth><FitHeight>1<\/FitHeight>/g) || []).length, 1);
  assert.equal((output.match(/<PaperSizeIndex>9<\/PaperSizeIndex>/g) || []).length, 1);
  assert.match(output, /<Data ss:Type="Number">-18<\/Data>/);
  assert.doesNotMatch(output, /<Data ss:Type="Number">'-18<\/Data>/);
  assert.match(output, /出爐/);
  assert.match(output, /關爐/);
  assert.match(output, /下月/);
  assert.match(output, /RoleCommissioned/);
  assert.match(output, /RoleManager/);
  assert.doesNotMatch(output, /10:00:00/);
});

test("A4 列印版以單頁上下兩排呈現並保留職級顏色", () => {
  const model = buildStaffingExportModel([store("S01", "五甲店", "資深人員"), store("S02", "凱旋店", "正式人員")]);
  const output = buildStaffingPrintHtml(model);
  assert.match(output, /@page\{size:A4 landscape/);
  assert.match(output, /class="top-grid"/);
  assert.match(output, /class="bottom-grid"/);
  assert.match(output, /grid-template-columns:2fr repeat\(4,1fr\)/);
  assert.match(output, /grid-template-columns:repeat\(6,1fr\)/);
  assert.doesNotMatch(output, /sheet-title/);
  assert.doesNotMatch(output, /page-break-after:always/);
  assert.match(output, /role-senior/);
  assert.match(output, /role-regular/);
  assert.equal((output.match(/class="sheet"/g) || []).length, 1);
});

test("匯出人員區只顯示姓名，不顯示職稱、工作分組與個人工時", () => {
  const model = buildStaffingExportModel([store("S01", "五甲店", "資深人員")]);
  const excel = buildStaffingExcelXml(model);
  const print = buildStaffingPrintHtml(model);
  assert.match(excel, />人員<\/Data>/);
  assert.doesNotMatch(excel, />資深人員<\/Data>/);
  assert.doesNotMatch(excel, />門店<\/Data>/);
  assert.doesNotMatch(excel, />10:00–21:00<\/Data>/);
  assert.match(print, />人員<\/span>/);
  assert.doesNotMatch(print, />資深人員<\/td>/);
  assert.doesNotMatch(print, />門店<\/td>/);
});

test("HQ 營運總部不列入門店編制匯出", () => {
  const model = buildStaffingExportModel([store("HQ", "營運總部", "送貨人員"), store("S01", "五甲店", "店長")]);
  assert.deepEqual(model.stores.map((item) => item.store_code), ["S01"]);
});
