/**
 * Channel Registry — governed, extensible, NOT hard-coded in business logic.
 *
 * Preserves: GlobalUserID, RBAC/ABAC/RLS, audit, events.
 * Channels are configuration, not code. Future channels (Push, Voice, etc.)
 * can be added without rewriting core.
 */

import { db } from "@/db";
import { communicationChannels } from "@/db/schema";
import type { CommunicationChannel } from "./types";
import { COMMUNICATION_CHANNELS } from "./types";

export type ChannelRecord = typeof communicationChannels.$inferSelect;

const CANONICAL_CHANNELS: Record<string, { name: string; description: string; capabilities: string[]; inbound: boolean; media: boolean; templates: boolean }> = {
  WHATSAPP: {
    name: "WhatsApp",
    description: "WhatsApp Business via Meta Cloud API — official integration only, no unofficial automation",
    capabilities: ["TEXT", "TEMPLATE", "MEDIA", "DOCUMENT", "LOCATION", "BUTTON", "LIST"],
    inbound: true,
    media: true,
    templates: true,
  },
  SMS: {
    name: "SMS",
    description: "SMS via approved providers with country-specific routing and opt-out",
    capabilities: ["TEXT", "TEMPLATE"],
    inbound: true,
    media: false,
    templates: true,
  },
  EMAIL: {
    name: "Email",
    description: "Email via approved providers with HTML, attachments, threading, bounce handling",
    capabilities: ["TEXT", "HTML", "TEMPLATE", "ATTACHMENT", "THREADING"],
    inbound: true,
    media: true,
    templates: true,
  },
  IN_APP: {
    name: "In-App Notifications",
    description: "Governed in-application notifications — extends existing notification infrastructure",
    capabilities: ["TEXT", "ACTION", "LINK"],
    inbound: false,
    media: false,
    templates: true,
  },
  INTERNAL: {
    name: "Internal BEYU Messaging",
    description: "Governed internal communication between authorized BEYU users with RBAC/ABAC/RLS",
    capabilities: ["TEXT", "DOCUMENT", "TASK"],
    inbound: true,
    media: true,
    templates: false,
  },
};

export function isValidChannel(code: string): code is CommunicationChannel {
  return (COMMUNICATION_CHANNELS as readonly string[]).includes(code);
}

export function isMarketingChannel(channel: string): boolean {
  return ["WHATSAPP", "SMS", "EMAIL"].includes(channel);
}

export async function listChannels(): Promise<ChannelRecord[]> {
  return db.select().from(communicationChannels);
}

export async function getChannel(code: string): Promise<ChannelRecord | null> {
  const rows = await db.select().from(communicationChannels).where((await import("drizzle-orm")).eq(communicationChannels.code, code)).limit(1);
  return rows[0] ?? null;
}

export function getCanonicalChannelMeta(code: string) {
  return CANONICAL_CHANNELS[code] ?? null;
}

export function getAllCanonicalChannelCodes(): string[] {
  return Object.keys(CANONICAL_CHANNELS);
}
