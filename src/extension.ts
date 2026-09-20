import * as vscode from "vscode";
import { exec, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Kiểu package manager hỗ trợ
type PackageManager = "npm" | "yarn" | "pnpm";

// Loại node trong TreeView
type ItemKind = "favorites" | "folder" | "script";

/** Context extension (dùng cho workspaceState lưu pin) */
let extContext: vscode.ExtensionContext;

/** Provider toàn cục để các command gọi refresh */
let provider: ScriptProvider;

/**
 * Map terminal đang mở, khóa theo cwd + tên script để tái sử dụng đúng
 * terminal của từng script (khi bật reuseTerminal).
 */
const terminals = new Map<string, vscode.Terminal>();

/** Các script đang chạy: key -> tiến trình/terminal tương ứng */
const running = new Map<
  string,
  { terminal?: vscode.Terminal; child?: ChildProcess }
>();

function scriptKey(cwd: string, scriptName: string): string {
  return `${cwd}::${scriptName}`;
}

// ---------------------------------------------------------------------------
// Pin / Favorites (lưu vào workspaceState)
// ---------------------------------------------------------------------------

const PINNED_STATE_KEY = "scriptsSidebar.pinned";

function getPinnedSet(): Set<string> {
  return new Set(
    extContext.workspaceState.get<string[]>(PINNED_STATE_KEY, [])
  );
}

async function setPinnedSet(set: Set<string>): Promise<void> {
  await extContext.workspaceState.update(PINNED_STATE_KEY, [...set]);
}

function isPinned(key: string): boolean {
  return getPinnedSet().has(key);
}

// ---------------------------------------------------------------------------
// TreeItem
// ---------------------------------------------------------------------------

class ScriptItem extends vscode.TreeItem {
  // Node con (dùng cho favorites / folder / group)
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

      // contextValue ghép cờ để menu điều kiện (regex trong when):
      // script | scriptRunning | scriptPinned | scriptRunningPinned
      this.contextValue =
        "script" + (isRun ? "Running" : "") + (pinned ? "Pinned" : "");

      this.description = scriptValue;
      this.tooltip = new vscode.MarkdownString(
        `**${scriptName}**${isRun ? " · _đang chạy_" : ""}${
          pinned ? " · ⭐" : ""
        }\n\n\`\`\`sh\n${scriptValue}\n\`\`\``
      );
      // Đang chạy -> spinner; rảnh -> play
      this.iconPath = isRun
        ? new vscode.ThemeIcon("loading~spin")
        : new vscode.ThemeIcon("play");

      this.command = {
        command: "scriptsSidebar.runScript",
        title: "Chạy Script",
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
    50
  );

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
    // Node cha đã có children dựng sẵn -> trả luôn
    if (element) {
      return element.children ?? [];
    }

    const packages = await findPackageJsons();
    if (packages.length === 0) {
      return [];
    }

    const roots: ScriptItem[] = [];

    // 1) Nhóm Favorites (nếu có pin còn hợp lệ)
    const favorites = this.buildFavorites(packages);
    if (favorites) {
      roots.push(favorites);
    }

    // 2) Mỗi package.json là 1 node cha có thể thu gọn (kể cả khi chỉ có 1),
    //    để user gói gọn danh sách script lại khi cần.
    for (const pkg of packages) {
      const folder = new ScriptItem(
        "folder",
        pkg.name,
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        undefined,
        pkg.packageJsonPath
      );
      // id ổn định -> VS Code nhớ trạng thái thu/mở giữa các lần refresh
      folder.id = `folder:${pkg.packageJsonPath}`;
      folder.children = this.buildPackageChildren(pkg);
      folder.description = `${folder.children.length}`;
      roots.push(folder);
    }

    return roots;
  }

  /** Dựng nhóm Favorites từ danh sách key đã pin */
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
      return undefined; // pin cũ đã trỏ tới script không còn tồn tại
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

  /** Dựng danh sách script cho 1 package (danh sách phẳng, sắp xếp A-Z) */
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
// Package manager + lệnh chạy
// ---------------------------------------------------------------------------

function detectPackageManager(dir: string): PackageManager {
  const configured = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<string>("packageManager", "auto");

  if (configured === "npm" || configured === "yarn" || configured === "pnpm") {
    return configured;
  }

  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(current, "yarn.lock"))) {
      return "yarn";
    }
    if (fs.existsSync(path.join(current, "package-lock.json"))) {
      return "npm";
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return "npm";
}

function buildRunCommand(pm: PackageManager, scriptName: string): string {
  if (pm === "yarn") {
    return `yarn ${scriptName}`;
  }
  return `${pm} run ${scriptName}`;
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

  // Đang chạy rồi -> focus terminal thay vì chạy lại (tránh phá dev server)
  const active = running.get(key);
  if (active?.terminal && active.terminal.exitStatus === undefined) {
    active.terminal.show();
    return;
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
    // Set cwd lúc tạo -> không cần gửi `cd`; tab mang tên script + icon play
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

  running.set(key, { terminal });
  provider.refresh();
}

/**
 * Chạy script chế độ nền qua child_process, hiện kết quả qua thông báo.
 * Phù hợp script ngắn (lint, format). Không dùng cho watch/dev server.
 */
function runScriptSilent(packageJsonPath: string, scriptName: string): void {
  const cwd = path.dirname(packageJsonPath);
  const pm = detectPackageManager(cwd);
  const cmd = buildRunCommand(pm, scriptName);
  const key = scriptKey(cwd, scriptName);

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Đang chạy: ${scriptName}`,
      cancellable: true,
    },
    (_progress, token) =>
      new Promise<void>((resolve) => {
        const child = exec(
          cmd,
          { cwd, maxBuffer: 10 * 1024 * 1024 },
          (err, stdout, stderr) => {
            running.delete(key);
            provider.refresh();
            if (err) {
              const detail = (stderr || stdout || err.message).trim();
              vscode.window.showErrorMessage(
                `Script "${scriptName}" lỗi: ${firstLines(detail)}`
              );
            } else {
              const detail = (stdout || stderr).trim();
              vscode.window.showInformationMessage(
                `Script "${scriptName}" xong. ${firstLines(detail)}`
              );
            }
            resolve();
          }
        );

        running.set(key, { child });
        provider.refresh();

        token.onCancellationRequested(() => {
          child.kill();
          running.delete(key);
          provider.refresh();
          resolve();
        });
      })
  );
}

/** Dừng một script đang chạy */
function stopScript(packageJsonPath: string, scriptName: string): void {
  const cwd = path.dirname(packageJsonPath);
  const key = scriptKey(cwd, scriptName);
  const active = running.get(key);
  if (!active) {
    return;
  }
  // Dispose terminal sẽ kill cả cây tiến trình con
  active.terminal?.dispose();
  active.child?.kill();
  terminals.delete(key);
  running.delete(key);
  provider.refresh();
}

/** Lấy vài dòng đầu output để hiển thị gọn trong thông báo */
function firstLines(text: string, max = 200): string {
  if (!text) {
    return "";
  }
  const trimmed = text.length > max ? text.slice(0, max) + "…" : text;
  return trimmed.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Pin / Unpin
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

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  extContext = context;
  provider = new ScriptProvider();

  const treeView = vscode.window.createTreeView("scriptView", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  context.subscriptions.push(
    treeView,
    vscode.commands.registerCommand(
      "scriptsSidebar.runScript",
      (item: ScriptItem) => {
        if (item?.scriptName && item.packageJsonPath) {
          runScriptInTerminal(item.packageJsonPath, item.scriptName);
        }
      }
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.runScriptSilent",
      (item: ScriptItem) => {
        if (item?.scriptName && item.packageJsonPath) {
          runScriptSilent(item.packageJsonPath, item.scriptName);
        }
      }
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.stopScript",
      (item: ScriptItem) => {
        if (item?.scriptName && item.packageJsonPath) {
          stopScript(item.packageJsonPath, item.scriptName);
        }
      }
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.pinScript",
      (item: ScriptItem) => pinScript(item)
    ),
    vscode.commands.registerCommand(
      "scriptsSidebar.unpinScript",
      (item: ScriptItem) => unpinScript(item)
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

  // Refresh khi đổi workspace folder hoặc setting của extension
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
      let changed = false;
      for (const [key, term] of terminals) {
        if (term === closed) {
          terminals.delete(key);
        }
      }
      for (const [key, entry] of running) {
        if (entry.terminal === closed) {
          running.delete(key);
          changed = true;
        }
      }
      if (changed) {
        provider.refresh();
      }
    })
  );

  // Best-effort: khi lệnh trong terminal kết thúc (shell integration) -> clear trạng thái
  const win = vscode.window as unknown as {
    onDidEndTerminalShellExecution?: (
      listener: (e: { terminal: vscode.Terminal }) => void
    ) => vscode.Disposable;
  };
  if (typeof win.onDidEndTerminalShellExecution === "function") {
    context.subscriptions.push(
      win.onDidEndTerminalShellExecution((e) => {
        let changed = false;
        for (const [key, entry] of running) {
          if (entry.terminal === e.terminal) {
            running.delete(key);
            changed = true;
          }
        }
        if (changed) {
          provider.refresh();
        }
      })
    );
  }
}

export function deactivate(): void {
  for (const term of terminals.values()) {
    term.dispose();
  }
  terminals.clear();
  running.clear();
}
