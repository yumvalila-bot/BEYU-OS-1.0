export default () => ({
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "3000"),

  // Database
  DB_HOST: process.env.DB_HOST || "localhost",
  DB_PORT: parseInt(process.env.DB_PORT || "5432"),
  DB_USERNAME: process.env.DB_USERNAME || "postgres",
  DB_PASSWORD: process.env.DB_PASSWORD || "password",
  DB_DATABASE: process.env.DB_DATABASE || "beyu_health",
  DB_LOGGING: process.env.DB_LOGGING === "true",

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "your-secret-key",
  JWT_EXPIRATION: process.env.JWT_EXPIRATION || "15m",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "your-refresh-secret",
  JWT_REFRESH_EXPIRATION: process.env.JWT_REFRESH_EXPIRATION || "7d",
  // Optional issuer/audience for stronger token validation. When set, both
  // signing and verification require them (enforced by JwtStrategy and
  // AuthContextMiddleware).
  JWT_ISSUER: process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379"),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"],

  // Integrations
  NHIF_API_URL: process.env.NHIF_API_URL,
  NHIF_API_KEY: process.env.NHIF_API_KEY,
  DHIS2_URL: process.env.DHIS2_URL,
  DHIS2_USERNAME: process.env.DHIS2_USERNAME,
  DHIS2_PASSWORD: process.env.DHIS2_PASSWORD,

  // Email
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587"),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM || "noreply@beyuhealth.com",

  // AI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4",

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
});
