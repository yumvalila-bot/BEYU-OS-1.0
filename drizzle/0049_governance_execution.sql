-- Extend the Enterprise Operating Kernel's canonical tasks. No duplicate action,
-- document, workflow or audit system; no business-domain execution capability.
ALTER TABLE tasks ADD COLUMN source_resolution_id text REFERENCES resolutions(id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN depends_on_task_id text REFERENCES tasks(id) ON DELETE RESTRICT;
ALTER TABLE tasks ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN created_by_user_id text REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN completed_by_user_id text REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN completed_at timestamptz;
ALTER TABLE tasks ADD COLUMN verified_by_user_id text REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN verified_at timestamptz;
ALTER TABLE tasks ADD COLUMN closed_at timestamptz;
CREATE INDEX tasks_resolution_idx ON tasks(source_resolution_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_version_positive CHECK (version > 0);
ALTER TABLE tasks ADD CONSTRAINT tasks_governance_state CHECK (source_resolution_id IS NULL OR (
  status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','VERIFIED','CLOSED')
  AND due_at IS NOT NULL AND created_by_user_id IS NOT NULL
  AND (status = 'OPEN' OR assignee_user_id IS NOT NULL)
  AND (status NOT IN ('COMPLETED','VERIFIED','CLOSED') OR (completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL AND completed_by_user_id = assignee_user_id))
  AND (status NOT IN ('VERIFIED','CLOSED') OR (verified_at IS NOT NULL AND verified_by_user_id IS NOT NULL
       AND verified_by_user_id <> completed_by_user_id AND verified_by_user_id <> assignee_user_id))
  AND (status <> 'CLOSED' OR closed_at IS NOT NULL)
  AND (status IN ('COMPLETED','VERIFIED','CLOSED') OR (completed_at IS NULL AND completed_by_user_id IS NULL))
  AND (status IN ('VERIFIED','CLOSED') OR (verified_at IS NULL AND verified_by_user_id IS NULL))
  AND (status = 'CLOSED' OR closed_at IS NULL)
  AND (verified_at IS NULL OR completed_at <= verified_at)
  AND (closed_at IS NULL OR verified_at <= closed_at)
));
--> statement-breakpoint
CREATE TABLE governance_action_evidence (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  document_version text NOT NULL,
  document_checksum text NOT NULL CHECK (document_checksum ~ '^[a-fA-F0-9]{64}$'),
  note text NOT NULL CHECK (length(trim(note)) >= 10),
  submitted_by_user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX governance_evidence_task_idx ON governance_action_evidence(task_id);
CREATE UNIQUE INDEX governance_evidence_document_uidx ON governance_action_evidence(task_id,document_id,document_version,document_checksum);
--> statement-breakpoint
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_scoped ON tasks USING (
  tenant_id = ANY(beyu_tenant_ids()) AND
  ((source_resolution_id IS NULL AND coalesce(current_setting('beyu.governance_entity_ids', true), '') = '') OR (current_setting('beyu.governance_actions_read', true) = 'on' AND EXISTS (SELECT 1 FROM resolutions r WHERE r.id=source_resolution_id AND r.tenant_id=tasks.tenant_id)))
) WITH CHECK (
  tenant_id = ANY(beyu_tenant_ids()) AND
  ((source_resolution_id IS NULL AND coalesce(current_setting('beyu.governance_entity_ids', true), '') = '') OR (current_setting('beyu.governance_actions_read', true) = 'on' AND EXISTS (SELECT 1 FROM resolutions r WHERE r.id=source_resolution_id AND r.tenant_id=tasks.tenant_id)))
);
CREATE POLICY tasks_governance_no_delete ON tasks AS RESTRICTIVE FOR DELETE USING (source_resolution_id IS NULL);
ALTER TABLE governance_action_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_action_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY governance_evidence_read ON governance_action_evidence FOR SELECT
 USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id=task_id AND t.source_resolution_id IS NOT NULL));
CREATE POLICY governance_evidence_insert ON governance_action_evidence FOR INSERT WITH CHECK (
 EXISTS (SELECT 1 FROM tasks t JOIN documents d ON d.tenant_id=t.tenant_id
         WHERE t.id=task_id AND t.source_resolution_id IS NOT NULL AND t.status='IN_PROGRESS'
           AND d.id=document_id AND d.version=document_version AND d.checksum=document_checksum)
);
-- No UPDATE/DELETE policies: the runtime cannot rewrite or erase evidence links.
--> statement-breakpoint
CREATE FUNCTION beyu_governance_task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent resolutions%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' AND OLD.source_resolution_id IS DISTINCT FROM NEW.source_resolution_id THEN
    RAISE EXCEPTION 'Governance provenance is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.source_resolution_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO parent FROM resolutions WHERE id=NEW.source_resolution_id AND tenant_id=NEW.tenant_id;
  IF NOT FOUND OR parent.status <> 'APPROVED' OR NOT parent.quorum_met OR parent.decision_date IS NULL OR parent.decided_by_member_id IS NULL THEN
    RAISE EXCEPTION 'Approved attributed governance mandate required' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'OPEN' OR NEW.version <> 1 OR NEW.assignee_user_id IS NOT NULL
       OR NEW.completed_at IS NOT NULL OR NEW.verified_at IS NOT NULL OR NEW.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Governance action must start OPEN' USING ERRCODE='23514';
    END IF;
    IF NEW.depends_on_task_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM tasks t WHERE t.id=NEW.depends_on_task_id AND t.source_resolution_id=NEW.source_resolution_id AND t.id<>NEW.id
    ) THEN RAISE EXCEPTION 'Dependency must be an existing action on the same resolution' USING ERRCODE='23514'; END IF;
  ELSE
    IF OLD.status='CLOSED' OR NEW.version <> OLD.version+1 THEN
      RAISE EXCEPTION 'Closed or stale governance action' USING ERRCODE='23514';
    END IF;
    IF ROW(NEW.tenant_id,NEW.title,NEW.description,NEW.priority,NEW.due_at,NEW.depends_on_task_id,NEW.created_by_user_id,NEW.created_at)
       IS DISTINCT FROM ROW(OLD.tenant_id,OLD.title,OLD.description,OLD.priority,OLD.due_at,OLD.depends_on_task_id,OLD.created_by_user_id,OLD.created_at)
       OR (OLD.status <> 'OPEN' AND NEW.assignee_user_id IS DISTINCT FROM OLD.assignee_user_id) THEN
      RAISE EXCEPTION 'Mandate terms and assigned ownership are immutable' USING ERRCODE='23514';
    END IF;
    IF (OLD.status IN ('COMPLETED','VERIFIED') AND NEW.status <> 'IN_PROGRESS'
        AND ROW(NEW.completed_at,NEW.completed_by_user_id) IS DISTINCT FROM ROW(OLD.completed_at,OLD.completed_by_user_id))
       OR (OLD.status='VERIFIED' AND ROW(NEW.verified_at,NEW.verified_by_user_id) IS DISTINCT FROM ROW(OLD.verified_at,OLD.verified_by_user_id)) THEN
      RAISE EXCEPTION 'Completion and verification attestations are immutable' USING ERRCODE='23514';
    END IF;
    IF NOT ((OLD.status='OPEN' AND NEW.status='ASSIGNED')
      OR (OLD.status='ASSIGNED' AND NEW.status='IN_PROGRESS')
      OR (OLD.status='IN_PROGRESS' AND NEW.status IN ('IN_PROGRESS','BLOCKED','COMPLETED'))
      OR (OLD.status='BLOCKED' AND NEW.status='IN_PROGRESS')
      OR (OLD.status='COMPLETED' AND NEW.status IN ('IN_PROGRESS','VERIFIED'))
      OR (OLD.status='VERIFIED' AND NEW.status='CLOSED')) THEN
      RAISE EXCEPTION 'Invalid governance action transition' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.status IN ('IN_PROGRESS','COMPLETED','VERIFIED','CLOSED') AND NEW.depends_on_task_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM tasks WHERE id=NEW.depends_on_task_id AND status IN ('VERIFIED','CLOSED')) THEN
    RAISE EXCEPTION 'Dependency not independently verified' USING ERRCODE='23514';
  END IF;
  IF NEW.status IN ('COMPLETED','VERIFIED','CLOSED') AND (
    NOT EXISTS (SELECT 1 FROM governance_action_evidence WHERE task_id=NEW.id)
    OR EXISTS (SELECT 1 FROM governance_action_evidence e WHERE e.task_id=NEW.id AND NOT EXISTS (
      SELECT 1 FROM governance_action_evidence e2 JOIN documents d ON d.id=e2.document_id
      WHERE e2.task_id=NEW.id AND e2.document_id=e.document_id AND d.tenant_id=NEW.tenant_id
        AND d.version=e2.document_version AND d.checksum=e2.document_checksum AND d.authority_status='AUTHORITATIVE'
        AND d.superseded_by_id IS NULL
    ))
  ) THEN RAISE EXCEPTION 'Current document evidence required before completion, verification and closure' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_governance_guard BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION beyu_governance_task_guard();
--> statement-breakpoint
CREATE FUNCTION beyu_governance_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM tasks t JOIN resolutions r ON r.id=t.source_resolution_id
   JOIN governance_bodies b ON b.id=r.body_id LEFT JOIN legal_entities le ON le.id=b.legal_entity_id
   JOIN documents d ON d.id=NEW.document_id AND d.tenant_id=t.tenant_id
   WHERE t.id=NEW.task_id AND t.status='IN_PROGRESS' AND t.assignee_user_id=NEW.submitted_by_user_id
     AND d.version=NEW.document_version AND d.checksum=NEW.document_checksum
     AND d.authority_status='AUTHORITATIVE' AND d.superseded_by_id IS NULL
     AND (d.effective_date IS NULL OR d.effective_date <= CURRENT_DATE)
     AND d.classification <= r.classification
     AND (d.entity_scope IS NULL OR d.entity_scope='*' OR d.entity_scope=le.code)
     AND (d.jurisdiction_code IS NULL OR d.jurisdiction_code=le.country_code)
 ) THEN RAISE EXCEPTION 'Evidence must match the scoped authoritative document and assignee' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER governance_evidence_guard BEFORE INSERT ON governance_action_evidence
 FOR EACH ROW EXECUTE FUNCTION beyu_governance_evidence_guard();
