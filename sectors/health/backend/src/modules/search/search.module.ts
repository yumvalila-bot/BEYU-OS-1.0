import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { SearchRepository } from "./search.repository";
import { IdentityModule } from "../identity/identity.module";
import { AuthModule } from "../auth/auth.module";
@Module({
  imports: [IdentityModule, AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchRepository],
  exports: [SearchService, SearchRepository],
})
export class SearchModule {}
