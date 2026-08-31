import { IsIn, IsOptional, IsString } from "class-validator";

export class CompleteEncounterDto {
  @IsIn(["discharged", "admitted", "referred", "died", "absconded", "ama"])
  disposition!: "discharged" | "admitted" | "referred" | "died" | "absconded" | "ama";

  @IsOptional() @IsString()
  present_illness?: string;
}
