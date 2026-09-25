# Change Log

## [Unreleased]

<!-- Ghi thay đổi mới ở đây; `npm run release` sẽ tự gắn số version + ngày. -->

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
