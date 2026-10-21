import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";

/**
 * #180: the update check used to send this install's version and OS to
 * mdhero.app/api/version, where they fed a daily-active-users counter, while
 * the README said "No telemetry. No analytics." The check now asks GitHub for
 * the latest release and compares it locally. These tests pin both halves:
 * the request carries nothing about the user, and the notification still works.
 */

vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.2.10" }));

const store = new Map<string, string>();
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  store.clear();
  fetchMock.mockReset();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function release(tag: string) {
  const forkTag = `personal-${tag}`;
  return { ok: true, json: async () => ({ tag_name: forkTag, html_url: `https://github.com/AutomaticLasagna/mdhero/releases/tag/${forkTag}` }) };
}

async function load() {
  return import("../../src/lib/stores/updater");
}

describe("the update check sends nothing about the user", () => {
  it("makes exactly one request, to GitHub's releases API, with no query string", async () => {
    fetchMock.mockResolvedValue(release("v0.2.10"));
    const { checkForUpdates } = await load();
    await checkForUpdates(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://api.github.com");
    expect(url.pathname).toBe("/repos/AutomaticLasagna/mdhero/releases/latest");
    expect(url.search).toBe("");
  });

  it("never contacts mdhero.app and never includes the version or OS", async () => {
    fetchMock.mockResolvedValue(release("v0.2.11"));
    const { checkForUpdates } = await load();
    await checkForUpdates(true);

    const [url, init] = fetchMock.mock.calls[0];
    const sent = JSON.stringify([url, init]);
    expect(sent).not.toContain("mdhero.app");
    expect(sent).not.toContain("0.2.10");
    expect(sent).not.toMatch(/darwin|win32|linux/);
  });
});

describe("the notification still works", () => {
  it("ignores upstream URLs and non-versioned tags", async () => {
    for (const data of [
      { tag_name: "personal-v0.2.11", html_url: "https://github.com/vaibhav-kakde-in/mdhero/releases/tag/v0.2.11" },
      { tag_name: "personal-v0.2.10-1", html_url: "https://github.com/AutomaticLasagna/mdhero/releases/tag/personal-v0.2.10-1" },
    ]) {
      fetchMock.mockResolvedValue({ ok: true, json: async () => data });
      const { checkForUpdates, updateAvailable } = await load();
      await checkForUpdates(true);
      expect(get(updateAvailable)).toBeNull();
    }
  });
  it("announces a newer release", async () => {
    fetchMock.mockResolvedValue(release("v0.2.11"));
    const { checkForUpdates, updateAvailable } = await load();
    await checkForUpdates(true);
    expect(get(updateAvailable)).toMatchObject({ version: "0.2.11" });
  });

  it("stays quiet on the current release", async () => {
    fetchMock.mockResolvedValue(release("v0.2.10"));
    const { checkForUpdates, updateAvailable } = await load();
    await checkForUpdates(true);
    expect(get(updateAvailable)).toBeNull();
  });

  it("fails quietly when offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { checkForUpdates, updateAvailable, checkInFlight } = await load();
    await expect(checkForUpdates(true)).resolves.toBeUndefined();
    expect(get(updateAvailable)).toBeNull();
    expect(get(checkInFlight)).toBe(false);
  });
});

/**
 * The automatic daily check can be switched off (#180). The check already skips
 * itself in dev builds, and tests run as dev, so these switch DEV off first:
 * otherwise "no request when off" would pass for the wrong reason. The first
 * case proves the automatic path really runs here.
 */
describe("the automatic check follows the Settings switch", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
  });

  function withSetting(on: boolean) {
    store.set("mdhero-settings", JSON.stringify({ autoCheckUpdates: on }));
  }

  it("checks automatically when the switch is on (the default)", async () => {
    fetchMock.mockResolvedValue(release("v0.2.11"));
    const { checkForUpdates } = await load();
    await checkForUpdates();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("makes no request at all when the switch is off", async () => {
    withSetting(false);
    const { checkForUpdates } = await load();
    await checkForUpdates();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still checks when the user asks, with the switch off", async () => {
    withSetting(false);
    fetchMock.mockResolvedValue(release("v0.2.11"));
    const { checkForUpdates, updateAvailable } = await load();
    await checkForUpdates(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(get(updateAvailable)).toMatchObject({ version: "0.2.11" });
  });
});
