"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

const MAX_LOG_LINES = 10000;

interface LogViewerProps {
  url: string;
  className?: string;
}

export function LogViewer({ url, className = "" }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setLogs([]);
    setError(null);
    setConnected(false);

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          setError(data.error);
          setConnected(false);
        } else if (data.line) {
          setLogs((prev) => {
            const newLogs = [...prev, data.line];
            return newLogs.length > MAX_LOG_LINES ? newLogs.slice(-MAX_LOG_LINES) : newLogs;
          });
        }
      } catch {
        setLogs((prev) => {
          const newLogs = [...prev, event.data];
          return newLogs.length > MAX_LOG_LINES ? newLogs.slice(-MAX_LOG_LINES) : newLogs;
        });
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError("Connection lost");
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [url]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-success" : "bg-error"
            }`}
          />
          <span className="text-muted">
            {connected ? "Connected" : error || "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-accent"
            />
            Auto-scroll
          </label>
          <Button size="sm" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-background p-2 font-mono text-xs"
      >
        {logs.length === 0 ? (
          <div className="text-muted">Waiting for logs...</div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all hover:bg-surface">
              {formatLogLine(line)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatLogLine(line: string): React.ReactNode {
  // Try to parse timestamp from docker logs format
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s/);

  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const rest = line.slice(timestampMatch[0].length);

    // Format timestamp
    const date = new Date(timestamp);
    const formatted = date.toLocaleTimeString();

    return (
      <>
        <span className="text-muted">{formatted}</span>
        <span> {rest}</span>
      </>
    );
  }

  return line;
}
