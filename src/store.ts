import * as vscode from "vscode";

// Lưu danh sách script bị ẩn vào workspaceState (theo từng workspace).
// Rule: mặc định KHÔNG ẩn gì; chỉ ẩn các script user chủ động ẩn.

let ctx: vscode.ExtensionContext;

export function initStore(context: vscode.ExtensionContext): void {
  ctx = context;
}

const HIDDEN_KEY = "scriptsSidebar.hidden";

export function getHiddenSet(): Set<string> {
  return new Set(ctx.workspaceState.get<string[]>(HIDDEN_KEY, []));
}

export function isHidden(key: string): boolean {
  return getHiddenSet().has(key);
}

export async function addHidden(key: string): Promise<void> {
  const set = getHiddenSet();
  set.add(key);
  await ctx.workspaceState.update(HIDDEN_KEY, [...set]);
}

export async function removeHidden(key: string): Promise<void> {
  const set = getHiddenSet();
  set.delete(key);
  await ctx.workspaceState.update(HIDDEN_KEY, [...set]);
}

// ── Group (package.json folder) bị ẩn ──────────────────────────────────────
// Lưu theo `packageJsonPath` tuyệt đối. Khác với setting `exclude` (glob, áp
// cho mọi repo): đây là xoá thủ công từng group, lưu riêng theo workspace.

const HIDDEN_FOLDERS_KEY = "scriptsSidebar.hiddenFolders";

/** Tập đường dẫn package.json của các group đang bị ẩn khỏi sidebar. */
export function getHiddenFolders(): Set<string> {
  return new Set(ctx.workspaceState.get<string[]>(HIDDEN_FOLDERS_KEY, []));
}

/** Group (theo packageJsonPath) có đang bị ẩn không. */
export function isFolderHidden(packageJsonPath: string): boolean {
  return getHiddenFolders().has(packageJsonPath);
}

/** Ẩn 1 group khỏi sidebar. */
export async function addHiddenFolder(packageJsonPath: string): Promise<void> {
  const set = getHiddenFolders();
  set.add(packageJsonPath);
  await ctx.workspaceState.update(HIDDEN_FOLDERS_KEY, [...set]);
}

/** Hiện lại 1 group đã ẩn. */
export async function removeHiddenFolder(
  packageJsonPath: string
): Promise<void> {
  const set = getHiddenFolders();
  set.delete(packageJsonPath);
  await ctx.workspaceState.update(HIDDEN_FOLDERS_KEY, [...set]);
}

// ── Trạng thái mở/đóng của group ────────────────────────────────────────────
// Mặc định tất cả THU GỌN; chỉ các folder user chủ động mở mới được lưu là
// "expanded". Lưu theo packageJsonPath, riêng từng workspace.

const EXPANDED_FOLDERS_KEY = "scriptsSidebar.expandedFolders";

/** Tập đường dẫn package.json của các group đang được mở (expanded). */
export function getExpandedFolders(): Set<string> {
  return new Set(ctx.workspaceState.get<string[]>(EXPANDED_FOLDERS_KEY, []));
}

/** Group (theo packageJsonPath) có đang được mở không (mặc định: không). */
export function isFolderExpanded(packageJsonPath: string): boolean {
  return getExpandedFolders().has(packageJsonPath);
}

/** Ghi lại trạng thái mở/đóng của 1 group. */
export async function setFolderExpanded(
  packageJsonPath: string,
  expanded: boolean
): Promise<void> {
  const set = getExpandedFolders();
  if (expanded) {
    set.add(packageJsonPath);
  } else {
    set.delete(packageJsonPath);
  }
  await ctx.workspaceState.update(EXPANDED_FOLDERS_KEY, [...set]);
}

// ── Thứ tự ưu tiên script trong folder (kéo-thả) ────────────────────────────
// Lưu map { packageJsonPath -> [scriptName theo thứ tự] } vào workspaceState.

const ORDER_KEY = "scriptsSidebar.order";

/** Thứ tự script đã lưu cho 1 folder (rỗng nếu chưa sắp xếp). */
export function getOrder(packageJsonPath: string): string[] {
  const all = ctx.workspaceState.get<Record<string, string[]>>(ORDER_KEY, {});
  return all[packageJsonPath] ?? [];
}

/** Ghi thứ tự script cho 1 folder. */
export async function setOrder(
  packageJsonPath: string,
  scriptNames: string[]
): Promise<void> {
  const all = ctx.workspaceState.get<Record<string, string[]>>(ORDER_KEY, {});
  all[packageJsonPath] = scriptNames;
  await ctx.workspaceState.update(ORDER_KEY, all);
}
