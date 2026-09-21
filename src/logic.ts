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

/** Nhãn hiển thị: ưu tiên alias, không có thì dùng tên gốc */
export function displayLabel(scriptName: string, alias?: string): string {
  return alias && alias.trim() ? alias.trim() : scriptName;
}

/**
 * Tìm vị trí dòng (0-based) của từng script trong nội dung package.json.
 * Trả về Map<tên script, số dòng>. Dùng cho CodeLens.
 */
export function findScriptLines(text: string): Map<string, number> {
  const result = new Map<string, number>();

  // Tìm block "scripts": { ... }
  const scriptsMatch = /"scripts"\s*:\s*\{/.exec(text);
  if (!scriptsMatch) {
    return result;
  }

  const blockStart = scriptsMatch.index + scriptsMatch[0].length;
  // Tìm dấu } đóng block scripts (đếm độ sâu ngoặc)
  let depth = 1;
  let end = blockStart;
  for (let i = blockStart; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const block = text.slice(blockStart, end);
  // Số dòng tính tới đầu block
  const baseLine = text.slice(0, blockStart).split("\n").length - 1;

  // Với mỗi dòng trong block, bắt "<tên>": (key ở đầu mỗi entry)
  const lines = block.split("\n");
  const keyRe = /^\s*"((?:[^"\\]|\\.)*)"\s*:/;
  for (let i = 0; i < lines.length; i++) {
    const m = keyRe.exec(lines[i]);
    if (m) {
      const name = m[1].replace(/\\"/g, '"');
      if (!result.has(name)) {
        result.set(name, baseLine + i);
      }
    }
  }

  return result;
}
