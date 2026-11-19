import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Panel } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function PublicContentPage() {
  const access = await requireAccess("communications:broadcast.manage");
  if (!access.allowed) return <Panel kicker="Access denied" title="Public content publishing"><p>{access.reason}</p></Panel>;
  return withTenantDatabaseContext(access.principal, async () => {
    const rows = await db.select().from(publicContent).where(eq(publicContent.tenantId, access.principal.tenantId)).orderBy(desc(publicContent.updatedAt)).limit(100);
    return <div className="space-y-5">
      <header><div className="beyu-kicker">Communications · Publishing</div><h1 className="text-2xl font-semibold">News & Events Publishing</h1><p className="beyu-muted text-sm">Draft public updates, submit them for independent approval, and publish approved items to the BEYU homepage.</p></header>
      <Panel kicker="Governance" title="Publication rules"><p className="text-sm">New items start as DRAFT. Submit them for approval. A different authorized approver with MFA step-up must approve PUBLIC-classified content before it appears on the public site. Internal and confidential content never enters the public feed.</p></Panel>
      <Panel kicker="Content register" title="Recent items">
        <div className="space-y-2">{rows.length === 0 ? <p className="text-sm beyu-muted">No content has been created yet.</p> : rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><div><strong>{row.title}</strong><p className="beyu-muted text-xs">{row.kind} · {row.classification} · {row.status}</p></div><span className="text-xs beyu-muted">{row.updatedAt.toLocaleString()}</span></div>)}</div>
      </Panel>
    </div>;
  });
}
