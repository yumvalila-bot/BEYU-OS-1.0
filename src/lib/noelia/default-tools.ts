import { NoeliaToolRegistry } from "./tool-registry";
import { BeyuNoeliaReadService } from "./read-services";

/** Build the production registry. Handlers are BEYU service adapters only. */
export function createDefaultNoeliaToolRegistry(
  services = new BeyuNoeliaReadService(),
): NoeliaToolRegistry {
  const registry = new NoeliaToolRegistry();

  registry.register({
    name: "finance.treasury.aggregate",
    permission: "finance:treasury.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Aggregate authorized treasury positions through Finance OS.",
    execute: (context) => services.treasury(context),
  });
  registry.register({
    name: "finance.capital.pipeline",
    permission: "finance:capital.read",
    risk: "LOW",
    description: "Read the authorized capital request pipeline through Finance OS.",
    execute: (context) => services.capitalPipeline(context),
  });
  registry.register({
    name: "finance.waterfall.latest",
    permission: "finance:waterfall.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read the latest authorized waterfall result through Finance OS.",
    execute: (context) => services.latestWaterfall(context),
  });
  registry.register({
    name: "risk.register.query",
    permission: "risk:register.read",
    risk: "LOW",
    description: "Read authorized risk register evidence.",
    execute: (context) => services.riskRegister(context),
  });
  registry.register({
    name: "compliance.obligation.query",
    permission: "compliance:obligation.read",
    risk: "LOW",
    description: "Read authorized obligations and confirmed assessments.",
    execute: (context) => services.compliance(context),
  });
  registry.register({
    name: "governance.resolution.query",
    permission: "governance:resolution.read",
    risk: "LOW",
    description: "Read authorized resolution evidence.",
    execute: (context) => services.governance(context),
  });
  registry.register({
    name: "tax.knowledge.query",
    permission: "finance:tax.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Read authoritative tax intelligence for authorized countries.",
    execute: (context) => services.tax(context),
  });
  registry.register({
    name: "hcm.employee.aggregate",
    permission: "hcm:employee.read",
    risk: "LOW",
    description: "Aggregate workforce through the canonical HCM service.",
    execute: (context) => services.workforce(context),
  });
  registry.register({
    name: "knowledge.rag.search",
    permission: "ai:noelia.query",
    risk: "LOW",
    description: "Retrieve governed, scoped and classification-filtered memory.",
    execute: (context, input) => services.knowledge(context, input),
  });

  return registry;
}
