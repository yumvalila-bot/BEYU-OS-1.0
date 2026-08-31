import { IsIn } from "class-validator";

const TO_STATES = [
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;

export class TransitionAppointmentDto {
  @IsIn(TO_STATES as unknown as string[])
  to!: (typeof TO_STATES)[number];
}
