import assert from "node:assert/strict";
import { LEITE_TABS, leiteTabPath } from "./routes.ts";

for (const tab of LEITE_TABS) {
  assert.equal(leiteTabPath(tab.to), `/leite/${tab.to}`);
}

assert.equal(leiteTabPath("producao"), "/leite/producao");
