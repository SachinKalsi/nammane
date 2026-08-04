# Nammane Developer Documentation

This document describes the technical architecture, database schemas, authentication flows, and frontend/backend integration details of the **Nammane** (Our Home) personal manager web application. It serves as a guide for developers to understand the project structure or rebuild it from scratch.

---

## 1. Tech Stack Overview

The application is designed to be lightweight and run on low-resource environments (e.g., a 1GB RAM server) by offloading heavy computational tasks (like image processing, cropping, and PDF rendering) entirely to the client's browser.

### Backend (Python/Flask)
- **Framework:** Flask (Python 3)
- **Routing & Proxying:** Flask routes for handling data API requests, serving the single-page application (SPA), and proxying files securely.
- **Authentication & Rate Limiting:** Custom IP-based rate limiter and lockout mechanism to prevent brute-force entry attempts.
- **Google Services Integration:** Integrates `google-api-python-client` to interact with Google Sheets (acting as a relational database) and Google Drive (for document/media storage).

### Database & Storage (Google Workspace)
- **Relational Data:** Stored in a single **Google Sheet** containing multiple tabs (worksheets) acting as database tables.
- **File Storage:** Stored in **Google Drive** inside organized folders (e.g., `MedicalReports/[Person_Name]/[Entry_Name]/`, `Insurance/[Provider]_[Policy_Name]/`, etc.).

### Frontend (HTML5 / Vanilla CSS / Vanilla JS / SPA)
- **Structure:** Single Page Application (SPA) served from `templates/index.html`.
- **Styling:** Custom CSS built on top of Bootstrap 5 CSS grid and utilities, styled with custom color palettes (Forest Green `#1a3a2a`, warm beiges, and orange accent `#c8873a`). Icons are rendered using Bootstrap Icons.
- **Libraries (CDN loaded):**
  - **Cropper.js:** Client-side image crop and 90-degree rotation.
  - **jsPDF:** Client-side compiler to combine multiple images into a single `.pdf` document.

---

## 2. Environment Variables & Credentials

The backend configures itself using a `.env` file located in the project root:

```ini
# Application configuration
READ_PIN=1111      # PIN code for read-only access
WRITE_PIN=2222     # PIN code for full read/write/delete access

# Google APIs Config
SPREADSHEET_ID=your_google_spreadsheet_id_here
DRIVE_ROOT_FOLDER_ID=your_google_drive_folder_id_here
```

### Google OAuth Credentials
To communicate with Google APIs, the app expects:
1. `credentials.json`: Client secrets downloaded from the Google Cloud Console (configured with the Google Sheets API and Google Drive API scopes).
2. `token.json`: Generated dynamically on first startup via the OAuth2 flow and persisted to save the access and refresh tokens.

---

## 3. Database Schema (Google Sheets)

The database is built on a single spreadsheet. Running `python3 init_gsheets.py` will automatically create the worksheets and insert column headers if they do not exist.

### Table: `People`
Stores family members and profiles.
- `id` (string, UUID)
- `name` (string)
- `dob` (date, `YYYY-MM-DD`)
- `relation` (string)
- `blood_group` (string)
- `allergies` (string)
- `description` (text)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag: `TRUE` / `FALSE`)

### Table: `Health_Entries`
Stores medical reports and doctor visits.
- `id` (string, UUID)
- `person_id` (foreign key linking to `People.id`)
- `name` (string, e.g. "Annual Health Checkup")
- `doctor` (string)
- `hospital` (string)
- `date` (date, `YYYY-MM-DD`)
- `next_visit_date` (date)
- `description` (text)
- `linked_entry_id` (foreign key linking to another `Health_Entries.id`)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag)

### Table: `Health_Attachments`
Individual files/observations linked to a `Health_Entries` report.
- `id` (string, UUID)
- `entry_id` (foreign key linking to `Health_Entries.id`)
- `name` (string, e.g. "Blood Sugar Report")
- `file_path` (string, Google Drive URL link)
- `file_drive_link` (string, Google Drive URL link)
- `value` (string, optional measurement, e.g. "120/80 mmHg")
- `datetime` (date-time string)
- `description` (text)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag)

### Table: `Health_Medicines`
Prescribed medicines linked to a medical visit or family member.
- `id` (string, UUID)
- `person_id` (foreign key linking to `People.id`)
- `entry_id` (foreign key linking to `Health_Entries.id`)
- `medicine_name` (string)
- `purpose` (string)
- `dosage` (string, e.g. "500mg")
- `when_to_take` (string comma-separated, e.g. "Morning,After food")
- `from_date` (date)
- `until_date` (date)
- `ongoing` (boolean flag: `TRUE` / `FALSE`)
- `notes` (text)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag)

### Table: `Health_Insurance`
Stores insurance policy records and documents.
- `id` (string, UUID)
- `persons_covered` (string comma-separated keys linking to `People.id`)
- `provider` (string)
- `policy_name` (string)
- `policy_number` (string)
- `type` (string, e.g. "Health", "Life", "Vehicle")
- `sum_insured` (number)
- `premium_amount` (number)
- `premium_frequency` (string, e.g. "Annual", "Monthly")
- `premium_due_date` (date)
- `renewal_date` (date)
- `file_paths` (string comma-separated Google Drive links)
- `file_drive_links` (string comma-separated Google Drive links)
- `notes` (text)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag)

### Table: `Vault_Documents`
Personal identity, property, or legal document tracker.
- `id` (string, UUID)
- `person_id` (foreign key linking to `People.id` or empty for "Family/All")
- `category` (string, e.g. "Identity", "Property", "Vehicle")
- `name` (string, e.g. "Aadhar card")
- `document_number` (string)
- `issued_by` (string)
- `issue_date` (date)
- `expiry_date` (date)
- `file_paths` (string comma-separated Google Drive links)
- `file_drive_links` (string comma-separated Google Drive links)
- `description` (text)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag)

### Table: `Warranty_Cards`
Stores purchased appliances and products warranties.
- `id` (string, UUID)
- `product` (string, e.g. "Samsung Refrigerator")
- `purchase_date` (date)
- `warranty_till` (date)
- `file_paths` (string comma-separated Google Drive links)
- `file_drive_links` (string comma-separated Google Drive links)
- `notes` (text)
- `created_at` (ISO timestamp)
- `is_deleted` (boolean flag)

---

## 4. Key Security & Control Flows

### 4.1 Authentication & IP Lockout
1. **Access Authorization:** When requesting APIs, the client sends the entered PIN in the `X-Access-Pin` request header. 
2. **Access Control Decorator (`@login_required`):**
   - Intercepts requests. Reads client IP.
   - If the IP has had $\ge 5$ invalid attempts, it locks the IP for **12 hours** (returns status `429 Too Many Requests`).
   - Validates that the PIN matches `WRITE_PIN` for mutations (`POST`, `PUT`, `DELETE`) or `READ_PIN`/`WRITE_PIN` for `GET` requests.
3. **Login Endpoint (`/api/login`):** Validates the PIN and returns a JSON payload stating the access role (`read` or `write`).

### 4.2 Document View Proxying (`/api/drive/proxy`)
Because Google Drive links are not publicly accessible and require authentication:
1. When viewing a document on the frontend, links are routed through `/api/drive/proxy?pin=...&link=...&name=...`.
2. The optional `name` query param comes from the record's name field (attachment name, policy name, document name, product name, etc.) so downloads are named e.g. `Blood_Report.pdf` instead of `proxy.pdf`.
3. The same proxy is reused on edit-save when new images are uploaded: the client fetches existing Drive files to decide whether to merge images into a PDF (see §5.5).
4. The backend validates the `pin` argument (applying the lockout rate limits).
5. If authorized, the backend extracts the `file_id` from the Google Drive `webViewLink` and calls the Drive API's `get_media()` method to fetch raw bytes.
6. It streams the raw file bytes back with the original MIME type and a `Content-Disposition: inline; filename="..."` header (falls back to the Drive filename if `name` is omitted).

---

## 5. File Upload & Processing Flow

To keep the Flask server's memory consumption low and prevent Out-Of-Memory (OOM) crashes on 1GB RAM instances, file compilation and modifications happen client-side.

```mermaid
graph TD
    A[User taps Upload Zone] --> B[Show Action Sheet Choice]
    B -->|Camera| C[input type=file capture=environment]
    B -->|Gallery/Files| D[input type=file multiple]
    C --> E[Accumulate File object in memory JS array]
    D --> E
    E --> F[Display list with Crop and Remove controls]
    F -->|Crop/Rotate clicked| G[Open Cropper.js modal]
    G -->|Crop applied| H[Export Canvas to Blob & update JS array]
    F -->|User clicks Save| Q{Any new files selected?}
    Q -->|No| P[Keep existing Drive links unchanged]
    Q -->|Yes| R{Any new images?}
    R -->|No| S[Upload new non-images as-is]
    R -->|Yes| T{Existing Drive links present?}
    T -->|Yes| U[Fetch existing via /api/drive/proxy]
    U --> V{Classify existing files}
    V -->|Images| W[Merge existing images + new images]
    V -->|PDFs / other| X[Keep existing PDF links separate]
    W --> I{Total images ≥ 2?}
    T -->|No| I
    I -->|Yes| J[Auto-compile into PDF client-side via jsPDF]
    I -->|No| K[Compress single image client-side via Canvas]
    J --> L[FormData: PDF + keep non-image existing links]
    K --> M[FormData: JPEG + keep existing links]
    X --> L
    S --> N[Upload to Flask API]
    L --> N
    M --> N
    N --> O[Flask streams file bytes directly to Google Drive]
    O --> P2[Drive link saved to Google Sheet]
```

### 5.1 Mobile Camera Integration
- Mobile browsers (iOS Safari, Android Chrome) trigger the native camera interface directly when an `<input type="file" accept="image/*" capture="environment">` is clicked.
- **Privacy Aspect:** On iOS Safari, images captured through this input are placed directly into the browser session sandbox as temporary uploads and **do not** save to the user's iPhone Photos library.

### 5.2 Client-Side Cropping (Cropper.js)
- Images loaded from inputs are read into memory using a `FileReader` as a Data URL.
- `Cropper.js` is initialized inside an overlay modal `#cropper-modal` to provide image cropping.
- **Rotation:** Images taken on mobile devices are often rotated incorrectly. Buttons in the modal trigger `cropper.rotate(90)` or `-90` to fix this.
- Clicking "Apply" outputs a cropped HTML5 Canvas. We export this canvas back into a raw File object:
  ```javascript
  canvas.toBlob((blob) => {
    const croppedFile = new File([blob], filename, { type: 'image/jpeg' });
    // Replace original file in array
  }, 'image/jpeg', 0.92);
  ```

### 5.3 High-Quality Compression (Target ~2MB)
- Raw photos from modern smartphones are often 10MB+. Uploading multiple uncompressed photos consumes high mobile data and overflows Google Drive limits.
- Before compilation or upload, images are processed in a canvas:
  - Scaled proportionally so that the maximum dimension (width or height) is **2560px** (preserves crisp, fine print on invoices).
  - Exported as JPEG with **0.92** quality.
  - This results in files averaging **1.5MB to 2.5MB** that look identical to the original image but upload much faster.

### 5.4 Automatic PDF Compilation (jsPDF)
- If a user uploads **2 or more images** in a form (same save), they are automatically merged into a single multi-page PDF.
- The client-side logic processes the images sequentially, adds a new page in `jsPDF` for each image, scales each image to fit A4 page dimensions while keeping its aspect ratio, and exports the PDF:
  ```javascript
  const pdfBlob = pdf.output('blob');
  const compiledPdfFile = new File([pdfBlob], name, { type: 'application/pdf' });
  ```
- The compiled `.pdf` file replaces the individual images inside the FormData object before the fetch request is dispatched to the backend API.

### 5.5 Incremental Edits (`prepareUploadWithExisting`)
On edit, previously saved files are stored as Google Drive links (not `File` objects). PDF compilation must therefore consider both **new uploads** and **existing images**.

Implemented in `templates/index.html` via `prepareUploadWithExisting(newFiles, existingLinks, title)` and used by health attachments, insurance, vault, and warranty saves:

| Scenario | Behavior |
|----------|----------|
| No new files selected | Skip Drive fetch entirely; keep existing links unchanged |
| New non-image files only | Upload as-is; no Drive fetch; keep all existing links |
| Existing **image(s)** + new **image(s)** (total ≥ 2) | Fetch existing images via `/api/drive/proxy`, merge with new images into one PDF, **replace** those image links with the new PDF |
| Existing **PDF** (or other non-image) + new photo(s) | Leave the PDF **separate**; compress/compile only the new images and append |
| Fetch failure for an existing file | Treat as non-mergeable; keep the original link so nothing is lost |

Key rules:
- Drive is contacted **only when new images are being uploaded** and there are existing links to evaluate.
- Existing PDFs are never opened or rewritten; new photos stay as a separate JPEG/PDF alongside them.
- After a successful image→PDF merge, the old image Drive links are dropped from `existing_file_links` / `existing_file_link` so the backend appends only the new compiled PDF (plus any kept non-image links).

---

## 6. How to Rebuild & Run the Project

### Step 1: Install Requirements
Ensure Python 3 is installed, then install the dependencies from `requirements.txt`:
```bash
pip install -r requirements.txt
```

### Step 2: Configure Environment
Copy `.env.example` to `.env` and fill in the values:
- Set your target `READ_PIN` and `WRITE_PIN`.
- Place your `credentials.json` file (Service Account or OAuth Client Credentials) in the root directory.
- Specify the `SPREADSHEET_ID` and `DRIVE_ROOT_FOLDER_ID`.

### Step 3: Initialize Google Sheet
Run the initialization script to configure the worksheets and headers:
```bash
python3 init_gsheets.py
```

### Step 4: Run the Server
Launch the Flask development server:
```bash
python3 app.py
```
By default, the application serves on port `5001`. You can access it on `http://127.0.0.1:5001`.

---

## 7. Automated Deploy (GitHub → Oracle Cloud)

Every push to `main` triggers `.github/workflows/deploy.yml`, which SSHs into the VM and runs `scripts/deploy.sh` (`git pull` / `pip install` / `systemctl restart nammane`).

### One-time server setup

1. Ensure the app lives in a git clone (example: `/home/ubuntu/nammane`) with `venv/` and a working `nammane` systemd unit.
2. Allow passwordless restart for the deploy user only:
   ```bash
   sudo tee /etc/sudoers.d/nammane-deploy >/dev/null <<'EOF'
   ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl restart nammane, /bin/systemctl status nammane
   EOF
   sudo chmod 440 /etc/sudoers.d/nammane-deploy
   ```
   (Replace `ubuntu` with your SSH username.)
3. Generate a deploy key on your laptop (do **not** reuse your personal GitHub key if you prefer isolation):
   ```bash
   ssh-keygen -t ed25519 -C "nammane-github-deploy" -f ~/.ssh/nammane_deploy -N ""
   ```
4. Append the **public** key to the server:
   ```bash
   ssh-copy-id -i ~/.ssh/nammane_deploy.pub ubuntu@YOUR_SERVER_IP
   ```
5. Confirm SSH works without a password:
   ```bash
   ssh -i ~/.ssh/nammane_deploy ubuntu@YOUR_SERVER_IP 'cd /home/ubuntu/nammane && bash scripts/deploy.sh'
   ```
   (After this commit is pulled once manually, or run the inline `git pull` commands yourself the first time.)

### GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions** → add:

**Deploy / SSH**

| Secret | Example |
|--------|---------|
| `DEPLOY_HOST` | `132.226.x.x` (Oracle public IP) |
| `DEPLOY_USER` | `ubuntu` |
| `DEPLOY_PATH` | `/home/ubuntu/nammane` |
| `DEPLOY_SSH_KEY` | Full contents of `~/.ssh/nammane_deploy` (private key) |

Optional: `DEPLOY_PORT` if SSH is not on 22 (uncomment `port` in the workflow).

**App config** (written to server `.env` on every deploy)

| Secret | Purpose |
|--------|---------|
| `READ_PIN` | Read-only access PIN |
| `WRITE_PIN` | Read/write access PIN |
| `SPREADSHEET_ID` | Google Sheets spreadsheet ID |
| `DRIVE_ROOT_FOLDER_ID` | Google Drive root folder ID |

All four app secrets must be set. On each deploy, `scripts/deploy.sh` rewrites the server `.env` from these values and restarts the service. To change a PIN or ID: update the GitHub secret, then push to `main` or **Run workflow** manually.

Manual `bash scripts/deploy.sh` on the server (without those env vars exported) leaves the existing `.env` alone.

Google API files (`credentials.json`, `token.json`) stay on the server only — still gitignored, not managed by Actions.

### After setup

- Push to `main` → Actions tab shows **Deploy to Oracle Cloud** → server updates automatically.
- Or trigger **Run workflow** manually from the Actions tab.
- Manual fallback on the server: `bash scripts/deploy.sh`.

**Note:** `git reset --hard origin/main` discards tracked edits on the server. `.env` is regenerated from GitHub secrets when those env vars are present; `credentials.json` / `token.json` remain outside git so they survive resets.
