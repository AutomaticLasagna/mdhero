import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

// Exercise the production UI with file/menu IPC mocked; no real files are edited.
const root = resolve("build");
const server = createServer(async (request, response) => {
  try {
    let file = resolve(root, "." + decodeURIComponent(request.url.split("?")[0]));
    if (!file.startsWith(root + sep) && file !== root) throw new Error("Invalid path");
    if (!(await stat(file)).isFile()) file = resolve(root, "index.html");
    const types = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
    response.setHeader("Content-Type", types[extname(file)] ?? "text/html");
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("mdhero_locale", "en");
    localStorage.setItem("mdhero-settings", JSON.stringify({ autoCheckUpdates: false, restoreTabsOnLaunch: false }));
    window.calls = [];
    window.disk = {};
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback: () => 1,
      convertFileSrc: (path) => path,
      invoke: async (cmd, args) => {
        window.calls.push({ cmd, args });
        if (["get_opened_files", "list_claude_plans", "list_folder_md_files"].includes(cmd)) return [];
        if (cmd === "plugin:app|version") return "0.2.10";
        if (cmd === "plugin:cli|cli_matches") return { args: {} };
        if (cmd === "plugin:dialog|save") return "/test/saved.md";
        if (cmd === "write_markdown_file") { window.disk[args.path] = args.content; return; }
        if (cmd === "read_markdown_file") return window.disk[args.path] ?? "# New file";
        if (cmd === "resolve_path") return args.path;
        return null;
      },
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => typeof window.__mdhero_undo === "function");
  const editor = page.locator("textarea.editor");
  await page.keyboard.press("Control+t");
  await editor.waitFor();
  await editor.pressSequentially("Protect this paragraph");
  await editor.press("Control+a");
  await editor.press("Backspace");
  await page.evaluate(() => window.__mdhero_undo());
  assert.equal(await editor.inputValue(), "Protect this paragraph");
  assert.deepEqual(await editor.evaluate((el) => [el.selectionStart, el.selectionEnd]), [0, 22]);
  await page.waitForFunction(() => window.calls.filter((call) => call.cmd === "set_history_menu_state").at(-1)?.args.canRedo === true);
  await editor.click({ button: "right" });
  const contextMenu = await page.evaluate(() => window.calls.filter((call) => call.cmd === "show_editor_context_menu").at(-1));
  assert.equal(contextMenu.args.canRedo, true);
  await page.evaluate(() => window.__mdhero_redo());
  assert.equal(await editor.inputValue(), "");
  await editor.press("Control+z");
  await editor.press("Control+s");
  await page.waitForFunction(() => window.disk["/test/saved.md"] === "Protect this paragraph");
  await editor.press("Control+y");
  assert.equal(await editor.inputValue(), "");
  await editor.press("Control+z");
  await editor.press("Control+t");
  await editor.fill("Second document");
  await editor.press("Control+PageUp");
  assert.equal(await editor.inputValue(), "Protect this paragraph");
  await page.evaluate(() => window.__mdhero_redo());
  assert.equal(await editor.inputValue(), "");
  await editor.press("Control+z");
  await editor.press("Control+e");
  await page.keyboard.press("Control+e");
  await editor.waitFor();
  await page.evaluate(() => window.__mdhero_redo());
  assert.equal(await editor.inputValue(), "");
  await editor.press("Control+z");
  await page.evaluate(() => window.__mdhero_open_path("/test/saved.md"));
  await page.waitForTimeout(100);
  assert.equal(await page.locator(".tabbar-files > .tab").count(), 2);
  assert.equal(await editor.inputValue(), "Protect this paragraph");
  for (let i = 0; i < 16; i++) await page.keyboard.press("Control+t");
  const strip = page.locator(".tabbar");
  await strip.evaluate((el) => { el.scrollLeft = 0; });
  await strip.hover();
  await page.mouse.wheel(0, 250);
  await page.waitForTimeout(100);
  assert((await strip.evaluate((el) => el.scrollLeft)) > 0);
  await page.keyboard.press("Control+1");
  await page.waitForTimeout(100);
  assert((await strip.evaluate((el) => el.scrollLeft)) < 50);
  await page.setViewportSize({ width: 900, height: 400 });
  await page.locator(".layout-btn").click();
  await page.locator(".tabbar.side").waitFor();
  await strip.evaluate((el) => { el.scrollTop = 0; });
  await strip.hover();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(100);
  assert((await strip.evaluate((el) => el.scrollTop)) > 0);
  assert.deepEqual(errors, []);
  console.log("PASS: selection recovery, menu state/undo/redo, Save As, tab/view changes, duplicate open, top/side wheel scrolling, active-tab visibility.");
} finally {
  await browser?.close();
  server.close();
}
