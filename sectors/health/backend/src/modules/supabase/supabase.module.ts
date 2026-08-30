import { Module } from "@nestjs/common";
import { SupabaseController } from "./supabase.controller";
import { SupabaseService } from "./supabase.service";
import { AuthModule } from "../auth/auth.module";
import { TenantScopeGuard } from "../../common/security/tenant-scope.guard";
import { SupabaseConfig } from "../../config/supabase.config";

@Module({
  imports: [AuthModule],
  controllers: [SupabaseController],
  providers: [SupabaseService, SupabaseConfig, TenantScopeGuard],
  exports: [SupabaseService],
})
export class SupabaseModule {}
