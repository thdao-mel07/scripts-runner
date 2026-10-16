import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  PackageManager,
  scriptKey,
  buildRunCommand,
  pickPackageManager,
} from "./logic";
import { markTerminalRunning, getEntry, terminals } from "./running";

/** Phát hiện package manager: theo setting, hoặc dò lockfile lên cấp cha */
export function detectPackageManager(dir: string): PackageManager {
  const configured = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<string>("packageManager", "auto");

  if (configured === "npm" || configured === "yarn" || configured === "pnpm") {
    return configured;
  }

  let current = dir;
  for (let i = 0; i < 10; i++) {
    const found = {
      pnpm: fs.existsSync(path.join(current, "pnpm-lock.yaml")),
      yarn: fs.existsSync(path.join(current, "yarn.lock")),
      npm: fs.existsSync(path.join(current, "package-lock.json")),
    };
    if (found.pnpm || found.yarn || found.npm) {
      return pickPackageManager(found);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return "npm";
}

/** Chạy script qua terminal (giữ log, hỗ trợ watch/interactive) */
export function runScriptInTerminal(
  packageJsonPath: string,
  scriptName: string
): void {
  const cwd = path.dirname(packageJsonPath);
  const pm = detectPackageManager(cwd);
  const reuse = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<boolean>("reuseTerminal", true);

  const key = scriptKey(cwd, scriptName);

  // Chỉ focus-thay-vì-chạy-lại khi BẬT reuse (tránh phá dev server)
  if (reuse) {
    const active = getEntry(key);
    if (active?.terminal && active.terminal.exitStatus === undefined) {
      active.terminal.show();
      return;
    }
  }

  let terminal: vscode.Terminal | undefined;
  if (reuse) {
    terminal = terminals.get(key);
    if (terminal && terminal.exitStatus !== undefined) {
      terminals.delete(key);
      terminal = undefined;
    }
  }

  if (!terminal) {
    terminal = vscode.window.createTerminal({
      name: scriptName,
      cwd,
      iconPath: new vscode.ThemeIcon("play"),
    });
    if (reuse) {
      terminals.set(key, terminal);
    }
  }

  terminal.show();
  terminal.sendText(buildRunCommand(pm, scriptName));
  markTerminalRunning(key, packageJsonPath, scriptName, terminal);
}
