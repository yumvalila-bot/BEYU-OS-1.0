import {
  IsString,
  IsOptional,
  IsIn,
  IsBoolean,
  IsEmail,
  Matches,
  Length,
} from "class-validator";

export class CreatePatientDto {
  @IsString()
  @Length(1, 64)
  medical_record!: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  title?: string;

  @IsString()
  @Length(1, 128)
  given_name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 128)
  middle_name?: string;

  @IsString()
  @Length(1, 128)
  family_name!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dob must be YYYY-MM-DD" })
  dob?: string;

  @IsOptional()
  @IsIn(["male", "female", "other", "unknown"])
  sex?: "male" | "female" | "other" | "unknown";

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address_line?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  id_type?: string;

  @IsOptional()
  @IsString()
  id_number?: string;

  @IsOptional()
  @IsString()
  next_of_kin_name?: string;

  @IsOptional()
  @IsString()
  next_of_kin_phone?: string;

  @IsOptional()
  @IsString()
  next_of_kin_relation?: string;

  @IsOptional()
  @IsString()
  blood_type?: string;

  @IsOptional()
  @IsBoolean()
  allergies_known?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
