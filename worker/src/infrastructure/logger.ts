import type { Logger } from "@application/ports";

/**
 * Workers observability collects console output, so there is nothing to ship
 * logs to - structure is the only thing worth adding.
 */
export function consoleLogger(): Logger {
  return {
    info(message, fields) {
      console.log(JSON.stringify({ level: "info", message, ...fields }));
    },
    error(message, fields) {
      console.error(JSON.stringify({ level: "error", message, ...fields }));
    },
  };
}
