import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditHistory } from "../../src/lib/utils/edit-history";
import { focusedHistoryState, historyCommand } from "../../src/lib/utils/history-menu";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));

let target: EventTarget & { matches: () => boolean };
const nativeCommand = vi.fn();

beforeEach(() => {
  target = Object.assign(new EventTarget(), { matches: () => true });
  vi.stubGlobal("window", {});
  vi.stubGlobal("document", { activeElement: target, queryCommandEnabled: () => false, execCommand: nativeCommand });
  nativeCommand.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("menu commands use document history, not browser history", () => {
  it("restores a deleted selection and redoes it even when native history is unavailable", () => {
    const history = new EditHistory("Keep this paragraph");
    history.record("", { start: 0, end: 19 }, { start: 0, end: 0 }, "delete");
    target.addEventListener("mdherohistorystate", (event) => {
      event.preventDefault();
      Object.assign((event as CustomEvent).detail, { canUndo: history.canUndo, canRedo: history.canRedo });
    });
    target.addEventListener("mdherohistory", (event) => {
      event.preventDefault();
      if ((event as CustomEvent).detail === "undo") history.undo();
      else history.redo();
    });
    expect(focusedHistoryState()).toEqual({ canUndo: true, canRedo: false });
    historyCommand("undo");
    expect(history.text).toBe("Keep this paragraph");
    expect(focusedHistoryState()).toEqual({ canUndo: false, canRedo: true });
    historyCommand("redo");
    expect(history.text).toBe("");
    expect(nativeCommand).not.toHaveBeenCalled();
  });

  it("keeps native undo for ordinary text inputs", () => {
    historyCommand("undo");
    expect(nativeCommand).toHaveBeenCalledWith("undo");
  });

  it("does not send undo into a document when focus is outside an editor", () => {
    target.matches = () => false;
    historyCommand("undo");
    expect(nativeCommand).not.toHaveBeenCalled();
    expect(focusedHistoryState()).toEqual({ canUndo: false, canRedo: false });
  });
});
