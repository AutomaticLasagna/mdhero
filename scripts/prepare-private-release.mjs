import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { archiveFiles, assertPackagedBinary, assertPayloadFiles, privacyFindings, remapFlags, sha256 } from "./release-privacy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.error || result.status !== 0) throw new Error("Release subprocess failed; no verified package was prepared");
  return result.stdout;
}

function payloadFiles(directory, prefix = "") {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Installer extraction contains a link");
    const entry = prefix + name;
    if (stat.isDirectory()) files.push(...payloadFiles(path, entry + "/"));
    else if (stat.isFile()) files.push(entry);
    else throw new Error("Installer extraction contains an unexpected file type");
  }
  return files;
}

function main() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("This release process supports Windows x64 only");
  if (run("git", ["status", "--porcelain"]).trim()) throw new Error("Commit or stash source changes before preparing a release");
  const sourceCommit = run("git", ["rev-parse", "HEAD"]).trim();
  if (process.env.RUSTFLAGS && !process.env.CARGO_ENCODED_RUSTFLAGS) throw new Error("Use CARGO_ENCODED_RUSTFLAGS rather than RUSTFLAGS for this build");
  const sevenZip = join(process.env.ProgramFiles || "C:\\Program Files", "7-Zip", "7z.exe");
  if (!existsSync(sevenZip)) throw new Error("Install 7-Zip in Program Files before preparing a release");
  const config = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
  if (!/^[\w .-]+$/.test(config.productName) || !/^\d+\.\d+\.\d+$/.test(config.version)) throw new Error("Unsupported release filename");

  const privateRoots = [...new Set([
    homedir(), root, process.env.CARGO_HOME || join(homedir(), ".cargo"),
    process.env.RUSTUP_HOME || join(homedir(), ".rustup"),
  ].map((path) => resolve(path)))];
  const target = join(root, "src-tauri/target/privacy-build");
  const workRoot = join(root, "src-tauri/target/privacy-work");
  mkdirSync(workRoot, { recursive: true });
  const work = mkdtempSync(join(workRoot, "audit-"));
  const release = join(target, "x86_64-pc-windows-msvc/release");
  const filename = `${config.productName}_${config.version}_x64-setup.exe`;
  const installer = join(release, "bundle/nsis", filename);
  // Remove only this known build output, so a successful no-op cannot pass an old installer.
  rmSync(installer, { force: true });
  const log = openSync(join(work, "build.log"), "w");
  try {
    console.log("Building Windows x64 with generic compiler paths. Build logs stay local.");
    run(process.execPath, [join(root, "node_modules/@tauri-apps/cli/tauri.js"), "build", "--bundles", "nsis", "--target", "x86_64-pc-windows-msvc"], {
      env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_ENCODED_RUSTFLAGS: remapFlags(privateRoots, process.env.CARGO_ENCODED_RUSTFLAGS) },
      stdio: ["ignore", log, log],
    });
  } finally {
    closeSync(log);
  }

  archiveFiles(run(sevenZip, ["l", "-slt", installer]));
  const payload = join(work, "payload");
  run(sevenZip, ["x", installer, `-o${payload}`, "-y"]);
  const entries = payloadFiles(payload);
  assertPayloadFiles(entries);
  const built = readFileSync(join(release, "mdhero.exe"));
  assertPackagedBinary(built, readFileSync(join(payload, "mdhero.exe")));
  const installerBytes = readFileSync(installer);
  const files = [installerBytes, built, ...entries.map((file) => readFileSync(join(payload, file)))];
  for (const bytes of files) {
    const findings = privacyFindings(bytes, privateRoots);
    if (findings.length) throw new Error(`Privacy check failed (${findings.join(", ")}); nothing copied to verified releases`);
  }

  run("git", ["diff", "--quiet", "HEAD"]);
  if (run("git", ["rev-parse", "HEAD"]).trim() !== sourceCommit ||
      run("git", ["ls-files", "--others", "--exclude-standard"]).trim()) {
    throw new Error("Source changed during the build; prepare the release again");
  }
  const publicName = filename.replaceAll(" ", ".");
  const digest = sha256(installerBytes);
  const staged = join(work, "package");
  mkdirSync(staged);
  copyFileSync(installer, join(staged, publicName));
  if (sha256(readFileSync(join(staged, publicName))) !== digest) throw new Error("Verified package copy failed checksum verification");
  writeFileSync(join(staged, "SHA256SUMS.txt"), `${digest}  ${publicName}\n`);
  // Allowlisted metadata only: no local paths, environment variables, or raw findings.
  writeFileSync(join(staged, "privacy-report.json"), JSON.stringify({
    schema: 1, sourceCommit, platform: "windows-x64", filename: publicName,
    sha256: digest, scannedFiles: files.length, payloadFiles: entries.sort(),
    checks: ["path-remapping", "payload-allowlist", "packaged-binary-match", "personal-paths", "credential-patterns"],
  }, null, 2) + "\n");
  const readyRoot = join(root, "src-tauri/target/verified-releases");
  mkdirSync(readyRoot, { recursive: true });
  const ready = join(readyRoot, `${config.version}-${basename(work)}`);
  if (!resolve(staged).startsWith(resolve(workRoot) + sep) ||
      !resolve(ready).startsWith(resolve(readyRoot) + sep)) throw new Error("Release staging path is outside its workspace");
  renameSync(staged, ready);
  const output = relative(root, ready).replaceAll("\\", "/");
  console.log(`Verified release prepared: ${output}`);
  console.log("Only publish the files in that folder. No release has been uploaded.");
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `directory=${output}\n`, { flag: "a" });
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : "Release preparation failed");
  process.exitCode = 1;
}
