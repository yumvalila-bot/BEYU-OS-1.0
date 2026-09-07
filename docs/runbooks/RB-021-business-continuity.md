# RB-021: Business Continuity

**Severity:** P0  
**Trigger:** Extended outage affecting business operations  
**Last Tested:** NOT_TESTED  
**Owner:** CEO + CTO

## 1. Overview
Business continuity procedures ensure critical business functions continue during extended outages.

## 2. Critical Business Functions

| Function | Manual Workaround | Maximum Downtime |
|----------|------------------|------------------|
| Financial operations | Spreadsheet-based accounting | 24 hours |
| Clinical operations | Paper-based medical records | 4 hours |
| Governance | Email-based approvals | 48 hours |
| Identity management | Manual account creation | 8 hours |

## 3. Activation Criteria
- P0 outage > 4 hours
- Database unrecoverable
- Security breach requiring system shutdown
- Natural disaster affecting infrastructure

## 4. Procedures
- Activate manual workflows
- Notify all stakeholders
- Establish communication channels
- Document all manual operations
- Plan for system restoration

## 5. External Blockers
- Manual workflow documentation incomplete
- Staff training not conducted
- DR drills not performed

## References
- [RB-020: Disaster Recovery](./RB-020-disaster-recovery.md)
