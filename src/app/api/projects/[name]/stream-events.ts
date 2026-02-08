export type ComposeStreamEvent =
  | { type: "output"; data: string }
  | { type: "done" }
  | { type: "error"; message: string };
