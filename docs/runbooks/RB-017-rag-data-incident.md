# RB-017: RAG Data Incident

**Severity:** P1  
**Trigger:** RAG knowledge base contamination, unauthorized access, or data leak  
**Last Tested:** NOT_TESTED  
**Owner:** AI Lead + Data Governance Lead

## 1. Scenarios
- Contaminated/poisoned documents ingested
- Cross-tenant RAG retrieval (authorization bypass)
- Stale/revoked source still retrievable
- Sensitive data exposed through embeddings

## 2. Immediate Response
```bash
# Suspend RAG retrieval
# UPDATE system_config SET value = 'suspended' WHERE key = 'RAG_RETRIEVAL_STATUS';

# Identify contaminated sources
# SELECT * FROM rag_documents WHERE status = 'CONTAMINATED' OR ingested_at > '{incident_time}';

# Communication
# Channel: #incidents + #ai
# Message: [P1] RAG incident - {type} - retrieval suspended
```

## 3. Resolution
- Remove contaminated documents
- Re-index affected embeddings
- Verify tenant isolation in retrieval
- Re-enable retrieval after verification

## References
- [RB-015: AI Incident](./RB-015-ai-incident.md)
- [RB-014: Tenant Isolation Incident](./RB-014-tenant-isolation-incident.md)
