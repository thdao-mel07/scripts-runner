# Active Context

## Thay đổi mới nhất (chưa publish)
- THÊM đọc cấu hình từ package.json gốc repo: field `scriptsRunner`
  { scanMode?, include?, exclude? }. logic.ts có parseScriptsRunnerConfig +
  mergeFilterOptions (include/exclude union với settings; scanMode: settings
  thắng nếu đặt rõ qua inspect(), ngược lại dùng repo, rồi mặc định). tree.ts
  đọc root package.json của từng workspace folder (readRepoConfig) + readSettingsFilter
  (có scanModeExplicit qua cfg.inspect) rồi merge trước khi filterPackages.
  Mục đích: repo tự khai báo, cả team khỏi cấu hình settings.json tay.
- GỠ HẲN chế độ chạy ngầm (silent/child_process): bỏ command runScriptSilent,
  nút ▷, setting confirmSilentForLongRunning. Lý do: silent không có TTY nên
  script kiểm tra isTTY sẽ fail; chạy trong Terminal có TTY thật là đúng. Đã dọn
  runner.ts (chỉ còn runScriptInTerminal, bỏ spawn/outputChannel), running.ts
  (terminal-only, bỏ child/markChildRunning/killChildTree), logic.ts (bỏ
  isLongRunningScript + firstLines), extension.ts (bỏ outputChannel/initRunner,
  runSilent). Test còn 12, typecheck + build sạch.
- THÊM nhớ trạng thái mở/đóng group: mặc định THU GỌN (Collapsed). store.ts có
  getExpandedFolders/isFolderExpanded/setFolderExpanded (key
  "scriptsSidebar.expandedFolders", theo packageJsonPath). tree.ts set
  collapsibleState theo state. extension.ts nghe treeView.onDidExpandElement /
  onDidCollapseElement để lưu. Lưu riêng từng workspace.
- THÊM "remove group" (hide folder): nút inline ✕ trên mỗi folder
  (scriptsSidebar.hideFolder), lưu workspaceState key
  "scriptsSidebar.hiddenFolders" theo packageJsonPath tuyệt đối. Khôi phục:
  "Show Hidden Package Groups…" (scriptsSidebar.showHiddenFolders) ở view title
  + chuột phải trong package.json (QuickPick multi-select). store.ts có
  getHiddenFolders/isFolderHidden/addHiddenFolder/removeHiddenFolder; tree.ts bỏ
  qua folder bị ẩn. Khác với setting exclude (glob, mọi repo) — đây là xoá thủ
  công từng group. (Phần cache "hiện nhanh hơn" để làm sau.)
- THÊM lọc package cho monorepo: setting `scriptsSidebar.scanMode`
  (all | roots | workspaces, default **all** để tương thích ngược),
  `scriptsSidebar.include` / `scriptsSidebar.exclude` (mảng glob khớp đường dẫn
  package.json tương đối workspace folder). Logic lọc thuần nằm trong
  `src/logic.ts` (filterPackages + parseWorkspacesField + parsePnpmWorkspaceYaml
  + globToRegExp/matchesAnyGlob), có 14 test. tree.ts đọc workspaces từ
  package.json + pnpm-workspace.yaml, tính relDir theo từng workspace folder rồi
  gọi filterPackages. Refresh khi settings đổi đã có sẵn (affectsConfiguration).


- Bỏ Favorites/pin, bỏ alias, bỏ CodeLens, bỏ nút inline Run terminal.
- THÊM: ẩn script (hide) - script ẩn bị LOẠI HẲN khỏi sidebar (không có
  nhóm Hidden). Hiện lại bằng CHUỘT PHẢI trong file package.json ->
  "Show Hidden Scripts…" (command scriptsSidebar.showHidden, editor/context
  when resourceFilename==package.json, QuickPick multi-select).
  Lưu workspaceState key "scriptsSidebar.hidden". Rule lấy script lần đầu
  KHÔNG đổi (script mới vẫn hiện mặc định).
- Đang là v0.3.0 local (store đang chạy 0.3.0 cũ). Cần publish:patch -> 0.3.1.

## Đang làm gì
v0.3.0 (2026-09-21): sửa 6 bug + thêm CodeLens (package.json), status bar
running indicator, alias (rename script), guard silent cho script chạy dài,
Output channel cho silent. Tách pure logic -> src/logic.ts + test (npm test,
node:test + tsx). Đã cài vào Antigravity, chờ user test rồi publish 2 store.
v0.2.0 đã publish MS Marketplace + Open VSX (dothanhdao.scripts-sidebar).

## Thay đổi gần nhất (2026-09-18)
- Tạo toàn bộ scaffold extension: package.json, tsconfig, esbuild.js,
  src/extension.ts, icon.svg, .vscode/launch.json + tasks.json, README.
- Type-check sạch, esbuild compile ra dist/extension.js thành công.
- Khởi tạo memory-bank và điền nội dung theo đúng bối cảnh VS Code extension.
- FIX sau khi user test F5: (1) bỏ lệnh `cd` dài dòng — set cwd lúc tạo
  terminal; (2) tên tab terminal = tên script thay vì "Scripts"; tái sử
  dụng terminal theo từng script qua Map.
- Đổi UI: icon play (item/terminal/activity bar outline); đổi tên
  container "Scripts Runner", view "package.json".
- v0.2.0: nhóm prefix + stop/trạng thái + pin/favorites + QuickPick.
  Dùng contextValue ghép cờ (scriptRunning/scriptPinned...) + regex when
  trong menus để hiện nút inline đúng ngữ cảnh.

## Vấn đề đang gặp
- Chưa có (chờ kết quả F5 của user).
- `npm audit` cảnh báo ở devDependencies (esbuild/typescript) — không ảnh
  hưởng runtime, tạm bỏ qua.

## Quyết định gần đây
- Chạy script hỗ trợ CẢ 2 cách: terminal (reuse, mặc định) + child_process
  (silent, có progress + hủy). (User chọn.)
- Build bằng esbuild thay vì tsc thuần. (User chọn.)
- Hỗ trợ monorepo ngay từ bản đầu (gom theo folder).

## Việc tiếp theo có thể làm
- Thêm field `repository` + LICENSE để đóng gói .vsix không cảnh báo.
- Nâng cấp: group script theo nhóm (dev/build), recent scripts, run + debug.
