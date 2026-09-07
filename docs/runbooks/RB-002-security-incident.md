# RB-002: Security Incident

**Severity:** P0 (always)  
**Trigger:** Suspected or confirmed security breach  
**Last Tested:** NOT_TESTED  
**Owner:** Security Lead / CISO

---

## 1. Detection

### Indicators
- Unusual authentication failures (brute force)
- Successful auth from unexpected locations/IPs
- RLS violations in database logs
- Unauthorized API access attempts
- Privilege escalation attempts
- Data exfiltration patterns
- Malware/ransomware indicators
- Insider threat signals

### Sources
- Application logs (auth failures, authorization denials)
- Database logs (RLS violations, suspicious queries)
- Network logs (unusual traffic patterns)
- User reports (account compromise)
- Third-party notifications (breach disclosure)

---

## 2. Immediate Response (< 5 minutes)

### 2.1 Activate Security Incident Team
```
Channel: #security-incidents (private)
Message: [SECURITY] {brief description} - activating incident team
Participants: Security Lead, CISO, CTO, Legal (if data breach)
```

### 2.2 Preserve Evidence
```bash
# DO NOT modify affected systems
# DO NOT restart services (preserves memory state)
# DO NOT delete logs

# Capture current state
# [EXTERNAL_BLOCKED: Requires forensic tooling]

# Document observations
# Timeline, affected systems, indicators
```

### 2.3 Contain (if active breach)
```bash
# Lock suspicious accounts (admin role required)
# UPDATE users 
# SET status = 'LOCKED', locked_until = now() + interval '72 hours'
# WHERE id IN ('user1', 'user2');

# Revoke suspicious sessions
# DELETE FROM sessions WHERE user_id IN ('user1', 'user2');

# Block suspicious IPs (if applicable)
# [EXTERNAL_BLOCKED: Requires WAF/firewall access]
```

---

## 3. Investigation

### 3.1 Scope Assessment
- What systems are affected?
- What data is affected?
- How many users are affected?
- Is the breach ongoing?
- What is the attack vector?

### 3.2 Forensic Analysis
```bash
# Analyze authentication logs
# Look for: brute force, credential stuffing, session hijacking

# Analyze authorization logs
# Look for: privilege escalation, horizontal privilege escalation

# Analyze database logs
# Look for: SQL injection, RLS bypass, data exfiltration

# Analyze network logs
# Look for: command & control, data exfiltration, lateral movement
```

### 3.3 Attack Vector Identification
- Phishing
- Credential compromise
- Application vulnerability
- Infrastructure vulnerability
- Insider threat
- Supply chain attack
- Zero-day exploit

---

## 4. Containment

### 4.1 Short-Term Containment
- Isolate affected systems
- Block attacker IPs
- Disable compromised accounts
- Revoke compromised credentials
- Disable vulnerable features

### 4.2 Long-Term Containment
- Patch vulnerabilities
- Harden configurations
- Implement additional controls
- Monitor for persistence

---

## 5. Eradication

### 5.1 Remove Threat
- Remove malware
- Delete unauthorized accounts
- Revert unauthorized changes
- Patch vulnerabilities
- Rotate compromised credentials

### 5.2 Verify Eradication
```bash
# Scan for malware
# [EXTERNAL_BLOCKED: Requires antivirus/EDR]

# Verify no persistence mechanisms
# Check: cron jobs, startup scripts, scheduled tasks

# Verify no backdoors
# Check: unauthorized users, SSH keys, API tokens
```

---

## 6. Recovery

### 6.1 Restore Systems
```bash
# Restore from clean backup (if needed)
# See RB-020: Disaster Recovery

# Rebuild compromised systems
# Apply security patches
# Harden configurations

# Restore data from known-good backup
# Verify data integrity
```

### 6.2 Verify Recovery
```bash
# Security scan
# [EXTERNAL_BLOCKED: Requires security scanner]

# Penetration test (if major breach)
# [EXTERNAL_BLOCKED: Requires external security firm]

# Monitor for re-infection
# [EXTERNAL_BLOCKED: Requires monitoring platform]
```

---

## 7. Communication

### 7.1 Internal Communication
```
Frequency: Every 30 minutes (active), daily (contained)
Channel: #security-incidents (private)
Participants: Security team, CTO, CEO, Legal, PR (if public)
```

### 7.2 External Communication (if required)

#### Regulatory Notification
- **GDPR:** 72 hours to supervisory authority
- **Tanzania Data Protection Act:** 72 hours to PDPC
- **PCI DSS:** Immediate to payment brands (if card data)

#### User Notification
- If personal data compromised
- If credentials compromised
- If financial data compromised

#### Public Disclosure
- Coordinated with Legal and PR
- Transparent but measured
- Provide remediation steps

---

## 8. Post-Incident

### 8.1 Forensic Report
- Timeline of attack
- Attack vector
- Systems/data affected
- Attacker TTPs (tactics, techniques, procedures)
- Indicators of compromise (IOCs)

### 8.2 Post-Mortem (within 1 week)
- Root cause analysis
- Contributing factors
- Detection gaps
- Response effectiveness
- Lessons learned

### 8.3 Remediation Plan
- Patch vulnerabilities
- Harden systems
- Improve detection
- Update runbooks
- Security awareness training

---

## 9. Specific Scenarios

### Scenario A: Credential Compromise
1. Lock affected accounts
2. Force password reset
3. Revoke all sessions
4. Rotate API keys/tokens
5. Investigate source of compromise
6. Enable MFA (if not already)

### Scenario B: Data Breach
1. Contain breach (stop data exfiltration)
2. Assess data exposed
3. Preserve forensic evidence
4. Notify Legal
5. Notify regulators (if required)
6. Notify affected users
7. Offer credit monitoring (if PII exposed)

### Scenario C: Ransomware
1. Isolate affected systems (disconnect from network)
2. DO NOT pay ransom (contact law enforcement)
3. Preserve evidence
4. Identify ransomware variant
5. Check for decryption tools
6. Restore from clean backups
7. Rebuild systems

### Scenario D: Insider Threat
1. Preserve evidence (discreetly)
2. Coordinate with HR and Legal
3. Revoke access
4. Investigate scope
5. Document for potential legal action
6. Review access controls

---

## 10. Escalation

| Condition | Escalate To |
|-----------|-------------|
| Active data exfiltration | CISO + CTO (immediate) |
| PII breach | CISO + Legal (immediate) |
| Financial data breach | CISO + CFO + Legal |
| Ransomware | CISO + CTO + CEO + Law Enforcement |
| Nation-state attack | CISO + CTO + CEO + Government |

---

## 11. Closure Criteria

- [ ] Threat eradicated
- [ ] Systems restored
- [ ] Vulnerabilities patched
- [ ] Credentials rotated
- [ ] Forensic report complete
- [ ] Regulatory notifications sent (if required)
- [ ] User notifications sent (if required)
- [ ] Post-mortem complete
- [ ] Remediation plan approved
- [ ] Incident ticket closed

---

## 12. Legal Considerations

### Evidence Preservation
- Chain of custody
- Forensic imaging
- Log retention (minimum 1 year)
- Attorney-client privilege (if litigation expected)

### Regulatory Compliance
- GDPR (EU)
- Tanzania Data Protection Act
- PCI DSS (if card data)
- Sector-specific regulations (Health, Finance)

### Law Enforcement
- When to involve law enforcement
- How to preserve evidence
- Coordination with legal counsel

---

## References
- [RB-001: General Incident Response](./RB-001-incident-response.md)
- [RB-012: Identity Compromise](./RB-012-identity-compromise.md)
- [RB-014: Tenant Isolation Incident](./RB-014-tenant-isolation-incident.md)
- [RB-020: Disaster Recovery](./RB-020-disaster-recovery.md)
