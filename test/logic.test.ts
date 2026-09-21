import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scriptKey,
  buildRunCommand,
  pickPackageManager,
  isLongRunningScript,
  firstLines,
  displayLabel,
  findScriptLines,
} from "../src/logic";

test("scriptKey ghép cwd + tên script", () => {
  assert.equal(scriptKey("/a/b", "build"), "/a/b::build");
});

test("buildRunCommand đúng theo package manager", () => {
  assert.equal(buildRunCommand("npm", "dev"), "npm run dev");
  assert.equal(buildRunCommand("pnpm", "dev"), "pnpm run dev");
  assert.equal(buildRunCommand("yarn", "dev"), "yarn dev");
});

test("pickPackageManager ưu tiên pnpm > yarn > npm", () => {
  assert.equal(pickPackageManager({ pnpm: true, yarn: true, npm: true }), "pnpm");
  assert.equal(pickPackageManager({ yarn: true, npm: true }), "yarn");
  assert.equal(pickPackageManager({ npm: true }), "npm");
  assert.equal(pickPackageManager({}), "npm");
});

test("isLongRunningScript nhận diện script chạy dài", () => {
  assert.equal(isLongRunningScript("start:dev"), true);
  assert.equal(isLongRunningScript("watch"), true);
  assert.equal(isLongRunningScript("dev"), true);
  assert.equal(isLongRunningScript("start:metro", "react-native start"), true);
  assert.equal(isLongRunningScript("build", "tsc -w"), true);
  assert.equal(isLongRunningScript("test", "jest --watch"), true);
  // Script ngắn thì không
  assert.equal(isLongRunningScript("lint", "eslint ."), false);
  assert.equal(isLongRunningScript("build", "tsc"), false);
  assert.equal(isLongRunningScript("format", "prettier --write ."), false);
});

test("firstLines rút gọn và gộp khoảng trắng", () => {
  assert.equal(firstLines(""), "");
  assert.equal(firstLines("a\nb\nc"), "a b c");
  const long = "x".repeat(300);
  const out = firstLines(long, 200);
  assert.equal(out.length, 201); // 200 ký tự + dấu …
  assert.ok(out.endsWith("…"));
});

test("displayLabel ưu tiên alias", () => {
  assert.equal(displayLabel("build-android-stg"), "build-android-stg");
  assert.equal(displayLabel("build-android-stg", "Build Staging"), "Build Staging");
  assert.equal(displayLabel("x", "   "), "x"); // alias rỗng -> dùng tên gốc
});

test("findScriptLines tìm đúng dòng của từng script", () => {
  const json = [
    "{",
    '  "name": "demo",',
    '  "scripts": {',
    '    "build": "tsc",',
    '    "dev": "vite"',
    "  }",
    "}",
  ].join("\n");
  const lines = findScriptLines(json);
  assert.equal(lines.get("build"), 3);
  assert.equal(lines.get("dev"), 4);
  // "name" ngoài block scripts -> không được tính
  assert.equal(lines.has("name"), false);
});

test("findScriptLines trả rỗng khi không có scripts", () => {
  assert.equal(findScriptLines('{"name":"x"}').size, 0);
});
