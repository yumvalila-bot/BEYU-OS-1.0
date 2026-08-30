import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { SupabaseService, ProxyActor } from "./supabase.service";
import { JwtAuthGuard } from "../auth/guards/jwt.guard";
import { TenantScopeGuard } from "../../common/security/tenant-scope.guard";
import { RequirePermission } from "../../common/security/require-permission.decorator";

/**
 * Authenticated, tenant-scoped data proxy. Every route requires a valid BEYU
 * JWT (JwtAuthGuard) and tenant isolation (TenantScopeGuard). The caller's
 * tenant is bound to all reads/writes, so cross-tenant access is denied unless
 * the actor holds tenant:switch authority.
 */
@ApiTags("supabase")
@ApiBearerAuth("access-token")
@Controller("api/supabase")
@UseGuards(JwtAuthGuard, TenantScopeGuard)
export class SupabaseController {
  constructor(private readonly supabaseService: SupabaseService) {}

  private actor(req: Request): ProxyActor {
    const user = req.user as ProxyActor;
    if (!user) {
      throw new Error("AUTH_REQUIRED");
    }
    return {
      userId: user.userId,
      role: user.role,
      permissions: user.permissions ?? [],
      tenantId: user.tenantId,
    };
  }

  @Get("health")
  @ApiOperation({ summary: "Check Supabase proxy health" })
  async health() {
    return this.supabaseService.getHealth();
  }

  @Get(":table")
  @RequirePermission("phi:read")
  @ApiOperation({ summary: "Fetch rows (authenticated, tenant-scoped)" })
  async fetchTable(
    @Req() req: Request,
    @Param("table") table: string,
    @Query("limit") limit?: string,
    @Query("orderBy") orderBy?: string,
    @Query("ascending") ascending?: string,
  ) {
    return this.supabaseService.fetchTable(this.actor(req), table, {
      limit: limit ? Number(limit) : undefined,
      orderBy,
      ascending: ascending === "true",
    });
  }

  @Get(":table/:id")
  @RequirePermission("phi:read")
  @ApiOperation({ summary: "Fetch a row by ID (authenticated, tenant-scoped)" })
  async fetchRow(
    @Req() req: Request,
    @Param("table") table: string,
    @Param("id") id: string,
    @Query("expand") expand?: string,
  ) {
    return this.supabaseService.fetchRow(this.actor(req), table, id, expand);
  }

  @Post(":table")
  @RequirePermission("phi:write")
  @ApiOperation({ summary: "Create a row (authenticated, tenant-bound)" })
  async createRow(
    @Req() req: Request,
    @Param("table") table: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.supabaseService.createRow(this.actor(req), table, payload);
  }

  @Put(":table/:id")
  @RequirePermission("phi:write")
  @ApiOperation({ summary: "Update a row (authenticated, tenant-scoped)" })
  async updateRow(
    @Req() req: Request,
    @Param("table") table: string,
    @Param("id") id: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.supabaseService.updateRow(this.actor(req), table, id, payload);
  }

  @Delete(":table/:id")
  @RequirePermission("phi:write")
  @ApiOperation({ summary: "Delete a row (authenticated, tenant-scoped)" })
  async deleteRow(
    @Req() req: Request,
    @Param("table") table: string,
    @Param("id") id: string,
  ) {
    return this.supabaseService.deleteRow(this.actor(req), table, id);
  }
}
