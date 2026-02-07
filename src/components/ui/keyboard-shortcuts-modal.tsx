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
    title: "Navigation",
    shortcuts: [
      { keys: ["g", "h"], description: "Go to Dashboard" },
      { keys: ["g", "p"], description: "Go to Projects" },
      { keys: ["g", "c"], description: "Go to Containers" },
      { keys: ["g", "i"], description: "Go to Images" },
      { keys: ["g", "n"], description: "Go to Networks" },
      { keys: ["g", "v"], description: "Go to Volumes" },
      { keys: ["g", "s"], description: "Go to System" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["Esc"], description: "Close modal / Cancel" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: ["Cmd", "S"], description: "Save changes" },
    ],
  },
  {
    title: "Help",
    shortcuts: [
      { keys: ["?"], description: "Show this help" },
    ],
  },
];

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <div className="flex items-center gap-1">
      {keys.map((key, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted mx-0.5">+</span>}
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
