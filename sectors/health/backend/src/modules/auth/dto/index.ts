import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;

  /** Optional tenant code; if omitted the server resolves the actor's tenant. */
  @IsOptional()
  @IsString()
  tenantCode?: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  full_name: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  /** Self-registration role is restricted server-side (defaults to patient). */
  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  tenantCode?: string;

  @IsOptional()
  @IsString()
  licenceNumber?: string;
}

export class RefreshTokenDto {
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
