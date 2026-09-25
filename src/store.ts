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
