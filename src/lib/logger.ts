import pino, { type Logger } from "pino";

/**
 * Creates a new logger with the specified log level.
 *
 * This function uses the `pino` library to create a new logger. The log level, message key,
 * formatters, and redact options are set in the `pinoOptions` object. If the `NODE_ENV`
 * environment variable is set to 'production', the logger is created with these options.
 * Otherwise, it attempts to create a logger with pretty-printing enabled. If this fails,
 * it falls back to creating a logger without pretty-printing.
 *
 * @param loglevel - The log level to set for the logger.
 * @returns A new logger with the specified log level.
 */
export function logger(loglevel: string, scope?: string | undefined): Logger {
  let log: Logger;
  const pinoOptions = {
    level: loglevel,
    messageKey: "message",
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    redact: ["bitcoind.password"],
  };
  if (process.env.NODE_ENV === "production") {
    log = pino(pinoOptions);
  } else {
    try {
      const pretty = require("pino-pretty");
      log = pino(pinoOptions, pretty());
    } catch (error) {
      log = pino(pinoOptions);
    }
  }

  return scope ? log.child({ scope }) : log;
}
