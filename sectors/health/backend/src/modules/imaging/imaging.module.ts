import { Module } from "@nestjs/common";
import { ImagingController } from "./imaging.controller";
import {
  CriticalFindingRepository,
  ImagingSeriesRepository,
  ImagingService,
  ImagingStudyRepository,
  ReportAddendumRepository,
  WorklistRepository,
} from "./imaging.service";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";

/**
 * Imaging study registry. Reports and orders stay in RadiologyModule; this
 * module owns the DICOM-level metadata, addenda, critical findings and the
 * modality worklist. No pixel data is stored anywhere in it.
 */
@Module({
  imports: [IdentityModule, AuthModule, AuditModule, EventsModule],
  controllers: [ImagingController],
  providers: [
    ImagingService,
    ImagingStudyRepository,
    ImagingSeriesRepository,
    ReportAddendumRepository,
    CriticalFindingRepository,
    WorklistRepository,
  ],
  exports: [ImagingService, ImagingStudyRepository],
})
export class ImagingModule {}
