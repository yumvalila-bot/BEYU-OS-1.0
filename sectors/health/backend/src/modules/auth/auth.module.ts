import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt.guard";
import { TenantContext } from "../../common/security/tenant-context";
import { IdentityModule } from "../identity/identity.module";
import { CsrfOriginGuard } from "../../common/security/csrf-origin.guard";
import { AuditService } from "../audit/audit.service";
import { RateLimiter } from "../../common/security/rate-limiter";

@Module({
  imports: [
    PassportModule,
    IdentityModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get("JWT_SECRET", "dev-only-change-me"),
        signOptions: {
          expiresIn: configService.get("JWT_EXPIRATION", "15m"),
          issuer: configService.get("JWT_ISSUER"),
          audience: configService.get("JWT_AUDIENCE"),
          algorithm: "HS256",
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, MfaController],
  providers: [
    AuthService,
    MfaService,
    JwtStrategy,
    JwtAuthGuard,
    TenantContext,
    CsrfOriginGuard,
    AuditService,
    RateLimiter,
  ],
  exports: [
    AuthService,
    MfaService,
    JwtModule,
    JwtAuthGuard,
    TenantContext,
    IdentityModule,
    RateLimiter,
  ],
})
export class AuthModule {}
