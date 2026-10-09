import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStaffingSnapshot,
  calculateLaborUnit,
  canManageStaffingOverview,
  canViewAllStaffingStores,
  normalizeStaffingSnapshot,
  resolvePublishedStaffingSnapshot,
  resolveStaffingDraftSnapshot,
  syncStaffingSnapshotPeople,
  staffingMetrics,
  staffingRoleTone,
  validateStaffingSnapshot,
} from "../src/modules/staffing-overview/domain/staffingOverview.js";

const stores = [{ id: "store-1", store_code: "S01", store_name: "鳳山五甲店" }];
const staff = [
  { id: "a", store_code: "S01", employee_name: "阿暄", role_name: "店長", work_category: "門店營運", employment_status: "在職" },
  { id: "b", store_code: "S01", employee_name: "娟姨", role_name: "兼職後勤", work_category: "後勤", employment_status: "在職" },
  { id: "c", store_code: "S01", employee_name: "彥璋", role_name: "送貨專員", work_category: "送貨", employment_status: "在職" },
  { id: "d", store_code: "S01", employee_name: "留停人員", role_name: "正式人員", work_category: "門店營運", employment_status: "留職停薪" },
  { id: "e", store_code: "S02", employee_name: "別店人員", role_name: "正式人員", employment_status: "在職" },
];

test("五甲快照依門店、後勤與送貨分組且不混入其他門店", () => {
  const snapshot = buildStaffingSnapshot({ store: stores[0], stores, staff });
  assert.equal(snapshot.store_code, "S01");
  assert.equal(snapshot.target_headcount, 8);
  assert.equal(snapshot.daily_demand, 6);
  assert.equal(snapshot.people.length, 4);
  assert.deepEqual(snapshot.people.filter((row) => row.group === "後勤").map((row) => row.name), ["娟姨"]);
  assert.deepEqual(snapshot.people.filter((row) => row.group === "送貨").map((row) => row.name), ["彥璋"]);
  assert.equal(snapshot.manager_name, "阿暄");
});

test("人力統計只計入顯示中的在職與留停人員", () => {
  const snapshot = buildStaffingSnapshot({ store: stores[0], stores, staff });
  snapshot.people[0].visible = false;
  assert.deepEqual(staffingMetrics(snapshot), { active: 1, leave: 1, target: 8, gap: -7 });
});

test("送貨人員保留顯示但不計入門店與後勤人力", () => {
  const snapshot = buildStaffingSnapshot({ store: stores[0], stores, staff });
  assert.equal(snapshot.people.find((row) => row.name === "彥璋")?.group, "送貨");
  assert.deepEqual(staffingMetrics(snapshot), { active: 2, leave: 1, target: 8, gap: -6 });
});

test("舊發布版本中的送貨職稱會自動移出後勤分組", () => {
  const fallback = buildStaffingSnapshot({ store: stores[0], stores, staff: [] });
  const normalized = normalizeStaffingSnapshot({
    ...fallback,
    people: [{ id: "driver", name: "彥璋", role: "送貨人員", group: "後勤", employment_type: "正職", status: "在職" }],
  }, fallback);
  assert.equal(normalized.people[0].group, "送貨");
});

test("門店人力依最新主檔歸屬同步並保留發布版顯示設定", () => {
  const fallback = buildStaffingSnapshot({ store: stores[0], stores, staff: [
    { id: "a", store_code: "S01", employee_name: "阿暄", role_name: "店長", employment_status: "在職" },
    { id: "new", store_code: "S01", employee_name: "新進人員", role_name: "正式人員", employment_status: "在職" },
  ] });
  const synced = syncStaffingSnapshotPeople({
    ...fallback,
    target_headcount: 9,
    people: [
      { ...fallback.people[0], role: "委任店經理", note: "總部顯示設定", sort_order: 2 },
      { id: "moved", name: "已調店人員", role: "正式人員", group: "門店", status: "在職", visible: true, sort_order: 1 },
      { id: "display-temp", name: "手動顯示人員", role: "支援", group: "門店", status: "在職", visible: true, sort_order: 3 },
    ],
  }, fallback);
  assert.equal(synced.target_headcount, 9);
  assert.deepEqual(synced.people.map((person) => person.name), ["阿暄", "新進人員", "手動顯示人員"]);
  assert.equal(synced.people.find((person) => person.id === "a")?.role, "委任店經理");
  assert.equal(synced.people.find((person) => person.id === "a")?.note, "總部顯示設定");
});

test("門店只讀總部已發布版本，不混入人資主檔新增人員", () => {
  const fallback = buildStaffingSnapshot({ store: stores[0], stores, staff: [
    { id: "a", store_code: "S01", employee_name: "已發布人員", role_name: "店長", employment_status: "在職" },
    { id: "new", store_code: "S01", employee_name: "人資新增未發布", role_name: "正式人員", employment_status: "在職" },
  ] });
  const published = {
    ...fallback,
    people: [{ ...fallback.people[0], name: "已發布人員" }],
  };

  assert.deepEqual(resolvePublishedStaffingSnapshot(published, fallback).people.map((person) => person.name), ["已發布人員"]);
  assert.equal(resolvePublishedStaffingSnapshot(null, fallback), null);
  assert.deepEqual(resolveStaffingDraftSnapshot(null, published, fallback).people.map((person) => person.name), ["已發布人員"]);
});

test("管理與跨店檢視權限分開", () => {
  assert.equal(canManageStaffingOverview("coo"), true);
  assert.equal(canManageStaffingOverview("supervisor"), false);
  assert.equal(canManageStaffingOverview("store_manager"), false);
  assert.equal(canViewAllStaffingStores("supervisor"), true);
  assert.equal(canViewAllStaffingStores("store_manager"), false);
});

test("發布前驗證必要資料與人數", () => {
  const snapshot = buildStaffingSnapshot({ store: stores[0], stores, staff });
  assert.equal(validateStaffingSnapshot(snapshot), "");
  assert.equal(validateStaffingSnapshot({ ...snapshot, target_headcount: -1 }), "編制人數不可小於 0");
  assert.equal(validateStaffingSnapshot({ ...snapshot, people: [{ ...snapshot.people[0], name: "" }] }), "人員顯示資料不完整或過長");
});

test("各店使用自己的出爐、關爐及班別時間", () => {
  const s02 = buildStaffingSnapshot({ store: { store_code: "S02", store_name: "鳳山凱旋店" }, stores, staff: [] });
  assert.equal(s02.output_time, "10:30");
  assert.equal(s02.closing_time, "21:00");
  assert.deepEqual(s02.shifts.map((shift) => [shift.name, shift.start_time, shift.end_time]), [
    ["開早班", "09:30", "20:30"],
    ["正常班", "10:30", "21:30"],
    ["打烊班", "11:30", "22:30"],
  ]);
});

test("工時試算依人力、休假與崗位自動計算", () => {
  const s06 = buildStaffingSnapshot({ store: { store_code: "S06", store_name: "鳳山南華店" }, stores, staff: [] });
  assert.deepEqual(calculateLaborUnit(s06.labor_units[0]), {
    monthDays: 30,
    staffEquivalent: 0,
    restDays: 12,
    positions: 1.5,
    totalDays: 0,
    workDays: -12,
    requiredDays: 45,
    balance: -57,
  });
});

test("職級使用固定色系分類", () => {
  assert.equal(staffingRoleTone("委任店經理"), "commissioned");
  assert.equal(staffingRoleTone("店長"), "manager");
  assert.equal(staffingRoleTone("代店"), "manager");
  assert.equal(staffingRoleTone("副店長"), "deputy");
  assert.equal(staffingRoleTone("資深人員"), "senior");
  assert.equal(staffingRoleTone("新進人員"), "newcomer");
  assert.equal(staffingRoleTone("兼職後勤"), "support");
  assert.equal(staffingRoleTone("送貨專員"), "delivery");
  assert.equal(staffingRoleTone("兼職人員"), "parttime");
  assert.equal(staffingRoleTone("正式人員"), "regular");
});
