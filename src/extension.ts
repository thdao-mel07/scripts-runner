import * as vscode from "vscode";
import * as path from "path";
import { scriptKey } from "./logic";
import { initStore, addPin, removePin, getAlias, setAlias, removeAlias } from "./store";
import {
  initRunning,
  onTerminalClosed,
  onTerminalExecEnded,
  stopScript,
  disposeAll,
  allEntries,
} from "./running";
import {
  initRunner,
  runScriptInTerminal,
  runScriptSilent,
} from "./runner";
import { ScriptItem, ScriptProvider } from "./tree";
import { PackageJsonCodeLensProvider } from "./codelens";

/** Lấy (packageJsonPath, scriptName, scriptValue) từ ScriptItem hoặc object CodeLens */
function resolveTarget(item: unknown):
  | { packageJsonPath: string; scriptName: string; scriptValue?: string }
  | undefined {
  const it = item as {
    packageJsonPath?: string;
    scriptName?: string;
    scriptValue?: string;
  };
  if (it?.packageJsonPath && it.scriptName) {
    return {
      packageJsonPath: it.packageJsonPath,
      scriptName: it.scriptName,
      scriptValue: it.scriptValue,
    };
  }
  return undefined;
}

/** Đặt/đổi alias hiển thị cho 1 script */
async function promptAlias(
  item: ScriptItem,
  refresh: () => void
): Promise<void> {
  if (!item?.scriptName || !item.packageJsonPath) {
    return;
  }
  const key = scriptKey(path.dirname(item.packageJsonPath), item.scriptName);
  const input = await vscode.window.showInputBox({
    title: `Alias for "${item.scriptName}"`,
    prompt: "Enter a display name (leave empty to remove)",
    value: getAlias(key) ?? "",
  });
  if (input === undefined) {
    return; // Esc
  }
  if (input.trim() === "") {
    await removeAlias(key);
  } else {
    await setAlias(key, input.trim());
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
      description: e.terminal ? "terminal" : "silent",
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

  const outputChannel = vscode.window.createOutputChannel("Scripts Runner");
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  statusBar.command = "scriptsSidebar.showRunning";

  const provider = new ScriptProvider();
  initRunner(outputChannel);
  initRunning(statusBar, () => provider.refresh());

  const treeView = vscode.window.createTreeView("scriptView", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const run = (item: unknown): void => {
    const t = resolveTarget(item);
    if (t) {
      runScriptInTerminal(t.packageJsonPath, t.scriptName);
    }
  };
  const runSilent = (item: unknown): void => {
    const t = resolveTarget(item);
    if (t) {
      runScriptSilent(t.packageJsonPath, t.scriptName, t.scriptValue);
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
    outputChannel,
    statusBar,
    vscode.commands.registerCommand("scriptsSidebar.runScript", run),
    vscode.commands.registerCommand("scriptsSidebar.runScriptSilent", runSilent),
    vscode.commands.registerCommand("scriptsSidebar.stopScript", stop),
    vscode.commands.registerCommand(
      "scriptsSidebar.pinScript",
      async (item: ScriptItem) => {
        const key = keyOf(item);
        if (key) {
          await addPin(key);
          provider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.unpinScript",
      async (item: ScriptItem) => {
        const key = keyOf(item);
        if (key) {
          await removePin(key);
          provider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand("scriptsSidebar.setAlias", (item: ScriptItem) =>
      promptAlias(item, () => provider.refresh())
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.clearAlias",
      async (item: ScriptItem) => {
        const key = keyOf(item);
        if (key) {
          await removeAlias(key);
          provider.refresh();
        }
      }
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.showRunning",
      showRunningQuickPick
    ),
    vscode.commands.registerCommand("scriptsSidebar.refresh", () =>
      provider.refresh()
    ),
    vscode.languages.registerCodeLensProvider(
      [
        { language: "json", pattern: "**/package.json" },
        { language: "jsonc", pattern: "**/package.json" },
      ],
      new PackageJsonCodeLensProvider()
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
