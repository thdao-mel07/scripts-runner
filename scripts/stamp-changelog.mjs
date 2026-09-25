// Chạy tự động trong lifecycle `npm version` (sau khi bump, trước khi commit).
// Chuyển mục "## [Unreleased]" thành "## [x.y.z] - YYYY-MM-DD" và tạo lại
// mục [Unreleased] rỗng cho lần sau.
import { readFileSync, writeFileSync } from "node:fs";

const CHANGELOG = "CHANGELOG.md";
const PLACEHOLDER =
  "<!-- Ghi thay đổi mới ở đây; `npm run release` sẽ tự gắn số version + ngày. -->";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const date = new Date().toISOString().slice(0, 10);

const lines = readFileSync(CHANGELOG, "utf8").split("\n");
const idx = lines.findIndex((l) => l.trim() === "## [Unreleased]");
if (idx === -1) {
  console.warn("stamp-changelog: không tìm thấy [Unreleased], bỏ qua.");
  process.exit(0);
}

// Lấy nội dung Unreleased (tới heading "## [" kế tiếp)
let end = idx + 1;
while (end < lines.length && !lines[end].startsWith("## [")) {
  end++;
}
const body = lines
  .slice(idx + 1, end)
  .join("\n")
  .replace(PLACEHOLDER, "")
  .trim();

const section = [
  "## [Unreleased]",
  "",
  PLACEHOLDER,
  "",
  `## [${version}] - ${date}`,
  "",
  body,
  "",
].join("\n");

const out = [...lines.slice(0, idx), section, ...lines.slice(end)].join("\n");
writeFileSync(CHANGELOG, out);
console.log(`stamp-changelog: đã gắn version ${version} (${date}) vào CHANGELOG.`);
