# Change Log

## [Unreleased]

<!-- Ghi thay đổi mới ở đây; `npm run release` sẽ tự gắn số version + ngày. -->

## [0.3.3] - 2026-10-16

### New
- **Per-repo config via `package.json`.** A repo can declare filtering in a
  `scriptsRunner` field of its root `package.json` (`scanMode` / `include` /
  `exclude`), so the whole team gets the same sidebar without any per-machine
  settings. `include`/`exclude` merge (union) with `scriptsSidebar.*` settings;
  an explicitly-set `scriptsSidebar.scanMode` still wins.

## [0.3.2] - 2026-10-16

### Removed
- **Silent / background run mode.** Scripts now always run in the integrated
  terminal (which has a real TTY), so interactive and TTY-requiring scripts work
  correctly. Removed the `▷` silent button, the `scriptsSidebar.runScriptSilent`
  command, and the `scriptsSidebar.confirmSilentForLongRunning` setting.

### New
- **Collapsed by default + remembered expand/collapse.** Package groups now
  start collapsed, and each group's open/closed state is saved per-workspace, so
  the next session restores exactly the groups you had open.
- **Remove a package group** from the sidebar via the inline ✕ button on a
  folder (stored per-workspace). Restore groups with "Show Hidden Package
  Groups…" from the view title or by right-clicking in a `package.json`.
- **Scan filtering** for monorepos. New settings:
  - `scriptsSidebar.scanMode` (`all` / `roots` / `workspaces`, default `all`) —
    `roots` hides workspace members declared in a parent's `workspaces` /
    `pnpm-workspace.yaml`.
  - `scriptsSidebar.include` / `scriptsSidebar.exclude` — glob allowlist/blocklist
    matched against each `package.json` path relative to the workspace folder
    (e.g. `exclude: ["**/packages/**"]`).

## [0.3.1]

### Changed
- Hidden scripts are now removed from the sidebar entirely; restore them via
  right-click in `package.json` → "Show Hidden Scripts…" (replaces Favorites).

### Removed
- Favorites / pin, script alias (rename), CodeLens in `package.json`, and the
  inline run-in-terminal button (clicking a script still runs it).

## [0.3.0]

### New
- **CodeLens** in `package.json`: "▶ Run" and "Run (silent)" right above each script.
- **Status bar** indicator showing how many scripts are running; click to stop one.
- **Silent-mode guard**: warns before running a long-running script (watch/dev/start) in silent mode.
- Silent runs now stream full output to a **"Scripts Runner" Output channel** ("Show Output" button on the notification).

### Fixed
- Running state no longer gets lost when the same script runs in both terminal and silent modes.
- `reuseTerminal: false` now always opens a fresh terminal instead of just focusing the old one.
- Warn when the workspace has more package.json files than the scan limit.
- Killing a silent script now stops the whole child-process tree.
- Notifications no longer truncate long output (use the Output channel).
- UI strings are now in English to match the Marketplace listing.

## [0.2.0]

- Added **Stop** action and a running-state indicator (spinner).
- Added **Pin / Favorites** (remembered per workspace).
- Collapsible package node that remembers its collapsed/expanded state.
- Clicking a running script now focuses its terminal instead of re-running it.
- Terminal tab is named after the script and reused per script.

## [0.1.0]

- Initial release.
- Sidebar with one-click run.
- Terminal and silent (background) run modes.
- npm / yarn / pnpm auto-detection from the lockfile.
- Auto-refresh when `package.json` changes.
- Monorepo support.
