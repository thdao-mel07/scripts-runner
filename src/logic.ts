// Các hàm thuần (pure) — không phụ thuộc vscode API nên test được bằng node:test.

export type PackageManager = "npm" | "yarn" | "pnpm";

/** Khóa định danh 1 script = thư mục + tên script */
export function scriptKey(cwd: string, scriptName: string): string {
  return `${cwd}::${scriptName}`;
}

/** Dựng lệnh chạy theo package manager */
export function buildRunCommand(
  pm: PackageManager,
  scriptName: string
): string {
  // yarn dùng "yarn <script>", npm/pnpm dùng "run"
  if (pm === "yarn") {
    return `yarn ${scriptName}`;
  }
  return `${pm} run ${scriptName}`;
}

/** Chọn package manager từ danh sách lockfile tìm thấy (ưu tiên pnpm > yarn > npm) */
export function pickPackageManager(found: {
  pnpm?: boolean;
  yarn?: boolean;
  npm?: boolean;
}): PackageManager {
  if (found.pnpm) {
    return "pnpm";
  }
  if (found.yarn) {
    return "yarn";
  }
  return "npm";
}

/**
 * Chế độ quét package.json hiển thị trên sidebar.
 *
 * - `all`: mọi `package.json` có scripts (bỏ `node_modules`). Mặc định.
 * - `roots`: chỉ các package gốc — package KHÔNG phải là workspace member của
 *   package khác. Ẩn các lib con khai báo trong `workspaces`/`pnpm-workspace.yaml`.
 * - `workspaces`: các package gốc có khai báo workspaces + đúng những member
 *   mà chúng khai báo; bỏ các package lẻ không thuộc workspace nào.
 *
 * @see {@linkcode filterPackages}
 */
export type ScanMode = "all" | "roots" | "workspaces";

/**
 * Một package.json đã phát hiện trong workspace, đủ dữ liệu để lọc.
 *
 * @see {@linkcode filterPackages}
 */
export interface DiscoveredPackage {
  /** Đường dẫn tuyệt đối tới `package.json`. */
  readonly packageJsonPath: string;
  /** Đường dẫn POSIX tương đối của THƯ MỤC package so với workspace folder (gốc = `""`). */
  readonly relDir: string;
  /** Glob workspaces khai báo trong package này (gộp từ `package.json` + `pnpm-workspace.yaml`). */
  readonly workspaceGlobs: readonly string[];
}

/** Tuỳ chọn lọc danh sách package hiển thị. @see {@linkcode filterPackages} */
export interface PackageFilterOptions {
  /** Chế độ quét. @default "all" */
  readonly scanMode: ScanMode;
  /** Glob allowlist theo đường dẫn `package.json` tương đối; rỗng = không lọc. @default [] */
  readonly include: readonly string[];
  /** Glob blocklist theo đường dẫn `package.json` tương đối. @default [] */
  readonly exclude: readonly string[];
}

/**
 * Cấu hình Scripts Runner khai báo ngay trong `package.json` gốc của repo
 * (field `scriptsRunner`), để repo tự mô tả cách lọc mà không cần `settings.json`.
 *
 * @see {@linkcode parseScriptsRunnerConfig}
 * @see {@linkcode mergeFilterOptions}
 */
export interface ScriptsRunnerConfig {
  /** Ghi đè chế độ quét ở mức repo. @see {@linkcode ScanMode} */
  readonly scanMode?: ScanMode;
  /** Glob allowlist khai báo ở mức repo. */
  readonly include?: readonly string[];
  /** Glob blocklist khai báo ở mức repo. */
  readonly exclude?: readonly string[];
}

/** Lọc mảng, chỉ giữ phần tử là string. */
function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((x): x is string => typeof x === "string");
}

/**
 * Đọc field `scriptsRunner` từ nội dung đã parse của `package.json` gốc.
 * Bỏ qua giá trị sai kiểu (vd scanMode không hợp lệ).
 *
 * @param json Nội dung `package.json` đã `JSON.parse`.
 * @returns Cấu hình hợp lệ; `{}` nếu không khai báo.
 * @see {@linkcode ScriptsRunnerConfig}
 */
export function parseScriptsRunnerConfig(json: unknown): ScriptsRunnerConfig {
  const raw = (json as { scriptsRunner?: unknown } | null)?.scriptsRunner;
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const cfg = raw as { scanMode?: unknown; include?: unknown; exclude?: unknown };
  const out: {
    scanMode?: ScanMode;
    include?: string[];
    exclude?: string[];
  } = {};
  if (
    cfg.scanMode === "all" ||
    cfg.scanMode === "roots" ||
    cfg.scanMode === "workspaces"
  ) {
    out.scanMode = cfg.scanMode;
  }
  const include = stringArray(cfg.include);
  if (include) {
    out.include = include;
  }
  const exclude = stringArray(cfg.exclude);
  if (exclude) {
    out.exclude = exclude;
  }
  return out;
}

/** Gộp 2 mảng string, loại trùng, giữ thứ tự xuất hiện. */
function union(
  a: readonly string[],
  b: readonly string[]
): string[] {
  return [...new Set([...a, ...b])];
}

/**
 * Gộp cấu hình từ settings VS Code với cấu hình khai báo trong `package.json`.
 *
 * - `scanMode`: ưu tiên settings nếu người dùng đặt rõ (`settingsScanModeExplicit`),
 *   ngược lại dùng của repo, cuối cùng là giá trị từ settings (mặc định).
 * - `include` / `exclude`: hợp (union) cả hai, vì đều là bộ lọc cộng dồn.
 *
 * @param settings Cấu hình đọc từ settings (đã có mặc định).
 * @param repo Cấu hình khai báo trong `package.json` gốc.
 * @param settingsScanModeExplicit `scanMode` có được đặt rõ trong settings không.
 * @see {@linkcode filterPackages}
 */
export function mergeFilterOptions(
  settings: PackageFilterOptions,
  repo: ScriptsRunnerConfig,
  settingsScanModeExplicit: boolean
): PackageFilterOptions {
  let scanMode: ScanMode;
  if (settingsScanModeExplicit) {
    scanMode = settings.scanMode;
  } else if (repo.scanMode) {
    scanMode = repo.scanMode;
  } else {
    scanMode = settings.scanMode;
  }
  return {
    scanMode,
    include: union(settings.include, repo.include ?? []),
    exclude: union(settings.exclude, repo.exclude ?? []),
  };
}

/** Chuẩn hoá đường dẫn về dạng POSIX, bỏ dấu `/` thừa ở đầu/cuối. */
function toPosix(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

/**
 * Đọc danh sách glob workspaces từ nội dung đã parse của `package.json`.
 * Hỗ trợ cả `workspaces: string[]` lẫn `workspaces: { packages: string[] }` (Yarn).
 *
 * @see {@linkcode DiscoveredPackage.workspaceGlobs}
 */
export function parseWorkspacesField(json: unknown): string[] {
  const ws = (json as { workspaces?: unknown } | null)?.workspaces;
  if (Array.isArray(ws)) {
    return ws.filter((x): x is string => typeof x === "string");
  }
  const pkgs = (ws as { packages?: unknown } | null)?.packages;
  if (Array.isArray(pkgs)) {
    return pkgs.filter((x): x is string => typeof x === "string");
  }
  return [];
}

/**
 * Trích danh sách glob từ `pnpm-workspace.yaml` (chỉ đọc khối `packages:`),
 * parse tay để không cần thêm dependency YAML.
 *
 * @see {@linkcode DiscoveredPackage.workspaceGlobs}
 */
export function parsePnpmWorkspaceYaml(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const globs: string[] = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, ""); // bỏ comment
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      // Thoát khối khi gặp key top-level khác (không thụt đầu dòng)
      if (/^\S/.test(line) && !/^\s*-/.test(line)) {
        break;
      }
      const m = line.match(/^\s*-\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (m) {
        globs.push(m[1]);
      }
    }
  }
  return globs;
}

/** Chuyển 1 glob (`*`, `**`, `?`) thành RegExp khớp toàn chuỗi đường dẫn POSIX. */
function globToRegExp(glob: string): RegExp {
  const g = toPosix(glob);
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") {
          // `**/` khớp 0 hoặc nhiều cấp thư mục ở đầu
          i++;
          re += "(?:.*/)?";
        } else {
          // `**` khớp qua mọi cấp (gồm cả dấu `/`)
          re += ".*";
        }
      } else {
        re += "[^/]*"; // `*` khớp trong 1 cấp
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

/** Một đường dẫn POSIX có khớp bất kỳ glob nào trong danh sách không. */
export function matchesAnyGlob(
  relPath: string,
  globs: readonly string[]
): boolean {
  const p = toPosix(relPath);
  return globs.some((g) => globToRegExp(g).test(p));
}

/** POSIX relative từ `fromDir` tới `toDir` (cả hai tương đối workspace folder). */
function relFrom(fromDir: string, toDir: string): string | undefined {
  const from = toPosix(fromDir);
  const to = toPosix(toDir);
  if (from === "") {
    return to;
  }
  if (to === from) {
    return "";
  }
  if (to.startsWith(`${from}/`)) {
    return to.slice(from.length + 1);
  }
  return undefined; // toDir không nằm trong fromDir
}

/**
 * `child` có phải là workspace member của `parent` không — tức thư mục con của
 * parent và khớp một trong các glob workspaces mà parent khai báo.
 */
function isMemberOf(
  child: DiscoveredPackage,
  parent: DiscoveredPackage
): boolean {
  if (child === parent || parent.workspaceGlobs.length === 0) {
    return false;
  }
  const sub = relFrom(parent.relDir, child.relDir);
  if (sub === undefined || sub === "") {
    return false;
  }
  return matchesAnyGlob(sub, parent.workspaceGlobs);
}

/**
 * Lọc danh sách package hiển thị theo {@linkcode PackageFilterOptions}.
 *
 * Trình tự: lấy tập cơ sở theo `scanMode`, loại các `exclude`, rồi nếu `include`
 * khác rỗng thì chỉ giữ những cái khớp `include`. Glob khớp theo đường dẫn
 * `package.json` tương đối workspace folder (vd `app/packages/x/package.json`).
 *
 * @param packages Toàn bộ package.json đã phát hiện (đã bỏ `node_modules`).
 * @param options Chế độ quét + allowlist/blocklist.
 * @returns Danh sách package nên hiển thị, giữ nguyên thứ tự đầu vào.
 * @see {@linkcode ScanMode}
 */
export function filterPackages<T extends DiscoveredPackage>(
  packages: readonly T[],
  options: PackageFilterOptions
): T[] {
  const { scanMode, include, exclude } = options;

  let base: T[];
  if (scanMode === "all") {
    base = [...packages];
  } else {
    const members = new Set<T>();
    for (const child of packages) {
      if (packages.some((parent) => isMemberOf(child, parent))) {
        members.add(child);
      }
    }
    if (scanMode === "roots") {
      // Giữ package không phải member của bất kỳ package nào
      base = packages.filter((p) => !members.has(p));
    } else {
      // "workspaces": package gốc có khai báo workspaces + đúng các member
      const roots = packages.filter(
        (p) => !members.has(p) && p.workspaceGlobs.length > 0
      );
      const keep = new Set<T>(roots);
      for (const m of members) {
        keep.add(m);
      }
      base = packages.filter((p) => keep.has(p));
    }
  }

  const relJson = (p: DiscoveredPackage): string =>
    toPosix(p.relDir === "" ? "package.json" : `${p.relDir}/package.json`);

  let result = base;
  if (exclude.length > 0) {
    result = result.filter((p) => !matchesAnyGlob(relJson(p), exclude));
  }
  if (include.length > 0) {
    result = result.filter((p) => matchesAnyGlob(relJson(p), include));
  }
  return result;
}
