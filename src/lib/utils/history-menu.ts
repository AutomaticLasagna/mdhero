import { invoke } from "@tauri-apps/api/core";

export interface HistoryMenuState {
  canUndo: boolean;
  canRedo: boolean;
}

export function focusedHistoryState(): HistoryMenuState {
  const state = { canUndo: false, canRedo: false };
  const target = document.activeElement;
  const claimed = target && !target.dispatchEvent(new CustomEvent("mdherohistorystate", {
    detail: state, cancelable: true,
  }));
  if (!claimed && target?.matches("input, textarea, [contenteditable=true]")) {
    state.canUndo = document.queryCommandEnabled("undo");
    state.canRedo = document.queryCommandEnabled("redo");
  }
  return state;
}

let sent: string | undefined;
let pending = Promise.resolve();
export function syncHistoryMenu(): void {
  if (!("__TAURI_INTERNALS__" in window)) return;
  const state = focusedHistoryState();
  const key = JSON.stringify(state);
  if (key === sent) return;
  sent = key;
  pending = pending.then(() => invoke<void>("set_history_menu_state", { ...state })).catch((error) => {
    sent = undefined;
    console.error("Could not update Undo/Redo menu", error);
  });
}

export function historyCommand(command: "undo" | "redo"): void {
  const target = document.activeElement;
  const claimed = target && !target.dispatchEvent(new CustomEvent("mdherohistory", {
    detail: command, cancelable: true,
  }));
  if (!claimed && target?.matches("input, textarea, [contenteditable=true]")) {
    document.execCommand(command);
  }
  syncHistoryMenu();
}
