import { writable, get } from "svelte/store";
import { tabStore } from "./tabs";

/**
 * In-app download + install of updates via tauri-plugin-updater.
 *
 * This is the *action* layer. The *detection* layer lives in `updater.ts`
 * (it asks GitHub for the latest release and drives the banner/toast). When
 * the user clicks "Update now," we run the
 * updater plugin's own check against the GitHub `latest.json` manifest —
 * that's authoritative for the signed artifact — then download, install, and
 * relaunch onto the new version.
 */

/** True while a download/install is in progress. */
export const updateInstalling = writable(false);
/** 0–100 once content length is known; -1 while indeterminate. */
export const updateProgress = writable(-1);
/** Human-readable error if the install failed (null = no error). */
export const updateError = writable<string | null>(null);

export async function installUpdate(): Promise<void> {
  // The updater plugin is a no-op in dev (no bundled app to replace). Surface
  // a clear message rather than failing cryptically.
  if (import.meta.env.DEV) {
    updateError.set("In-app updates are only available in installed builds, not dev.");
    return;
  }

  if (get(updateInstalling)) return;
  if (get(tabStore.tabs).some((tab) => tab.dirty)) {
    updateError.set("Save your open documents before installing an update.");
    return;
  }

  updateError.set(null);
  updateInstalling.set(true);
  updateProgress.set(-1);

  let update: import("@tauri-apps/plugin-updater").Update | null = null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    update = await check({ timeout: 15000 });

    if (!update) {
      updateError.set("No update available.");
      updateInstalling.set(false);
      return;
    }

    // The signature establishes trust; also restrict the manifest's assets to our fork.
    const platforms = update.rawJson.platforms;
    if (!platforms || typeof platforms !== "object" || Array.isArray(platforms) || !Object.keys(platforms).length) {
      throw new Error("The update manifest has no supported release assets.");
    }
    for (const asset of Object.values(platforms)) {
      const url = new URL(asset.url);
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password ||
          !url.pathname.startsWith("/AutomaticLasagna/mdhero/releases/download/") || url.search || url.hash ||
          typeof asset.signature !== "string" || !asset.signature) {
        throw new Error("The update is not a signed release from this fork.");
      }
    }

    let downloaded = 0;
    let contentLength = 0;

    await update.download((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? 0;
          downloaded = 0;
          updateProgress.set(contentLength > 0 ? 0 : -1);
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            updateProgress.set(Math.min(100, Math.round((downloaded / contentLength) * 100)));
          }
          break;
        case "Finished":
          updateProgress.set(100);
          break;
      }
    });

    // Downloading may take time; preserve edits made while it was in progress.
    if (get(tabStore.tabs).some((tab) => tab.dirty)) {
      throw new Error("Save your open documents, then try the update again.");
    }
    await update.install();

    // Installed to disk — relaunch onto the new version. On Windows the NSIS
    // installer (installMode: passive) handles the swap + relaunch itself, so
    // this may not return; calling relaunch is still correct on macOS.
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    updateError.set(err instanceof Error ? err.message : String(err));
  } finally {
    await update?.close().catch(() => {});
    updateInstalling.set(false);
  }
}
