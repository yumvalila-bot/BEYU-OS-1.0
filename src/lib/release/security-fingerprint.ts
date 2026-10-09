/**
 * Canonical physical/security catalog fingerprint used by the governed release.
 *
 * Keep this query read-only. It covers the root release's owned `public` schema;
 * sector databases have independent migration/release systems and fingerprints.
 * Every item is prefixed, fully qualified, and sorted before hashing so policy,
 * ACL, owner, RLS, function, or default-privilege drift changes the digest.
 */
export const RUNTIME_SECURITY_DEFINER_ALLOWLIST: ReadonlyArray<{
  identity: string;
  justification: string;
}> = [];

export const SECURITY_FINGERPRINT_SQL = String.raw`
  select md5(string_agg(item, E'\n' order by item)) as fingerprint
  from (
    select 'schema:'||n.nspname||':owner='||owner.rolname||':acl='||coalesce(array_to_string(n.nspacl, ','), '') item
      from pg_namespace n join pg_roles owner on owner.oid=n.nspowner where n.nspname='public'
    union all
    select 'relation:'||n.nspname||'.'||c.relname||':kind='||c.relkind::text||':owner='||owner.rolname||
           ':acl='||coalesce(array_to_string(c.relacl, ','), '')||':rls='||c.relrowsecurity||':force='||c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles owner on owner.oid=c.relowner
     where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
    union all
    select 'column:'||table_schema||'.'||table_name||'.'||column_name||':type='||data_type||
           ':nullable='||is_nullable||':default='||coalesce(column_default,'')
      from information_schema.columns where table_schema='public'
    union all
    select 'column_acl:'||n.nspname||'.'||c.relname||'.'||a.attname||':acl='||coalesce(array_to_string(a.attacl, ','),'')
      from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','p','v','m','f') and a.attnum>0 and not a.attisdropped and a.attacl is not null
    union all
    select 'constraint:'||n.nspname||'.'||t.relname||'.'||c.conname||':type='||c.contype::text||
           ':definition='||pg_get_constraintdef(c.oid, true)
      from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='public'
    union all
    select 'index:'||schemaname||'.'||indexname||':'||indexdef from pg_indexes where schemaname='public'
    union all
    select 'policy:'||n.nspname||'.'||c.relname||'.'||p.polname||':command='||p.polcmd::text||
           ':permissive='||p.polpermissive||':roles='||coalesce((
             select string_agg(coalesce(r.rolname, role_oid::regrole::text), ',' order by coalesce(r.rolname, role_oid::regrole::text))
               from unnest(p.polroles) role_oid left join pg_roles r on r.oid=role_oid
           ), '')||':using='||coalesce(pg_get_expr(p.polqual,p.polrelid,true),'')||
           ':check='||coalesce(pg_get_expr(p.polwithcheck,p.polrelid,true),'')
      from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public'
    union all
    select 'function:'||n.nspname||'.'||p.oid::regprocedure::text||':owner='||owner.rolname||
           ':language='||l.lanname||':security_definer='||p.prosecdef||
           ':config='||coalesce(array_to_string(p.proconfig, ','),'')||
           ':acl='||coalesce(array_to_string(p.proacl, ','),'')||
           ':definition='||pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles owner on owner.oid=p.proowner
      join pg_language l on l.oid=p.prolang
     where n.nspname='public' and p.prokind in ('f','p')
    union all
    select 'default_acl:owner='||owner.rolname||':schema='||coalesce(n.nspname,'*')||':type='||d.defaclobjtype::text||
           ':acl='||coalesce(array_to_string(d.defaclacl, ','),'')
      from pg_default_acl d join pg_roles owner on owner.oid=d.defaclrole
      left join pg_namespace n on n.oid=d.defaclnamespace
     where d.defaclnamespace=0 or n.nspname='public'
    union all
    select 'app_role:'||r.rolname||':super='||r.rolsuper||':bypassrls='||r.rolbypassrls||
           ':createrole='||r.rolcreaterole||':createdb='||r.rolcreatedb||':replication='||r.rolreplication||
           ':inherit='||r.rolinherit
      from pg_roles r where r.rolname like 'beyu\_%' escape '\'
    union all
    select 'app_role_membership:'||member.rolname||'->'||parent.rolname||':admin='||m.admin_option
      from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles member on member.oid=m.member
     where member.rolname like 'beyu\_%' escape '\' or parent.rolname like 'beyu\_%' escape '\'
  ) catalog
`;
