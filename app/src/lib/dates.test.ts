import assert from "node:assert/strict";
import {
  addDays,
  dateKeyInSaoPaulo,
  formatDay,
  formatLong,
  formatMonth,
  timeInSaoPaulo,
} from "./dates.js";

assert.equal(dateKeyInSaoPaulo("2026-08-04T00:00:00.000Z"), "2026-08-03");
assert.equal(timeInSaoPaulo("2026-08-04T00:00:00.000Z"), "21:00");
assert.equal(dateKeyInSaoPaulo("2026-08-04T03:00:00.000Z"), "2026-08-04");
assert.equal(timeInSaoPaulo("2026-08-04T03:00:00.000Z"), "00:00");
assert.equal(addDays("2026-08-04", 1), "2026-08-05");
assert.match(formatDay("2026-08-04"), /04/);
assert.match(formatLong("2026-08-04"), /2026/);
assert.match(formatMonth("2026-08-04"), /2026/);
