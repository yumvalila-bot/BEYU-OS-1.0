import { ForbiddenException, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PermissionsGuard } from "./permissions.guard";
import { TenantContext, ActorContext } from "./tenant-context";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permission.decorator";

const actor = (role: string, tenantId = "TENANT-A"): ActorContext => ({
  userId: "user-1",
  email: "a@beyu.example",
  role,
  permissions: [],
  tenantId,
});

function context(handler: () => void): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard (RBAC enforcement at API boundary)", () => {
  const freshHandler = () => () => undefined;
  const setRequired = (perms: string[]) => (handler: () => void) =>
    Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, perms, handler);

  it("allows a request when the actor has the required permission", () => {
    const handler = freshHandler();
    const reflector = new Reflector();
    setRequired(["phi:read"])(handler);
    const tenant = new TenantContext();
    tenant.enterWith(actor("doctor"));
    const guard = new PermissionsGuard(reflector, tenant);
    expect(guard.canActivate(context(handler))).toBe(true);
  });

  it("denies a request when the actor lacks the permission", () => {
    const handler = freshHandler();
    const reflector = new Reflector();
    setRequired(["rx:write"])(handler);
    const tenant = new TenantContext();
    tenant.enterWith(actor("patient"));
    const guard = new PermissionsGuard(reflector, tenant);
    expect(() => guard.canActivate(context(handler))).toThrow(
      ForbiddenException,
    );
  });

  it("allows routes that declare no permission requirement", () => {
    const handler = freshHandler();
    const reflector = new Reflector();
    const tenant = new TenantContext();
    tenant.enterWith(actor("patient"));
    const guard = new PermissionsGuard(reflector, tenant);
    expect(guard.canActivate(context(handler))).toBe(true);
  });

  it("applies explicit grants (break-glass) on top of the role", () => {
    const handler = freshHandler();
    const reflector = new Reflector();
    setRequired(["phi:write"])(handler);
    const tenant = new TenantContext();
    tenant.enterWith({ ...actor("patient"), permissions: ["phi:write"] });
    const guard = new PermissionsGuard(reflector, tenant);
    expect(guard.canActivate(context(handler))).toBe(true);
  });
});
