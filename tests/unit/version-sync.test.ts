import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// MDHero's version is written out by hand in four places that do not read each
// other — `tauri.conf.json` does NOT derive from `package.json`. A release bump
// has to touch all four, and nothing in the build fails if one is missed.
//
// The consequence is not cosmetic. The macOS Quick Look extension takes its
// `CFBundleShortVersionString` / `CFBundleVersion` from **package.json**
// (`quicklook/build-appex.sh`), while the host app takes its version from
// **tauri.conf.json**. Bump tauri.conf.json and forget package.json and the
// release ships a 0.2.x app with a 0.2.(x-1) extension sealed inside the app's
// code signature — signed, notarized, and quietly inconsistent.
//
// These assertions are the only thing standing between that and a tagged
// release, so keep them cheap and keep them green.

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/** `version = "x.y.z"` from the [package] table — not from a dependency. */
function cargoTomlVersion(toml: string): string | undefined {
  const pkg = toml.split(/^\[/m).find((s) => s.startsWith("package]"));
  return pkg?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
}

/** The `mdhero` entry in Cargo.lock, which carries its own copy. */
function cargoLockVersion(lock: string): string | undefined {
  return lock.match(/name = "mdhero"\r?\nversion = "([^"]+)"/)?.[1];
}

describe("the version is the same in every file that declares it", () => {
  const pkg = JSON.parse(read("package.json")).version as string;
  const tauri = JSON.parse(read("src-tauri/tauri.conf.json")).version as string;
  const cargo = cargoTomlVersion(read("src-tauri/Cargo.toml"));
  const lock = cargoLockVersion(read("src-tauri/Cargo.lock"));

  it("package.json declares a plain semver version", () => {
    // Guards the parse itself: if this file stops looking how the other
    // assertions assume, they must fail loudly rather than compare undefined.
    expect(pkg).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("every declaration was found", () => {
    expect({ pkg, tauri, cargo, lock }).toEqual({
      pkg,
      tauri: expect.any(String),
      cargo: expect.any(String),
      lock: expect.any(String),
    });
  });

  it("src-tauri/tauri.conf.json matches package.json", () => {
    // This is the pair that decides the app-vs-extension mismatch described
    // above, so it gets its own assertion rather than a combined one.
    expect(tauri).toBe(pkg);
  });

  it("src-tauri/Cargo.toml matches package.json", () => {
    expect(cargo).toBe(pkg);
  });

  it("src-tauri/Cargo.lock matches package.json", () => {
    // Easy to miss: bumping Cargo.toml without running `cargo check` leaves the
    // lock behind, and the lock is what a reproducible build resolves from.
    expect(lock).toBe(pkg);
  });
});

describe("the Quick Look extension's version still comes from package.json", () => {
  const script = read("quicklook/build-appex.sh");

  it("build-appex.sh reads the version out of package.json", () => {
    // If this coupling ever moves, the reasoning in the header comment above —
    // and the tauri.conf.json/package.json assertion that protects it — stop
    // describing reality. Fail here so whoever moves it updates both.
    expect(script).toMatch(/VERSION=.*require\(.*package\.json.*\)\.version/);
  });

  it("stamps both CFBundle version keys from that value", () => {
    expect(script).toContain("Set :CFBundleShortVersionString $VERSION");
    expect(script).toContain("Set :CFBundleVersion $VERSION");
  });

  it("keeps the Info.plist placeholders the script substitutes", () => {
    // PlistBuddy `Set` fails on a missing key, so the template must keep them.
    const plist = read("quicklook/Info.plist");
    expect(plist).toContain("CFBundleShortVersionString");
    expect(plist).toContain("CFBundleVersion");
  });
});
