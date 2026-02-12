/**
 * Simple structured logger for Compoza.
 * Provides consistent log levels and formatting.
 * Can be replaced with a proper logging library (Pino, Winston) if needed.
 */

import pc from "picocolors";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default to info level; can be configured via LOG_LEVEL env var
const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"] ?? LOG_LEVELS.info;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: pc.dim,
  info: pc.blue,
  warn: pc.yellow,
  error: pc.red,
};

function formatMessage(level: LogLevel, module: string, message: string, context?: LogContext): string {
  const timestamp = pc.dim(new Date().toISOString());
  const tag = LEVEL_COLORS[level](`[${level.toUpperCase()}]`);
  const mod = pc.cyan(`[${module}]`);
  const contextStr = context ? pc.dim(` ${JSON.stringify(context)}`) : "";
  return `${timestamp} ${tag} ${mod} ${message}${contextStr}`;
}

/**
 * Create a logger instance for a specific module.
 *
 * @example
 * const log = createLogger("Compose");
 * log.info("Starting project", { name: "my-project" });
 * // Output: 2024-01-15T10:30:00.000Z [INFO] [Compose] Starting project {"name":"my-project"}
 */
export function createLogger(module: string) {
  return {
    debug(message: string, context?: LogContext) {
      if (shouldLog("debug")) {
        console.debug(formatMessage("debug", module, message, context));
      }
    },

    info(message: string, context?: LogContext) {
      if (shouldLog("info")) {
        console.info(formatMessage("info", module, message, context));
      }
    },

    warn(message: string, context?: LogContext) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", module, message, context));
      }
    },

    error(message: string, error?: unknown, context?: LogContext) {
      if (shouldLog("error")) {
        const errorContext = error instanceof Error
          ? { ...context, error: error.message, stack: error.stack }
          : { ...context, error: String(error) };
        console.error(formatMessage("error", module, message, errorContext));
      }
    },
  };
}

// Pre-created loggers for common modules
export const log = {
  compose: createLogger("Compose"),
  docker: createLogger("Docker"),
  projects: createLogger("Projects"),
  registry: createLogger("Registry"),
  updates: createLogger("Updates"),
  api: createLogger("API"),
  server: createLogger("Server"),
};
