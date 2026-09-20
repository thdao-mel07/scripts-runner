# Project Brief

## Tên dự án
Scripts Sidebar (VS Code Extension)

## Mô tả
Extension cho VS Code hiển thị toàn bộ scripts trong `package.json` ở một
sidebar riêng trên Activity Bar. Người dùng click một phát là chạy script,
không cần gõ lệnh terminal thủ công.

## Đối tượng người dùng
Lập trình viên dùng VS Code (JS/TS/React Native/Node...) muốn chạy nhanh
các npm/yarn/pnpm script mà không phải nhớ hoặc gõ tay lệnh.

## Platform
- [x] VS Code Extension (Desktop)
- [ ] iOS
- [ ] Android

> Ghi chú: đây KHÔNG phải app React Native. Là extension VS Code viết bằng
> TypeScript, chạy trong Extension Host của VS Code.

## Tính năng cốt lõi
- Tab riêng "Scripts" trên Activity Bar (TreeView).
- Hiển thị danh sách script + nội dung command kèm theo.
- Click để chạy; 2 chế độ: qua Terminal (reuse) hoặc chạy nền (child_process
  + notification).
- Tự phát hiện package manager (npm/yarn/pnpm) qua lockfile.
- Auto refresh khi package.json thay đổi (FileSystemWatcher).
- Hỗ trợ monorepo: nhiều package.json gom theo folder.
