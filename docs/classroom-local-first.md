# Kru Aorry Classroom Phase 1 — local-first decision

## Product boundary

Classroom Phase 1 is a working vertical slice for creating, printing, and reviewing a five-question mathematics Exit Ticket for ป.4–ป.6.

The product wording shown in the interface is deliberately bounded:

> รองรับกรอบหลักสูตรและเป้าหมายการเรียนรู้ของ สพฐ. โดยครูเลือกหลักสูตรที่สถานศึกษาใช้จริง

This is not a claim of complete curriculum alignment. Teachers remain responsible for choosing the curriculum used by their school.

## Data placement

| Data | Location | Reason |
| --- | --- | --- |
| Account, membership, entitlements | Supabase | Existing server-authoritative product data |
| Curriculum pack identifiers and non-child metadata | Bundled application data in Phase 1 | Reviewed, versioned release content |
| Worksheet snapshots | Browser `localStorage` | Local-first; preserves the exact curriculum target and questions used |
| Class label and aggregate correct counts | Browser `localStorage` | Never sent to Supabase by default |
| Student names, individual scores, parent/student accounts | Not supported | Explicitly outside Phase 1 |

The `/classroom` route is membership-protected by the existing Supabase session proxy, but the Classroom client does not write class or result data to Supabase.

## Versioning and identity

- Local state and backup files carry `schemaVersion: 1`.
- Worksheets and result overviews receive UUIDs from `crypto.randomUUID()`.
- Every worksheet stores `curriculumPackId`, `curriculumPackVersion`, and a curriculum target snapshot.
- Backups identify themselves as `kruaorry-classroom-backup` and declare that they are prototype, unencrypted files that must not contain personal data.

## Curriculum references

The bundled targets are transcribed from the official OBEC/IPST mathematics indicators (revised B.E. 2560 / 2017):

- `ค 1.1 ป.4/10` — mixed operations with counting numbers and zero.
- `ค 1.1 ป.5/9` — percentage word problems of no more than two steps.
- `ค 1.1 ป.6/11` — ratio and scale word problems.

Source PDF: <https://academic.obec.go.th/images/document/1580786328_d_1.pdf>

## Offline and backup limits

- Once loaded, the Classroom page can create, persist, and print while the tab remains open without a network connection.
- Phase 1 does not install a service worker, so a fresh reload after the tab is closed is not guaranteed offline.
- Exported backups are JSON and are not encrypted. The interface tells teachers not to enter real student names or personal data.
- There is no cloud sync, AI grading, OCR/camera flow, or individual student mode in Phase 1.
