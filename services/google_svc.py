import os
import io
import json
import uuid
import threading
from datetime import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

class DataService:
    def __init__(self):
        self.spreadsheet_id = os.environ.get('SPREADSHEET_ID')
        self.drive_folder_id = os.environ.get('DRIVE_ROOT_FOLDER_ID')
        
        self.credentials = self._get_credentials()
                
        self.sheets_service = build('sheets', 'v4', credentials=self.credentials) if self.credentials else None
        self.drive_service = build('drive', 'v3', credentials=self.credentials) if self.credentials else None
        self.lock = threading.Lock()

    def _get_credentials(self):
        creds = None
        # The file token.json stores the user's access and refresh tokens
        if os.path.exists('token.json'):
            creds = Credentials.from_authorized_user_file('token.json', SCOPES)
            
        # If there are no (valid) credentials available, let the user log in.
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
                creds = flow.run_local_server(port=0)
            # Save the credentials for the next run
            with open('token.json', 'w') as token:
                token.write(creds.to_json())
        return creds

    # Helper function to get headers for mapping
    def _get_headers(self, sheet_name):
        with self.lock:
            res = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!1:1"
            ).execute()
            return res.get('values', [[]])[0]

    def get_records(self, sheet_name):
        if not self.sheets_service:
            return []
        
        with self.lock:
            res = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!A:Z"
            ).execute()
        
        values = res.get('values', [])
        if not values or len(values) < 2:
            return []
            
        headers = values[0]
        records = []
        for row in values[1:]:
            record = {}
            for i, header in enumerate(headers):
                record[header] = row[i] if i < len(row) else ''
            records.append(record)
        return records

    def create_record(self, sheet_name, data):
        if not self.sheets_service:
            return None
            
        if 'id' not in data or not data['id']:
            data['id'] = str(uuid.uuid4())
        data['created_at'] = datetime.utcnow().isoformat()
        
        headers = self._get_headers(sheet_name)
        row = [data.get(h, '') for h in headers]
        
        with self.lock:
            self.sheets_service.spreadsheets().values().append(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!A:A",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": [row]}
            ).execute()
        return data['id']

    def update_record(self, sheet_name, record_id, data):
        if not self.sheets_service:
            return
            
        with self.lock:
            res = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!A:Z"
            ).execute()
        
        values = res.get('values', [])
        if not values:
            return
            
        headers = values[0]
        id_index = headers.index('id') if 'id' in headers else 0
        
        row_idx = None
        for i, row in enumerate(values):
            if i > 0 and len(row) > id_index and row[id_index] == record_id:
                row_idx = i
                break
                
        if row_idx is not None:
            # Reconstruct the row
            current_row = values[row_idx]
            new_row = []
            for i, h in enumerate(headers):
                if h in data:
                    new_row.append(data[h])
                elif i < len(current_row):
                    new_row.append(current_row[i])
                else:
                    new_row.append('')
                    
            range_to_update = f"{sheet_name}!A{row_idx + 1}"
            with self.lock:
                self.sheets_service.spreadsheets().values().update(
                    spreadsheetId=self.spreadsheet_id,
                    range=range_to_update,
                    valueInputOption="USER_ENTERED",
                    body={"values": [new_row]}
                ).execute()

    def delete_record(self, sheet_name, record_id):
        if not self.sheets_service:
            return
            
        with self.lock:
            res = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id,
                range=f"{sheet_name}!A:Z"
            ).execute()
        
        values = res.get('values', [])
        if not values:
            return
            
        headers = values[0]
        id_index = headers.index('id') if 'id' in headers else 0
        
        row_idx = None
        for i, row in enumerate(values):
            if i > 0 and len(row) > id_index and row[id_index] == record_id:
                row_idx = i
                break
                
        if row_idx is not None:
            with self.lock:
                # First, fetch the sheet ID for `sheet_name`
                spreadsheet = self.sheets_service.spreadsheets().get(spreadsheetId=self.spreadsheet_id).execute()
                sheet_id = next((s['properties']['sheetId'] for s in spreadsheet.get('sheets', []) if s['properties']['title'] == sheet_name), None)
                
                if sheet_id is not None:
                    request = {
                        "deleteDimension": {
                            "range": {
                                "sheetId": sheet_id,
                                "dimension": "ROWS",
                                "startIndex": row_idx,
                                "endIndex": row_idx + 1
                            }
                        }
                    }
                    self.sheets_service.spreadsheets().batchUpdate(
                        spreadsheetId=self.spreadsheet_id,
                        body={"requests": [request]}
                    ).execute()

    def handle_files(self, req_files, key_prefix='files'):
        paths = []
        if not self.drive_service:
            return paths
        
        if key_prefix == 'files':
            for f in req_files.getlist(key_prefix):
                if f and f.filename:
                    file_metadata = {
                        'name': f.filename,
                        'parents': [self.drive_folder_id]
                    }
                    media = MediaIoBaseUpload(io.BytesIO(f.read()), mimetype=f.mimetype or 'application/octet-stream', resumable=True)
                    with self.lock:
                        file = self.drive_service.files().create(body=file_metadata, media_body=media, fields='id, webViewLink').execute()
                    paths.append(file.get('webViewLink'))
        return paths

    def process_entry_attachments(self, entry_id, req):
        if not self.sheets_service: 
            return
            
        atts_str = req.form.get('attachments', '[]')
        try:
            atts = json.loads(atts_str)
        except:
            atts = []
            
        saved_files = {}
        if self.drive_service:
            for key, file_obj in req.files.items():
                if key.startswith('att_file_') and file_obj and file_obj.filename:
                    idx = int(key.split('_')[-1])
                    file_metadata = {
                        'name': file_obj.filename,
                        'parents': [self.drive_folder_id]
                    }
                    media = MediaIoBaseUpload(io.BytesIO(file_obj.read()), mimetype=file_obj.mimetype or 'application/octet-stream', resumable=True)
                    with self.lock:
                        file = self.drive_service.files().create(body=file_metadata, media_body=media, fields='webViewLink').execute()
                    saved_files[idx] = file.get('webViewLink')
                    
        existing_atts = [a for a in self.get_records('Health_Attachments') if a['entry_id'] == entry_id]
        for ext in existing_atts:
            self.delete_record('Health_Attachments', ext['id'])

        for att in atts:
            idx = att.get('file_index', -1)
            ext_link = att.get('existing_file_link', '')
            new_path = saved_files.get(idx, ext_link)
            att_data = {
                'id': str(uuid.uuid4()),
                'entry_id': entry_id,
                'name': att.get('name'),
                'value': att.get('value'),
                'datetime': att.get('datetime'),
                'description': att.get('description'),
                'file_path': new_path,
                'file_drive_link': new_path
            }
            self.create_record('Health_Attachments', att_data)

    def stream_file(self, web_view_link):
        if not self.drive_service or not web_view_link:
            return None, None
            
        # extract file_id from link like https://drive.google.com/file/d/xxxx/view
        try:
            file_id = web_view_link.split('/d/')[1].split('/')[0]
        except IndexError:
            return None, None
            
        with self.lock:
            try:
                # Get the file metadata to find its mimeType
                meta = self.drive_service.files().get(fileId=file_id, fields='mimeType').execute()
                mime = meta.get('mimeType', 'application/octet-stream')
                
                # Fetch raw bytes
                data = self.drive_service.files().get_media(fileId=file_id).execute()
                return data, mime
            except Exception as e:
                print(f"Failed to stream proxy file: {e}")
                return None, None
