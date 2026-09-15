# Ujenzi security — actual state

- Permissions: `ujenzi:data.read`, `ujenzi:data.manage` (tenant `BEYU-UJENZI`)
- RLS FORCE on all Ujenzi tables (`beyu.tenant_id`)
- URLs are not authorization; `guarded()` HTTP
- CAP_POSTING LOCKED
- Offline sync does not skip server auth
- Break-glass: reuse BEYU `identity:emergency.activate` — not duplicated
