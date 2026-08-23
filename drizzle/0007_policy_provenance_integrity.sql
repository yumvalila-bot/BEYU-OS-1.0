-- BEYU OS — Phase 5P: POLICY PROVENANCE REFERENTIAL INTEGRITY
--
-- Scope note. Accounting authority remains UNRATIFIED. This migration encodes
-- NO accounting policy: no chart of accounts, recognition rule, debit/credit
-- treatment, period policy, FX, tax, maker/checker or capital execution.
--
-- DEFECT closed here, found by hostile audit at HEAD 18999ee:
--
--   policies.approved_by_resolution_id had NO foreign key. A policy could
--   therefore claim approval by a resolution that does not exist
--   ('RES_TOTALLY_FAKE' was inserted and persisted), and the reference would
--   survive indefinitely. Deleting a resolution likewise left policies
--   pointing at nothing. Approval provenance was unverifiable.
--
-- AUTHORITY FOR THIS CHANGE IS ALREADY RATIFIED and is not an accounting
-- decision:
--   Constitution Art. 4 — "Every material decision must be traceable to who,
--   what, when, why, under which authority, on which data, under which policy,
--   with which approvals and with which consequences."
--   A reference to a resolution that does not exist cannot satisfy "with which
--   approvals". This migration makes the claim verifiable; it does NOT decide
--   whether approval is mandatory.
--
-- DELIBERATELY NOT DONE HERE:
--   * approved_by_resolution_id is NOT made NOT NULL. All five seeded ACTIVE
--     policies currently have it NULL, so requiring it would immediately
--     disable the entire live policy engine, including CONST-AI-001 which
--     denies AI financial posting. Whether an approving resolution is
--     mandatory — and how the existing policies are to be retro-attested — is
--     a GOVERNANCE DECISION reserved to the Group Board / Chief Governance
--     Officer.
--   * No check that the referenced resolution is APPROVED rather than DRAFT or
--     TABLED. That is the same governance decision and is recorded as an open
--     finding, not silently enforced.
--
-- ON DELETE RESTRICT is chosen over CASCADE: a resolution that a policy relies
-- on for provenance must not be removable while that dependency exists, and
-- cascading a resolution deletion into policy deletion would destroy governance
-- history rather than protect it.

ALTER TABLE policies
  ADD CONSTRAINT policies_approved_by_resolution_id_resolutions_id_fk
  FOREIGN KEY (approved_by_resolution_id) REFERENCES resolutions(id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT policies_approved_by_resolution_id_resolutions_id_fk ON policies IS
  'Constitution Art. 4: a policy may not claim approval by a resolution that does not exist. Nullability and required approval status remain governance decisions.';
