import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get, writable } from "svelte/store";
import { readFileSync } from "node:fs";

const { check, relaunch } = vi.hoisted(() => ({ check: vi.fn(), relaunch: vi.fn() }));
const tabs = writable<{ dirty: boolean }[]>([]);
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch }));
vi.mock("../../src/lib/stores/tabs", () => ({ tabStore: { tabs } }));

function candidate(url = "https://github.com/AutomaticLasagna/mdhero/releases/download/personal-v0.2.12/MDHero.Personal_0.2.12_x64-setup.exe") {
  return {
    rawJson: { platforms: { "windows-x86_64": { url, signature: "signed-artifact" } } },
    download: vi.fn(async (progress: (event: unknown) => void) => {
      progress({ event: "Started", data: { contentLength: 100 } });
      progress({ event: "Progress", data: { chunkLength: 100 } });
      progress({ event: "Finished" });
    }),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  tabs.set([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("signed fork updates", () => {
  it("downloads through the signature-verifying plugin before installing and relaunching", async () => {
    const update = candidate();
    check.mockResolvedValue(update);
    const { installUpdate, updateProgress, updateInstalling } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(update.download).toHaveBeenCalledOnce();
    expect(update.install).toHaveBeenCalledOnce();
    expect(update.download.mock.invocationCallOrder[0]).toBeLessThan(update.install.mock.invocationCallOrder[0]);
    expect(relaunch).toHaveBeenCalledOnce();
    expect(update.close).toHaveBeenCalledOnce();
    expect(get(updateProgress)).toBe(100);
    expect(get(updateInstalling)).toBe(false);
  });

  it.each([
    "https://github.com/vaibhav-kakde-in/mdhero/releases/download/v0.2.12/app.exe",
    "https://example.com/app.exe",
    "http://github.com/AutomaticLasagna/mdhero/releases/download/v0.2.12/app.exe",
    "https://github.com/AutomaticLasagna/mdhero-other/releases/download/v0.2.12/app.exe",
    "https://user:password@github.com/AutomaticLasagna/mdhero/releases/download/v0.2.12/app.exe",
  ])("rejects an asset outside the fork: %s", async (url) => {
    const update = candidate(url);
    check.mockResolvedValue(update);
    const { installUpdate } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(update.close).toHaveBeenCalledOnce();
  });

  it("rejects an unsigned asset", async () => {
    const update = candidate();
    update.rawJson.platforms["windows-x86_64"].signature = "";
    check.mockResolvedValue(update);
    const { installUpdate } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(update.download).not.toHaveBeenCalled();
  });

  it("never installs or restarts after failed signature verification", async () => {
    const update = candidate();
    update.download.mockRejectedValue(new Error("Signature verification failed"));
    check.mockResolvedValue(update);
    const { installUpdate, updateError } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(update.install).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
    expect(get(updateError)).toContain("Signature");
    expect(update.close).toHaveBeenCalledOnce();
  });

  it("blocks updates with existing unsaved edits", async () => {
    tabs.set([{ dirty: true }]);
    const { installUpdate, updateError } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(check).not.toHaveBeenCalled();
    expect(get(updateError)).toContain("Save");
  });

  it("preserves edits made during the download", async () => {
    const update = candidate();
    update.download.mockImplementation(async () => { tabs.set([{ dirty: true }]); });
    check.mockResolvedValue(update);
    const { installUpdate, updateError } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(update.install).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
    expect(get(updateError)).toContain("Save");
  });

  it("clears busy state when there is no update", async () => {
    check.mockResolvedValue(null);
    const { installUpdate, updateInstalling } = await import("../../src/lib/stores/autoUpdate");
    await installUpdate();
    expect(get(updateInstalling)).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("pins the fork endpoint, signing identity, and required IPC permissions", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    expect(config.plugins.updater.endpoints).toEqual(["https://github.com/AutomaticLasagna/mdhero/releases/latest/download/latest.json"]);
    expect(Buffer.from(config.plugins.updater.pubkey, "base64").toString()).toContain("4CF1538E9A02D7FB");
    const permissions = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf8")).permissions;
    for (const permission of ["updater:allow-check", "updater:allow-download", "updater:allow-install", "process:allow-restart"]) {
      expect(permissions).toContain(permission);
    }
  });
});
