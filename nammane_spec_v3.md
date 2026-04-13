# Nammane (ನಮ್ಮ ಮನೆ) — Family Life OS
# Complete Specification v3

---

## Vision

Nammane (ನಮ್ಮ ಮನೆ) means "Our Home" in Kannada.

A private, self-hosted family life management system.
Not just health — a single place for everything that matters:
health records, insurance, finance, property, vehicles.

Starting with:
- Health (medical reports, medicines)
- Insurance (health, life, vehicle)

Future modules (structure ready, no code yet):
- Documents Vault (PAN, Aadhaar, passports, home docs) — see TODO
- Finance (investments, loans, taxes)
- Property
- Vehicles

All data in Google Sheets. All files in Google Drive.
Accessible from any browser — mobile or desktop.
PIN-protected. No third-party app. Zero cost.

---

## Hosting & Infrastructure

| Layer | Choice |
|---|---|
| Server | Oracle Cloud Free Tier VM (Ubuntu) |
| App server | Gunicorn + systemd (auto-restart on failure, starts on boot) |
| Backend | Python Flask |
| Frontend | Bootstrap 5 HTML (served by Flask) |
| Auth | 4-digit PIN, server-side session (30 days) |
| File storage | Google Drive |
| Structured data | Google Sheets |
| Cost | $0 forever |

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ACCESS_PIN` | Yes | 4-digit PIN for login |
| `SESSION_SECRET` | Yes | Random string for session cookies |
| `GOOGLE_CREDENTIALS_JSON` | Yes | Service account JSON (single line) |
| `SPREADSHEET_ID` | Yes | Google Sheet ID |
| `DRIVE_ROOT_FOLDER_ID` | Yes | Root "Nammane" folder ID in Drive |

---

## Authentication

- 4-digit PIN on login screen
- Server-side session cookie (30 days)
- Every API endpoint requires valid session — no data visible without PIN
- Lock icon in top bar → immediate logout

---

## Google Drive — Folder Structure

```
Nammane/
│
├── Health/
│   ├── MedicalReports/
│   │   └── {PersonName}/
│   │       └── {EntryName}_{Date}/
│   │           ├── prescription.jpg
│   │           ├── blood_report.pdf
│   │           └── mri_scan.jpg
│   └── Insurance/
│       └── {PolicyName}_{PersonsCovered}/
│           └── policy.pdf
│
├── DocumentsVault/
│   ├── Identity/
│   │   └── {PersonName}/
│   │       ├── pan_card.pdf
│   │       ├── aadhaar.pdf
│   │       └── passport.pdf
│   ├── Property/
│   │   └── {PropertyName}/
│   │       ├── sale_deed.pdf
│   │       └── khata.pdf
│   ├── Vehicle/
│   │   └── {VehicleName}/
│   │       ├── rc_book.pdf
│   │       └── insurance.pdf
│   └── Other/
│       └── {DocumentName}/
│
├── Finance/                        ← future
│   ├── Investments/
│   ├── Taxes/
│   └── Loans/
│
└── _Archive/                       ← soft-deleted items move here
```

---

## Google Sheets — All Tabs

One spreadsheet. Tabs grouped by module prefix.

### Global

**People**
| Column | Type | Notes |
|---|---|---|
| id | string | UUID |
| name | string | Full name |
| dob | date | YYYY-MM-DD |
| relation | string | Self, Wife, Father, Mother, Son, Daughter, Other |
| blood_group | string | A+, B-, O+, AB+, etc. |
| allergies | string | Free text |
| description | string | Medical history & milestones — free text, editable from app |
| created_at | datetime | ISO format |

---

### Health Module

**Health_Entries**
Top-level container for a medical interaction or log.
Does not require a doctor/hospital — can be a simple BP log or daily reading.

| Column | Type | Notes |
|---|---|---|
| id | string | UUID |
| person_id | string | FK → People.id |
| name | string | User-defined — "Annual Checkup Jan 2025", "BP Log March" |
| doctor | string | Optional |
| hospital | string | Optional |
| date | date | Date of visit / entry |
| next_visit_date | date | Optional |
| description | string | Overall notes / findings for this entry |
| linked_entry_id | string | Optional FK → Health_Entries.id |
| created_at | datetime | ISO format |

**Health_Attachments**
Each attachment belongs to one Entry.
At least one of file OR value must be present.

| Column | Type | Notes |
|---|---|---|
| id | string | UUID |
| entry_id | string | FK → Health_Entries.id |
| name | string | User-defined — "Blood Report", "BP Reading", "Doctor Prescription" |
| file_path | string | Google Drive folder path (optional) |
| file_drive_link | string | Google Drive webViewLink (optional) |
| value | string | Optional — "120/80 mmHg", "112 mg/dL" |
| datetime | datetime | Date + time of reading or document |
| description | string | Optional free text |
| created_at | datetime | ISO format |

**Health_Medicines**
Independent entity. Linked to an entry optionally.

| Column | Type | Notes |
|---|---|---|
| id | string | UUID |
| person_id | string | FK → People.id |
| entry_id | string | FK → Health_Entries.id (optional — entry where prescribed) |
| medicine_name | string | |
| purpose | string | "For BP control", "Antibiotic" |
| dosage | string | "500mg", "1 tablet" |
| when_to_take | string | Comma separated — Morning / Afternoon / Night / Before food / After food |
| from_date | date | |
| until_date | date | Optional — blank if ongoing |
| ongoing | boolean | TRUE / FALSE |
| notes | string | Optional |
| created_at | datetime | ISO format |

**Health_Insurance**

| Column | Type | Notes |
|---|---|---|
| id | string | UUID |
| persons_covered | string | Comma separated person_ids — supports floater |
| provider | string | Star Health, LIC, etc. |
| policy_name | string | |
| policy_number | string | |
| type | string | Health / Life / Term / Vehicle / Other |
| sum_insured | number | INR |
| premium_amount | number | INR |
| premium_frequency | string | Monthly / Quarterly / Annual |
| premium_due_date | date | Next due date |
| renewal_date | date | |
| file_paths | string | Comma separated Drive paths |
| file_drive_links | string | Comma separated Drive webViewLinks |
| notes | string | |
| created_at | datetime | ISO format |

---

### Documents Vault Module

**Vault_Documents**
For personal documents — identity, property, vehicle, and other.

| Column | Type | Notes |
|---|---|---|
| id | string | UUID |
| person_id | string | FK → People.id (optional — some docs are family-wide) |
| category | string | Identity / Property / Vehicle / Other |
| name | string | User-defined — "PAN Card", "Aadhaar", "Passport", "Sale Deed" |
| document_number | string | Optional — PAN number, passport number, etc. |
| issued_by | string | Optional — issuing authority |
| issue_date | date | Optional |
| expiry_date | date | Optional — for passport, DL, etc. |
| file_paths | string | Comma separated Drive paths |
| file_drive_links | string | Comma separated Drive webViewLinks |
| description | string | Free text notes |
| created_at | datetime | ISO format |

---

### Finance Module (future — tabs only, no code yet)

- Finance_Investments
- Finance_Loans
- Finance_Taxes
- Finance_Income

---

## Data Relationships

```
People (global)
  ├── Health_Entries        (one person → many entries)
  │     ├── Health_Attachments  (one entry → many attachments)
  │     └── Health_Medicines    (one entry → many medicines, optional link)
  ├── Health_Medicines      (also standalone, person_id direct)
  ├── Health_Insurance      (persons_covered — supports multiple people)
  └── Vault_Documents       (one person → many docs, or family-wide)
```

---

## Navigation

```
[ Home ] [ Insurance ] [ Medical Reports ] [ Medicines ]
```

Documents Vault accessible from Home (section) or top bar icon.
People managed from Home page.
Search icon in top bar — global search across all modules.
Lock icon in top bar — logout.

---

## Pages & Flows

---

### Login Page
- PIN keypad (4 digits)
- Correct PIN → session → Home
- Wrong PIN → error, clear

---

### Home Page

One section — People table with ongoing medicines inline.

**People Table**
- Columns: Name (+ relation, blood group below), Ongoing Medicines
- Ongoing medicines pulled from Health_Medicines where ongoing = TRUE for that person
- All medicines shown inline, comma separated
- Actions per row: [View More] [Edit]
- [+ Add Person] button in section header

**No separate Insurance or Vault sections on Home.**
Insurance lives in its own tab. Vault is future.

---

### Person Detail Page (View More)

```
Name, DOB, Blood Group, Relation, Allergies
─────────────────────────────────────────
Medical History
[editable textarea — description field]
[Save]
─────────────────────────────────────────
Current Medicines
(from Health_Medicines where person_id = this, ongoing = TRUE)
─────────────────────────────────────────
Recent Reports
(from Health_Entries where person_id = this, last 3)
[View All Reports →]
```

---

### Insurance Tab
- All policies listed
- Filter by person
- Sort by premium_due_date (soonest first)
- [+ Add Insurance] button
- Tap → Insurance Detail (all fields + file links + edit/delete)

**Add / Edit Insurance Form:**
- Persons covered (multi-select from People)
- Provider, Policy name, Policy number
- Type (Health / Life / Term / Vehicle / Other)
- Sum insured, Premium amount, Premium frequency
- Premium due date, Renewal date
- File uploads (multiple)
- Notes
- Save

---

### Medical Reports Tab
- Recent 5 entries by default, sorted by date descending
- Filter by person (pill buttons or dropdown)
- [+ Add Medical Report] button
- [View All] to see beyond 5
- Tap row → Entry Detail

**Entry row shows:** Name, Person, Date, Doctor, Hospital, # Attachments

**Add / Edit Medical Report Form:**

Entry fields:
- Person (dropdown)
- Entry name (free text)
- Doctor (optional)
- Hospital / Clinic (optional)
- Date
- Next visit date (optional)
- Description (textarea — overall notes)

Note: Medicines are NOT added here. Use the Medicines tab → Add Medicine → Link to this report.

Attachments section (repeatable rows):
- Name (free text)
- File upload (one file per row, optional)
- Value (optional — "120/80 mmHg")
- Date + Time
- Description (optional)
- [Remove row] [+ Add Attachment]

On Save:
1. Create Drive folder: `Nammane/Health/MedicalReports/{PersonName}/{EntryName}_{Date}/`
2. Upload each file, store path + Drive link
3. Write to Health_Entries sheet
4. Write to Health_Attachments sheet
5. Write to Health_Medicines sheet (if any medicines added)

**Entry Detail Page:**
- All entry fields
- Attachments (name, value, datetime, description, file link)
- Medicines (all fields)
- Linked entry (clickable)
- [Edit] [Delete]

---

### Medicines Tab
- Table view: Medicine, Person, When, From date, Ongoing (checkbox)
- Recent 5 by default, sorted by created_at descending
- Filter by person
- [+ Add Medicine] button
- [Load More] to see beyond 5
- Tap row → opens Edit Medicine form

**Add / Edit Medicine Form:**
- Person (dropdown)
- Medicine name
- Purpose
- Dosage
- When to take (multi-select: Morning / Afternoon / Night / Before food / After food)
- From date
- Until date / Ongoing toggle
- Linked Report (optional dropdown — link to a Health Entry)
- Notes
- Save → writes to Health_Medicines sheet

---

### Documents Vault Page
- All vault documents
- Filter by category (Identity / Property / Vehicle / Other)
- Filter by person
- [+ Add Document] button
- Tap → Document Detail (all fields + file links + edit/delete)

**Add / Edit Vault Document Form:**
- Person (optional — leave blank for family-wide docs)
- Category (Identity / Property / Vehicle / Other)
- Document name (free text — "PAN Card", "Aadhaar", "Passport")
- Document number (optional)
- Issued by (optional)
- Issue date (optional)
- Expiry date (optional — show alert when near expiry)
- File uploads (multiple)
- Description / Notes
- Save → uploads to Drive, writes to Vault_Documents sheet

---

### Search Page (top bar icon)
- Single search box
- Searches across:
  - People (name, relation)
  - Health_Entries (name, doctor, hospital, description)
  - Health_Attachments (name, value, description)
  - Health_Medicines (medicine name, purpose)
  - Health_Insurance (provider, policy name, policy number)
  - Vault_Documents (name, document number, description)
- Results grouped by type
- Tap → relevant detail page

---

## Out of Scope (for now)

- OCR / Tesseract
- Claude AI parsing
- Reminders / WhatsApp notifications
- RAG / natural language querying
- Finance module (folder + sheet tabs created, no UI/backend)
- Multi-user / role-based access

## TODO — Documents Vault (next phase)

Personal identity and property documents — PAN, Aadhaar, Passport, Home docs etc.
Drive folder structure and Vault_Documents sheet tab are already designed (see above).
UI to be built when ready. Will appear as a 5th tab in bottom nav.

- Category: Identity / Property / Vehicle / Other
- Fields: Name, Document number, Issued by, Issue date, Expiry date, Files, Notes
- Expiry alerts: highlight documents expiring within 60 days
- Person: per person or family-wide

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | HTML + Bootstrap 5 + Vanilla JS |
| Backend | Python 3 + Flask |
| App server | Gunicorn |
| Process manager | systemd |
| Auth | Flask sessions + PIN |
| Google Sheets API | google-api-python-client |
| Google Drive API | google-api-python-client |
| Deployment | Oracle Cloud Free Tier VM (Ubuntu) |

---

## Future Modules (no code — structure only)

| Module | Drive folder | Sheet tabs | Examples |
|---|---|---|---|
| Finance | Nammane/Finance/ | Finance_Investments, Finance_Loans, Finance_Taxes | MF portfolio, home loan, ITR |
| Property | Nammane/DocumentsVault/Property/ | (reuse Vault_Documents with category=Property) | Sale deed, Khata, EC |
| Vehicles | Nammane/DocumentsVault/Vehicle/ | (reuse Vault_Documents with category=Vehicle) | RC book, insurance, PUC |
| Identity docs | Nammane/DocumentsVault/Identity/ | (reuse Vault_Documents with category=Identity) | PAN, Aadhaar, Passport, DL |
