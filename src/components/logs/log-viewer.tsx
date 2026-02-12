"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui";
import { AnsiText } from "@/components/ui/ansi-text";
import { useEventSource } from "@/hooks";
import { formatTime } from "@/lib/format";

const MAX_LOG_LINES = 10000;
const SCROLL_THRESHOLD = 50;

interface LogMessage {
  line?: string;
  error?: string;
}

interface LogViewerProps {
  url: string;
  className?: string;
}

export function LogViewer({ url, className = "" }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);

  // Check if scrolled to bottom
  const isAtBottom = useCallback(() => {
    if (!containerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  }, []);

  const handleMessage = useCallback((data: LogMessage) => {
    if (data.error) return;
    if (data.line) {
      setLogs((prev) => {
        const newLogs = [...prev, data.line!];
        return newLogs.length > MAX_LOG_LINES ? newLogs.slice(-MAX_LOG_LINES) : newLogs;
      });
    }
  }, []);

  const handleOpen = useCallback(() => {
    setLogs([]);
    setIsFollowing(true);
    isFollowingRef.current = true;
  }, []);

  const { connected, error } = useEventSource<LogMessage>({
    url,
    onMessage: handleMessage,
    onOpen: handleOpen,
  });

  // Auto-scroll when following and new logs arrive
  useEffect(() => {
    if (isFollowingRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle user scroll - detach when scrolling up, reattach at bottom
  const handleScroll = useCallback(() => {
    const atBottom = isAtBottom();
    if (atBottom !== isFollowingRef.current) {
      isFollowingRef.current = atBottom;
      setIsFollowing(atBottom);
    }
  }, [isAtBottom]);

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
              checked={isFollowing}
              onChange={(e) => {
                const follow = e.target.checked;
                isFollowingRef.current = follow;
                setIsFollowing(follow);
                if (follow && containerRef.current) {
                  containerRef.current.scrollTop = containerRef.current.scrollHeight;
                }
              }}
              className="accent-accent"
            />
            Follow
          </label>
          <Button onClick={handleClear}>
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

    const date = new Date(timestamp);
    const formatted = formatTime(date);

    return (
      <>
        <span className="text-muted">{formatted}</span>
        <span> <AnsiText text={rest} /></span>
      </>
    );
  }

  return <AnsiText text={line} />;
}
