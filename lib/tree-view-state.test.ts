import { expect, test } from "bun:test";
import { readTreeView, treeViewKey, writeTreeView } from "./tree-view-state";

test("keeps tree view per thread and root", () => {
  const a = treeViewKey("thread:a", "h", "/r");
  const b = treeViewKey("thread:b", "h", "/r");
  writeTreeView(a, { expanded: ["", "src"], selected: "src/x.ts" });
  expect(readTreeView(a)).toEqual({ expanded: ["", "src"], selected: "src/x.ts" });
  expect(readTreeView(b)).toEqual({ expanded: [""], selected: null });
});
