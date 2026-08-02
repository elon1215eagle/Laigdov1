import test from "node:test";
import assert from "node:assert/strict";
import { STAFF_POSITION_OPTIONS, buildStaffPositionSkillCommand } from "../src/modules/hr/index.js";

test("第一階段工作崗位符合核定清單", () => {
  assert.deepEqual(STAFF_POSITION_OPTIONS, ["店長值班", "櫃台", "炸台", "備料", "包裝", "外送", "後勤", "送貨"]);
});

test("員工可有多項技能但只能有一個主要崗位", () => {
  const result = buildStaffPositionSkillCommand({ staff_id: "A", positions: ["炸台", "備料", "炸台"], primary_position: "炸台" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.payload.positions, ["炸台", "備料"]);
});

test("主要崗位必須包含在技能清單", () => {
  const result = buildStaffPositionSkillCommand({ staff_id: "A", positions: ["櫃台"], primary_position: "炸台" });
  assert.equal(result.valid, false);
});
