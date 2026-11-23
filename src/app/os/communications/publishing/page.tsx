import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Panel } from "@/components/brand";
import { PublicContentComposer } from "@/components/public-content-composer";

export const dynamic = "force-dynamic";

export default async function PublicContentPage() {
  const access = await requireAccess("communications:broadcast.manage");
  if (!access.allowed) return <Panel kicker="Access denied" title="Public content publishing"><p>{access.reason}</p></Panel>;
  return withTenantDatabaseContext(access.principal, async () => {
    const rows = await db.select().from(publicContent).where(eq(publicContent.tenantId, access.principal.tenantId)).orderBy(desc(publicContent.updatedAt)).limit(100);
    return <div className="space-y-5">
      <header><div className="beyu-kicker">Communications · Publishing</div><h1 className="text-2xl font-semibold">News & Events Publishing</h1><p className="beyu-muted text-sm">Draft public updates, submit them for independent approval, and publish approved items to the BEYU homepage.</p></header>
      <Panel kicker="Governance" title="Publication rules"><p className="text-sm">New items start as DRAFT. Submit them for approval. A different authorized approver with MFA step-up must approve PUBLIC-classified content before it appears on the public site. Internal and confidential content never enters the public feed.</p></Panel>
      <Panel kicker="Publishing workspace" title="Create, submit and approve"><PublicContentComposer rows={rows.map(({ id, title, status, classification }) => ({ id, title, status, classification }))} /></Panel>
    </div>;
  });
}
