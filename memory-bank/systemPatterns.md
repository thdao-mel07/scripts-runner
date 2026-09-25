# System Patterns

## Cấu trúc thư mục (đã tách module - v0.3.0)
```
extension/
├── src/
│   ├── extension.ts      # mỏng: activate/deactivate + đăng ký command
│   ├── logic.ts          # hàm THUẦN (pure) - có test, không import vscode
│   ├── store.ts          # danh sách script bị ẩn (hide) - workspaceState
│   ├── running.ts        # map script đang chạy + status bar + kill
│   ├── runner.ts         # detectPM + chạy terminal/silent + output channel
│   ├── tree.ts           # ScriptItem + ScriptProvider + findPackageJsons
│   └── codelens.ts       # CodeLens cho package.json
├── test/
│   └── logic.test.ts     # unit test (node:test + tsx)
├── resources/
│   └── icon.svg          # icon Activity Bar
├── dist/                 # output esbuild (gitignored)
├── .vscode/
│   ├── launch.json       # config F5
│   └── tasks.json        # task compile/watch
├── esbuild.js            # bundle config
├── tsconfig.json
├── package.json          # manifest + contributes
└── memory-bank/
```

## Các thành phần chính trong extension.ts
- `ScriptItem` (extends `vscode.TreeItem`): 2 loại `kind` = "folder" | "script".
  - script: có `description` (nội dung command), tooltip markdown, `command`
    click chạy, `contextValue = "script"` để hiện nút inline.
- `ScriptProvider` (implements `TreeDataProvider<ScriptItem>`): dựng cây,
  có `onDidChangeTreeData` để refresh.
- `findPackageJsons()`: quét bằng `findFiles`, bỏ node_modules, bỏ file lỗi
  JSON, chỉ giữ package có scripts.
- `detectPackageManager(dir)`: dò lockfile lên tối đa 10 cấp cha; ưu tiên
  setting nếu khác "auto".
- `runInTerminal(item)` / `runSilent(item)`: 2 chế độ chạy.
- Terminal quản lý qua `Map<key, Terminal>` với key = `cwd::scriptName`:
  - Tên tab terminal = tên script (không phải "Scripts").
  - Set `cwd` lúc tạo terminal → KHÔNG gửi lệnh `cd` (tránh dài dòng).
  - reuseTerminal=true → dùng lại đúng terminal của từng script.
  - Dọn map khi terminal bị đóng (`onDidCloseTerminal`).

## Naming Conventions
- Class/Interface/Type: PascalCase
- Hàm/biến: camelCase
- Command id: `scriptsSidebar.<action>`
- Comment: tiếng Việt; tên biến/hàm: tiếng Anh (theo global rule)

## Kiến trúc v0.2.0 (nâng cấp)
- Node kind: "favorites" | "folder" | "script". Node cha giữ sẵn
  `children` -> getChildren trả `element.children`.
- Mỗi package.json là 1 node "folder" thu gọn được (kể cả khi chỉ có 1
  package) -> user gói gọn danh sách script. Set `id` ổn định
  (`folder:<path>`, `favorites`) để VS Code nhớ trạng thái thu/mở.
- Script bên trong hiển thị danh sách PHẲNG, sắp xếp A-Z (không nhóm prefix).
- Trạng thái đang chạy: `running: Map<key,{terminal?,child?}>`. Item đổi
  icon (loading~spin) + contextValue có "Running".
- Pin: lưu `workspaceState[scriptsSidebar.pinned]` = mảng key. Nhóm ⭐ ở đầu.
- contextValue ghép cờ: "script" + "Running"? + "Pinned"? -> menus dùng
  regex `viewItem =~ /.../` để hiện run/stop/pin/unpin đúng lúc.
- Auto-clear running: onDidCloseTerminal + onDidEndTerminalShellExecution
  (best-effort, feature-detect vì API mới).

## Quy tắc quan trọng
- TypeScript strict, không dùng `any`.
- Luôn try/catch khi đọc/parse package.json để không crash extension.
- `external: ["vscode"]` trong esbuild — không bao giờ bundle module vscode.
- Chạy nền (silent) chỉ hợp script ngắn; watch/dev server phải dùng terminal.
- Cây có nhiều package.json → hiển thị theo folder; 1 package → phẳng.
