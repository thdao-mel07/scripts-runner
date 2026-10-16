import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scriptKey,
  buildRunCommand,
  pickPackageManager,
  parseWorkspacesField,
  parsePnpmWorkspaceYaml,
  matchesAnyGlob,
  filterPackages,
  parseScriptsRunnerConfig,
  mergeFilterOptions,
  applyOrder,
  reorderList,
  type DiscoveredPackage,
  type PackageFilterOptions,
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

test("parseScriptsRunnerConfig đọc field hợp lệ", () => {
  assert.deepEqual(
    parseScriptsRunnerConfig({
      scriptsRunner: { scanMode: "roots", exclude: ["**/packages/**"] },
    }),
    { scanMode: "roots", exclude: ["**/packages/**"] }
  );
  // Không khai báo -> {}
  assert.deepEqual(parseScriptsRunnerConfig({}), {});
  assert.deepEqual(parseScriptsRunnerConfig(null), {});
  // scanMode sai -> bỏ; include lọc phần tử không phải string
  assert.deepEqual(
    parseScriptsRunnerConfig({
      scriptsRunner: { scanMode: "bogus", include: ["a", 1, "b"] },
    }),
    { include: ["a", "b"] }
  );
});

test("mergeFilterOptions: repo bổ sung khi settings không đặt rõ scanMode", () => {
  const settings: PackageFilterOptions = {
    scanMode: "all",
    include: [],
    exclude: ["**/dist/**"],
  };
  const merged = mergeFilterOptions(
    settings,
    { scanMode: "roots", exclude: ["**/packages/**"] },
    false // settings scanMode KHÔNG đặt rõ -> dùng của repo
  );
  assert.equal(merged.scanMode, "roots");
  assert.deepEqual(merged.exclude, ["**/dist/**", "**/packages/**"]); // union
});

test("mergeFilterOptions: settings đặt rõ thì thắng repo", () => {
  const settings: PackageFilterOptions = {
    scanMode: "all",
    include: [],
    exclude: [],
  };
  const merged = mergeFilterOptions(
    settings,
    { scanMode: "roots" },
    true // settings scanMode đặt rõ
  );
  assert.equal(merged.scanMode, "all");
});

test("mergeFilterOptions: exclude union không trùng lặp", () => {
  const settings: PackageFilterOptions = {
    scanMode: "all",
    include: [],
    exclude: ["**/packages/**"],
  };
  const merged = mergeFilterOptions(
    settings,
    { exclude: ["**/packages/**", "**/examples/**"] },
    false
  );
  assert.deepEqual(merged.exclude, ["**/packages/**", "**/examples/**"]);
});

test("applyOrder: thứ tự lưu lên trước, còn lại A-Z", () => {
  assert.deepEqual(
    applyOrder(["build", "dev", "lint", "test"], ["dev", "build"]),
    ["dev", "build", "lint", "test"]
  );
  // Chưa lưu gì -> toàn bộ A-Z
  assert.deepEqual(applyOrder(["test", "build", "dev"], []), ["build", "dev", "test"]);
  // Thứ tự lưu có script đã xoá -> bỏ qua
  assert.deepEqual(applyOrder(["a", "b"], ["x", "b", "a"]), ["b", "a"]);
});

test("reorderList: chèn trước phần tử đích", () => {
  assert.deepEqual(
    reorderList(["a", "b", "c", "d"], ["d"], "b"),
    ["a", "d", "b", "c"]
  );
  // before undefined -> xuống cuối
  assert.deepEqual(reorderList(["a", "b", "c"], ["a"]), ["b", "c", "a"]);
  // kéo nhiều, giữ thứ tự tương đối
  assert.deepEqual(
    reorderList(["a", "b", "c", "d"], ["c", "a"], "d"),
    ["b", "a", "c", "d"]
  );
  // before là chính phần tử đang kéo -> xuống cuối (no-op an toàn)
  assert.deepEqual(reorderList(["a", "b", "c"], ["b"], "b"), ["a", "c", "b"]);
});
