"use client";

import { useEffect, useRef, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket, ConnectionStatus } from "@/hooks";

interface TerminalProps {
  containerId: string;
  className?: string;
}

const terminalTheme = {
  background: "#0d1117",
  foreground: "#e6edf3",
  cursor: "#58a6ff",
  cursorAccent: "#0d1117",
  selectionBackground: "#388bfd44",
  black: "#484f58",
  red: "#ff7b72",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

function getStatusDisplay(status: ConnectionStatus, error: string | null): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "error":
      return error || "Error";
    case "disconnected":
      return "Disconnected";
  }
}

function getStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "bg-success";
    case "connecting":
      return "bg-warning animate-pulse";
    default:
      return "bg-error";
  }
}

export function Terminal({ containerId, className = "" }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const handleData = useCallback((data: string) => {
    termRef.current?.write(data);
  }, []);

  const handleStarted = useCallback(() => {
    termRef.current?.clear();
  }, []);

  const handleEnd = useCallback(() => {
    termRef.current?.writeln("\r\n\x1b[33mSession ended.\x1b[0m");
  }, []);

  const [{ status, error, shell }, { sendInput, resize, reconnect }] = useTerminalSocket({
    containerId,
    onData: handleData,
    onStarted: handleStarted,
    onEnd: handleEnd,
  });

  // Handle resize
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && termRef.current) {
      fitAddonRef.current.fit();
      resize(termRef.current.cols, termRef.current.rows);
    }
  }, [resize]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: terminalTheme,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    term.onData((data) => {
      sendInput(data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sendInput, handleResize]);

  // Write status messages to terminal
  useEffect(() => {
    if (!termRef.current) return;

    if (status === "connecting") {
      termRef.current.clear();
      termRef.current.writeln("Connecting to container...");
    } else if (status === "disconnected") {
      termRef.current.writeln("\r\n\x1b[33mDisconnected from server.\x1b[0m");
    } else if (status === "error" && error) {
      termRef.current.writeln(`\r\n\x1b[31mError: ${error}\x1b[0m`);
    } else if (status === "connected") {
      // Send resize after connection
      handleResize();
    }
  }, [status, error, handleResize]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border text-sm">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
          <span className="text-muted">{getStatusDisplay(status, error)}</span>
          {status === "connected" && shell && (
            <>
              <span className="text-muted">·</span>
              <span className="text-muted font-mono">{shell.split("/").pop()}</span>
            </>
          )}
        </div>
        {(status === "disconnected" || status === "error") && (
          <button
            onClick={reconnect}
            className="text-accent hover:underline"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#0d1117] p-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
