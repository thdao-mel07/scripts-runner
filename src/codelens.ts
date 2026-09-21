import * as vscode from "vscode";
import * as path from "path";
import { findScriptLines } from "./logic";

/** Hiện nút Run / Run (silent) ngay trên mỗi script trong package.json */
export class PackageJsonCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (path.basename(document.fileName) !== "package.json") {
      return [];
    }
    if (document.fileName.includes(`${path.sep}node_modules${path.sep}`)) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const lines = findScriptLines(document.getText());
    for (const [name, lineNo] of lines) {
      const range = new vscode.Range(lineNo, 0, lineNo, 0);
      const arg = { packageJsonPath: document.fileName, scriptName: name };
      lenses.push(
        new vscode.CodeLens(range, {
          title: "▶ Run",
          command: "scriptsSidebar.runScript",
          arguments: [arg],
        }),
        new vscode.CodeLens(range, {
          title: "Run (silent)",
          command: "scriptsSidebar.runScriptSilent",
          arguments: [arg],
        })
      );
    }
    return lenses;
  }
}
