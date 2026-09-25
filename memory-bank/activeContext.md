# Active Context

## Thay đổi mới nhất (chưa publish)
- Bỏ Favorites/pin, bỏ alias, bỏ CodeLens, bỏ nút inline Run terminal.
- THÊM: ẩn/hiện script (hide/unhide) - script ẩn gom vào nhóm "Hidden" ở
  cuối; lưu workspaceState key "scriptsSidebar.hidden". Rule lấy script lần
  đầu KHÔNG đổi (mọi script mới vẫn hiện mặc định).
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
