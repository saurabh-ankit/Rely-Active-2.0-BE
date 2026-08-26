import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3002),

  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173,http://localhost:3000")
    .transform(value => value.split(",").map(origin => origin.trim())),

  // MySQL Database Configuration
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default("root"),
  DB_PASS: z.string().default("password"),
  DB_NAME: z.string().default("rely_active_2_0"),

  // Redis Configuration
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),

  // Rely Master SSO & JWT Security
  JWT_SECRET: z.string().default("rely_master_sso_super_secret_jwt_key_2026"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  SSO_MASTER_URL: z.string().default("http://localhost:3000"),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Winston Logger
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).default("info"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      "❌ Invalid environment configuration:\n" +
        parsed.error.issues
          .map(issue => `  - ${issue.path.join(".")}: ${issue.message}`)
          .join("\n")
    );
    process.exit(1);
  }

  const data = parsed.data;

  return Object.freeze({
    nodeEnv: data.NODE_ENV,
    isProduction: data.NODE_ENV === "production",
    isTest: data.NODE_ENV === "test",
    port: data.PORT,
    corsOrigins: data.CORS_ORIGINS,
    db: Object.freeze({
      host: data.DB_HOST,
      port: data.DB_PORT,
      username: data.DB_USER,
      password: data.DB_PASS,
      database: data.DB_NAME,
    }),
    redis: Object.freeze({
      host: data.REDIS_HOST,
      port: data.REDIS_PORT,
      password: data.REDIS_PASSWORD,
      db: data.REDIS_DB,
    }),
    jwt: Object.freeze({
      secret: data.JWT_SECRET,
      expiresIn: data.JWT_EXPIRES_IN,
    }),
    ssoMasterUrl: data.SSO_MASTER_URL,
    rateLimit: Object.freeze({
      windowMs: data.RATE_LIMIT_WINDOW_MS,
      max: data.RATE_LIMIT_MAX,
    }),
    logLevel: data.LOG_LEVEL,
  });
}

export const env = loadEnv();
export type Env = typeof env;
