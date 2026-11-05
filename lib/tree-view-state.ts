/**
 * Expanded folders and selection per thread and root, kept in memory so the
 * tree looks the same after BB unmounts and remounts the panel. Directory
 * contents are not cached here; they reload on mount.
 */
export interface TreeViewState {
  expanded: string[];
  selected: string | null;
}

const MAX_ENTRIES = 200;
const MAX_EXPANDED = 500;
const views = new Map<string, TreeViewState>();

export function treeViewKey(stateKey: string, hostId: string, rootPath: string): string {
  return `${stateKey}\n${hostId}\n${rootPath}`;
}

export function readTreeView(key: string): TreeViewState {
  return views.get(key) ?? { expanded: [""], selected: null };
}

export function writeTreeView(key: string, state: TreeViewState): void {
  views.delete(key);
  views.set(key, { expanded: state.expanded.slice(0, MAX_EXPANDED), selected: state.selected });
  if (views.size > MAX_ENTRIES) {
    const oldest = views.keys().next().value;
    if (oldest !== undefined) views.delete(oldest);
  }
}
