import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("permits every registered local command after enabling application ACLs", () => {
  const root = resolve("src-tauri");
  const source = readFileSync(resolve(root, "src/lib.rs"), "utf8");
  const handlers = source.match(/generate_handler!\[([\s\S]*?)\]/)![1]
    .split(",").map((name) => name.trim().split("::").at(-1)!).filter(Boolean);
  const capability = JSON.parse(readFileSync(resolve(root, "capabilities/default.json"), "utf8"));
  const allowed: string[] = [];
  for (const file of readdirSync(resolve(root, "permissions"))) {
    const permission = readFileSync(resolve(root, "permissions", file), "utf8");
    const id = permission.match(/identifier = "([^"]+)"/)![1];
    expect(capability.permissions).toContain(id);
    const commands = permission.match(/commands.allow = \[([\s\S]*?)\]/)![1];
    allowed.push(...[...commands.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  }
  expect(handlers.length).toBeGreaterThan(0);
  expect(allowed.sort()).toEqual(handlers.sort());
});
