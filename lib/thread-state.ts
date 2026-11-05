/**
 * Explorer state kept per thread: which folder the panel shows and the folders
 * the user opened by path. Stored in one localStorage entry, most recently
 * used thread last, and capped so it cannot grow without limit.
 */
export interface ThreadExplorerState {
  selectedId: string | null;
  folders: string[];
}

export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const THREAD_STATE_STORAGE_KEY = "bb-plugin-file-explorer:thread-state";
export const MAX_THREAD_STATES = 200;
export const MAX_OPENED_FOLDERS = 10;

const SELECTED_ID = /^(?:thread|source|personal|folder):[\w-]{1,128}$/u;

/** Thread id when there is one; otherwise the New Thread page of a project. */
export function threadStateKey(threadId: string | null, projectId: string | null): string {
  if (threadId !== null) return `thread:${threadId}`;
  return `project:${projectId ?? "none"}`;
}

function sanitize(value: unknown): ThreadExplorerState {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const selectedId = typeof record.selectedId === "string" && SELECTED_ID.test(record.selectedId)
    ? record.selectedId
    : null;
  const folders = Array.isArray(record.folders)
    ? record.folders.filter((item): item is string => typeof item === "string").slice(0, MAX_OPENED_FOLDERS)
    : [];
  return { selectedId, folders };
}

function readStore(storage: StateStorage): Record<string, ThreadExplorerState> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(THREAD_STATE_STORAGE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, sanitize(value)]),
    );
  } catch {
    return {};
  }
}

export function readThreadState(key: string, storage: StateStorage = localStorage): ThreadExplorerState {
  return readStore(storage)[key] ?? { selectedId: null, folders: [] };
}

export function updateThreadState(
  key: string,
  patch: Partial<ThreadExplorerState>,
  storage: StateStorage = localStorage,
): ThreadExplorerState {
  const store = readStore(storage);
  const next = sanitize({ ...(store[key] ?? { selectedId: null, folders: [] }), ...patch });
  delete store[key];
  const entries = [...Object.entries(store), [key, next] as const].slice(-MAX_THREAD_STATES);
  try {
    storage.setItem(THREAD_STATE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // The state still lasts for this window when storage is unavailable.
  }
  return next;
}

/** Newest first, without duplicates, capped. */
export function withFolder(folders: readonly string[], path: string): string[] {
  return [path, ...folders.filter((existing) => existing !== path)].slice(0, MAX_OPENED_FOLDERS);
}

export function withoutFolder(folders: readonly string[], path: string): string[] {
  return folders.filter((existing) => existing !== path);
}

/** One folder per line from the "pinned folders" setting. */
export function parsePinnedFolders(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return [...new Set(lines)];
}
