import * as vscode from "vscode";
import * as path from "path";
import { ChildProcess } from "child_process";
import { scriptKey } from "./logic";

// Quản lý các script đang chạy (terminal và/hoặc child_process) + status bar.

export interface RunEntry {
  packageJsonPath: string;
  scriptName: string;
  terminal?: vscode.Terminal;
  child?: ChildProcess;
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

// --- Cập nhật trạng thái (không ghi đè giữa terminal & child) ---

export function markTerminalRunning(
  key: string,
  packageJsonPath: string,
  scriptName: string,
  terminal: vscode.Terminal
): void {
  const cur = running.get(key);
  running.set(key, {
    packageJsonPath,
    scriptName,
    terminal,
    child: cur?.child,
  });
  afterChange();
}

export function markChildRunning(
  key: string,
  packageJsonPath: string,
  scriptName: string,
  child: ChildProcess
): void {
  const cur = running.get(key);
  running.set(key, {
    packageJsonPath,
    scriptName,
    child,
    terminal: cur?.terminal,
  });
  afterChange();
}

/** Gỡ 1 kênh (terminal/child); hết cả 2 thì xóa key */
export function clearRunning(key: string, which: "terminal" | "child"): void {
  const cur = running.get(key);
  if (!cur) {
    return;
  }
  if (which === "terminal") {
    cur.terminal = undefined;
  } else {
    cur.child = undefined;
  }
  if (!cur.terminal && !cur.child) {
    running.delete(key);
  } else {
    running.set(key, cur);
  }
  afterChange();
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
      clearRunning(key, "terminal");
    }
  }
}

/** Gỡ trạng thái chạy khi lệnh trong terminal kết thúc (shell integration) */
export function onTerminalExecEnded(terminal: vscode.Terminal): void {
  for (const [key, entry] of running) {
    if (entry.terminal === terminal) {
      clearRunning(key, "terminal");
    }
  }
}

// --- Dừng ---

/** Kill cả cây tiến trình con (child spawn với detached:true) */
export function killChildTree(child: ChildProcess): void {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // fallback bên dưới
    }
  }
  try {
    child.kill();
  } catch {
    // ignore
  }
}

export function stopScript(packageJsonPath: string, scriptName: string): void {
  const key = scriptKey(path.dirname(packageJsonPath), scriptName);
  const active = running.get(key);
  if (!active) {
    return;
  }
  active.terminal?.dispose();
  if (active.child) {
    killChildTree(active.child);
  }
  terminals.delete(key);
  running.delete(key);
  afterChange();
}

/** Dọn tất cả khi deactivate */
export function disposeAll(): void {
  for (const term of terminals.values()) {
    term.dispose();
  }
  for (const entry of running.values()) {
    if (entry.child) {
      killChildTree(entry.child);
    }
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
