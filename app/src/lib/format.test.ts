import assert from "node:assert/strict";
import { parseDecimal, parseMilkLiters } from "./format.js";

assert.equal(parseDecimal("12,5"), 12.5);
assert.equal(parseDecimal("12.5"), 12.5);
assert.equal(parseDecimal("12,5 L 3"), null);
assert.equal(parseDecimal("1.234,5"), null);

assert.equal(parseMilkLiters("7,5"), 7.5);
assert.equal(parseMilkLiters("12.5"), 12.5);
assert.equal(parseMilkLiters("100"), 100);
assert.equal(parseMilkLiters("101"), null);
assert.equal(parseMilkLiters("12.50"), null);
assert.equal(parseMilkLiters("12,5 L 3"), null);
