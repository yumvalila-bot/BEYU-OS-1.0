# Ujenzi Digital Twin — actual state

**Status: PARTIAL.** Identifier graph only. Not a 3D viewer. Not a Twin OS.

## IMPLEMENTED
- Persistent IDs: Project, Site, Building, Level, Space, Element, System, Asset, ModelObject
- Edges (`ujenzi_twin_edges`) for CONTAINS relations
- Query API returns **counts**, refuses geometry payloads (`geometryPayload: REFUSED`)
- RLS FORCE on all twin tables (0043)

## NOT IMPLEMENTED
- IFC parser, federated model viewer, point clouds, streaming
- Automatic BIM-vs-reality comparison
