import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe, BadRequestException } from "@nestjs/common";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { JsonLogger } from "./common/observability/json-logger";
import { DomainExceptionFilter } from "./common/errors/domain-exception.filter";
import { validateBootEnvironment } from "./common/security/boot-validation";
import { RateLimitExceptionFilter } from "./common/security/rate-limit-exception.filter";

/**
 * Fail-closed production configuration guard. In production the process must not
 * boot on known/development secrets. Values are never printed.
 */
const INSECURE_JWT_SECRETS = new Set([
  "dev-only-change-me",
  "your-secret-key",
  "your-refresh-secret",
]);

/**
 * External adapters that the system can reach. A missing endpoint/key is NOT
 * fatal (the adapter will surface as BLOCKED / EXTERNAL_DEPENDENCY_REQUIRED
 * and fail-closed on call), but we surface a clear non-secret diagnostic so
 * operators know at boot which integrations are disabled. We never log the
 * values themselves — only present/missing boolean status.
 */
const EXTERNAL_ADAPTER_ENV_VARS: Array<{
  key: string;
  required: boolean;
  adapter: string;
}> = [
  { key: "DATABASE_URL", required: true, adapter: "postgres" },
  { key: "JWT_SECRET", required: true, adapter: "auth" },
  { key: "JWT_REFRESH_SECRET", required: true, adapter: "auth" },
  { key: "JWT_ISSUER", required: true, adapter: "auth" },
  { key: "JWT_AUDIENCE", required: true, adapter: "auth" },
  { key: "SUPABASE_URL", required: false, adapter: "supabase" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", required: false, adapter: "supabase" },
  { key: "NHIF_API_BASE_URL", required: false, adapter: "nhif" },
  { key: "NHIF_API_KEY", required: false, adapter: "nhif" },
  { key: "TRA_API_BASE_URL", required: false, adapter: "tra" },
  { key: "TMDA_API_BASE_URL", required: false, adapter: "tmda" },
  { key: "PACS_BASE_URL", required: false, adapter: "pacs" },
  { key: "FHIR_ENDPOINT_BASE_URL", required: false, adapter: "fhir_endpoint" },
  { key: "MTUHA_API_BASE_URL", required: false, adapter: "mtuha_submission" },
  { key: "HIVE_API_BASE_URL", required: false, adapter: "hive" },
  {
    key: "PAYMENT_GATEWAY_BASE_URL",
    required: false,
    adapter: "payment_gateway",
  },
];

function redact(v?: string): string {
  if (!v) return "MISSING";
  return "CONFIGURED"; // never echo the value
}

function assertProductionConfig(): void {
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  for (const { key, required, adapter } of EXTERNAL_ADAPTER_ENV_VARS) {
    if (!process.env[key]) {
      (required ? missingRequired : missingOptional).push(`${adapter}(${key})`);
    }
  }
  const jwtSecret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (jwtSecret && INSECURE_JWT_SECRETS.has(jwtSecret))
    missingRequired.push("auth(JWT_SECRET=default/insecure)");
  if (refreshSecret && INSECURE_JWT_SECRETS.has(refreshSecret))
    missingRequired.push("auth(JWT_REFRESH_SECRET=default/insecure)");

  if ((process.env.NODE_ENV ?? "development") === "production") {
    if (missingRequired.length) {
      throw new Error(
        `FATAL: production boot refused — mandatory config missing/insecure: ${missingRequired.join(", ")}`,
      );
    }
    const cors = (process.env.CORS_ORIGIN ?? "")
      .split(",")
      .map((o) => o.trim());
    const invalidCors =
      cors.length === 0 ||
      cors.some((o) => !o || o === "*" || /^https?:\/\/localhost(:|$)/.test(o));
    if (invalidCors) {
      throw new Error(
        "FATAL: CORS_ORIGIN must be explicit, non-wildcard, non-localhost in production.",
      );
    }
  } else {
    // In non-production, fail closed only on absolute must-haves (e.g. JWT) and
    // warn about the rest. We do NOT start silent-success with insecure JWT.
    if (
      jwtSecret &&
      INSECURE_JWT_SECRETS.has(jwtSecret) &&
      process.env.JWT_SECRET
    ) {
      // allow dev default but log
      // eslint-disable-next-line no-console
      console.warn(
        "WARN: JWT_SECRET is a dev default; set a strong secret for production.",
      );
    }
  }

  // Non-secret diagnostic: list which adapters are configured vs missing.
  // eslint-disable-next-line no-console
  console.info("BOOT adapter configuration (no secrets):");
  for (const { key, adapter } of EXTERNAL_ADAPTER_ENV_VARS) {
    // eslint-disable-next-line no-console
    console.info(
      `  ${adapter.padEnd(18)} ${key.padEnd(32)} ${redact(process.env[key])}`,
    );
  }
  if (missingOptional.length) {
    // eslint-disable-next-line no-console
    console.info(
      `Adapters not configured (will fail-closed as BLOCKED): ${missingOptional.join(", ")}`,
    );
  }
}

async function bootstrap() {
  assertProductionConfig();
  const boot = validateBootEnvironment(process.env);
  if (!boot.ok) {
    // eslint-disable-next-line no-console
    console.error("BOOT VALIDATION FAILED — refusing to start:", boot.errors);
    process.exit(1);
  }
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  const configService = app.get(ConfigService);

  // Security middleware. CSP is strict: connect-src 'self' supports the
  // same-origin Vercel edge proxy architecture. No inline scripts in prod.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"], // Swagger UI requires inline styles
          "img-src": ["'self'", "data:", "blob:"],
          "connect-src": ["'self'"],
          "font-src": ["'self'", "data:"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'self'"],
          "form-action": ["'self'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-site" },
      crossOriginEmbedderPolicy: false, // Swagger UI loads external fonts via data:
    }),
  );
  app.use(compression());
  app.use(cookieParser());

  // CORS configuration
  app.enableCors({
    origin: configService.get("CORS_ORIGIN", "*"),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      // Map class-validator errors to a BadRequestException whose payload is
      // shaped like DomainError; the global filter normalises both.
      exceptionFactory: (errors) => {
        const fields: Record<string, string[]> = {};
        for (const e of errors) {
          if (e.constraints) {
            fields[e.property] = Object.values(e.constraints);
          }
          for (const child of e.children ?? []) {
            const key = `${e.property}.${child.property}`;
            fields[key] = Object.values(child.constraints ?? {});
          }
        }
        return new BadRequestException({
          code: "VALIDATION",
          message: "Validation failed",
          details: { fields },
        });
      },
    }),
  );

  // Global exception filters: rate-limit (Retry-After) first, then DomainError.
  app.useGlobalFilters(
    new RateLimitExceptionFilter(),
    new DomainExceptionFilter(),
  );

  // Enable shutdown hooks so Bull/cache pools drain cleanly.
  app.enableShutdownHooks();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("BEYU Health OS API")
    .setDescription("Enterprise Healthcare API Documentation")
    .setVersion("1.0.0")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "access-token",
    )
    .addTag("auth", "Authentication endpoints")
    .addTag("patients", "Patient management")
    .addTag("clinical", "Clinical data")
    .addTag("appointments", "Appointment scheduling")
    .addTag("billing", "Billing and payments")
    .addTag("lab", "Laboratory services")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = configService.get("PORT", 3000);
  await app.listen(port);
  logger.log(`API running`, {
    service: "beyu-health-os",
    port,
    env: process.env.NODE_ENV ?? "development",
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
