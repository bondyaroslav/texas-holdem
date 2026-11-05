export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Console-backed logger for the browser. Swap this implementation to ship
 * logs to a backend once one exists — callers only depend on `Logger`.
 */
function createConsoleLogger(isDev: boolean): Logger {
  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (level === 'debug' && !isDev) {
      return;
    }
    console[level](`[${level}] ${message}`, context ?? {});
  };

  return {
    debug: (message, context) => {
      log('debug', message, context);
    },
    info: (message, context) => {
      log('info', message, context);
    },
    warn: (message, context) => {
      log('warn', message, context);
    },
    error: (message, context) => {
      log('error', message, context);
    },
  };
}

export const logger: Logger = createConsoleLogger(import.meta.env.DEV);
