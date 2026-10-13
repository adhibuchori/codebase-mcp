/** A tiny console logger with printf-style placeholders. */
export const logger = {
  error: (message: string, ...values: unknown[]) => console.error(message, ...values),
  info: (message: string, ...values: unknown[]) => console.info(message, ...values),
};
