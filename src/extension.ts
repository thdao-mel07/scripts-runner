import * as vscode from "vscode";
import * as path from "path";
import { scriptKey } from "./logic";
import {
  initStore,
  addHidden,
  removeHidden,
  getHiddenSet,
  addHiddenFolder,
  removeHiddenFolder,
  getHiddenFolders,
  setFolderExpanded,
} from "./store";
import {
  initRunning,
  onTerminalClosed,
  onTerminalExecEnded,
  stopScript,
  disposeAll,
  allEntries,
} from "./running";
import { runScriptInTerminal } from "./runner";
import { ScriptItem, ScriptProvider } from "./tree";

/** Lấy (packageJsonPath, scriptName) từ ScriptItem */
function resolveTarget(
  item: unknown
): { packageJsonPath: string; scriptName: string } | undefined {
  const it = item as {
    packageJsonPath?: string;
    scriptName?: string;
  };
  if (it?.packageJsonPath && it.scriptName) {
    return {
      packageJsonPath: it.packageJsonPath,
      scriptName: it.scriptName,
    };
  }
  return undefined;
}

/**
 * Hiện lại script đã ẩn — gọi từ chuột phải trong file package.json.
 * Lọc theo package.json đang mở (nếu có), cho chọn nhiều để bỏ ẩn.
 */
async function showHidden(
  contextUri: vscode.Uri | undefined,
  refresh: () => void
): Promise<void> {
  const hidden = getHiddenSet();
  if (hidden.size === 0) {
    vscode.window.showInformationMessage("No hidden scripts.");
    return;
  }

  let keys = [...hidden];
  // Nếu gọi từ 1 package.json cụ thể -> chỉ lấy script ẩn của thư mục đó
  const uri = contextUri ?? vscode.window.activeTextEditor?.document.uri;
  if (uri && path.basename(uri.fsPath) === "package.json") {
    const dir = path.dirname(uri.fsPath);
    const scoped = keys.filter((k) => k.startsWith(`${dir}::`));
    if (scoped.length > 0) {
      keys = scoped;
    }
  }

  const picks = await vscode.window.showQuickPick(
    keys.map((k) => {
      const sep = k.lastIndexOf("::");
      return {
        label: k.slice(sep + 2),
        description: path.basename(k.slice(0, sep)),
        key: k,
      };
    }),
    {
      placeHolder: "Select hidden script(s) to show in the sidebar again",
      canPickMany: true,
    }
  );
  if (!picks || picks.length === 0) {
    return;
  }
  for (const p of picks) {
    await removeHidden(p.key);
  }
  refresh();
}

/** Hiện lại các group (package.json) đã ẩn khỏi sidebar qua QuickPick. */
async function showHiddenFolders(refresh: () => void): Promise<void> {
  const hidden = getHiddenFolders();
  if (hidden.size === 0) {
    vscode.window.showInformationMessage("No hidden package groups.");
    return;
  }
  const picks = await vscode.window.showQuickPick(
    [...hidden].map((p) => ({
      label: path.basename(path.dirname(p)),
      description: vscode.workspace.asRelativePath(p),
      pkgPath: p,
    })),
    {
      placeHolder: "Select package group(s) to show in the sidebar again",
      canPickMany: true,
    }
  );
  if (!picks || picks.length === 0) {
    return;
  }
  for (const p of picks) {
    await removeHiddenFolder(p.pkgPath);
  }
  refresh();
}

/** Click status bar -> chọn 1 script đang chạy để dừng */
async function showRunningQuickPick(): Promise<void> {
  const entries = allEntries();
  if (entries.length === 0) {
    return;
  }
  const pick = await vscode.window.showQuickPick(
    entries.map((e) => ({
      label: `$(debug-stop) ${e.scriptName}`,
      entry: e,
    })),
    { placeHolder: "Select a running script to stop" }
  );
  if (pick) {
    stopScript(pick.entry.packageJsonPath, pick.entry.scriptName);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  initStore(context);

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  statusBar.command = "scriptsSidebar.showRunning";

  const provider = new ScriptProvider();
  initRunning(statusBar, () => provider.refresh());

  const treeView = vscode.window.createTreeView("scriptView", {
    treeDataProvider: provider,
    showCollapseAll: true,
    dragAndDropController: provider,
  });

  // Nhớ trạng thái mở/đóng từng group để lần sau khởi động giữ nguyên.
  treeView.onDidExpandElement((e) => {
    if (e.element.kind === "folder" && e.element.packageJsonPath) {
      void setFolderExpanded(e.element.packageJsonPath, true);
    }
  });
  treeView.onDidCollapseElement((e) => {
    if (e.element.kind === "folder" && e.element.packageJsonPath) {
      void setFolderExpanded(e.element.packageJsonPath, false);
    }
  });

  const run = (item: unknown): void => {
    const t = resolveTarget(item);
    if (t) {
      runScriptInTerminal(t.packageJsonPath, t.scriptName);
    }
  };
  const stop = (item: unknown): void => {
    const t = resolveTarget(item);
    if (t) {
      stopScript(t.packageJsonPath, t.scriptName);
    }
  };
  const keyOf = (item: ScriptItem): string | undefined =>
    item?.scriptName && item.packageJsonPath
      ? scriptKey(path.dirname(item.packageJsonPath), item.scriptName)
      : undefined;

  context.subscriptions.push(
    treeView,
    statusBar,
    vscode.commands.registerCommand("scriptsSidebar.runScript", run),
    vscode.commands.registerCommand("scriptsSidebar.stopScript", stop),
    vscode.commands.registerCommand(
      "scriptsSidebar.hideScript",
      async (item: ScriptItem) => {
        const key = keyOf(item);
        if (key) {
          await addHidden(key);
          provider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.showHidden",
      (uri?: vscode.Uri) => showHidden(uri, () => provider.refresh())
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.hideFolder",
      async (item: ScriptItem) => {
        if (item?.packageJsonPath) {
          await addHiddenFolder(item.packageJsonPath);
          provider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand("scriptsSidebar.showHiddenFolders", () =>
      showHiddenFolders(() => provider.refresh())
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.showRunning",
      showRunningQuickPick
    ),
    vscode.commands.registerCommand("scriptsSidebar.refresh", () =>
      provider.refresh()
    )
  );

  // Auto refresh khi package.json thay đổi / thêm / xoá
  const watcher = vscode.workspace.createFileSystemWatcher("**/package.json");
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("scriptsSidebar")) {
        provider.refresh();
      }
    }),
    vscode.window.onDidCloseTerminal((closed) => onTerminalClosed(closed))
  );

  // Best-effort: khi lệnh trong terminal kết thúc (shell integration) -> clear
  const win = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: (
      listener: (e: { terminal: vscode.Terminal }) => void
    ) => vscode.Disposable;
  };
  if (typeof win.onDidEndTerminalShellExecution === "function") {
    context.subscriptions.push(
      win.onDidEndTerminalShellExecution((e) => onTerminalExecEnded(e.terminal))
    );
  }
}

export function deactivate(): void {
  disposeAll();
}
