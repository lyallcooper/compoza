import { DemoState } from "./state";

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO === "true";
}

let _state: DemoState | null = null;

export function getDemoState(): DemoState {
  if (!_state) {
    _state = new DemoState();
  }
  return _state;
}
