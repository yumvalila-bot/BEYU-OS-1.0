"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type ContentRow = {
  id: string;
  kind: string;
  title: string;
  slug: string;
  summary: string;
  classification: string;
  status: string;
  createdBy: string;
  approvedBy: string | null;
  publishedAt: string | null;
  startsAt: string | null;
  location: string | null;
};

type Props = {
  items: ContentRow[];
  currentUserId: string;
  canApprove: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function PublicContentComposer({ items, currentUserId, canApprove }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<"NEWS" | "EVENT">("NEWS");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [classification, setClassification] = useState<"PUBLIC" | "INTERNAL" | "CONFIDENTIAL">("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/public-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `pub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
        body: JSON.stringify({
          kind,
          title,
          slug: slug || slugify(title),
          summary,
          body,
          location: location.trim() || null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          classification,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "err", text: data?.error?.message ?? data?.message ?? "Failed to create draft." });
      } else {
        setTitle("");
        setSlug("");
        setSummary("");
        setBody("");
        setLocation("");
        setStartsAt("");
        setMessage({ kind: "ok", text: "Draft created. Submit PUBLIC items for independent approval." });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "err", text: "Network error while creating draft." });
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(id: string, action: "submit" | "archive") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/public-content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "err", text: data?.error?.message ?? data?.message ?? `Failed to ${action} item.` });
      } else {
        setMessage({
          kind: "ok",
          text:
            action === "submit"
              ? "Submitted for independent approval. A different authorized approver must approve publication."
              : "Item archived and removed from the public feed.",
        });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "err", text: "Network error while updating item." });
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/public-content/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ kind: "err", text: data?.error?.message ?? data?.message ?? "Approval action failed." });
      } else {
        setMessage({
          kind: "ok",
          text: decision === "APPROVE" ? "Approved and published to BEYU public news." : "Returned to DRAFT for revision.",
        });
        router.refresh();
      }
    } catch {
      setMessage({ kind: "err", text: "Network error during approval action." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <form
        onSubmit={onCreate}
        style={{
          display: "grid",
          gap: "0.85rem",
          padding: "1.25rem",
          borderRadius: 12,
          border: "1px solid var(--border, #d9e2ef)",
          background: "var(--surface, #ffffff)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.05rem", color: "#0b1f4d" }}>Draft New Public News or Event</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value === "EVENT" ? "EVENT" : "NEWS")} required>
              <option value="NEWS">NEWS</option>
              <option value="EVENT">EVENT</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Classification (only PUBLIC can publish)
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL")}
              required
            >
              <option value="PUBLIC">PUBLIC</option>
              <option value="INTERNAL">INTERNAL</option>
              <option value="CONFIDENTIAL">CONFIDENTIAL</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
              minLength={4}
              maxLength={180}
              required
              placeholder="Institutional announcement title"
            />
          </label>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
            URL Slug
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              minLength={3}
              maxLength={180}
              required
              placeholder="institutional-announcement-title"
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          Summary
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            minLength={10}
            maxLength={400}
            required
            placeholder="Concise summary displayed on the BEYU homepage and /news."
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
          Full Body
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            minLength={20}
            maxLength={20000}
            required
            placeholder="Full approved institutional article or event brief."
          />
        </label>

        {kind === "EVENT" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.85rem" }}>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Event Date &amp; Time
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
              Location
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={180}
                placeholder="Dar es Salaam, Tanzania"
              />
            </label>
          </div>
        ) : null}

        {message ? (
          <p
            role={message.kind === "err" ? "alert" : "status"}
            style={{
              margin: 0,
              padding: "0.65rem 0.85rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              background: message.kind === "err" ? "#fef2f2" : "#ecfdf5",
              color: message.kind === "err" ? "#991b1b" : "#065f46",
              border: `1px solid ${message.kind === "err" ? "#fecaca" : "#a7f3d0"}`,
            }}
          >
            {message.text}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={busy}
            style={{
              background: "#0b1f4d",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "0.65rem 1.25rem",
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Saving..." : "Save Draft"}
          </button>
        </div>
      </form>

      <div style={{ display: "grid", gap: "0.85rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem", color: "#0b1f4d" }}>Publication Queue ({items.length})</h2>
        {items.length === 0 ? (
          <p style={{ margin: 0, color: "#475569", fontSize: "0.9rem" }}>
            No public news or event records have been authored in this tenant yet.
          </p>
        ) : (
          items.map((item) => {
            const isAuthor = item.createdBy === currentUserId;
            return (
              <article
                key={item.id}
                style={{
                  padding: "1rem 1.25rem",
                  borderRadius: 12,
                  border: "1px solid var(--border, #d9e2ef)",
                  background: "var(--surface, #ffffff)",
                  display: "grid",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.75rem", padding: "0.18rem 0.55rem", borderRadius: 999, background: "#eef3fb", color: "#0b1f4d" }}>
                      {item.kind}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "0.75rem", padding: "0.18rem 0.55rem", borderRadius: 999, background: "#fef9e7", color: "#8a6a12" }}>
                      {item.classification}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: "0.75rem", padding: "0.18rem 0.55rem", borderRadius: 999, background: "#f1f5f9", color: "#334155" }}>
                      {item.status}
                    </span>
                  </div>
                  <code style={{ fontSize: "0.76rem", color: "#64748b" }}>/news/{item.slug}</code>
                </div>

                <h3 style={{ margin: 0, fontSize: "1rem", color: "#0b1f4d" }}>{item.title}</h3>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "#475569" }}>{item.summary}</p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginTop: "0.25rem" }}>
                  {item.status === "DRAFT" && item.classification === "PUBLIC" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitAction(item.id, "submit")}
                      style={{ padding: "0.42rem 0.85rem", borderRadius: 7, border: "1px solid #0b1f4d", background: "#0b1f4d", color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
                    >
                      Submit for Independent Approval
                    </button>
                  ) : null}

                  {item.status === "PENDING_APPROVAL" && canApprove && !isAuthor ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decideApproval(item.id, "APPROVE")}
                        style={{ padding: "0.42rem 0.85rem", borderRadius: 7, border: "1px solid #065f46", background: "#065f46", color: "#fff", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
                      >
                        Approve &amp; Publish
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => decideApproval(item.id, "REJECT")}
                        style={{ padding: "0.42rem 0.85rem", borderRadius: 7, border: "1px solid #991b1b", background: "#fff", color: "#991b1b", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}
                      >
                        Return to Draft
                      </button>
                    </>
                  ) : null}

                  {item.status === "PENDING_APPROVAL" && isAuthor ? (
                    <span style={{ fontSize: "0.8rem", color: "#8a6a12" }}>
                      Awaiting independent review (Segregation of Duties prevents self-approval).
                    </span>
                  ) : null}

                  {item.status !== "ARCHIVED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => submitAction(item.id, "archive")}
                      style={{ padding: "0.42rem 0.85rem", borderRadius: 7, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", cursor: "pointer", fontSize: "0.82rem" }}
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
