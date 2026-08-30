import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt.guard";
import { TenantContext } from "../../common/security/tenant-context";
import { IdentityModule } from "../identity/identity.module";
import { CsrfOriginGuard } from "../../common/security/csrf-origin.guard";

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
          // Constrain to HS256 to prevent algorithm-confusion / alg:none attacks.
          algorithm: "HS256",
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    TenantContext,
    CsrfOriginGuard,
  ],
  exports: [
    AuthService,
    JwtModule,
    JwtAuthGuard,
    TenantContext,
    IdentityModule,
  ],
})
export class AuthModule {}
