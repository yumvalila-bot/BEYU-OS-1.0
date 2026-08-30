import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { GraphqlHealthResolver } from "./graphql.resolver";

@Module({
  controllers: [HealthController],
  providers: [HealthService, GraphqlHealthResolver],
})
export class HealthModule {}
