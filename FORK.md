# MDHero Personal

Personal fork of [MDHero](https://github.com/vaibhav-kakde-in/mdhero), retaining its MIT license and attribution.

## Changes

- Per-document undo/redo from the keyboard, the Edit menu, and the editor's native right-click menu. Undo restores text and selection; history survives saves, tab switches, and viewer/editor switches. Menu availability follows the document history rather than the browser's separate history. Cut, Copy, Paste, and Select All remain in the right-click menu.
- Vertical mouse-wheel movement scrolls overflowing top tabs horizontally. Horizontal trackpad movement, modified gestures, and vertical side tabs retain their normal behavior. Selecting a tab brings it into view.
- Opening a file joins the existing window by default. Settings → Behavior can disable this after a restart. An already-open document is selected without reloading or overwriting its edits.
- Separate installed name and application identifier: `MDHero Personal`, `com.automaticlasagna.mdhero`. Settings are separate from the original app. Update checks point to this fork rather than upstream.

Undo history lasts while a tab is open, with at most 500 grouped steps. Closing the tab or quitting discards that history. This is not crash recovery or document versioning.

## Provenance

- Upstream base: `05f0f08`.
- Undo implementation: `3ad12abe518b54780a5ebd865b84289404a35002` from [kritzerenkrieg's undo branch](https://github.com/kritzerenkrieg/mdhero/tree/feat/182-undo-redo), preserved as its original commit. This fork replaces its browser-dependent menu routing.
- Existing-window implementation: upstream [PR #130](https://github.com/vaibhav-kakde-in/mdhero/pull/130), already included in the base. This fork enables it by default and protects existing tabs from repeated open requests.

## Build and check

Use Node 22+, pnpm 10.34.7, Rust stable, and the Windows MSVC build tools. The repository pins pnpm to avoid differences in newer pnpm versions.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm release:prepare
```

The browser test serves the production `build/` directory and mocks Tauri file/menu IPC. It checks the real frontend without changing documents on disk. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an already-installed Chromium. It does not replace a native Windows interaction check.

The native menu test verifies custom Undo/Redo entries, enabled state, and preservation of state when menus are translated. Its Windows manifest enables the same v6 common controls required by the application.

Verified on Windows during setup: the frontend suite (386 tests) and the added application-permissions regression check passed; 26 Rust unit tests and the native menu integration test passed; Svelte reported zero errors and nine existing warnings. The production browser check passed. The built Windows app was also exercised directly: native Edit-menu Undo/Redo, native right-click Undo, file loading, and a second launch opening README in the existing window all worked. Test documents were not saved, and the test app was closed afterward.

Two existing checks needed Windows compatibility fixes: CRLF handling in the version test, and removal of an unnecessary shebang from the Node-invoked Quick Look build module so Vitest can import it.

## Distribution

For distributable Windows x64 builds, commit your source changes, install 7-Zip in Program Files, then run **`pnpm release:prepare`**. It builds with generic Rust compiler paths, lists and validates the NSIS archive before extraction, checks every extracted file against the reviewed payload allowlist, scans UTF-8 and UTF-16 strings for local/home paths and recognizable credential patterns, and verifies the packaged executable matches the new build except for Tauri's NSIS marker.

Only after every check passes does it create a new folder under `src-tauri/target/verified-releases/` containing the installer, `SHA256SUMS.txt`, and `privacy-report.json`. The report contains only source commit, platform, hashes, filenames, and check names. Filenames already use GitHub-compatible dots instead of spaces. Build logs and extracted audit files stay in ignored `src-tauri/target/privacy-work/`; never upload that directory.

Use only that verified folder for a release, and smoke-test its installer before publication. A failed build, missing 7-Zip, unexpected archive file, leaked path, recognized credential, or changed source stops preparation without creating a verified folder. Old verified folders are retained; select the folder printed by the current successful run. Do not publish a raw `pnpm tauri build` output.

The manual **Prepare privacy-checked Windows release** GitHub Actions workflow runs the same command and uploads only the verified folder as a workflow artifact. It has read-only repository permissions and does not publish a GitHub release. The inherited upstream installer-upload and publishing jobs are disabled in this fork, including on `v*` tags; unit and Rust CI checks remain enabled.

The scanner is a conservative guard, not proof that arbitrary personal text or every possible secret has been detected. Keep private documents and credentials out of application resources, review changes to resources/environment configuration, and review the release notes separately. Public project attribution and GitHub usernames are not stripped. This process currently covers Windows x64 NSIS installers only.

No installer is run automatically and no default file association is changed during development. Windows builds are unsigned. Before publishing signed in-app updates, replace the inherited updater public key with this fork's own key and configure its release signing; until then, distribute builds manually. No update endpoint points at upstream releases.
