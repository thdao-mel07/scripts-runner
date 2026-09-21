import * as vscode from "vscode";

// Lưu trạng thái pin & alias vào workspaceState (theo từng workspace).

let ctx: vscode.ExtensionContext;

export function initStore(context: vscode.ExtensionContext): void {
  ctx = context;
}

// --- Pin / Favorites ---

const PINNED_KEY = "scriptsSidebar.pinned";

export function getPinnedSet(): Set<string> {
  return new Set(ctx.workspaceState.get<string[]>(PINNED_KEY, []));
}

export function isPinned(key: string): boolean {
  return getPinnedSet().has(key);
}

export async function addPin(key: string): Promise<void> {
  const set = getPinnedSet();
  set.add(key);
  await ctx.workspaceState.update(PINNED_KEY, [...set]);
}

export async function removePin(key: string): Promise<void> {
  const set = getPinnedSet();
  set.delete(key);
  await ctx.workspaceState.update(PINNED_KEY, [...set]);
}
