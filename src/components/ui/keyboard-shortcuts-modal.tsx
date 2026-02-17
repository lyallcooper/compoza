"use client";

import { Modal } from "./modal";

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Go to",
    shortcuts: [
      { keys: ["g", "h"], description: "Dashboard" },
      { keys: ["g", "p"], description: "Projects" },
      { keys: ["g", "c"], description: "Containers" },
      { keys: ["g", "i"], description: "Images" },
      { keys: ["g", "n"], description: "Networks" },
      { keys: ["g", "v"], description: "Volumes" },
      { keys: ["g", "s"], description: "System" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["/"], description: "Focus search" },
      { keys: ["Esc"], description: "Close modal / Cancel" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: ["Cmd", "S"], description: "Save changes" },
    ],
  },
];

const modifierKeys = new Set(["Cmd", "Ctrl", "Shift", "Alt"]);

function KeyCombo({ keys }: { keys: string[] }) {
  const isSimultaneous = keys.some((k) => modifierKeys.has(k));
  const separator = isSimultaneous ? "+" : "→";

  return (
    <div className="flex items-center gap-1.5">
      {keys.map((key, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted text-xs">{separator}</span>}
          <kbd className="px-1.5 py-0.5 text-xs font-mono bg-surface border border-border rounded min-w-[1.5rem] text-center inline-block">
            {key}
          </kbd>
        </span>
      ))}
    </div>
  );
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="space-y-6 max-h-[60vh] overflow-y-auto">
        {shortcutGroups.map((group) => (
          <div key={group.title}>
            <h4 className="text-sm font-semibold text-muted mb-2">{group.title}</h4>
            <div className="space-y-2">
              {group.shortcuts.map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{shortcut.description}</span>
                  <KeyCombo keys={shortcut.keys} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted mt-4 pt-4 border-t border-border">
        Press <kbd className="px-1 py-0.5 text-xs font-mono bg-surface border border-border rounded">?</kbd> anywhere to show this help.
      </p>
    </Modal>
  );
}
