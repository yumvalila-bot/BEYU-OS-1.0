# Ujenzi BIM — actual state

**Status: PARTIAL.** Metadata register (`ujenzi_bim_models`, `ujenzi_model_objects`).

Open standards intended: IFC, BCF, COBie — **adapters not connected**.

**IMPLEMENTED:** artifact register with SHA-256, duplicate detection, IFC STEP header sniff (`ISO-10303-21`), unsupported-format flag. Geometry is **not** parsed (`geometryParsed: false`).

**NOT IMPLEMENTED:** production BIM viewer, object extraction, federation, proprietary Revit/Tekla APIs, model comparison engine.
