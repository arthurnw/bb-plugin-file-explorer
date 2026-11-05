import { createHash } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import type { RootChoice } from "../shared";
import { registerRoot } from "./roots";

export type OpenFolderResult =
  | { ok: true; choice: RootChoice }
  | { ok: false; message: string };

export type DirectoryProbe = (
  hostId: string,
  absolutePath: string,
) => Promise<{ isDirectory: boolean } | null>;

export function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

/** Stable id for a typed folder, so a remembered choice survives restarts. */
export function folderChoiceId(hostId: string, rootPath: string): string {
  return `folder:${createHash("sha1").update(`${hostId}\n${rootPath}`).digest("hex").slice(0, 16)}`;
}

/**
 * Register any directory on the given host as a tree root. The path comes from
 * the user's own typed input, so it is only checked for being an absolute,
 * existing directory.
 */
export async function openFolder(
  hostId: string,
  rawPath: string,
  probe: DirectoryProbe,
): Promise<OpenFolderResult> {
  const expanded = expandHome(rawPath.trim());
  if (expanded.includes("\0")) return { ok: false, message: "Path contains a null byte." };
  if (!path.isAbsolute(expanded)) {
    return { ok: false, message: "Enter an absolute path or one starting with ~/." };
  }
  const rootPath = path.resolve(expanded);
  const stat = await probe(hostId, rootPath);
  if (stat === null) return { ok: false, message: `${rootPath} does not exist.` };
  if (!stat.isDirectory) return { ok: false, message: `${rootPath} is not a folder.` };
  return {
    ok: true,
    choice: {
      id: folderChoiceId(hostId, rootPath),
      label: `Folder · ${rootPath}`,
      projectId: null,
      workspace: {
        environmentId: null,
        hostId,
        rootPath,
        rootName: path.basename(rootPath) || rootPath,
        rootId: registerRoot(hostId, rootPath),
      },
    },
  };
}
