import { describe, expect, test } from "bun:test";
import {
  MAX_OPENED_FOLDERS,
  MAX_THREAD_STATES,
  type StateStorage,
  parsePinnedFolders,
  readThreadState,
  threadStateKey,
  updateThreadState,
  withFolder,
  withoutFolder,
} from "./thread-state";

function memory(): StateStorage {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("thread state", () => {
  test("keeps each thread's selection and folders separate", () => {
    const s = memory();
    updateThreadState("thread:a", { selectedId: "folder:abc", folders: ["/x"] }, s);
    updateThreadState("thread:b", { selectedId: "thread:b" }, s);
    expect(readThreadState("thread:a", s)).toEqual({ selectedId: "folder:abc", folders: ["/x"] });
    expect(readThreadState("thread:b", s)).toEqual({ selectedId: "thread:b", folders: [] });
    expect(readThreadState("thread:c", s)).toEqual({ selectedId: null, folders: [] });
  });

  test("a patch leaves the other field alone", () => {
    const s = memory();
    updateThreadState("k", { folders: ["/x"] }, s);
    updateThreadState("k", { selectedId: "folder:abc" }, s);
    expect(readThreadState("k", s)).toEqual({ selectedId: "folder:abc", folders: ["/x"] });
  });

  test("drops the least recently updated thread past the cap", () => {
    const s = memory();
    for (let i = 0; i <= MAX_THREAD_STATES; i++) updateThreadState(`t${i}`, { folders: ["/x"] }, s);
    expect(readThreadState("t0", s).folders).toEqual([]);
    expect(readThreadState(`t${MAX_THREAD_STATES}`, s).folders).toEqual(["/x"]);
  });

  test("ignores corrupt storage and bad selection ids", () => {
    const s = memory();
    s.setItem("bb-plugin-file-explorer:thread-state", "{nope");
    expect(readThreadState("k", s)).toEqual({ selectedId: null, folders: [] });
    updateThreadState("k", { selectedId: "bogus id" }, s);
    expect(readThreadState("k", s).selectedId).toBeNull();
  });

  test("folder list helpers", () => {
    expect(withFolder(["/a", "/b"], "/b")).toEqual(["/b", "/a"]);
    const many = Array.from({ length: MAX_OPENED_FOLDERS }, (_, i) => `/f${i}`);
    expect(withFolder(many, "/new")).toHaveLength(MAX_OPENED_FOLDERS);
    expect(withoutFolder(["/a", "/b"], "/a")).toEqual(["/b"]);
  });

  test("keys and pinned-folder parsing", () => {
    expect(threadStateKey("t1", "p1")).toBe("thread:t1");
    expect(threadStateKey(null, "p1")).toBe("project:p1");
    expect(parsePinnedFolders(" ~/.config \n\n~/.config\n/etc\n")).toEqual(["~/.config", "/etc"]);
    expect(parsePinnedFolders(undefined)).toEqual([]);
  });
});
