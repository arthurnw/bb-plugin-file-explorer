import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBbContext, useBbNavigate, useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { FileExplorerPanel } from "@/components/FileExplorerPanel";
import { FileContentSearchPanel } from "@/components/FileContentSearchPanel";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { registerSurfaceNavigation } from "@/lib/surface-navigation";
import { getFindInFolder, subscribeFindInFolder } from "@/lib/find-in-folder";
import type { RootChoice } from "../shared";
import {
  parsePinnedFolders,
  readThreadState,
  threadStateKey,
  updateThreadState,
  withFolder,
  withoutFolder,
} from "@/lib/thread-state";
import type { rpcContract } from "../contract";

/** The two views the rail carries: names, or the text inside them. */
type ExplorerTab = "files" | "search";
const TAB_STORAGE_KEY = "bb-plugin-file-explorer:tab";

function readStoredTab(): ExplorerTab {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) === "search" ? "search" : "files";
  } catch {
    return "files";
  }
}

function writeStoredTab(tab: ExplorerTab): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch {
    // The choice still lasts for this window when storage is unavailable.
  }
}

/** Body of the File Explorer tab in BB's right panel. */
export function FileExplorerPanelTab() {
  const rpc = useRpc<typeof rpcContract>();
  const { threadId, projectId } = useBbContext();
  const { values } = useSettings();
  const navigate = useBbNavigate();

  // The panel is the only surface that opens previews now, so it registers
  // the navigator the file rows look up by thread.
  useEffect(() => registerSurfaceNavigation(threadId, navigate), [threadId, navigate]);
  // Each thread keeps its own folder and recent folders. The state is read
  // again whenever the route moves to another thread.
  const stateKey = threadStateKey(threadId, projectId);
  const stateKeyRef = useRef(stateKey);
  stateKeyRef.current = stateKey;
  const [loadedKey, setLoadedKey] = useState(stateKey);
  const [selectedId, setSelectedId] = useState<string | null>(() => readThreadState(stateKey).selectedId);
  const [folders, setFolders] = useState<string[]>(() => readThreadState(stateKey).folders);
  if (loadedKey !== stateKey) {
    const stored = readThreadState(stateKey);
    setLoadedKey(stateKey);
    setSelectedId(stored.selectedId);
    setFolders(stored.folders);
  }

  const [choices, setChoices] = useState<RootChoice[]>([]);
  const [openedChoices, setOpenedChoices] = useState<RootChoice[]>([]);
  const [pinnedChoices, setPinnedChoices] = useState<RootChoice[]>([]);
  const [loadingRoots, setLoadingRoots] = useState(true);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [folderInput, setFolderInput] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [tab, setTab] = useState<ExplorerTab>(readStoredTab);

  // A right-clicked "Find in Folder" opens the tab that answers it. The panel
  // reads the same request and scopes its query to that folder.
  const findInFolder = useSyncExternalStore(subscribeFindInFolder, getFindInFolder);
  useEffect(() => {
    if (findInFolder === null) return;
    setTab("search");
    writeStoredTab("search");
  }, [findInFolder]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoots(true);
    void rpc.call("listRootChoices", { currentThreadId: threadId, pinnedThreadId: null })
      .then(({ choices: next }) => {
        if (!cancelled) setChoices(next);
      })
      .catch((cause) => {
        if (!cancelled) setRootError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingRoots(false);
      });
    return () => { cancelled = true; };
  }, [rpc, threadId, projectId, refreshCount, values?.treeRoot]);

  // Folders are kept by path; the server mints fresh root ids for them on each
  // load. A folder that no longer exists is removed from this thread's list.
  const pinnedPaths = parsePinnedFolders(values?.pinnedFolders);
  const pinnedKey = pinnedPaths.join("\n");
  useEffect(() => {
    let cancelled = false;
    void Promise.all(pinnedPaths.map((path) => rpc.call("openFolder", { path })))
      .then((results) => {
        if (cancelled) return;
        setPinnedChoices(results.flatMap((result) =>
          result.ok
            ? [{ ...result.choice, label: `Pinned · ${result.choice.workspace.rootPath}` }]
            : []));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, pinnedKey, refreshCount]);

  const foldersKey = folders.join("\n");
  useEffect(() => {
    let cancelled = false;
    const keyAtStart = stateKey;
    setLoadingFolders(true);
    void Promise.all(folders.map((path) => rpc.call("openFolder", { path })))
      .then((results) => {
        if (cancelled) return;
        setOpenedChoices(results.flatMap((result) => (result.ok ? [result.choice] : [])));
        const missing = folders.filter((_, index) => !results[index]?.ok);
        if (missing.length > 0) {
          const kept = folders.filter((path) => !missing.includes(path));
          updateThreadState(keyAtStart, { folders: kept });
          setFolders(kept);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingFolders(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc, foldersKey, refreshCount]);

  const chooseRoot = (id: string) => {
    setSelectedId(id);
    updateThreadState(stateKey, { selectedId: id });
  };

  const openFolderByPath = (path: string) => {
    setFolderError(null);
    const keyAtCall = stateKey;
    void rpc.call("openFolder", { path })
      .then((result) => {
        if (!result.ok) {
          if (stateKeyRef.current === keyAtCall) setFolderError(result.message);
          return;
        }
        const { choice } = result;
        const rootPath = choice.workspace.rootPath;
        const next = updateThreadState(keyAtCall, {
          selectedId: choice.id,
          folders: withFolder(readThreadState(keyAtCall).folders, rootPath),
        });
        if (stateKeyRef.current !== keyAtCall) return;
        setFolders(next.folders);
        setSelectedId(choice.id);
        setFolderInput("");
      })
      .catch((cause) => {
        if (stateKeyRef.current === keyAtCall) {
          setFolderError(cause instanceof Error ? cause.message : String(cause));
        }
      });
  };

  const removeFolder = (choice: RootChoice) => {
    const next = updateThreadState(stateKey, {
      folders: withoutFolder(readThreadState(stateKey).folders, choice.workspace.rootPath),
      ...(selectedId === choice.id ? { selectedId: null } : {}),
    });
    setFolders(next.folders);
    setOpenedChoices((current) => current.filter((existing) => existing.id !== choice.id));
    if (selectedId === choice.id) setSelectedId(null);
  };

  // Pinned folders win over the same path in the recent list.
  const pinnedIds = new Set(pinnedChoices.map((choice) => choice.id));
  const recentChoices = openedChoices.filter((choice) => !pinnedIds.has(choice.id));
  const allChoices = [...choices, ...pinnedChoices, ...recentChoices];

  // With no stored choice, or one that is gone, a thread opens in its own
  // workspace; the New Thread page uses its project's source.
  const defaultChoice = threadId !== null
    ? allChoices.find((choice) => choice.id === `thread:${threadId}`)
    : allChoices.find((choice) => choice.id === `personal:${projectId}`)
      ?? allChoices.find((choice) => choice.id.startsWith("source:") && choice.projectId === projectId)
      ?? allChoices[0];
  const settled = !loadingRoots && !loadingFolders;
  const stored = selectedId === null ? undefined : allChoices.find((choice) => choice.id === selectedId);
  const chosen = stored ?? (selectedId !== null && !settled ? undefined : defaultChoice);
  // Clearing the stored choice returns the thread to its default, its own workspace.
  const backToThreadFolder = () => {
    setSelectedId(null);
    updateThreadState(stateKey, { selectedId: null });
  };
  const showThreadFolderButton = threadId !== null && defaultChoice !== undefined;
  const onThreadFolder = defaultChoice !== undefined && chosen?.id === defaultChoice.id;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground" aria-label="File Explorer">
      <div className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-1.5 py-1">
        <SearchableSelect
          ariaLabel="File Explorer folder"
          triggerTitle="Folder shown for this thread — each thread keeps its own"
          value={chosen?.id ?? null}
          onValueChange={chooseRoot}
          placeholder="Choose a folder"
          searchPlaceholder="Search projects…"
          options={allChoices.map((choice) => ({
            value: choice.id,
            label: choice.label,
            onRemove: recentChoices.includes(choice) ? () => removeFolder(choice) : undefined,
          }))}
          triggerClassName="bg-sidebar"
        />
        {showThreadFolderButton ? (
          <button type="button" aria-label="Back to this thread's workspace" title="Back to this thread's workspace"
            disabled={onThreadFolder}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-state-hover disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={backToThreadFolder}>
            <Icon name="FolderGit" className="size-3" />
          </button>
        ) : null}
        <button type="button" aria-label="Refresh folder list" title="Refresh folder list"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-state-hover"
          onClick={() => setRefreshCount((count) => count + 1)}>
          <Icon name="RotateCcw" className="size-3" />
        </button>
      </div>
      <div className="shrink-0 border-b border-sidebar-border px-1.5 py-1">
        <Input
          aria-label="Open folder by path"
          title="Open any folder on this computer by path, then press Enter"
          placeholder="Open folder path… (e.g. ~/.local/share)"
          value={folderInput}
          className="h-6 px-2 text-[11px]"
          onChange={(event) => {
            setFolderInput(event.target.value);
            setFolderError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && folderInput.trim() !== "") openFolderByPath(folderInput);
          }}
        />
        {folderError !== null ? <p className="pt-1 text-[11px] text-destructive">{folderError}</p> : null}
      </div>
      <div
        role="tablist"
        aria-label="File explorer view"
        className="flex shrink-0 items-center gap-0.5 border-b border-sidebar-border px-1.5 py-1"
      >
        {(
          [
            { id: "files", icon: "FileText", label: "Files" },
            { id: "search", icon: "Search", label: "Search text" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            title={item.label}
            onClick={() => {
              setTab(item.id);
              writeStoredTab(item.id);
            }}
            className={cn(
              "flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-[4px] text-[11px] leading-4",
              "hover:bg-state-hover",
              tab === item.id && "bg-state-active font-medium text-foreground hover:bg-state-active",
            )}
          >
            <Icon name={item.icon} className="size-3.5 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
      {rootError !== null ? <p className="px-2 py-2 text-[11px] text-destructive">{rootError}</p> : null}
      {loadingRoots && choices.length === 0 ? <p className="px-2 py-2 text-[11px] text-muted-foreground">Loading folders…</p> : null}
      {tab === "files" ? (
        <FileExplorerPanel root={chosen?.workspace ?? null} viewKey={stateKey} />
      ) : (
        <FileContentSearchPanel root={chosen?.workspace ?? null} />
      )}
    </div>
  );
}
