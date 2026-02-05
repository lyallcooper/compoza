"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface TerminalSocketState {
  status: ConnectionStatus;
  error: string | null;
  shell: string | null;
}

export interface UseTerminalSocketOptions {
  containerId: string;
  onData: (data: string) => void;
  onStarted?: () => void;
  onEnd?: () => void;
}

export interface TerminalSocketActions {
  sendInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  reconnect: () => void;
  stop: () => void;
}

/**
 * Hook for managing terminal WebSocket connections via Socket.IO.
 * Handles connection lifecycle, data streaming, and resize events.
 */
export function useTerminalSocket({
  containerId,
  onData,
  onStarted,
  onEnd,
}: UseTerminalSocketOptions): [TerminalSocketState, TerminalSocketActions] {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [shell, setShell] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Use refs for callbacks to avoid recreating socket on callback changes
  const onDataRef = useRef(onData);
  const onStartedRef = useRef(onStarted);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onDataRef.current = onData;
    onStartedRef.current = onStarted;
    onEndRef.current = onEnd;
  }, [onData, onStarted, onEnd]);

  const connect = useCallback(() => {
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
      setShell(null);
      socket.emit("exec:start", { containerId });
    });

    socket.on("exec:started", (data?: { shell?: string }) => {
      setStatus("connected");
      setShell(data?.shell ?? null);
      onStartedRef.current?.();
    });

    socket.on("exec:data", (data: string) => {
      onDataRef.current(data);
    });

    socket.on("exec:error", (data: { message: string }) => {
      setStatus("error");
      setError(data.message);
    });

    socket.on("exec:end", () => {
      setStatus("disconnected");
      onEndRef.current?.();
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setStatus("error");
      setError("Failed to connect to server");
    });

    return socket;
  }, [containerId]);

  useEffect(() => {
    const socket = connect();

    // Send keepalive ping every 5 minutes to prevent session timeout
    const keepaliveInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit("exec:ping");
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(keepaliveInterval);
      socket.emit("exec:stop");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  const sendInput = useCallback((data: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("exec:input", data);
    }
  }, []);

  const resize = useCallback((cols: number, rows: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("exec:resize", { cols, rows });
    }
  }, []);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      setStatus("connecting");
      setError(null);
      socketRef.current.connect();
    }
  }, []);

  const stop = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("exec:stop");
    }
  }, []);

  return [
    { status, error, shell },
    { sendInput, resize, reconnect, stop },
  ];
}
