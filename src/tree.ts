import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  scriptKey,
  filterPackages,
  parseWorkspacesField,
  parsePnpmWorkspaceYaml,
  parseScriptsRunnerConfig,
  mergeFilterOptions,
  type DiscoveredPackage,
  type ScanMode,
  type PackageFilterOptions,
} from "./logic";
import { isRunning } from "./running";
import { isHidden, isFolderHidden, isFolderExpanded } from "./store";

type ItemKind = "folder" | "script";

/** Số package.json tối đa quét trong workspace */
const MAX_PACKAGE_JSON = 500;
let warnedTruncation = false;

export class ScriptItem extends vscode.TreeItem {
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
      const isRun = isRunning(key);

      // contextValue ghép cờ; menu dùng regex negative-lookahead để lọc
      this.contextValue = "script" + (isRun ? "Running" : "");

      this.description = scriptValue;
      this.tooltip = new vscode.MarkdownString(
        `**${scriptName}**${
          isRun ? " · _running_" : ""
        }\n\n\`\`\`sh\n${scriptValue}\n\`\`\``
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
    }
  }
}

interface PackageInfo extends DiscoveredPackage {
  dir: string;
  name: string;
  scripts: Record<string, string>;
}

/** Cấu hình lọc đọc từ settings + biết scanMode có được đặt rõ không. */
interface SettingsFilter {
  options: PackageFilterOptions;
  scanModeExplicit: boolean;
}

/** Đọc cấu hình lọc package từ settings `scriptsSidebar`. */
function readSettingsFilter(): SettingsFilter {
  const cfg = vscode.workspace.getConfiguration("scriptsSidebar");
  const scanMode = cfg.get<ScanMode>("scanMode", "all");
  const include = cfg.get<string[]>("include", []);
  const exclude = cfg.get<string[]>("exclude", []);
  // scanMode có giá trị user/workspace đặt rõ hay chỉ là mặc định?
  const insp = cfg.inspect<ScanMode>("scanMode");
  const scanModeExplicit =
    insp?.workspaceFolderValue !== undefined ||
    insp?.workspaceValue !== undefined ||
    insp?.globalValue !== undefined;
  return { options: { scanMode, include, exclude }, scanModeExplicit };
}

/** Đọc field `scriptsRunner` từ package.json gốc của 1 workspace folder. */
function readRepoConfig(workspaceRoot: string) {
  try {
    const pkgPath = path.join(workspaceRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      return parseScriptsRunnerConfig(
        JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
      );
    }
  } catch {
    // package.json gốc lỗi cú pháp -> bỏ qua, dùng settings
  }
  return {};
}

/** Thư mục workspace chứa file (để tính relDir tương đối). */
function workspaceRootOf(fsPath: string): string {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
  return folder ? folder.uri.fsPath : path.dirname(fsPath);
}

/** relDir POSIX của thư mục package so với workspace folder (gốc = ""). */
function toRelDir(dir: string, root: string): string {
  const rel = path.relative(root, dir);
  return rel.split(path.sep).join("/");
}

/** Đọc glob workspaces khai báo cho 1 package (package.json + pnpm-workspace.yaml). */
function readWorkspaceGlobs(dir: string, json: unknown): string[] {
  const globs = parseWorkspacesField(json);
  try {
    const pnpmPath = path.join(dir, "pnpm-workspace.yaml");
    if (fs.existsSync(pnpmPath)) {
      globs.push(...parsePnpmWorkspaceYaml(fs.readFileSync(pnpmPath, "utf-8")));
    }
  } catch {
    // bỏ qua nếu đọc pnpm-workspace.yaml lỗi
  }
  return globs;
}

/** Tìm tất cả package.json trong workspace (bỏ node_modules) rồi lọc theo settings */
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
      const root = workspaceRootOf(uri.fsPath);
      packages.push({
        dir,
        packageJsonPath: uri.fsPath,
        name: json.name ?? path.basename(dir),
        scripts,
        relDir: toRelDir(dir, root),
        workspaceGlobs: readWorkspaceGlobs(dir, json),
      });
    } catch {
      continue; // bỏ qua package.json lỗi cú pháp
    }
  }

  packages.sort((a, b) => a.packageJsonPath.localeCompare(b.packageJsonPath));

  // Lọc theo scanMode/include/exclude (hàm thuần, có test).
  // Membership + cấu hình tính theo TỪNG workspace folder: relDir không lẫn
  // giữa các root, và mỗi repo có thể tự khai báo scriptsRunner trong package.json.
  const settings = readSettingsFilter();
  const byRoot = new Map<string, PackageInfo[]>();
  for (const pkg of packages) {
    const root = workspaceRootOf(pkg.packageJsonPath);
    const list = byRoot.get(root);
    if (list) {
      list.push(pkg);
    } else {
      byRoot.set(root, [pkg]);
    }
  }
  const kept: PackageInfo[] = [];
  for (const [root, list] of byRoot) {
    const options = mergeFilterOptions(
      settings.options,
      readRepoConfig(root),
      settings.scanModeExplicit
    );
    kept.push(...filterPackages(list, options));
  }
  kept.sort((a, b) => a.packageJsonPath.localeCompare(b.packageJsonPath));
  return kept;
}

export class ScriptProvider implements vscode.TreeDataProvider<ScriptItem> {
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

    // Mỗi package.json là 1 folder; chỉ liệt kê script KHÔNG bị ẩn.
    // Script đã ẩn bị loại hẳn khỏi UI; hiện lại bằng chuột phải trong
    // file package.json (command scriptsSidebar.showHidden).
    for (const pkg of packages) {
      // Group bị ẩn thủ công -> loại khỏi sidebar (khôi phục qua showHiddenFolders)
      if (isFolderHidden(pkg.packageJsonPath)) {
        continue;
      }
      // Mặc định thu gọn; mở lại đúng các group user từng mở (lưu workspaceState).
      const collapsibleState = isFolderExpanded(pkg.packageJsonPath)
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
      const folder = new ScriptItem(
        "folder",
        pkg.name,
        collapsibleState,
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

  /** Script hiển thị của 1 package (bỏ những cái đã ẩn), sắp xếp A-Z */
  private buildPackageChildren(pkg: PackageInfo): ScriptItem[] {
    return Object.entries(pkg.scripts)
      .filter(([n]) => !isHidden(scriptKey(pkg.dir, n)))
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
