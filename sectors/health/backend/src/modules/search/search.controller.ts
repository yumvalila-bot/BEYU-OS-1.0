import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { SearchService } from "./search.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { PermissionsGuard } from "../../common/security/permissions.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";
@ApiTags("search")
@ApiBearerAuth("access-token")
@Controller("api/search")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SearchController {
  constructor(private readonly svc: SearchService) {}
  @Get() @RequirePermission("patient:read") search(
    @Query("q") q: string,
    @Query("limit") l?: string,
  ) {
    return this.svc.search(q, l ? parseInt(l, 10) : 20);
  }
}
