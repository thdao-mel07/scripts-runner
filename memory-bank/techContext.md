# Tech Context

## Stack
- Loại: VS Code Extension (không phải React Native)
- Ngôn ngữ: TypeScript ^5.4 (strict mode)
- Node version: v22.22.0 (dev máy hiện tại)
- VS Code engine yêu cầu: ^1.85.0
- Bundler: esbuild ^0.20 (bundle CJS, external "vscode")

## API chính dùng
- `vscode.window.createTreeView` + `TreeDataProvider` — sidebar list
- `vscode.window.createTerminal` — chạy script qua terminal
- `child_process.exec` — chạy script chế độ nền (silent)
- `vscode.workspace.findFiles` — quét package.json (bỏ node_modules)
- `vscode.workspace.createFileSystemWatcher` — auto refresh

## Không dùng (vì là extension, không phải app RN)
- Navigation / State management / Networking / UI library RN: KHÔNG áp dụng.

## Test
- Pure logic tách ra `src/logic.ts` (không import vscode).
- Test: `npm test` = `node --import tsx --test test/*.test.ts` (node:test + tsx).
- Silent mode dùng `spawn(cmd,{shell:true,detached:true})` + kill process
  group `process.kill(-pid)` để dừng cả cây con.

## Key Dependencies
- devDependencies: `@types/vscode`, `@types/node`, `esbuild`, `typescript`,
  `sharp` (chỉ dùng để xuất icon PNG từ SVG, không dùng runtime)
- runtime: chỉ dùng API `vscode` do host cung cấp (không bundle).

## Cấu trúc build output
- Entry: `dist/extension.js` (field `main` trong package.json)
- Source: `src/extension.ts`

## Setup & Run
```bash
# install
npm install

# build 1 lần
npm run compile

# build watch
npm run watch

# type-check
npm run lint

# build production (minify)
npm run package
```

## Chạy thử
- Mở thư mục `extension` trong VS Code → nhấn F5 → cửa sổ
  "Extension Development Host" mở ra → mở project có package.json để test.

## Đóng gói .vsix
```bash
npm i -g @vscode/vsce
vsce package
# cần thêm field repository + LICENSE để tránh cảnh báo của vsce
```

## Publish Marketplace
- publisher: `dothanhdao` (đã set trong package.json)
- Extension ID trên store: `dothanhdao.scripts-sidebar`
- GitHub repo (public): https://github.com/thdao-mel07/scripts-runner
  (gh account: thdao-mel07). Đã set repository/bugs/homepage.
- Ảnh demo: images/demo.png -> vsce tự đổi thành raw URL khi package.
- Lệnh: `npx @vscode/vsce login dothanhdao` rồi `npx @vscode/vsce publish`
  (token do user tự nhập, có scope Marketplace > Manage).
- Update version sau: `npx @vscode/vsce publish patch|minor|major`.

## Settings extension expose
- `scriptsSidebar.packageManager`: auto | npm | yarn | pnpm (default auto)
- `scriptsSidebar.reuseTerminal`: boolean (default true)
