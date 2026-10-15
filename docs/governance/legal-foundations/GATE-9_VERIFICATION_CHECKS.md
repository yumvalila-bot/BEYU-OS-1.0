# BEYU-LF-REG-G9 — Gate 9 Verification Checks

Document ID: `BEYU-LF-REG-G9`
Title: Gate 9 — the fourteen verification checks, their exact commands, their results, and what they do NOT prove
Version: 1.0 · Date 2026-10-15
Status: `INFORMATIONAL`
Owner: CGO (proposed) · Approving authority (proposed): CGO
Next review date: On any change to the pack
Classification: `INTERNAL`
Related: `MASTER_DOCUMENT_REGISTER.md`, `README.md` §11, `REQUEST_TO_DOCUMENT_MATRIX.md`,
`CROSS_DOCUMENT_CONSISTENCY_REPORT.md`, `GATE-0B_EXPANSION_COVERAGE_INVENTORY.md`

> **⚠ WHAT THESE CHECKS PROVE, AND WHAT THEY DO NOT.**
> **They prove things about the FILES in this folder.** They prove that every registered path resolves, that
> every document carries an ID and a status, that the numbering convention was respected, that the fictional
> fixture identifiers were not promoted into new documents, that the question numbering resolves, and that the
> prohibited claim patterns do not appear outside prohibitions.
> **They prove NOTHING about the law, the facts or the world.** **Passing every check below does not mean that
> any clause is enforceable, that any entity exists, that any filing was made, that any tax position is correct,
> that any statement is accurate, that any contract is valid, that any IP is owned, that any privacy practice
> complies, or that any document is approved or executable.** **No registry, bank, land registry, IP registry,
> regulator, auditor, court or production environment was contacted or checked in the course of these checks.**
> **A green result here means the documentation is internally consistent and honestly labelled. That is all —
> and it is exactly as much as documentation can establish.**

## How to run them

```bash
cd /home/user/BEYU-OS-1.0/docs/governance/legal-foundations
# each check below is a single command; run them in order
```

**Convention:** `▲` = a check whose raw grep produces known false positives, with the refinement stated.

---

### Check 1 — Every registered path resolves to a file

```bash
python3 - <<'PYEOF'
import re, pathlib
t = pathlib.Path("MASTER_DOCUMENT_REGISTER.md").read_text()
paths = sorted(set(re.findall(r'`([A-Za-z0-9\-/]+/BEYU-LF-[A-Z0-9\-_]+\.md)`', t)))
missing = [p for p in paths if not pathlib.Path(p).exists()]
print(f"paths={len(paths)} missing={len(missing)}")
for m in missing: print("  MISSING", m)
PYEOF
```

**Result at revision 1.1: `paths=103 missing=0`.**
**Does not prove:** that the documents are complete, correct, approved or effective — only that the files exist
where the register says they do.

### Check 2 — Every document carries a `Document ID` and a `Status`

```bash
python3 - <<'PYEOF'
import pathlib
bad=[]; n=0
for p in sorted(pathlib.Path('.').rglob('*.md')):
    t=p.read_text(); n+=1
    if 'Document ID' not in t or 'Status' not in t: bad.append(str(p))
print(f"files={n} missing_fields={len(bad)}")
for b in bad: print("  MISSING", b)
PYEOF
```

**Result at revision 1.1: `files=120 missing_fields=0`.**
**Does not prove:** that the status value is correct — a wrong status on a document that *has* a status passes
this check. Status correctness is a human review matter.

### Check 3 — The `D01`–`D75` and `DC-01` sequence is intact (no renumbering)

```bash
python3 - <<'PYEOF'
import re, pathlib
names=[p.name for p in pathlib.Path('.').rglob('*.md')]
ids=sorted(set(re.findall(r'BEYU-LF-(D\d\d)', '\n'.join(names))))
missing=[f"D{i:02d}" for i in range(1,76) if f"D{i:02d}" not in ids]
print("unique D-IDs:", len(ids), "missing:", missing)
print("DC-01 present:", any('DC-01' in n for n in names))
PYEOF
```

**Result at revision 1.1: `unique D-IDs: 75 missing: []`, `DC-01 present: True`.**
**Does not prove:** that no document was edited — only that no document was **renumbered or removed**. Content
changes are tracked in `CHANGE_LOG.md`.

### Check 4 — No document is on disk without being registered

```bash
python3 - <<'PYEOF'
import re, pathlib
reg = pathlib.Path("MASTER_DOCUMENT_REGISTER.md").read_text()
registered = set(re.findall(r'`([A-Za-z0-9\-/]+/BEYU-LF-[A-Z0-9\-_]+\.md)`', reg))
on_disk = {str(p) for p in pathlib.Path('.').rglob('*.md') if p.name.startswith('BEYU-LF')}
unreg = sorted(on_disk - registered)
print(f"on_disk={len(on_disk)} registered={len(registered)} unregistered={len(unreg)}")
for u in unreg: print("  UNREGISTERED", u)
PYEOF
```

**Result at revision 1.1: `on_disk=103 registered=103 unregistered=0`.** (The pack-level control files —
`README.md`, `CHANGE_LOG.md`, `MASTER_DOCUMENT_REGISTER.md`, `REQUEST_TO_DOCUMENT_MATRIX.md` and the other
registers — use their own `BEYU-LF-REG-*` IDs and are indexed in `MASTER_DOCUMENT_REGISTER.md` §15.)
**Does not prove:** that the registered document is the *right* document for its ID.

### Check 5 ▲ — No document claims a completion status it cannot evidence

```bash
# naive form (produces false positives because "TEMPLATE_NOT_EXECUTED" contains "EXECUTED"):
grep -rniE '^Status:.*(APPROVED|EXECUTED|FILED|REGISTERED)' corporate/ employment/ \
     product-compliance/ fundraising/ financial-reporting/ trust/BEYU-LF-TC-01* | grep -v 'NOT '

# refined form (the check that should be used):
grep -rniE '^Status:' corporate/ employment/ product-compliance/ fundraising/ financial-reporting/ \
     trust/BEYU-LF-TC-01* ip/BEYU-LF-NDA-01* ip/BEYU-LF-RC-01* ip/BEYU-LF-IP-* \
  | grep -E '\b(APPROVED|FILED|REGISTERED)\b' \
  | grep -vE '(NOT_|NOT |PENDING|may not|cannot|never|prohibit)'
```

**Result at revision 1.1:** the naive form returns hits, **all of them the string `TEMPLATE_NOT_EXECUTED`**
(the literal status of an unexecuted template — a false positive of the naive pattern). **The refined form
returns nothing.** **No document in the expansion carries `APPROVED`, `FILED` or `REGISTERED`, and none carries
a bare `EXECUTED`.**
**Does not prove:** that no *body text* claims approval — body-text scanning is Check 14.

### Check 6 — The fictional fixture identifiers were not promoted into new documents

```bash
grep -rniE '(TZ-2025-4421|DOC-IP-001|DOC-TM-001|DOC-TM-002|TZ-NGO-00891|MU-TR-100241|DIFC-4471|TZ-138002211|TIN-114-882-991)' \
     corporate/ employment/ product-compliance/ fundraising/ financial-reporting/ \
     trust/BEYU-LF-TC-01* ip/BEYU-LF-NDA-01* ip/BEYU-LF-RC-01* ip/BEYU-LF-IP-* \
  | grep -viE '(fixtur|fictional|fiction|synthetic|never|not evidence|quarantin|must not|forbid|demonstration)'
```

**Result at revision 1.1: empty.** The identifiers appear **only** inside statements that they are fictional
and must not be relied on (`IP-TM-01` §1, `IP-EV-01` §1, `PRIV-02` §4.1, `CAP-01` §1, `INC-01` control block).
**Does not prove:** that the *existing* documents (`D39`–`D47`) are free of them — they intentionally quote them
in quarantine sections, which is why the filter above excludes those contexts.

### Check 7 — The cap table contains no invented shareholding

```bash
grep -nE '\| *[0-9][0-9,\.]* *\|' corporate/BEYU-LF-CAP-01_CAP_TABLE_AND_SHARE_REGISTER.md
python3 - <<'PYEOF'
import pathlib, re
t=pathlib.Path('corporate/BEYU-LF-CAP-01_CAP_TABLE_AND_SHARE_REGISTER.md').read_text()
print("numeric values in the tables before §3:",
      re.findall(r'\| *(?:[0-9][0-9,]*|[0-9]+%) *\|', t.split('## 3.')[0]))
PYEOF
```

**Result at revision 1.1: the second command returns `[]` — an empty list.** No bare numeric value appears in
any table before §3. **The issued-and-outstanding table (§2.1) contains the single row
`*— NO VERIFIED HOLDING —*` with a subtotal stated as `0` (zero verified shares), and the fully-diluted
discipline (§2.6) states its three figures as bold `0` values with the evidence required beside them.** No
holder, no number of shares, no percentage and no class allocation appears anywhere in the cap table.
**Does not prove:** that some *other* document does not contain an invented holding — Checks 6 and 14 cover the
adjacent risks.

### Check 8 ▲ — No fabricated employee, salary or offer

```bash
grep -rniE '(TZS *[0-9]|TSh|salary of [0-9]|paid [0-9]|employee named|Mr\.|Ms\.)' employment/ \
  | grep -viE '(no |never|blank|placeholder|\[|not )'
```

**Result at revision 1.1:** one hit — a **formatting example** in `EMP-04` §2.5 stating that currency and amount
format must be identical in both language texts (using `TZS 1,000,000` as an illustration of *format*). **No
named person, no offered salary, no offer, and no employment relationship appears in any employment document.**
**Does not prove:** that the repository's *software* surfaces are free of synthetic employee data — they are not:
`src/db/seed.ts` contains synthetic employee and payroll rows. **That is why `EMP-01` control 3 and
`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6 exist, and why this check is about the documents, not the code.**

### Check 9 — Every cited counsel question resolves to the brief

```bash
python3 - <<'PYEOF'
import re, pathlib
brief=pathlib.Path('LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md').read_text()
cite={}
for p in pathlib.Path('.').rglob('*.md'):
    if p.name=='LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md': continue
    for m in re.findall(r'Q-[A-Z]{1,6}-\d\d', p.read_text()): cite.setdefault(m,set()).add(str(p))
undef=sorted(c for c in cite if c not in brief)
print(f"cited={len(cite)} undefined_in_brief={len(undef)}")
for u in undef: print("  ", u, sorted(cite[u])[:3])
PYEOF
```

**Result at revision 1.1: `cited=74 undefined_in_brief=1` — the single hit is `Q-G-04`.**
**`Q-G-04` is a known, documented false positive:** it was **retargeted to `Q-G-02`** in an earlier revision, and
the only remaining occurrences are **in `CHANGE_LOG.md` and the consistency report, in the narrative that
describes the retarget.** It is not a live citation and **must not be "fixed"**
(`CROSS_DOCUMENT_CONSISTENCY_REPORT.md` P-13).
**Does not prove:** that the questions are the *right* questions, or that any of them has been answered —
**none has been answered.**

### Check 10 — The accountant questions are numbered and cited consistently

```bash
python3 - <<'PYEOF'
import re, pathlib
t=pathlib.Path('ACCOUNTANT_QUESTIONS_FOR_BEYU_FINANCIAL_REPORTING.md').read_text()
qs=sorted(set(re.findall(r'AQ-\d\d', t)))
print(f"defined={len(qs)} first={qs[0]} last={qs[-1]}")
cites=set()
for p in pathlib.Path('.').rglob('*.md'):
    if p.name.startswith('ACCOUNTANT'): continue
    cites|=set(re.findall(r'AQ-\d\d', p.read_text()))
print("cited elsewhere:", sorted(cites))
PYEOF
```

**Result at revision 1.1: `defined=48 first=AQ-01 last=AQ-48`; cited elsewhere: `AQ-01, AQ-02, AQ-09, AQ-22,
AQ-23, AQ-25, AQ-26, AQ-32`** (the priority questions, correctly cross-referenced).
**Does not prove:** that any accountant has seen, understood or answered a single one.

### Check 11 — Every `D##` reference in the pack resolves to a registered document

```bash
python3 - <<'PYEOF'
import re, pathlib
reg=pathlib.Path('MASTER_DOCUMENT_REGISTER.md').read_text()
ids=set(re.findall(r'`(BEYU-LF-[A-Z0-9\-]+)`', reg))
bad={}
for p in pathlib.Path('.').rglob('*.md'):
    for m in re.findall(r'\bD(\d\d)\b', p.read_text()):
        if f'BEYU-LF-D{m}' not in ids: bad.setdefault(str(p),set()).add(f'D{m}')
print("docs with D-refs not in register:", {k:sorted(v) for k,v in bad.items()})
PYEOF
```

**Result at revision 1.1: `{}` — empty.** Every `D##` reference in all 120 files resolves.
**Does not prove:** that the reference points to the *correct* document for the proposition it supports — that is
a substance review. (Two such defects were found and corrected in an earlier revision; see `CHANGE_LOG.md` §2.)

### Check 12 — Bilingual parity: both language texts are present

```bash
python3 - <<'PYEOF'
import pathlib
for f,marks in [('employment/BEYU-LF-EMP-02_OFFER_LETTERS_BARUA_ZA_AJIRA.md',['OFFER OF EMPLOYMENT','OFA YA KAZI']),
                ('product-compliance/BEYU-LF-TOS-01_TERMS_OF_SERVICE.md',['TERMS OF SERVICE','MASHARTI YA MATUMIZI']),
                ('product-compliance/BEYU-LF-PRIV-01_PRIVACY_POLICY.md',['PRIVACY NOTICE','ILANI YA FARAGHA'])]:
    t=pathlib.Path(f).read_text()
    print(f.split('/')[-1], "OK" if all(m in t for m in marks) else "MISSING MARK")
PYEOF
```

**Result at revision 1.1: all three `OK`.** Each document contains both an English and a Kiswahili text with the
same clause numbering.
**Does not prove** — and this is the important limitation — **that the two texts say the same thing.** A
mechanical presence check cannot assess translation equivalence. **That is why `EMP-04` §3 requires a
clause-by-clause reconciliation, a back-translation of obligation-bearing clauses, and counsel review — none of
which has been performed.**

### Check 13 — The consistency and coverage findings are recorded

```bash
grep -cE '^\| \*\*P-(1[7-9]|2[0-9]|30)' CROSS_DOCUMENT_CONSISTENCY_REPORT.md   # expansion conflicts P-17…P-30
grep -cE '^\| X-[1-9] ' GATE-0B_EXPANSION_COVERAGE_INVENTORY.md               # pre-drafting conflicts X-1…X-9
```

**Result at revision 1.1: `14` (P-17…P-30) and `9` (X-1…X-9).**
**Does not prove:** that the conflicts are *resolved*. **Most are not — they are recorded, routed to a question,
and left for the human decision. A recorded conflict is the deliverable; a silently resolved one would be the
defect.**

### Check 14 — The prohibited claim patterns do not appear outside prohibitions

```bash
grep -rniE '(is fully compliant|we are compliant|certified compliant|guaranteed|bank-grade|100% secure|audited accounts|we own the|registered trademark [A-Z])' \
     corporate/ employment/ product-compliance/ fundraising/ financial-reporting/ trust/BEYU-LF-TC-01* \
  | grep -viE '(not|never|prohibit|forbid|may not|must not|cannot|\[COUNSEL)'
```

**Result at revision 1.1: two hits, both false positives of the pattern** — `TOS-01` §4.11 and `FIN-01` §4.10,
which are **the prohibition lists themselves** (the phrases appear because the documents forbid them; the filter
excludes lines containing "prohibit"/"forbid" but these two table rows phrase the prohibition as a noun — "A
claim of certification…"; "Financial-service claims…"). **No document makes any such claim about the group.**
**Does not prove:** that no claim of this kind appears in the *external* materials the family may already have
produced, in the repository's root reports, or in the software's UI text. **Those are outside this folder, and
outside this check's scope.**

---

## Summary of results

| # | Check | Result | Residual risk |
|---|---|---|---|
| 1 | Registered paths resolve | **103 / 103** | Document correctness |
| 2 | ID + status present | **120 / 120** | Status accuracy |
| 3 | `D01`–`D75` + `DC-01` intact | **75 / 75, DC-01 present** | Content edits (tracked in the change log) |
| 4 | Nothing unregistered | **0 unregistered** | Wrong document for an ID |
| 5 | No unsupported completion status | **0 (naive grep returns the `TEMPLATE_NOT_EXECUTED` false positive)** | Body-text claims (Check 14) |
| 6 | Fixture identifiers not promoted | **0 (outside quarantine contexts)** | Existing quarantine sections quote them by design |
| 7 | Cap table invents nothing | **only explicit zeros and labels** | Other documents (Checks 6, 14) |
| 8 | No fabricated employee/salary/offer | **1 formatting example (not a salary)** | The software's synthetic rows (labelled in the audit) |
| 9 | Counsel citations resolve | **74 cited, 1 known false positive (`Q-G-04`)** | Whether the questions are answered (**none is**) |
| 10 | Accountant questions numbered | **48 defined, 8 cited** | Whether any is answered (**none is**) |
| 11 | `D##` references resolve | **0 unresolved** | Whether a reference supports its proposition |
| 12 | Bilingual parity (presence) | **3 / 3** | **Equivalence — not tested, not reconciled, not reviewed** |
| 13 | Findings recorded | **P-17…P-30 (14) and X-1…X-9 (9)** | Resolution (**mostly not resolved — by design**) |
| 14 | Prohibited claims outside prohibitions | **2 known false positives** | Materials outside this folder |

**One defect was found and corrected while running these checks:** the counsel-question reference `Q-LEG03` in
`D06` and `D07` was missing its hyphen (corrected to `Q-LEG-03`; three occurrences). It is recorded in
`CHANGE_LOG.md` §6.

## What these checks cannot establish — stated plainly

1. **No legal effect.** No clause, agreement or instrument in this pack has been reviewed by a lawyer, and **no
   check here tests enforceability, validity or compliance with any law.**
2. **No existence.** No entity, trust, office, share, registration, licence, contract, customer or transaction
   is verified by any check. **Nothing was checked at any registry, bank, land registry, IP registry or
   regulator.**
3. **No accounting accuracy.** `FIN-09`'s 22 reconciliation controls are **`NOT_RUN`** — there is no ledger.
   **These file checks are not financial controls and must never be presented as such.**
4. **No claim verification.** Checks 6, 7 and 14 test the **documents**, not the **claims a person might make in
   a meeting, an email or a conversation.** The claim discipline in `FIN-01` §3 is an operating rule for people,
   not a file check.
5. **No approval.** **An internally consistent pack is still an unapproved pack.** Everything in this folder
   remains a draft pending the human review and the merge gate.

**Run the checks, read the results, and then read this section again — because the second part is the part that
matters.**
