import {
  IsString,
  IsOptional,
  IsIn,
  IsUUID,
  Matches,
  Length,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateAppointmentDto {
  @IsUUID(4)
  patient_id!: string;

  @IsOptional()
  @IsUUID(4)
  provider_id?: string;

  @IsOptional()
  @IsUUID(4)
  department_id?: string;

  @IsOptional()
  @IsIn(["outpatient", "inpatient", "followup", "emergency", "teleconsult"])
  kind?: "outpatient" | "inpatient" | "followup" | "emergency" | "teleconsult";

  /** ISO 8601 timestamp (appointment start). */
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, {
    message: "scheduled_for must be ISO 8601",
  })
  scheduled_for!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  duration_min?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  reason?: string;

  @IsOptional()
  @IsString()
  @Length(0, 4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  idempotency_key?: string;
}
