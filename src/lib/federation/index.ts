/**
 * BEYU Federation & Trust — engine barrel (shared BEYU OS capability).
 *
 * Deterministic, evidence-gated rule engine for the federation trust plane.
 * Nothing in this package talks to the network, stores secrets or makes
 * connectivity claims: production/verified states are fail-closed and can
 * only be reached through recorded evidence + human approval (mirrored by
 * CHECK constraints in migration 0071).
 */
export * from "./catalog";
export * from "./lifecycle";
export * from "./guards";
export * from "./capability";
export * from "./consent";
export * from "./reconciliation";
export * from "./coverage";
export * from "./monitoring";
