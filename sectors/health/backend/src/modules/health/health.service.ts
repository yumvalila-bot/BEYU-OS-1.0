import {
  Injectable,
  ServiceUnavailableException,
  Inject,
} from "@nestjs/common";
import { DB_CONNECTION, type DbConnection } from "../identity/db-connection";

/**
 * Health endpoints. Two distinct signals:
 *  - /health/live  → liveness: the process is up and serving. Never depends on
 *    downstream services (a dead dependency must NOT kill the liveness signal
 *    that orchestrators use to restart/scale).
 *  - /health/ready → readiness: the process can serve real traffic, which
 *    requires the database. Fail-closed: any DB error ⇒ NOT ready (HTTP 503).
 *    No secrets, tokens, or PII are ever returned.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(DB_CONNECTION) private readonly db: DbConnection) {}

  async check() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async checkReadiness() {
    const dbStatus = await this.dbStatus();
    if (dbStatus !== "up") {
      throw new ServiceUnavailableException({
        status: "not_ready",
        checks: { database: dbStatus },
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: "ready",
      checks: { database: dbStatus },
      timestamp: new Date().toISOString(),
    };
  }

  async checkLiveness() {
    return {
      status: "alive",
      timestamp: new Date().toISOString(),
    };
  }

  private async dbStatus(): Promise<"up" | "down"> {
    try {
      await this.db.query("SELECT 1");
      return "up";
    } catch {
      return "down";
    }
  }
}
