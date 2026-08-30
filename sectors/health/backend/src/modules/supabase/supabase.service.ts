import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseConfig } from "../../config/supabase.config";

/**
 * Tables that are tenant-scoped (carry a tenant_id column). For these the proxy
 * always applies an explicit tenant filter bound to the authenticated actor,
 * so a caller can never read/write another tenant's rows even if the schema's
 * RLS were misconfigured (defence-in-depth at the application layer).
 */
const TENANT_SCOPED_TABLES = new Set<string>([
  "tenants",
  "profiles",
  "organization_members",
  "roles",
  "permissions",
  "audit_events",
  "documents",
  "fhir_resources",
  "nhif_claims",
]);

const ALLOWED_TABLES = [
  "patients",
  "appointments",
  "users",
  "organizations",
  "tenants",
  "organization_members",
  "profiles",
  "roles",
  "permissions",
  "audit_events",
  "documents",
  "fhir_resources",
  "nhif_claims",
] as const;

type AllowedTable = (typeof ALLOWED_TABLES)[number];

/** Authenticated caller identity resolved from the JWT by the guards. */
export interface ProxyActor {
  userId: string;
  role: string;
  permissions: string[];
  tenantId: string;
}

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | undefined;

  constructor(private supabaseConfig: SupabaseConfig) {
    this.client = supabaseConfig.getClient();
  }

  private ensureClient(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException(
        "Supabase client is not configured.",
      );
    }
    return this.client;
  }

  private validateTable(table: string): AllowedTable {
    if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
      throw new BadRequestException(
        `Table '${table}' is not allowed for proxy access.`,
      );
    }
    return table as AllowedTable;
  }

  private handleError(error: PostgrestError | null): void {
    if (!error) return;
    if (error.message?.toLowerCase().includes("no rows")) {
      throw new NotFoundException(error.message);
    }
    throw new InternalServerErrorException(error.message);
  }

  private tenantScoped(
    from: SupabaseClient,
    table: AllowedTable,
    actor: ProxyActor,
  ): any {
    const query = from.from(table) as any;
    if (TENANT_SCOPED_TABLES.has(table)) {
      return query.eq("tenant_id", actor.tenantId);
    }
    return query;
  }

  async getHealth() {
    const client = this.client;
    if (!client) {
      return {
        configured: false,
        connected: false,
        message: "Supabase client is not configured.",
      };
    }
    try {
      const { error } = await client
        .from("organizations")
        .select("id")
        .limit(1);
      return {
        configured: true,
        connected: !error,
        message: error
          ? `Supabase connection failed: ${error.message}`
          : "Supabase is reachable through the backend proxy.",
      };
    } catch (error) {
      return {
        configured: true,
        connected: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown Supabase health error.",
      };
    }
  }

  async fetchTable(
    actor: ProxyActor,
    table: string,
    options?: { limit?: number; orderBy?: string; ascending?: boolean },
  ) {
    const validated = this.validateTable(table);
    const client = this.ensureClient();
    let query = this.tenantScoped(client, validated, actor) as any;
    if (options?.orderBy) {
      query = query.order(options.orderBy, {
        ascending: options.ascending ?? false,
      });
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    const { data, error } = await query.select("*");
    if (error) this.handleError(error);
    return data ?? [];
  }

  async fetchRow(
    actor: ProxyActor,
    table: string,
    id: string,
    expand?: string,
  ) {
    const validated = this.validateTable(table);
    const client = this.ensureClient();
    let query: any = client
      .from(validated)
      .select(
        expand === "appointments" && validated === "patients"
          ? "*, appointments(*)"
          : "*",
      )
      .eq("id", id);
    if (TENANT_SCOPED_TABLES.has(validated)) {
      query = query.eq("tenant_id", actor.tenantId);
    }
    const { data, error } = await query.single();
    if (error) this.handleError(error);
    return data ?? null;
  }

  async createRow(
    actor: ProxyActor,
    table: string,
    payload: Record<string, unknown>,
  ) {
    const validated = this.validateTable(table);
    const client = this.ensureClient();
    // Bind the row to the actor's tenant; never trust a client-supplied tenant.
    const scopedPayload = TENANT_SCOPED_TABLES.has(validated)
      ? { ...payload, tenant_id: actor.tenantId }
      : payload;
    const { data, error } = await (client as any)
      .from(validated)
      .insert(scopedPayload)
      .select()
      .single();
    if (error) this.handleError(error);
    return data;
  }

  async updateRow(
    actor: ProxyActor,
    table: string,
    id: string,
    payload: Record<string, unknown>,
  ) {
    const validated = this.validateTable(table);
    const client = this.ensureClient();
    let query: any = (client as any)
      .from(validated)
      .update(payload)
      .eq("id", id);
    if (TENANT_SCOPED_TABLES.has(validated)) {
      query = query.eq("tenant_id", actor.tenantId);
    }
    const { data, error } = await query.select().single();
    if (error) this.handleError(error);
    return data;
  }

  async deleteRow(actor: ProxyActor, table: string, id: string) {
    const validated = this.validateTable(table);
    const client = this.ensureClient();
    let query: any = (client as any).from(validated).delete().eq("id", id);
    if (TENANT_SCOPED_TABLES.has(validated)) {
      query = query.eq("tenant_id", actor.tenantId);
    }
    const { error } = await query;
    if (error) this.handleError(error);
    return { deleted: true };
  }
}
