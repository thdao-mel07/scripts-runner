# Progress

## Done
- [x] Setup project (package.json, tsconfig, esbuild, .vscode config)
- [x] TreeView sidebar "Scripts" trên Activity Bar
- [x] Đọc & hiển thị scripts từ package.json (+ nội dung command)
- [x] Chạy script qua terminal (reuse terminal)
- [x] Chạy script chế độ nền (child_process + notification + progress/cancel)
- [x] Detect package manager npm/yarn/pnpm qua lockfile
- [x] Auto refresh bằng FileSystemWatcher
- [x] Hỗ trợ monorepo (gom theo folder)
- [x] Nút refresh + inline run trên view title/item
- [x] README + launch.json (F5) + tasks.json
- [x] Type-check sạch + esbuild compile OK
- [x] Khởi tạo memory-bank

## Done (v0.2.0 - nâng cấp)
- [x] ~~Nhóm script theo prefix~~ (ĐÃ GỠ theo yêu cầu user - danh sách phẳng A-Z)
- [x] Stop script + trạng thái đang chạy (icon spinner, nút ⏹)
- [x] Click script đang chạy -> focus terminal thay vì chạy lại
- [x] Pin/Favorites (lưu workspaceState, nhóm ⭐ đầu sidebar)
- [x] ~~QuickPick "Run Script…"~~ (ĐÃ GỠ theo yêu cầu user)
- [x] Node package thu gọn được (kể cả 1 package) + nhớ trạng thái qua id
- [x] Auto-clear trạng thái khi terminal đóng / lệnh kết thúc (shell integration best-effort)

## In Progress
- [ ] User test bằng F5 trong Extension Development Host (v0.2.0)

## Done (đóng gói)
- [x] LICENSE (MIT) + field license + .vscodeignore loại memory-bank
- [x] README hoàn chỉnh để publish
- [x] Đóng gói scripts-sidebar-0.2.0.vsix thành công (npx @vscode/vsce)

- [x] Icon Marketplace: thiết kế marketplace-icon.svg -> xuất PNG 256/128
  (bằng sharp), gắn field `icon` = resources/icon-256.png

- [x] Đã thử publish Marketplace nhưng KHÔNG tạo được Azure DevOps org
  (bị gate subscription / lỗi login) -> quay về cài LOCAL.
- [x] publisher đổi lại "local"; cài .vsix vào Antigravity IDE thành công
  (CLI: /Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide)

- [x] User đã có token + tạo được org. publisher = "dothanhdao" trở lại.
- [x] description đổi sang tiếng Anh ngắn gọn.
- [x] README viết lại chuẩn Marketplace (badges shields.io, Features theo
  mục, Extension Settings, Known Issues, Release Notes) + CHANGELOG.md.

## Todo
- [ ] User tự chạy: npx @vscode/vsce login dothanhdao && publish
- [ ] (Nên có) screenshot/GIF demo bằng URL tuyệt đối -> cần đưa code lên
  GitHub rồi trỏ raw URL (đã để sẵn chỗ comment trong README)
- [ ] (Cân nhắc) recent scripts, run+debug, publish Marketplace

## Known Bugs
- Trạng thái "đang chạy" của script chạy qua terminal: nếu VS Code KHÔNG có
  shell integration, chỉ clear khi terminal đóng hoặc bấm Stop (không tự
  biết lệnh one-shot đã xong). Có shell integration thì tự clear.
