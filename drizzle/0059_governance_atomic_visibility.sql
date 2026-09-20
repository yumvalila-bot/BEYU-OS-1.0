-- Fail closed when invoker RLS hides evidence at deferred validation.
-- No SECURITY DEFINER, visibility bypass, data rewrite, privilege widening or
-- historical migration modification. All previous projection predicates remain.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_governance_appointment_activation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM governance_appointments WHERE id=NEW.id) THEN RAISE EXCEPTION 'Atomic lifecycle evidence must remain visible through deferred validation' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM governance_appointments a WHERE a.id=NEW.id AND a.status='ACTIVE' AND NOT EXISTS(
  SELECT 1 FROM governance_members m WHERE m.id=a.member_id AND m.body_id=a.body_id AND m.party_id=a.party_id AND m.seat_role=a.seat_role
   AND m.voting_rights=a.voting_rights AND m.appointed_on=a.appointed_on AND m.retired_on=a.retired_on)) THEN
  RAISE EXCEPTION 'Active appointment requires its exact canonical member' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_body_establishment_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM governance_body_establishments WHERE id=NEW.id) THEN RAISE EXCEPTION 'Atomic lifecycle evidence must remain visible through deferred validation' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM governance_body_establishments e WHERE e.id=NEW.id AND e.status='ESTABLISHED' AND NOT EXISTS(
  SELECT 1 FROM governance_bodies b JOIN governance_bodies p ON p.id=e.parent_body_id WHERE b.id=e.body_id
   AND b.status='DRAFT' AND b.body_type='COMMITTEE' AND b.tenant_id=p.tenant_id AND b.legal_entity_id=p.legal_entity_id
   AND b.code=e.code AND b.name=e.name AND b.classification=e.classification AND b.charter_document_id=e.document_id
   AND b.quorum_minimum::text=e.rules->>'quorumMinimum' AND b.majority_rule=e.rules->>'majorityRule' AND b.reserved_matters=e.reserved_matters)) THEN
  RAISE EXCEPTION 'Established proposal requires its exact dormant canonical body' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_body_activation_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p governance_body_activations;
BEGIN
 SELECT * INTO p FROM governance_body_activations WHERE id=NEW.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atomic lifecycle evidence must remain visible through deferred validation' USING ERRCODE='23514'; END IF;
 IF p.status='ACTIVE' AND (
  NOT EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=p.body_id AND b.status='ACTIVE')
  OR NOT EXISTS(SELECT 1 FROM governance_charters c WHERE c.id=p.initial_charter_id AND c.body_id=p.body_id AND c.status='ADOPTED' AND c.authority_body_id=p.authority_body_id)
  OR (SELECT count(*) FROM governance_members m WHERE m.body_id=p.body_id)<>jsonb_array_length(p.nomination_ids)
  OR (SELECT count(*) FROM governance_appointments a JOIN governance_members m ON m.id=a.member_id AND m.body_id=a.body_id AND m.party_id=a.party_id
    AND m.seat_role=a.seat_role AND m.voting_rights=a.voting_rights AND m.appointed_on=a.appointed_on AND m.retired_on=a.retired_on
   WHERE a.id IN (SELECT jsonb_array_elements_text(p.nomination_ids)) AND a.status='ACTIVE' AND a.body_id=p.body_id AND a.initial_charter_id=p.initial_charter_id AND a.authority_body_id=p.authority_body_id)<>jsonb_array_length(p.nomination_ids)
  OR NOT beyu_initial_composition_valid(p.initial_charter_id,p.nomination_ids)
 ) THEN RAISE EXCEPTION 'Initial activation must commit exact membership, effective charter and active body atomically' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_membership_change_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c governance_membership_changes;
BEGIN
 SELECT * INTO c FROM governance_membership_changes WHERE id=NEW.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atomic lifecycle evidence must remain visible through deferred validation' USING ERRCODE='23514'; END IF;
 IF c.status='APPLIED' AND (NOT EXISTS(SELECT 1 FROM governance_members m WHERE m.id=c.member_id AND m.body_id=c.body_id AND m.lifecycle_revision=c.member_revision+1 AND m.lifecycle_status=c.to_status)
 OR (c.command='REINSTATE' AND NOT beyu_current_body_composition_valid(c.body_id))) THEN
  RAISE EXCEPTION 'Lifecycle evidence and exact canonical membership must commit atomically with valid reinstatement composition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION beyu_body_change_atomic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c governance_body_changes;
BEGIN
 SELECT * INTO c FROM governance_body_changes WHERE id=NEW.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Atomic lifecycle evidence must remain visible through deferred validation' USING ERRCODE='23514'; END IF;
 IF c.status='APPLIED' AND (NOT EXISTS(SELECT 1 FROM governance_bodies b WHERE b.id=c.body_id AND b.status::text=c.to_status)
 OR (c.command='RESUME' AND NOT beyu_current_body_composition_valid(c.body_id))) THEN
  RAISE EXCEPTION 'Body lifecycle evidence and canonical status must commit atomically with valid resumption composition' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
