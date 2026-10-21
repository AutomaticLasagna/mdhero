import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { archiveFiles, assertPackagedBinary, assertPayloadFiles, PAYLOAD_FILES, privacyFindings, remapFlags, sha256 } from "../../scripts/release-privacy.mjs";

const home = "C:\\Users\\SamplePerson";
const workspace = "D:\\Private Work\\Markdown";

describe("release privacy checks", () => {
  it("passes compiler arguments with spaces as separate encoded arguments", () => {
    expect(remapFlags([home, workspace], "-Copt-level=3").split("\x1f")).toEqual([
      "-Copt-level=3", `--remap-path-prefix=${home}=/build/root-0`,
      `--remap-path-prefix=${workspace}=/build/root-1`,
    ]);
  });

  it("detects actual, escaped, slash-normalized, and unaligned UTF-16 private paths", () => {
    for (const text of [home + "\\.cargo\\src", workspace + "\\src", "d:/private work/markdown/src", JSON.stringify(home)]) {
      for (const bytes of [Buffer.from(text), Buffer.from(text, "utf16le"), Buffer.concat([Buffer.from([1]), Buffer.from(text, "utf16le")])]) {
        expect(privacyFindings(bytes, [home, workspace])).toContain("local-build-path");
      }
    }
  });

  it("also rejects other users' home paths", () => {
    for (const text of ["C:/Users/Somebody/.cargo/file.rs", "/home/somebody/project/file", "/Users/Someone/project/file"]) {
      expect(privacyFindings(Buffer.from(text), [])).toContain("user-home-path");
    }
  });

  it("rejects recognizable credentials without echoing them", () => {
    const secrets = ["ghp_" + "a".repeat(36), "github_pat_" + "a".repeat(60), "sk-proj-" + "a".repeat(60), "AKIA" + "A".repeat(16)];
    for (const secret of secrets) {
      expect(privacyFindings(Buffer.from(secret), [])).toEqual(["credential-pattern"]);
    }
    expect(privacyFindings(Buffer.from("-----BEGIN PRIVATE KEY-----\n" + "A".repeat(80) + "\n-----END PRIVATE KEY-----"), [])).toEqual(["private-key"]);
  });

  it("allows generic build paths, public attribution, and crypto-parser labels", () => {
    expect(privacyFindings(Buffer.from("/build/root-1/src/main.rs author@users.noreply.github.com -----BEGIN PRIVATE KEY-----"), [home])).toEqual([]);
  });

  it("checks the exact installer allowlist before extraction, ignoring its header path", () => {
    const listing = "Path = C:\\local\\installer.exe\r\n----------\r\n" + PAYLOAD_FILES.map((path) => `Path = ${path}\r\nSize = 1\r\n`).join("\r\n");
    expect(archiveFiles(listing)).toEqual(PAYLOAD_FILES);
    for (const bad of ["../secrets.txt", "C:/Users/person/file", "build.log", "mdhero.pdb", "notes.md"]) {
      expect(() => assertPayloadFiles([...PAYLOAD_FILES, bad])).toThrow("allowlist");
    }
    expect(() => assertPayloadFiles(PAYLOAD_FILES.slice(1))).toThrow();
    expect(() => assertPayloadFiles([...PAYLOAD_FILES.slice(1), PAYLOAD_FILES[1]])).toThrow();
    expect(() => archiveFiles("no listing")).toThrow();
  });

  it("accepts only Tauri's NSIS marker change in the packaged executable", () => {
    const built = Buffer.from("code__TAURI_BUNDLE_TYPE_VAR_UNKdata");
    const packaged = Buffer.from("code__TAURI_BUNDLE_TYPE_VAR_NSSdata");
    expect(() => assertPackagedBinary(built, packaged)).not.toThrow();
    expect(() => assertPackagedBinary(packaged, packaged)).not.toThrow();
    expect(() => assertPackagedBinary(built, Buffer.from("different binary"))).toThrow();
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("blocks the inherited fork uploader and exposes only the verified directory to CI", () => {
    const legacy = readFileSync(".github/workflows/build.yml", "utf8").replaceAll("\r\n", "\n");
    expect(legacy).toMatch(/build:\s*\n\s*#.*\n\s*if: github.repository == 'vaibhav-kakde-in\/mdhero'/);
    expect(legacy).toMatch(/if: github.repository == 'vaibhav-kakde-in\/mdhero' && startsWith/);
    const workflow = readFileSync(".github/workflows/private-release.yml", "utf8");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pnpm release:prepare");
    expect(workflow).toContain("path: ${{ steps.package.outputs.directory }}/");
    expect(workflow).not.toContain("src-tauri/target/release");
  });
});
