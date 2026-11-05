import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { folderChoiceId, openFolder } from "./open-folder";
import { resolveRoot } from "./roots";

const dir = async () => ({ isDirectory: true });

describe("openFolder", () => {
  test("registers an existing directory as a root", async () => {
    const result = await openFolder("h1", "/var/tmp/x/", dir);
    if (!result.ok) throw new Error(result.message);
    expect(result.choice.workspace.rootPath).toBe("/var/tmp/x");
    expect(result.choice.workspace.rootName).toBe("x");
    expect(result.choice.id).toBe(folderChoiceId("h1", "/var/tmp/x"));
    expect(resolveRoot(result.choice.workspace.rootId)).toEqual({ hostId: "h1", rootPath: "/var/tmp/x" });
  });

  test("expands ~/", async () => {
    const result = await openFolder("h1", "~/.local/share", dir);
    if (!result.ok) throw new Error(result.message);
    expect(result.choice.workspace.rootPath).toBe(`${homedir()}/.local/share`);
  });

  test("rejects relative, missing and non-directory paths", async () => {
    expect((await openFolder("h1", "docs", dir)).ok).toBe(false);
    expect((await openFolder("h1", "/nope", async () => null)).ok).toBe(false);
    expect((await openFolder("h1", "/etc/hosts", async () => ({ isDirectory: false }))).ok).toBe(false);
  });
});
