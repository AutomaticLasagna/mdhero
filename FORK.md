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
```

The browser test serves the production `build/` directory and mocks Tauri file/menu IPC. It checks the real frontend without changing documents on disk. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an already-installed Chromium. It does not replace a native Windows interaction check.

The native menu test verifies custom Undo/Redo entries, enabled state, and preservation of state when menus are translated. Its Windows manifest enables the same v6 common controls required by the application.

Verified on Windows during setup: the frontend suite (386 tests) and the added application-permissions regression check passed; 26 Rust unit tests and the native menu integration test passed; Svelte reported zero errors and nine existing warnings. The production browser check passed. The built Windows app was also exercised directly: native Edit-menu Undo/Redo, native right-click Undo, file loading, and a second launch opening README in the existing window all worked. Test documents were not saved, and the test app was closed afterward.

Two existing checks needed Windows compatibility fixes: CRLF handling in the version test, and removal of an unnecessary shebang from the Node-invoked Quick Look build module so Vitest can import it.

## Distribution

Ask Codex to **prepare a release** or **publish a release**. Codex follows the project's [release skill](.agents/skills/mdhero-release/SKILL.md), handles the commands, and checks the installer for personal build paths and other private data before upload. You do not need to operate a release tool or GitHub workflow.

Preparation produces a checked installer, updater signature, checksum, and `latest.json`. Publishing additionally creates a GitHub release when requested. The inherited automatic upload/publish jobs remain disabled in this fork; normal unit and Rust CI checks remain enabled. Kept release files live under `package/<release-tag>/`.

Starting with 0.2.11, the app trusts this fork's updater signing key and accepts update assets only from this fork's GitHub releases. It checks automatically at startup and daily while open, respects the Settings switch, and offers **Update now**. It checks for unsaved edits before downloading and again before installation; failed signature verification never proceeds to installation. Future releases use `personal-v<major.minor.patch>` tags, with a higher application version in the signed update manifest.

The installed 0.2.10 version needs one manual installer update to receive the new public key and updater permissions. After that, approved signed releases can install from inside the app. Upstream merging, testing, and publishing remain under our control. No installer is run and no file association is changed during development.

The private signing key stays outside the repository in the user's restricted `.tauri/mdhero-personal/` directory. Keep a private backup: losing it prevents signing updates accepted by existing installations. The public key can be shared. These updater signatures are separate from Windows publisher/Authenticode certificates; the installer still has no such certificate.
