import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseConfig {
  private supabase: SupabaseClient | undefined;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>("SUPABASE_URL");
    const key = this.configService.get<string>("SUPABASE_SERVICE_KEY");
    if (url && key) {
      this.supabase = createClient(url, key);
    }
  }

  getClient(): SupabaseClient | undefined {
    return this.supabase;
  }

  getUrl(): string | undefined {
    return this.configService.get<string>("SUPABASE_URL");
  }

  getServiceKey(): string | undefined {
    return this.configService.get<string>("SUPABASE_SERVICE_KEY");
  }

  /**
   * The public anon key. Used to build a per-request USER-CONTEXT client bound to
   * the authenticated user's access token so that Postgres RLS applies. The
   * service-role key is never used for app traffic.
   */
  getAnonKey(): string | undefined {
    return this.configService.get<string>("SUPABASE_ANON_KEY");
  }
}
