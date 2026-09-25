import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { scriptKey } from "./logic";
import { isRunning } from "./running";
import { isHidden } from "./store";

type ItemKind = "hidden" | "folder" | "script";

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
      const hidden = isHidden(key);

      // contextValue ghép cờ; menu dùng regex negative-lookahead để lọc
      this.contextValue =
        "script" + (isRun ? "Running" : "") + (hidden ? "Hidden" : "");

      this.description = scriptValue;
      this.tooltip = new vscode.MarkdownString(
        `**${scriptName}**${isRun ? " · _running_" : ""}${
          hidden ? " · _hidden_" : ""
        }\n\n\`\`\`sh\n${scriptValue}\n\`\`\``
      );
      this.iconPath = isRun
        ? new vscode.ThemeIcon("loading~spin")
        : hidden
          ? new vscode.ThemeIcon("eye-closed")
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
    } else if (kind === "hidden") {
      this.contextValue = "hidden";
      this.iconPath = new vscode.ThemeIcon("eye-closed");
    }
  }
}

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

    // 1) Mỗi package.json là 1 folder; chỉ liệt kê script KHÔNG bị ẩn
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

    // 2) Nhóm "Hidden" ở cuối (thu gọn) để hiện lại script đã ẩn
    const hidden = this.buildHidden(packages);
    if (hidden) {
      roots.push(hidden);
    }

    return roots;
  }

  private buildHidden(packages: PackageInfo[]): ScriptItem | undefined {
    const items: ScriptItem[] = [];
    for (const pkg of packages) {
      for (const [name, value] of Object.entries(pkg.scripts)) {
        if (isHidden(scriptKey(pkg.dir, name))) {
          items.push(this.makeScriptItem(pkg, name, value));
        }
      }
    }
    if (items.length === 0) {
      return undefined;
    }

    items.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    const group = new ScriptItem(
      "hidden",
      "Hidden",
      vscode.TreeItemCollapsibleState.Collapsed
    );
    group.id = "hidden";
    group.children = items;
    group.description = `${items.length}`;
    return group;
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
