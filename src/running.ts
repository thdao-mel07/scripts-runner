import * as vscode from "vscode";
import * as path from "path";
import { scriptKey } from "./logic";

// Quản lý các script đang chạy qua terminal + status bar.

export interface RunEntry {
  packageJsonPath: string;
  scriptName: string;
  terminal: vscode.Terminal;
}

const running = new Map<string, RunEntry>();

/** Terminal tái sử dụng theo từng script (khi bật reuseTerminal) */
export const terminals = new Map<string, vscode.Terminal>();

let statusBar: vscode.StatusBarItem;
let onChange: () => void = () => {};

export function initRunning(
  sb: vscode.StatusBarItem,
  changeHandler: () => void
): void {
  statusBar = sb;
  onChange = changeHandler;
}

// --- Truy vấn ---

export function isRunning(key: string): boolean {
  return running.has(key);
}

export function getEntry(key: string): RunEntry | undefined {
  return running.get(key);
}

export function allEntries(): RunEntry[] {
  return [...running.values()];
}

// --- Cập nhật trạng thái ---

export function markTerminalRunning(
  key: string,
  packageJsonPath: string,
  scriptName: string,
  terminal: vscode.Terminal
): void {
  running.set(key, { packageJsonPath, scriptName, terminal });
  afterChange();
}

/** Gỡ trạng thái chạy của 1 script */
export function clearRunning(key: string): void {
  if (running.delete(key)) {
    afterChange();
  }
}

/** Gỡ mọi terminal trỏ tới `closed` (khi user đóng terminal) */
export function onTerminalClosed(closed: vscode.Terminal): void {
  for (const [key, term] of terminals) {
    if (term === closed) {
      terminals.delete(key);
    }
  }
  for (const [key, entry] of running) {
    if (entry.terminal === closed) {
      clearRunning(key);
    }
  }
}

/** Gỡ trạng thái chạy khi lệnh trong terminal kết thúc (shell integration) */
export function onTerminalExecEnded(terminal: vscode.Terminal): void {
  for (const [key, entry] of running) {
    if (entry.terminal === terminal) {
      clearRunning(key);
    }
  }
}

// --- Dừng ---

export function stopScript(packageJsonPath: string, scriptName: string): void {
  const key = scriptKey(path.dirname(packageJsonPath), scriptName);
  const active = running.get(key);
  if (!active) {
    return;
  }
  active.terminal.dispose();
  terminals.delete(key);
  running.delete(key);
  afterChange();
}

/** Dọn tất cả khi deactivate */
export function disposeAll(): void {
  for (const term of terminals.values()) {
    term.dispose();
  }
  terminals.clear();
  running.clear();
}

// --- Nội bộ ---

function afterChange(): void {
  updateStatusBar();
  onChange();
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
