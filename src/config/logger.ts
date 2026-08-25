import path from "node:path";

import winston from "winston";

import { env } from "./env";

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const consoleFormat = combine(
  errors({ stack: true }),
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  printf(({ level, message, timestamp: ts, requestId, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    const reqId = requestId ? ` [${requestId}]` : "";
    return `${ts} ${level}${reqId}: ${message}${rest}`;
  })
);

const fileFormat = combine(errors({ stack: true }), timestamp(), json());

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: env.isProduction ? fileFormat : consoleFormat,
  }),
];

if (env.isProduction) {
  transports.push(
    new winston.transports.File({
      filename: path.join("logs", "error.log"),
      level: "error",
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: path.join("logs", "combined.log"),
      format: fileFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: env.logLevel,
  transports,
  exitOnError: false,
});
