import test from "node:test";
import assert from "node:assert/strict";
import { toLocalDateTime } from "../src/live/dateTime.js";

test("task editing preserves the local due time across time zones", () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of [
      "Africa/Lagos",
      "America/New_York",
      "Asia/Kolkata",
    ]) {
      process.env.TZ = timezone;
      for (const date of [
        "2026-01-12T09:30:00.000Z",
        "2026-07-12T09:30:00.000Z",
      ]) {
        assert.equal(new Date(toLocalDateTime(date)).toISOString(), date);
      }
    }
    assert.equal(toLocalDateTime(null), "");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
