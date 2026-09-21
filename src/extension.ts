import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  PackageManager,
  scriptKey,
  buildRunCommand,
  pickPackageManager,
  isLongRunningScript,
  firstLines,
  displayLabel,
  findScriptLines,
} from "./logic";

// Loại node trong TreeView
type ItemKind = "favorites" | "folder" | "script";

/** Một script đang chạy + metadata để dừng/hiển thị */
interface RunEntry {
  packageJsonPath: string;
  scriptName: string;
  terminal?: vscode.Terminal;
  child?: ChildProcess;
}

/** Context extension (dùng cho workspaceState lưu pin/alias) */
let extContext: vscode.ExtensionContext;

/** Provider toàn cục để các command gọi refresh */
let provider: ScriptProvider;

/** Status bar item hiển thị số script đang chạy */
let statusBar: vscode.StatusBarItem;

/** Output channel gom log của chế độ silent */
let outputChannel: vscode.OutputChannel;

/** Số package.json tối đa quét trong workspace */
const MAX_PACKAGE_JSON = 500;
let warnedTruncation = false;

/**
 * Map terminal đang mở, khóa theo cwd + tên script để tái sử dụng đúng
 * terminal của từng script (khi bật reuseTerminal).
 */
const terminals = new Map<string, vscode.Terminal>();

/** Các script đang chạy: key -> entry (terminal và/hoặc child) */
const running = new Map<string, RunEntry>();

// ---------------------------------------------------------------------------
// Quản lý trạng thái đang chạy (fix bug #1: không ghi đè giữa terminal & silent)
// ---------------------------------------------------------------------------

/** Đánh dấu chạy qua terminal — giữ lại child nếu đang có */
function markTerminalRunning(
  key: string,
  packageJsonPath: string,
  scriptName: string,
  terminal: vscode.Terminal
): void {
  const cur = running.get(key);
  running.set(key, { packageJsonPath, scriptName, terminal, child: cur?.child });
  afterRunningChanged();
}

/** Đánh dấu chạy qua child_process — giữ lại terminal nếu đang có */
function markChildRunning(
  key: string,
  packageJsonPath: string,
  scriptName: string,
  child: ChildProcess
): void {
  const cur = running.get(key);
  running.set(key, { packageJsonPath, scriptName, child, terminal: cur?.terminal });
  afterRunningChanged();
}

/** Gỡ 1 kênh (terminal hoặc child); nếu hết cả 2 thì xóa hẳn key */
function clearRunning(key: string, which: "terminal" | "child"): void {
  const cur = running.get(key);
  if (!cur) {
    return;
  }
  if (which === "terminal") {
    cur.terminal = undefined;
  } else {
    cur.child = undefined;
  }
  if (!cur.terminal && !cur.child) {
    running.delete(key);
  } else {
    running.set(key, cur);
  }
  afterRunningChanged();
}

/** Sau mỗi thay đổi trạng thái: cập nhật status bar + refresh tree */
function afterRunningChanged(): void {
  updateStatusBar();
  provider.refresh();
}

function updateStatusBar(): void {
  const count = running.size;
  if (count === 0) {
    statusBar.hide();
    return;
  }
  const names = [...running.values()].map((e) => e.scriptName);
  statusBar.text = `$(sync~spin) ${count} script${count > 1 ? "s" : ""}`;
  statusBar.tooltip = `Running: ${names.join(", ")}\nClick to stop a script`;
  statusBar.show();
}

// ---------------------------------------------------------------------------
// Pin / Favorites + Alias (lưu vào workspaceState)
// ---------------------------------------------------------------------------

const PINNED_STATE_KEY = "scriptsSidebar.pinned";
const ALIAS_STATE_KEY = "scriptsSidebar.aliases";

function getPinnedSet(): Set<string> {
  return new Set(extContext.workspaceState.get<string[]>(PINNED_STATE_KEY, []));
}

async function setPinnedSet(set: Set<string>): Promise<void> {
  await extContext.workspaceState.update(PINNED_STATE_KEY, [...set]);
}

function isPinned(key: string): boolean {
  return getPinnedSet().has(key);
}

function getAliases(): Record<string, string> {
  return extContext.workspaceState.get<Record<string, string>>(
    ALIAS_STATE_KEY,
    {}
  );
}

function getAlias(key: string): string | undefined {
  return getAliases()[key];
}

async function setAliasValue(key: string, alias: string): Promise<void> {
  const all = getAliases();
  all[key] = alias;
  await extContext.workspaceState.update(ALIAS_STATE_KEY, all);
}

async function removeAliasValue(key: string): Promise<void> {
  const all = getAliases();
  delete all[key];
  await extContext.workspaceState.update(ALIAS_STATE_KEY, all);
}

// ---------------------------------------------------------------------------
// TreeItem
// ---------------------------------------------------------------------------

class ScriptItem extends vscode.TreeItem {
  children?: ScriptItem[];

  constructor(
    public readonly kind: ItemKind,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly scriptName?: string,
    public readonly scriptValue?: string,
    public readonly packageJsonPath?: string
  ) {
    super(label, collapsibleState);

    if (kind === "script" && scriptName && packageJsonPath) {
      const cwd = path.dirname(packageJsonPath);
      const key = scriptKey(cwd, scriptName);
      const isRun = running.has(key);
      const pinned = isPinned(key);
      const alias = getAlias(key);

      // contextValue ghép cờ; menu dùng regex negative-lookahead để lọc
      // (fix: bền vững với mọi tổ hợp cờ)
      this.contextValue =
        "script" +
        (isRun ? "Running" : "") +
        (pinned ? "Pinned" : "") +
        (alias ? "Aliased" : "");

      // Nhãn: ưu tiên alias; nếu có alias thì mô tả kèm tên gốc
      this.label = displayLabel(scriptName, alias);
      this.description = alias ? `${scriptName} · ${scriptValue}` : scriptValue;
      this.tooltip = new vscode.MarkdownString(
        `**${scriptName}**${alias ? ` (alias: ${alias})` : ""}${
          isRun ? " · _running_" : ""
        }${pinned ? " · ⭐" : ""}\n\n\`\`\`sh\n${scriptValue}\n\`\`\``
      );
      this.iconPath = isRun
        ? new vscode.ThemeIcon("loading~spin")
        : new vscode.ThemeIcon("play");

      this.command = {
        command: "scriptsSidebar.runScript",
        title: "Run Script",
        arguments: [this],
      };
    } else if (kind === "folder") {
      this.contextValue = "folder";
      this.iconPath = new vscode.ThemeIcon("package");
      this.tooltip = packageJsonPath;
    } else if (kind === "favorites") {
      this.contextValue = "favorites";
      this.iconPath = new vscode.ThemeIcon("star-full");
    }
  }
}

// ---------------------------------------------------------------------------
// Đọc package.json
// ---------------------------------------------------------------------------

interface PackageInfo {
  dir: string;
  packageJsonPath: string;
  name: string;
  scripts: Record<string, string>;
}

/** Tìm tất cả package.json trong workspace (bỏ node_modules) */
async function findPackageJsons(): Promise<PackageInfo[]> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return [];
  }

  const uris = await vscode.workspace.findFiles(
    "**/package.json",
    "**/node_modules/**",
    MAX_PACKAGE_JSON
  );

  // Fix bug #3: cảnh báo (1 lần) khi số package.json chạm giới hạn
  if (uris.length >= MAX_PACKAGE_JSON && !warnedTruncation) {
    warnedTruncation = true;
    vscode.window.showWarningMessage(
      `Scripts Runner: found ${MAX_PACKAGE_JSON}+ package.json files; the list may be truncated.`
    );
  }

  const packages: PackageInfo[] = [];
  for (const uri of uris) {
    try {
      const raw = fs.readFileSync(uri.fsPath, "utf-8");
      const json = JSON.parse(raw) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      const scripts = json.scripts ?? {};
      if (Object.keys(scripts).length === 0) {
        continue;
      }
      const dir = path.dirname(uri.fsPath);
      packages.push({
        dir,
        packageJsonPath: uri.fsPath,
        name: json.name ?? path.basename(dir),
        scripts,
      });
    } catch {
      continue; // bỏ qua package.json lỗi cú pháp
    }
  }

  packages.sort((a, b) => a.packageJsonPath.localeCompare(b.packageJsonPath));
  return packages;
}

// ---------------------------------------------------------------------------
// TreeDataProvider
// ---------------------------------------------------------------------------

class ScriptProvider implements vscode.TreeDataProvider<ScriptItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    ScriptItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ScriptItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ScriptItem): Promise<ScriptItem[]> {
    if (element) {
      return element.children ?? [];
    }

    const packages = await findPackageJsons();
    if (packages.length === 0) {
      return [];
    }

    const roots: ScriptItem[] = [];

    const favorites = this.buildFavorites(packages);
    if (favorites) {
      roots.push(favorites);
    }

    for (const pkg of packages) {
      const folder = new ScriptItem(
        "folder",
        pkg.name,
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        undefined,
        pkg.packageJsonPath
      );
      folder.id = `folder:${pkg.packageJsonPath}`;
      folder.children = this.buildPackageChildren(pkg);
      folder.description = `${folder.children.length}`;
      roots.push(folder);
    }

    return roots;
  }

  private buildFavorites(packages: PackageInfo[]): ScriptItem | undefined {
    const pinned = getPinnedSet();
    if (pinned.size === 0) {
      return undefined;
    }

    const items: ScriptItem[] = [];
    for (const pkg of packages) {
      for (const [name, value] of Object.entries(pkg.scripts)) {
        const key = scriptKey(pkg.dir, name);
        if (pinned.has(key)) {
          items.push(this.makeScriptItem(pkg, name, value));
        }
      }
    }
    if (items.length === 0) {
      return undefined;
    }

    items.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const fav = new ScriptItem(
      "favorites",
      "Favorites",
      vscode.TreeItemCollapsibleState.Expanded
    );
    fav.id = "favorites";
    fav.children = items;
    fav.description = `${items.length}`;
    return fav;
  }

  private buildPackageChildren(pkg: PackageInfo): ScriptItem[] {
    return Object.entries(pkg.scripts)
      .map(([n, v]) => this.makeScriptItem(pkg, n, v))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  private makeScriptItem(
    pkg: PackageInfo,
    name: string,
    value: string
  ): ScriptItem {
    return new ScriptItem(
      "script",
      name,
      vscode.TreeItemCollapsibleState.None,
      name,
      value,
      pkg.packageJsonPath
    );
  }
}

// ---------------------------------------------------------------------------
// CodeLens cho package.json (tính năng #3)
// ---------------------------------------------------------------------------

class PackageJsonCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (path.basename(document.fileName) !== "package.json") {
      return [];
    }
    if (document.fileName.includes(`${path.sep}node_modules${path.sep}`)) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const lines = findScriptLines(document.getText());
    for (const [name, lineNo] of lines) {
      const range = new vscode.Range(lineNo, 0, lineNo, 0);
      const arg = { packageJsonPath: document.fileName, scriptName: name };
      lenses.push(
        new vscode.CodeLens(range, {
          title: "▶ Run",
          command: "scriptsSidebar.runScript",
          arguments: [arg],
        }),
        new vscode.CodeLens(range, {
          title: "Run (silent)",
          command: "scriptsSidebar.runScriptSilent",
          arguments: [arg],
        })
      );
    }
    return lenses;
  }
}

// ---------------------------------------------------------------------------
// Package manager + lệnh chạy
// ---------------------------------------------------------------------------

function detectPackageManager(dir: string): PackageManager {
  const configured = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<string>("packageManager", "auto");

  if (configured === "npm" || configured === "yarn" || configured === "pnpm") {
    return configured;
  }

  // auto: dò lockfile từ thư mục hiện tại lên các cấp cha (tối đa 10 cấp)
  let current = dir;
  for (let i = 0; i < 10; i++) {
    const found = {
      pnpm: fs.existsSync(path.join(current, "pnpm-lock.yaml")),
      yarn: fs.existsSync(path.join(current, "yarn.lock")),
      npm: fs.existsSync(path.join(current, "package-lock.json")),
    };
    if (found.pnpm || found.yarn || found.npm) {
      return pickPackageManager(found);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return "npm";
}

// ---------------------------------------------------------------------------
// Chạy / dừng script
// ---------------------------------------------------------------------------

/** Chạy script qua terminal (giữ log, hỗ trợ watch/interactive) */
function runScriptInTerminal(packageJsonPath: string, scriptName: string): void {
  const cwd = path.dirname(packageJsonPath);
  const pm = detectPackageManager(cwd);
  const reuse = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<boolean>("reuseTerminal", true);

  const key = scriptKey(cwd, scriptName);

  // Fix bug #2: chỉ focus-thay-vì-chạy-lại khi BẬT reuse.
  // Khi tắt reuse, luôn tạo terminal mới để chạy lại.
  if (reuse) {
    const active = running.get(key);
    if (active?.terminal && active.terminal.exitStatus === undefined) {
      active.terminal.show();
      return;
    }
  }

  let terminal: vscode.Terminal | undefined;
  if (reuse) {
    terminal = terminals.get(key);
    if (terminal && terminal.exitStatus !== undefined) {
      terminals.delete(key);
      terminal = undefined;
    }
  }

  if (!terminal) {
    terminal = vscode.window.createTerminal({
      name: scriptName,
      cwd,
      iconPath: new vscode.ThemeIcon("play"),
    });
    if (reuse) {
      terminals.set(key, terminal);
    }
  }

  terminal.show();
  terminal.sendText(buildRunCommand(pm, scriptName));

  markTerminalRunning(key, packageJsonPath, scriptName, terminal);
}

/**
 * Chạy script chế độ nền qua child_process, hiện kết quả qua thông báo.
 * Có cảnh báo nếu là script chạy dài (tính năng #7) và gom log vào
 * Output Channel (fix bug #4).
 */
async function runScriptSilent(
  packageJsonPath: string,
  scriptName: string,
  scriptValue?: string
): Promise<void> {
  const cwd = path.dirname(packageJsonPath);
  const pm = detectPackageManager(cwd);
  const cmd = buildRunCommand(pm, scriptName);
  const key = scriptKey(cwd, scriptName);

  // Tính năng #7: cảnh báo khi silent 1 script có vẻ chạy dài
  const warn = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<boolean>("confirmSilentForLongRunning", true);
  if (warn && isLongRunningScript(scriptName, scriptValue)) {
    const choice = await vscode.window.showWarningMessage(
      `"${scriptName}" looks like a long-running script (watch/dev). Silent mode may never finish. Run it in the terminal instead?`,
      { modal: true },
      "Run in Terminal",
      "Run Silently Anyway"
    );
    if (!choice) {
      return; // Cancel
    }
    if (choice === "Run in Terminal") {
      runScriptInTerminal(packageJsonPath, scriptName);
      return;
    }
  }

  outputChannel.appendLine(`$ ${cmd}   (cwd: ${cwd})`);

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running: ${scriptName}`,
      cancellable: true,
    },
    (_progress, token) =>
      new Promise<void>((resolve) => {
        // shell:true để chạy lệnh; detached:true tạo process group để
        // kill được cả cây tiến trình con (fix bug #5). Stream log ->
        // không giới hạn buffer, gom hết vào Output Channel (fix bug #4).
        const child = spawn(cmd, { cwd, shell: true, detached: true });

        let stdoutBuf = "";
        let stderrBuf = "";
        child.stdout?.on("data", (d: Buffer) => {
          const s = d.toString();
          stdoutBuf += s;
          outputChannel.append(s);
        });
        child.stderr?.on("data", (d: Buffer) => {
          const s = d.toString();
          stderrBuf += s;
          outputChannel.append(s);
        });

        const finish = (ok: boolean, note: string): void => {
          clearRunning(key, "child");
          outputChannel.appendLine(
            `--- ${scriptName} ${ok ? "done" : "failed"} (${note}) ---`
          );
          const showOutput = "Show Output";
          if (ok) {
            const detail = (stdoutBuf || stderrBuf).trim();
            vscode.window
              .showInformationMessage(
                `Script "${scriptName}" done. ${firstLines(detail)}`,
                showOutput
              )
              .then((sel) => sel === showOutput && outputChannel.show());
          } else {
            const detail = (stderrBuf || stdoutBuf || note).trim();
            vscode.window
              .showErrorMessage(
                `Script "${scriptName}" failed: ${firstLines(detail)}`,
                showOutput
              )
              .then((sel) => sel === showOutput && outputChannel.show());
          }
          resolve();
        };

        child.on("error", (e) => finish(false, e.message));
        child.on("close", (code) =>
          finish(code === 0, `exit ${code ?? "?"}`)
        );

        markChildRunning(key, packageJsonPath, scriptName, child);

        token.onCancellationRequested(() => {
          killChildTree(child);
          clearRunning(key, "child");
          resolve();
        });
      })
  );
}

/** Kill cả cây tiến trình con của 1 child_process (fix bug #5) */
function killChildTree(child: ChildProcess): void {
  if (child.pid) {
    try {
      // Kill nguyên process group (child spawn với detached:true)
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // fallback bên dưới
    }
  }
  try {
    child.kill();
  } catch {
    // ignore
  }
}

/** Dừng một script đang chạy (cả terminal lẫn child) */
function stopScript(packageJsonPath: string, scriptName: string): void {
  const cwd = path.dirname(packageJsonPath);
  const key = scriptKey(cwd, scriptName);
  const active = running.get(key);
  if (!active) {
    return;
  }
  active.terminal?.dispose();
  if (active.child) {
    killChildTree(active.child);
  }
  terminals.delete(key);
  running.delete(key);
  afterRunningChanged();
}

// ---------------------------------------------------------------------------
// Pin / Unpin / Alias
// ---------------------------------------------------------------------------

async function pinScript(item: ScriptItem): Promise<void> {
  if (!item.scriptName || !item.packageJsonPath) {
    return;
  }
  const key = scriptKey(path.dirname(item.packageJsonPath), item.scriptName);
  const set = getPinnedSet();
  set.add(key);
  await setPinnedSet(set);
  provider.refresh();
}

async function unpinScript(item: ScriptItem): Promise<void> {
  if (!item.scriptName || !item.packageJsonPath) {
    return;
  }
  const key = scriptKey(path.dirname(item.packageJsonPath), item.scriptName);
  const set = getPinnedSet();
  set.delete(key);
  await setPinnedSet(set);
  provider.refresh();
}

/** Đặt/đổi alias hiển thị cho 1 script (tính năng #6) */
async function setAlias(item: ScriptItem): Promise<void> {
  if (!item.scriptName || !item.packageJsonPath) {
    return;
  }
  const key = scriptKey(path.dirname(item.packageJsonPath), item.scriptName);
  const current = getAlias(key);
  const input = await vscode.window.showInputBox({
    title: `Alias for "${item.scriptName}"`,
    prompt: "Enter a display name (leave empty to remove)",
    value: current ?? "",
  });
  // Người dùng bấm Esc -> undefined -> không làm gì
  if (input === undefined) {
    return;
  }
  if (input.trim() === "") {
    await removeAliasValue(key);
  } else {
    await setAliasValue(key, input.trim());
  }
  provider.refresh();
}

async function clearAlias(item: ScriptItem): Promise<void> {
  if (!item.scriptName || !item.packageJsonPath) {
    return;
  }
  const key = scriptKey(path.dirname(item.packageJsonPath), item.scriptName);
  await removeAliasValue(key);
  provider.refresh();
}

/** Click status bar -> chọn 1 script đang chạy để dừng (tính năng #2) */
async function showRunningQuickPick(): Promise<void> {
  const entries = [...running.values()];
  if (entries.length === 0) {
    return;
  }
  interface Pick extends vscode.QuickPickItem {
    entry: RunEntry;
  }
  const items: Pick[] = entries.map((e) => ({
    label: `$(debug-stop) ${e.scriptName}`,
    description: e.terminal ? "terminal" : "silent",
    entry: e,
  }));
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: "Select a running script to stop",
  });
  if (pick) {
    stopScript(pick.entry.packageJsonPath, pick.entry.scriptName);
  }
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

/** Lấy (packageJsonPath, scriptName) từ ScriptItem hoặc object CodeLens */
function resolveTarget(
  item: unknown
): { packageJsonPath: string; scriptName: string; scriptValue?: string } | undefined {
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

export function activate(context: vscode.ExtensionContext): void {
  extContext = context;
  provider = new ScriptProvider();
  outputChannel = vscode.window.createOutputChannel("Scripts Runner");
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0
  );
  statusBar.command = "scriptsSidebar.showRunning";

  const treeView = vscode.window.createTreeView("scriptView", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    treeView,
    outputChannel,
    statusBar,
    vscode.commands.registerCommand("scriptsSidebar.runScript", (item) => {
      const t = resolveTarget(item);
      if (t) {
        runScriptInTerminal(t.packageJsonPath, t.scriptName);
      }
    }),
    vscode.commands.registerCommand("scriptsSidebar.runScriptSilent", (item) => {
      const t = resolveTarget(item);
      if (t) {
        runScriptSilent(t.packageJsonPath, t.scriptName, t.scriptValue);
      }
    }),
    vscode.commands.registerCommand("scriptsSidebar.stopScript", (item) => {
      const t = resolveTarget(item);
      if (t) {
        stopScript(t.packageJsonPath, t.scriptName);
      }
    }),
    vscode.commands.registerCommand("scriptsSidebar.pinScript", (item) =>
      pinScript(item as ScriptItem)
    ),
    vscode.commands.registerCommand("scriptsSidebar.unpinScript", (item) =>
      unpinScript(item as ScriptItem)
    ),
    vscode.commands.registerCommand("scriptsSidebar.setAlias", (item) =>
      setAlias(item as ScriptItem)
    ),
    vscode.commands.registerCommand("scriptsSidebar.clearAlias", (item) =>
      clearAlias(item as ScriptItem)
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
    })
  );

  // Khi user đóng terminal -> gỡ khỏi map + đánh dấu script đã dừng
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((closed) => {
      for (const [key, term] of terminals) {
        if (term === closed) {
          terminals.delete(key);
        }
      }
      for (const [key, entry] of running) {
        if (entry.terminal === closed) {
          clearRunning(key, "terminal");
        }
      }
    })
  );

  // Best-effort: khi lệnh trong terminal kết thúc (shell integration) -> clear
  const win = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: (
      listener: (e: { terminal: vscode.Terminal }) => void
    ) => vscode.Disposable;
  };
  if (typeof win.onDidEndTerminalShellExecution === "function") {
    context.subscriptions.push(
      win.onDidEndTerminalShellExecution((e) => {
        for (const [key, entry] of running) {
          if (entry.terminal === e.terminal) {
            clearRunning(key, "terminal");
          }
        }
      })
    );
  }
}

export function deactivate(): void {
  for (const term of terminals.values()) {
    term.dispose();
  }
  for (const entry of running.values()) {
    if (entry.child) {
      killChildTree(entry.child);
    }
  }
  terminals.clear();
  running.clear();
}
