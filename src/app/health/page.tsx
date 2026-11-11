import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";

export const metadata: Metadata = { title: "Health OS" };

/**
 * Health's database is the authority for Health identity links, accounts,
 * tenant mapping and membership. This route verifies only BEYU authentication;
 * the mounted SPA obtains a one-use BEYU assertion and exchanges it with the
 * Health backend, which independently authorizes the local actor.
 */
export default async function HealthOSPage() {
  const principal = await resolvePrincipal();
  if (!principal) redirect("/");
  redirect("/os/health");
}
