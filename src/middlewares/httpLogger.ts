import morgan from "morgan";

import { logger } from "../config/logger";

morgan.token("id", req => (req as { requestId?: string }).requestId ?? "-");

export const httpLogger = morgan(
  ":id :method :url :status :res[content-length] - :response-time ms",
  {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
  }
);
