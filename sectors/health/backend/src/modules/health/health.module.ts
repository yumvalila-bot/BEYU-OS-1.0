import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { GraphqlHealthResolver } from "./graphql.resolver";
import { IntegrationsModule } from "../integrations/integrations.module";

@Module({
  imports: [IntegrationsModule],
  controllers: [HealthController],
  providers: [HealthService, GraphqlHealthResolver],
})
export class HealthModule {}
