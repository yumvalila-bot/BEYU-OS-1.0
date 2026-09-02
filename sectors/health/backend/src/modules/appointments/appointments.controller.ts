import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiHeader,
} from "@nestjs/swagger";
import { AppointmentsService } from "./appointments.service";
import { CreateAppointmentDto } from "./dto/create-appointment.dto";
import { TransitionAppointmentDto } from "./dto/transition-appointment.dto";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
import { IDEMPOTENCY_KEY_HEADER } from "../../common/security/idempotency.constants";

@ApiTags("appointments")
@ApiBearerAuth("access-token")
@ApiHeader({
  name: IDEMPOTENCY_KEY_HEADER,
  required: false,
  description: "Idempotency key for safe retries",
})
@Controller("api/appointments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Get()
  @RequirePermission("appointment:read")
  @ApiOperation({ summary: "List appointments for a given date" })
  list(@Query("date") date: string, @Query("provider_id") providerId?: string) {
    return this.service.list(date, providerId);
  }

  @Get(":id")
  @RequirePermission("appointment:read")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermission("appointment:book")
  @ApiOperation({
    summary: "Book an appointment (double-booking protected, idempotent)",
  })
  create(@Body() dto: CreateAppointmentDto) {
    return this.service.create(dto);
  }

  @Post(":id/transition")
  @RequirePermission("appointment:transition")
  @ApiOperation({ summary: "Transition appointment lifecycle state" })
  transition(@Param("id") id: string, @Body() dto: TransitionAppointmentDto) {
    return this.service.transition(id, dto.to);
  }
}
