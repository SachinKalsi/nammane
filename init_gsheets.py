import os
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from dotenv import load_dotenv

load_dotenv()
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

# Schema defined in the specification
TABLES = {
    'People': ['id', 'name', 'dob', 'relation', 'blood_group', 'allergies', 'description', 'created_at'],
    'Health_Entries': ['id', 'person_id', 'name', 'doctor', 'hospital', 'date', 'next_visit_date', 'description', 'linked_entry_id', 'created_at'],
    'Health_Attachments': ['id', 'entry_id', 'name', 'file_path', 'file_drive_link', 'value', 'datetime', 'description', 'created_at'],
    'Health_Medicines': ['id', 'person_id', 'entry_id', 'medicine_name', 'purpose', 'dosage', 'when_to_take', 'from_date', 'until_date', 'ongoing', 'notes', 'created_at'],
    'Health_Insurance': ['id', 'persons_covered', 'provider', 'policy_name', 'policy_number', 'type', 'sum_insured', 'premium_amount', 'premium_frequency', 'premium_due_date', 'renewal_date', 'file_paths', 'file_drive_links', 'notes', 'created_at'],
    'Vault_Documents': ['id', 'person_id', 'category', 'name', 'document_number', 'issued_by', 'issue_date', 'expiry_date', 'file_paths', 'file_drive_links', 'description', 'created_at']
}

def main():
    spreadsheet_id = os.environ.get('SPREADSHEET_ID')
    if not spreadsheet_id:
        print("SPREADSHEET_ID must be set in .env")
        return

    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    sheets_service = build('sheets', 'v4', credentials=creds)
    
    # 1. Get existing sheets
    spreadsheet = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    existing_sheets = {s['properties']['title']: s['properties']['sheetId'] for s in spreadsheet.get('sheets', [])}

    # 2. Add missing sheets
    requests = []
    for tab_name in TABLES.keys():
        if tab_name not in existing_sheets:
            requests.append({
                "addSheet": {
                    "properties": {
                        "title": tab_name
                    }
                }
            })

    if requests:
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": requests}
        ).execute()
        print(f"Added sheets: {[r['addSheet']['properties']['title'] for r in requests]}")

    # 3. Add headers to all sheets
    for tab_name, columns in TABLES.items():
        body = {
            "values": [columns]
        }
        sheets_service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"{tab_name}!A1",
            valueInputOption="USER_ENTERED",
            body=body
        ).execute()
        print(f"Updated headers for {tab_name}")
        
    print("Google Sheets setup complete!")

if __name__ == '__main__':
    main()
