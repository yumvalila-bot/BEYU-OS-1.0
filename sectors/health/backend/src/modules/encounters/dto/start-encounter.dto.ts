import { IsString, IsOptional, IsIn, IsUUID } from "class-validator";

export class StartEncounterDto {
  @IsUUID(4)
  patient_id!: string;

  @IsOptional() @IsUUID(4)
  appointment_id?: string;

  @IsOptional() @IsUUID(4)
  provider_id?: string;

  @IsOptional() @IsUUID(4)
  department_id?: string;

  @IsOptional() @IsIn(["ambulatory", "inpatient", "emergency", "teleconsult", "domiciliary"])
  kind?: "ambulatory" | "inpatient" | "emergency" | "teleconsult" | "domiciliary";

  @IsOptional() @IsString()
  chief_complaint?: string;

  @IsOptional() @IsIn(["red", "orange", "yellow", "green", "blue"])
  triage_level?: "red" | "orange" | "yellow" | "green" | "blue";
}
