-- Migration 027 down: re-create the (erroneous) trigger so down-then-up is
-- deterministic. A fresh up sequence (026 corrected + 027) leaves no trigger on
-- patients; down(027) + down(026) also leaves no trigger.
CREATE TRIGGER trg_patients_tenant_parent
  BEFORE INSERT OR UPDATE ON health.patients
  FOR EACH ROW EXECUTE FUNCTION health.ensure_tenant_parent_match();
