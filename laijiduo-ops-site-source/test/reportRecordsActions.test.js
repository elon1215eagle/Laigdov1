import assert from "node:assert/strict";
import test from "node:test";

import { selectLockableReports } from "../src/modules/daily-report/application/reportRecordsActions.js";

test("one-click locking only targets submitted records with persistent ids", () => {
  const rows = [
    { id: "submitted-1", status: "submitted" },
    { id: "approved-1", status: "approved" },
    { id: "draft-1", status: "draft" },
    { id: "revision-1", status: "needs_revision" },
    { status: "submitted" },
    { id: "submitted-2", status: "submitted" },
  ];

  assert.deepEqual(
    selectLockableReports(rows).map((row) => row.id),
    ["submitted-1", "submitted-2"],
  );
});
