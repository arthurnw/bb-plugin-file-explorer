import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FileExplorerPanelTab } from "@/components/FileExplorerPanelTab";
import { ChatDraftBridge } from "@/components/ChatDraftBridge";

// File Explorer opens as a tab in BB's right panel (the panel's + launcher),
// not as a pinned overlay rail.
export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "file-explorer",
    title: "File Explorer",
    icon: "FileText",
    layout: "flush",
    component: FileExplorerPanelTab,
  });

  app.slots.experimental_newThreadPanelAction({
    id: "file-explorer",
    title: "File Explorer",
    icon: "FileText",
    layout: "flush",
    component: FileExplorerPanelTab,
  });

  app.composer.customize({
    id: "file-explorer-chat-draft",
    scopes: ["thread", "queued-message", "side-chat", "new-thread"],
    banners: [{ id: "bridge", chrome: "bare", component: ChatDraftBridge }],
  });
});
