import test from "node:test";
import assert from "node:assert/strict";

import { normalizeLoginIdentifier } from "../src/domain/loginIdentifier.js";

test("store short accounts are case-insensitive and use isolated alias emails", () => {
  assert.equal(normalizeLoginIdentifier("S01"), "s01.sub@laigdo.com");
  assert.equal(normalizeLoginIdentifier(" s11 "), "s11.sub@laigdo.com");
});

test("existing email logins remain supported and are normalized", () => {
  assert.equal(normalizeLoginIdentifier(" S01@LAIGDO.COM "), "s01@laigdo.com");
  assert.equal(normalizeLoginIdentifier("hq@example.com"), "hq@example.com");
});

test("unknown short identifiers are not remapped", () => {
  assert.equal(normalizeLoginIdentifier("S00"), "s00");
  assert.equal(normalizeLoginIdentifier("S12"), "s12");
});
