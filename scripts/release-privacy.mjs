import { createHash } from "node:crypto";

export const PAYLOAD_FILES = [
  "$PLUGINSDIR/modern-wizard.bmp", "$PLUGINSDIR/nsDialogs.dll",
  "$PLUGINSDIR/NSISdl.dll", "$PLUGINSDIR/nsis_tauri_utils.dll",
  "$PLUGINSDIR/StartMenu.dll", "$PLUGINSDIR/System.dll", "mdhero.exe", "uninstall.exe",
];

/** @param {string[]} roots @param {string} [existing] */
export function remapFlags(roots, existing = "") {
  return [existing, ...roots.map((root, index) => `--remap-path-prefix=${root}=/build/root-${index}`)]
    .filter(Boolean).join("\x1f");
}

/** @param {Buffer} bytes @param {string[]} privateRoots */
export function privacyFindings(bytes, privateRoots) {
  const findings = new Set();
  // PE strings can be UTF-16 at either byte alignment, or JSON-escaped UTF-8.
  for (const value of [bytes.toString("utf8"), bytes.toString("utf16le"), bytes.subarray(1).toString("utf16le")]) {
    const normalized = value.replace(/\\+/g, "/").toLowerCase();
    if (privateRoots.some((root) => normalized.includes(root.replace(/\\+/g, "/").toLowerCase()))) {
      findings.add("local-build-path");
    }
    if (/(?:[a-z]:\/users\/|\/home\/|\/users\/)[^/\s\x00]+\//i.test(normalized)) {
      findings.add("user-home-path");
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{50,}-----END/.test(value)) {
      findings.add("private-key");
    }
    if (/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{40,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/.test(value)) {
      findings.add("credential-pattern");
    }
  }
  // Never return the matched text: diagnostics must not echo a secret.
  return [...findings];
}

/** @param {string} listing */
export function archiveFiles(listing) {
  const entries = listing.split(/^----------\r?$/m)[1];
  if (!entries) throw new Error("Installer listing has no payload section");
  const files = [...entries.matchAll(/^Path = (.+)\r?$/gm)]
    .map((match) => match[1].trim().replaceAll("\\", "/"));
  assertPayloadFiles(files);
  return files;
}

/** @param {string[]} files */
export function assertPayloadFiles(files) {
  if (files.length !== PAYLOAD_FILES.length || new Set(files).size !== files.length ||
      files.some((file) => !PAYLOAD_FILES.includes(file))) {
    throw new Error("Installer payload differs from the reviewed allowlist; review it before releasing");
  }
}

/** @param {Buffer} built @param {Buffer} packaged */
export function assertPackagedBinary(built, packaged) {
  const normalized = Buffer.from(built);
  const marker = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const offset = normalized.indexOf(marker);
  if (offset >= 0) Buffer.from("__TAURI_BUNDLE_TYPE_VAR_NSS").copy(normalized, offset);
  if (!normalized.equals(packaged)) throw new Error("Installer does not contain the freshly built executable");
}

/** @param {Buffer} bytes */
export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
