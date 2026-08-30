import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Req,
  Res,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request, Response } from "express";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto, LogoutDto } from "./dto";
import { JwtAuthGuard } from "./guards/jwt.guard";
import { CsrfOriginGuard } from "../../common/security/csrf-origin.guard";

const REFRESH_COOKIE = "beyu_refresh";
const REFRESH_TTL_MS = Number(process.env.JWT_REFRESH_TTL_MS ?? 604800000);

/**
 * Authentication endpoints. The refresh token is set as an httpOnly, SameSite
 * cookie (never readable by browser JS) and rotated on each refresh. The access
 * token is returned in the body and held in memory by the client.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Register a new user" })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Login with email and password" })
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(loginDto, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user: tokens.user };
  }

  @Post("refresh")
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate refresh token (with reuse detection)" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.readRefreshToken(req);
    const tokens = await this.authService.refreshToken(
      { refreshToken },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post("restore")
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Restore a session from the refresh cookie" })
  async restore(@Req() req: Request) {
    const refreshToken = this.readRefreshToken(req);
    const result = await this.authService.restoreSession(refreshToken);
    return result;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Get current user profile" })
  async me(@Req() req: Request) {
    const userId = (req.user as { userId: string }).userId;
    return this.authService.getProfile(userId);
  }

  @Post("logout")
  @UseGuards(CsrfOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Logout (revoke the session and clear cookie)" })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() logoutDto: LogoutDto,
  ) {
    const refreshToken = logoutDto.refreshToken ?? this.readRefreshToken(req);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { message: "Logged out successfully" };
  }

  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Logout everywhere (invalidate all sessions)" })
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = (req.user as { userId: string }).userId;
    await this.authService.logoutAll(userId);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { message: "All sessions revoked" };
  }

  private readRefreshToken(req: Request): string {
    const fromCookie =
      (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? "";
    if (fromCookie) return fromCookie;
    // Fallback: allow a body-supplied refresh token (mobile clients).
    const body = (req.body as { refreshToken?: string } | undefined) ?? {};
    if (body.refreshToken) return body.refreshToken;
    throw new UnauthorizedException("REFRESH_TOKEN_REQUIRED");
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOptions());
  }

  private cookieOptions() {
    const secure = process.env.NODE_ENV === "production";
    return {
      httpOnly: true,
      secure,
      sameSite: "lax" as const,
      path: "/",
      maxAge: Math.floor(REFRESH_TTL_MS / 1000),
    };
  }
}
