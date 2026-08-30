import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  organizationId?: string;
  licenceNumber?: string;
  permissions?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const issuer = configService.get<string>("JWT_ISSUER");
    const audience = configService.get<string>("JWT_AUDIENCE");
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_SECRET", "dev-only-change-me"),
      // Enforced only when configured (backward compatible, stronger in prod).
      issuer: issuer || undefined,
      audience: audience || undefined,
      // Constrain to HS256 to prevent algorithm-confusion / alg:none attacks.
      algorithms: ["HS256"],
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role ?? "patient",
      tenantId: payload.tenantId ?? "default",
      organizationId: payload.organizationId,
      licenceNumber: payload.licenceNumber,
      permissions: payload.permissions ?? [],
    };
  }
}
