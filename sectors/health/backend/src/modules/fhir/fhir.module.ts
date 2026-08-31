import { Module } from "@nestjs/common";
import { FhirController } from "./fhir.controller";
import { FhirService } from "./fhir.service";
import { FhirRepository } from "./fhir.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
@Module({ imports:[IdentityModule,AuthModule], controllers:[FhirController], providers:[FhirService,FhirRepository], exports:[FhirService,FhirRepository] })
export class FhirModule {}
