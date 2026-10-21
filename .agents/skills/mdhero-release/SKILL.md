---
name: mdhero-release
description: Prepares or publishes MDHero Personal Windows x64 releases with privacy checks. Use when asked to prepare, package, or publish a release of this fork.
---

# MDHero release

Handle the release work for the user. They can say "prepare a release" or "publish a release"; they do not need to run commands. Preparation stops before uploading. An explicit publishing request authorizes publication after the checks below pass; do not ask for that authorization again.

## Prepare

1. Identify the requested source commit and confirm `origin` is the user's fork, not upstream. Preserve unrelated edits. Use a clean, identified source tree for the build, and run the relevant existing checks. If rebuilding a previously tested version for privacy, verify the source is unchanged and explain that the installer bytes will differ.

2. Build Windows x64 with `pnpm tauri build --bundles nsis`. Derive private roots from the current user home, checkout, and any custom Cargo/Rustup locations. Add `--remap-path-prefix=<private-root>=/build/root-N` for each root to the process-local `CARGO_ENCODED_RUSTFLAGS`, separated by character 31 so spaces survive. Preserve existing compiler flags and restore the environment afterward. An ordinary build can embed the Windows username in Rust dependency paths.

3. Inspect the installer with 7-Zip before extracting it into a new temporary directory. Reject absolute paths, traversal, links, and unexpected payload files. The reviewed payload is `mdhero.exe`, `uninstall.exe`, and these files under `$PLUGINSDIR`: `modern-wizard.bmp`, `nsDialogs.dll`, `NSISdl.dll`, `nsis_tauri_utils.dll`, `StartMenu.dll`, `System.dll`. Review any changed inventory rather than silently accepting it. Documents, logs, settings, credentials, and debug symbols do not belong in the package.

4. Scan the installer, the freshly built executable, and every extracted file for the actual username/private roots, other user-home paths, private-key blocks, and recognizable credential/token patterns. Check UTF-8 and UTF-16 at both byte alignments; account for case, slash direction, and JSON-escaped paths. Review any match without echoing secrets into logs. A cryptography parser's key-label string alone is not a private key. Also review included resources and release notes: pattern scanning cannot identify every kind of personal information. If a finding remains unresolved, stop before upload.

5. Verify that the extracted executable matches the fresh build. Tauri's packaging may change only `__TAURI_BUNDLE_TYPE_VAR_UNK` to `__TAURI_BUNDLE_TYPE_VAR_NSS`; normalize that marker for comparison, and investigate any other difference. Compute the final installer's SHA-256. Use a filename with dots instead of spaces so GitHub's filename normalization cannot break the checksum entry.

6. Smoke-test the checked build: opening a file, Undo/Redo through keyboard and menus, tab scrolling, and a second file joining the existing window. Check whether the installed copy is running first: single-instance routing can send test files to the user's current window. Arrange for it to be closed before native testing; never terminate it or alter the user's documents. Use disposable test content and close only the test process you launched.

## Publish when requested

- Confirm the release tag points to the checked source and target the user's fork. Keep the fork's inherited automatic upload/publish jobs disabled. A `personal-` tag distinguishes these releases from upstream.
- Create a draft release containing only the installer and `SHA256SUMS.txt`, with short release notes. Keep build logs, extracted audit files, local settings, and debug symbols off GitHub. Public project attribution and the user's public GitHub handle remain public; check new commits use the intended public/no-reply identity.
- Verify the uploaded asset names and SHA-256 digests against the local files. Fix the checksum entry if GitHub changed the filename. Publish only after these checks pass. If an upload's outcome is uncertain, inspect the existing draft before retrying.

## Finish

Keep one verified installer and checksum under the ignored `package/<release-tag>/` folder and give the user its location or release link. State what was tested and any limits without promising an exhaustive privacy guarantee. Existing installations stay unchanged unless the user asks to install. Remove generated build outputs only when cleanup is requested; preserve source, Git history, and development dependencies.
