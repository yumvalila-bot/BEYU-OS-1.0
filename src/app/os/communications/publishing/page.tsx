import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { PublicContentComposer } from "@/components/public-content-composer";

export const dynamic = "force-dynamic";

export default async function CommunicationsPublishingPage() {
  const principal = await requirePrincipal();
  const canApprove = principal.permissions.has("communications:broadcast.approve");

  const rows = await withTenantDatabaseContext(principal, async () =>
    db
      .select()
      .from(publicContent)
      .where(eq(publicContent.tenantId, principal.tenantId))
      .orderBy(desc(publicContent.updatedAt))
      .limit(100),
  );

  const items = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    classification: row.classification,
    status: row.status,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    location: row.location,
  }));

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "2rem 1.25rem", display: "grid", gap: "1.5rem" }}>
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.78rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#8a6a12", fontWeight: 700 }}>
            Communications Platform · Governed Public Publishing
          </p>
          <h1 style={{ margin: "0.25rem 0 0", fontSize: "1.6rem", color: "#0b1f4d" }}>Public News &amp; Events</h1>
          <p style={{ margin: "0.4rem 0 0", color: "#475569", fontSize: "0.92rem", maxWidth: 680 }}>
            Only explicitly PUBLIC-classified items independently approved by a second authorized approver appear on the public BEYU homepage and{" "}
            <Link href="/news" style={{ color: "#0b1f4d", fontWeight: 600 }}>/news</Link>.
          </p>
        </div>
        <Link href="/os/communications" style={{ color: "#0b1f4d", fontWeight: 600, fontSize: "0.9rem" }}>
          ← Back to Communications
        </Link>
      </header>

      <PublicContentComposer items={items} currentUserId={principal.userId} canApprove={canApprove} />
    </main>
  );
}
