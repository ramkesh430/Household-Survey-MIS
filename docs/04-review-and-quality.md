# Supervisor review & data quality (Phase 3)

## Workflow
```
draft ──submit──► submitted ──approve──► approved
  ▲                   │                     │
  │                reject                (admin) reopen
  │                   ▼                     │
  └──── edit ───── rejected ◄───────────────┘
            (resubmit → submitted)
```

| Step | Who | What happens |
|---|---|---|
| Submit | enumerator (online or offline) | Full validation. The survey appears in the supervisor's **समीक्षा** queue, oldest first. |
| Reject (फिर्ता) | supervisor of that ward, admin | A reason is required. Optional **per-question notes** are added with "+ यो प्रश्नमा टिप्पणी" on any question. `reject_count` goes up; the reason and notes go into the history. |
| Correct & resubmit | enumerator | On the next sync the device gets the rejected survey. It shows an amber banner listing the reason and every noted question (tap to jump), notes on the questions themselves, and ✎ badges on the section tabs. Corrections work offline. On resubmit the queue flags it **"पहिले फिर्ता भई पुनः पेश"**. |
| Approve (स्वीकृत) | supervisor, admin, not the person who collected it | The verifier name and signature drawn on screen are written into the form's **प्रमाणित गर्नेको नाम / सही** fields (the page-22 verification block). The form is re-validated and locked. |
| Reopen | admin only | Approved → rejected with a reason. The verifier fields are cleared. |

Every transition is stored in `survey_status_history`, with notes in `details`. It is audited (`survey.approve`, `survey.reject`, `survey.reopen`) and shown under **इतिहास** on the review screen. Review actions use the survey `version`, so two supervisors cannot decide on a stale copy (409).

## Quality flags (review queue and गुणस्तर page)
| Flag | Rule |
|---|---|
| तथ्यांक जाँच चेतावनी | the shared engine raised consistency warnings (e.g. Q17 vs Q5, Q28 marriage under 20, Q29 counts) |
| GPS स्थान छैन | no coordinates recorded |
| GPS शुद्धता कम | accuracy worse than `QUALITY_GPS_POOR_ACCURACY_M` (default 50 m) |
| बस्तीका अन्य घरभन्दा टाढा | more than `QUALITY_GPS_OUTLIER_KM` (default 2 km) from the **median point of that settlement** (needs ≥ 3 GPS points) |
| पहिले फिर्ता भई पुनः पेश | resubmission after rejection |
| सम्भावित दोहोरो घरधुरी | the household is in an unresolved duplicate pair |
| अपूर्ण उत्तर | completion < 100 % on a submitted or approved survey |

The **summary** tab shows, per enumerator: total, draft, submitted, approved, rejected, times rejected, average completion, warnings, missing GPS and GPS outliers. It also shows ward totals: households, not started, approval progress.

## Duplicate households
`shared/similarity.js` (used by the server and on the device) normalises Nepali spellings before comparing names:
- spacing and punctuation
- ं / ँ, nukta and halant
- ी→ि, ू→ु
- श/ष→स, व→ब, ण→न

So "गोपाल बहादुर श्रेष्ठ" matches "गोपालबहादुर श्रेस्ठ".

A pair is suspected when:
- the names are ≥ 80 % similar in the same settlement, or
- the names are identical in another settlement of the same ward, or
- the phone numbers match (last 10 digits), or
- the house number matches with ≥ 60 % name similarity.

| Where | Behaviour |
|---|---|
| Registering on the device (offline) | Matches from the device database are shown before saving: "यस्तै घरधुरी पहिले नै दर्ता भएको हुन सक्छ". The enumerator can correct the entry or confirm "फरक परिवार हो". |
| Registering online | `POST /households` returns `possible_duplicates` (non-blocking). |
| गुणस्तर › सम्भावित दोहोरो घरधुरी | The supervisor compares the two records and decides: **फरक परिवार हुन्** (the pair is hidden from now on), or **पहिलो/दोस्रो दोहोरो हो** (that household gets `duplicate_of` set and is **excluded from counts and reports**). A household with an approved survey cannot be marked as the duplicate. |

Exact duplicates (same settlement + house no. + family no.) remain impossible thanks to the database's unique key (Phase 1).

## API
See `02-api.md`: `/surveys/:id/approve|reject|reopen`, `/quality/queue|flags|summary|duplicates`, `/quality/duplicates/review`.

## Tests
- `shared/test/similarity.test.js`: normalisation, similarity, duplicate reasons, exclusions.
- `server/test/review.test.js`:
  - permissions by role and ward
  - reason and notes validation
  - reject → pull with notes → resubmit → resubmitted flag
  - approve with version conflict, signature check, verifier written into the form and per-question table, lock, full history
  - admin reopen
  - GPS outlier, poor-accuracy and missing-GPS flags
  - per-enumerator summary
  - duplicate pairs (name and phone), "not duplicate", "duplicate" excluded from totals, approved household protected
- `client/src/test/sync.integration.test.js`: rejected on the server → notes on the device → corrected offline → resubmitted → approved → locked on the device.
- Browser (Chrome): supervisor rejects with a note on Q6 → enumerator sees the banner and note on the phone, changes Q6, resubmits → supervisor signs and approves → database shows `approved`, verifier name recorded.
