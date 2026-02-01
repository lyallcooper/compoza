"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { io, Socket } from "socket.io-client";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  containerId: string;
  className?: string;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function Terminal({ containerId, className = "" }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);

  const handleResize = useCallback(() => {
    if (fitAddonRef.current && termRef.current && socketRef.current?.connected) {
      fitAddonRef.current.fit();
      socketRef.current.emit("exec:resize", {
        cols: termRef.current.cols,
        rows: termRef.current.rows,
      });
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
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
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to socket
    const socket = io({
      path: "/socket.io",
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connecting");
      setError(null);
      term.clear();
      term.writeln("Connecting to container...");

      // Start exec session
      socket.emit("exec:start", { containerId });
    });

    socket.on("exec:started", () => {
      setStatus("connected");
      term.clear();
      // Send resize after connection
      socket.emit("exec:resize", {
        cols: term.cols,
        rows: term.rows,
      });
    });

    socket.on("exec:data", (data: string) => {
      term.write(data);
    });

    socket.on("exec:error", (data: { message: string }) => {
      setStatus("error");
      setError(data.message);
      term.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m`);
    });

    socket.on("exec:end", () => {
      setStatus("disconnected");
      term.writeln("\r\n\x1b[33mSession ended.\x1b[0m");
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
      term.writeln("\r\n\x1b[33mDisconnected from server.\x1b[0m");
    });

    socket.on("connect_error", () => {
      setStatus("error");
      setError("Failed to connect to server");
    });

    // Handle terminal input
    term.onData((data) => {
      if (socket.connected) {
        socket.emit("exec:input", data);
      }
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
      socket.emit("exec:stop");
      socket.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
  }, [containerId, handleResize]);

  const handleReconnect = () => {
    if (socketRef.current) {
      setStatus("connecting");
      setError(null);
      socketRef.current.connect();
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border text-sm">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "connected"
                ? "bg-success"
                : status === "connecting"
                ? "bg-warning animate-pulse"
                : "bg-error"
            }`}
          />
          <span className="text-muted">
            {status === "connected"
              ? "Connected"
              : status === "connecting"
              ? "Connecting..."
              : status === "error"
              ? error || "Error"
              : "Disconnected"}
          </span>
        </div>
        {(status === "disconnected" || status === "error") && (
          <button
            onClick={handleReconnect}
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
