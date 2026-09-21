import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import {
  PackageManager,
  scriptKey,
  buildRunCommand,
  pickPackageManager,
  isLongRunningScript,
  firstLines,
} from "./logic";
import {
  markTerminalRunning,
  markChildRunning,
  clearRunning,
  getEntry,
  terminals,
  killChildTree,
} from "./running";

let outputChannel: vscode.OutputChannel;

export function initRunner(oc: vscode.OutputChannel): void {
  outputChannel = oc;
}

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

/**
 * Chạy script chế độ nền qua spawn (detached để kill cả cây con).
 * Cảnh báo nếu là script chạy dài; gom log đầy đủ vào Output Channel.
 */
export async function runScriptSilent(
  packageJsonPath: string,
  scriptName: string,
  scriptValue?: string
): Promise<void> {
  const cwd = path.dirname(packageJsonPath);
  const pm = detectPackageManager(cwd);
  const cmd = buildRunCommand(pm, scriptName);
  const key = scriptKey(cwd, scriptName);

  const warn = vscode.workspace
    .getConfiguration("scriptsSidebar")
    .get<boolean>("confirmSilentForLongRunning", true);
  if (warn && isLongRunningScript(scriptName, scriptValue)) {
    const choice = await vscode.window.showWarningMessage(
      `"${scriptName}" looks like a long-running script (watch/dev). Silent mode may never finish. Run it in the terminal instead?`,
      { modal: true },
      "Run in Terminal",
      "Run Silently Anyway"
    );
    if (!choice) {
      return;
    }
    if (choice === "Run in Terminal") {
      runScriptInTerminal(packageJsonPath, scriptName);
      return;
    }
  }

  outputChannel.appendLine(`$ ${cmd}   (cwd: ${cwd})`);

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Running: ${scriptName}`,
      cancellable: true,
    },
    (_progress, token) =>
      new Promise<void>((resolve) => {
        const child = spawn(cmd, { cwd, shell: true, detached: true });

        let stdoutBuf = "";
        let stderrBuf = "";
        child.stdout?.on("data", (d: Buffer) => {
          const s = d.toString();
          stdoutBuf += s;
          outputChannel.append(s);
        });
        child.stderr?.on("data", (d: Buffer) => {
          const s = d.toString();
          stderrBuf += s;
          outputChannel.append(s);
        });

        const finish = (ok: boolean, note: string): void => {
          clearRunning(key, "child");
          outputChannel.appendLine(
            `--- ${scriptName} ${ok ? "done" : "failed"} (${note}) ---`
          );
          const showOutput = "Show Output";
          if (ok) {
            const detail = (stdoutBuf || stderrBuf).trim();
            vscode.window
              .showInformationMessage(
                `Script "${scriptName}" done. ${firstLines(detail)}`,
                showOutput
              )
              .then((sel) => sel === showOutput && outputChannel.show());
          } else {
            const detail = (stderrBuf || stdoutBuf || note).trim();
            vscode.window
              .showErrorMessage(
                `Script "${scriptName}" failed: ${firstLines(detail)}`,
                showOutput
              )
              .then((sel) => sel === showOutput && outputChannel.show());
          }
          resolve();
        };

        child.on("error", (e) => finish(false, e.message));
        child.on("close", (code) => finish(code === 0, `exit ${code ?? "?"}`));

        markChildRunning(key, packageJsonPath, scriptName, child);

        token.onCancellationRequested(() => {
          killChildTree(child);
          clearRunning(key, "child");
          resolve();
        });
      })
  );
}
