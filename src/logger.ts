import pino, { type Logger } from "pino";

export function logger(loglevel: string): Logger {
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
  return log;
}
