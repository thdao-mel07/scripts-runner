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
 * Đoán script "chạy dài" (watch/dev server) — không nên chạy ở chế độ silent
 * vì sẽ không bao giờ kết thúc.
 */
export function isLongRunningScript(name: string, value?: string): boolean {
  const haystack = `${name} ${value ?? ""}`.toLowerCase();
  // Các từ khóa thường gặp của lệnh chạy nền/watch
  return /(^|[\s:._-])(watch|dev|serve|start|nodemon|tsc -w|--watch|storybook|vite|webpack serve|metro)($|[\s:._-])/.test(
    haystack
  );
}

/** Rút gọn output nhiều dòng để hiện trong thông báo (mặc định 200 ký tự) */
export function firstLines(text: string, max = 200): string {
  if (!text) {
    return "";
  }
  const trimmed = text.length > max ? text.slice(0, max) + "…" : text;
  return trimmed.replace(/\s+/g, " ");
}
