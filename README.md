# Nammane (ನಮ್ಮ ಮನೆ) — Family Life OS

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**Nammane** (meaning "Our Home" in Kannada) is a private, self-hosted family life management system. It acts as a single, secure place for everything that matters—from medical history and ongoing medicines to insurance policies and family documents. 

Designed to be hosted entirely for **free** on the Oracle Cloud Free Tier, it uses Google Drive for file storage and Google Sheets as its database. No third-party apps, no subscriptions, just your data in your control.

## ✨ Features

- **Health Module**: Track medical visits, upload prescriptions, blood reports, and manage ongoing family medicines.
- **Insurance Tracker**: Keep all health, life, and vehicle insurance policies in one place. Never miss a premium due date.
- **Documents Vault (WIP)**: Securely store Identity cards (PAN, Aadhaar, Passports), Property documents, and vehicle RCs.
- **Zero Cost & Private**: Hosted on free-tier infrastructure. Data lives privately in your Google Drive and Google Sheets.
- **PIN-Protected**: 4-digit PIN authentication with secure, 30-day server-side sessions.
- **Mobile-Responsive**: Clean, simple Bootstrap 5 frontend accessible from any device.

## 🛠 Tech Stack

- **Frontend**: HTML5, Bootstrap 5, Vanilla JS
- **Backend**: Python 3, Flask
- **Storage/DB**: Google Drive API, Google Sheets API
- **Deployment**: Gunicorn + systemd on Oracle Cloud Free Tier (Ubuntu)

## 📁 How It Works

Nammane doesn't run its own complex database. Instead, it organizes a dedicated `Nammane/` folder in your Google Drive, sorting uploaded files into neat subdirectories automatically. Structured data (like medicine schedules, document metadata, and insurance profiles) are written to a single Google Sheet with multiple tabs. 

## 🚀 Getting Started

### Prerequisites
1. Python 3.8+
2. A Google Cloud Console project with **Google Drive API** and **Google Sheets API** enabled.
3. A Google Service Account JSON credentials file.
4. An empty Google Sheet and a base Google Drive folder.

### Environment Variables
Create a `.env` file in the root directory based on `.env.example`:

```env
ACCESS_PIN=1234
SESSION_SECRET=your_super_secret_string
GOOGLE_CREDENTIALS_JSON={"type": "service_account", ...}
SPREADSHEET_ID=your_google_sheet_id
DRIVE_ROOT_FOLDER_ID=your_google_drive_folder_id
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/nammane.git
   cd nammane
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Initialize the Google Sheets structure:
   ```bash
   python init_gsheets.py
   ```

5. Run the application locally:
   ```bash
   flask run
   ```

## 🛣 Roadmap
The system structure is ready for expansion. Future modules include:
- **Finance**: Investments, Loans, Taxes
- **Property**: Khata, Sale deeds, Encumbrance Certificates
- **Vehicles**: Service records, PUC tracking
- Expiry alerts for Identity Documents (Passports, DL)

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
