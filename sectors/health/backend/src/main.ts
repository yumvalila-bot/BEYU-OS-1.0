import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { JsonLogger } from "./common/observability/json-logger";

/**
 * Fail-closed production configuration guard. In production the process must not
 * boot on known/development secrets. Values are never printed.
 */
const INSECURE_JWT_SECRETS = new Set([
  "dev-only-change-me",
  "your-secret-key",
  "your-refresh-secret",
]);

function assertProductionConfig(): void {
  if ((process.env.NODE_ENV ?? "development") !== "production") return;
  const jwtSecret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtSecret || INSECURE_JWT_SECRETS.has(jwtSecret)) {
    throw new Error(
      "FATAL: JWT_SECRET must be a strong, non-default secret when NODE_ENV=production.",
    );
  }
  if (!refreshSecret || INSECURE_JWT_SECRETS.has(refreshSecret)) {
    throw new Error(
      "FATAL: JWT_REFRESH_SECRET must be a strong, non-default secret when NODE_ENV=production.",
    );
  }
  // Issuer and audience are REQUIRED in production: the JWT signing options
  // reject an undefined issuer/audience, and issuing tokens without them would
  // weaken validation. Fail closed at boot with a clear message instead of a
  // runtime 500 on login.
  if (!process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE) {
    throw new Error(
      "FATAL: JWT_ISSUER and JWT_AUDIENCE must be configured when NODE_ENV=production.",
    );
  }
  const cors = (process.env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim());
  const invalidCors =
    cors.length === 0 ||
    cors.some((o) => !o || o === "*" || /^https?:\/\/localhost(:|$)/.test(o));
  if (invalidCors) {
    throw new Error(
      "FATAL: CORS_ORIGIN must be an explicit, non-wildcard, non-localhost allow-list when NODE_ENV=production.",
    );
  }
}

async function bootstrap() {
  assertProductionConfig();
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  const configService = app.get(ConfigService);

  // Security middleware
  app.use(helmet());
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
    }),
  );

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
