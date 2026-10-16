import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scriptKey,
  buildRunCommand,
  pickPackageManager,
  isLongRunningScript,
  firstLines,
  parseWorkspacesField,
  parsePnpmWorkspaceYaml,
  matchesAnyGlob,
  filterPackages,
  type DiscoveredPackage,
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


test("parseWorkspacesField đọc cả 2 dạng", () => {
  assert.deepEqual(parseWorkspacesField({ workspaces: ["packages/*"] }), [
    "packages/*",
  ]);
  assert.deepEqual(
    parseWorkspacesField({ workspaces: { packages: ["apps/*", "libs/*"] } }),
    ["apps/*", "libs/*"]
  );
  assert.deepEqual(parseWorkspacesField({}), []);
  assert.deepEqual(parseWorkspacesField(null), []);
});

test("parsePnpmWorkspaceYaml chỉ lấy khối packages", () => {
  const yaml = [
    "packages:",
    "  - 'packages/*'",
    '  - "apps/**"',
    "  - tools/cli",
    "catalog:",
    "  react: ^18",
  ].join("\n");
  assert.deepEqual(parsePnpmWorkspaceYaml(yaml), [
    "packages/*",
    "apps/**",
    "tools/cli",
  ]);
});

test("matchesAnyGlob hỗ trợ *, ** và ?", () => {
  assert.equal(matchesAnyGlob("packages/foo", ["packages/*"]), true);
  assert.equal(matchesAnyGlob("packages/foo/bar", ["packages/*"]), false);
  assert.equal(matchesAnyGlob("a/b/c/package.json", ["**/package.json"]), true);
  assert.equal(matchesAnyGlob("app/packages/x/package.json", ["**/packages/**"]), true);
  assert.equal(matchesAnyGlob("app/src/package.json", ["**/packages/**"]), false);
});

function pkg(relDir: string, workspaceGlobs: string[] = []): DiscoveredPackage {
  return {
    packageJsonPath: `/ws/${relDir === "" ? "" : relDir + "/"}package.json`,
    relDir,
    workspaceGlobs,
  };
}

test("filterPackages scanMode=all giữ nguyên tất cả", () => {
  const pkgs = [pkg(""), pkg("packages/a"), pkg("packages/b")];
  const out = filterPackages(pkgs, { scanMode: "all", include: [], exclude: [] });
  assert.equal(out.length, 3);
});

test("filterPackages scanMode=roots bỏ workspace member", () => {
  const pkgs = [
    pkg("", ["packages/*"]),
    pkg("packages/a"),
    pkg("packages/b"),
    pkg("standalone"),
  ];
  const out = filterPackages(pkgs, {
    scanMode: "roots",
    include: [],
    exclude: [],
  });
  assert.deepEqual(
    out.map((p) => p.relDir),
    ["", "standalone"]
  );
});

test("filterPackages roots xử lý monorepo lồng nhau", () => {
  // mfe-platform-dmx khai báo packages/*, các @dmx/* là member
  const pkgs = [
    pkg("mini-web-shop"),
    pkg("mfe-platform-dmx", ["packages/*"]),
    pkg("mfe-platform-dmx/packages/analytics"),
    pkg("mfe-platform-dmx/packages/api-client"),
  ];
  const out = filterPackages(pkgs, {
    scanMode: "roots",
    include: [],
    exclude: [],
  });
  assert.deepEqual(
    out.map((p) => p.relDir),
    ["mini-web-shop", "mfe-platform-dmx"]
  );
});

test("filterPackages scanMode=workspaces chỉ giữ root có workspaces + member", () => {
  const pkgs = [
    pkg("", ["packages/*"]),
    pkg("packages/a"),
    pkg("standalone"), // không thuộc workspace nào -> bị bỏ
  ];
  const out = filterPackages(pkgs, {
    scanMode: "workspaces",
    include: [],
    exclude: [],
  });
  assert.deepEqual(
    out.map((p) => p.relDir),
    ["", "packages/a"]
  );
});

test("filterPackages exclude loại theo glob đường dẫn package.json", () => {
  const pkgs = [pkg("app"), pkg("app/packages/x"), pkg("app/packages/y")];
  const out = filterPackages(pkgs, {
    scanMode: "all",
    include: [],
    exclude: ["**/packages/**"],
  });
  assert.deepEqual(
    out.map((p) => p.relDir),
    ["app"]
  );
});

test("filterPackages include là allowlist áp sau scanMode", () => {
  const pkgs = [pkg("app"), pkg("libs/ui"), pkg("libs/core")];
  const out = filterPackages(pkgs, {
    scanMode: "all",
    include: ["libs/**"],
    exclude: [],
  });
  assert.deepEqual(
    out.map((p) => p.relDir),
    ["libs/ui", "libs/core"]
  );
});
