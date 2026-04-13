import os
import uuid
import json
import pandas as pd
from datetime import datetime
from werkzeug.utils import secure_filename

EXCEL_FILE = 'mock_nammane.xlsx'
TABLES = {
    'People': ['id', 'name', 'dob', 'relation', 'blood_group', 'allergies', 'description', 'created_at'],
    'Health_Entries': ['id', 'person_id', 'name', 'doctor', 'hospital', 'date', 'next_visit_date', 'description', 'linked_entry_id', 'created_at'],
    'Health_Attachments': ['id', 'entry_id', 'name', 'file_path', 'file_drive_link', 'value', 'datetime', 'description', 'created_at'],
    'Health_Medicines': ['id', 'person_id', 'entry_id', 'medicine_name', 'purpose', 'dosage', 'when_to_take', 'from_date', 'until_date', 'ongoing', 'notes', 'created_at'],
    'Health_Insurance': ['id', 'persons_covered', 'provider', 'policy_name', 'policy_number', 'type', 'sum_insured', 'premium_amount', 'premium_frequency', 'premium_due_date', 'renewal_date', 'file_paths', 'file_drive_links', 'notes', 'created_at'],
    'Vault_Documents': ['id', 'person_id', 'category', 'name', 'document_number', 'issued_by', 'issue_date', 'expiry_date', 'file_paths', 'file_drive_links', 'description', 'created_at']
}

class DataService:
    def __init__(self):
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        if not os.path.exists(EXCEL_FILE):
            with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl') as writer:
                for sheet, columns in TABLES.items():
                    pd.DataFrame(columns=columns).to_excel(writer, sheet_name=sheet, index=False)

    def get_records(self, sheet_name):
        df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, dtype=str)
        df = df.fillna('')
        return df.to_dict('records')

    def create_record(self, sheet_name, data):
        df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, dtype=str)
        if 'id' not in data or not data['id']:
            data['id'] = str(uuid.uuid4())
        data['created_at'] = datetime.utcnow().isoformat()
        
        # Append logic
        new_row = pd.DataFrame([data])
        df = pd.concat([df, new_row], ignore_index=True)
        self._save_sheet(sheet_name, df)
        return data['id']

    def update_record(self, sheet_name, record_id, data):
        df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, dtype=str)
        
        # Convert index to be updated
        idx = df.index[df['id'] == record_id].tolist()
        if idx:
            for k, v in data.items():
                if k not in df.columns:
                    df[k] = ''
                df.at[idx[0], k] = v
            self._save_sheet(sheet_name, df)

    def delete_record(self, sheet_name, record_id):
        df = pd.read_excel(EXCEL_FILE, sheet_name=sheet_name, dtype=str)
        df = df[df['id'] != record_id]
        self._save_sheet(sheet_name, df)

    def handle_files(self, req_files, key_prefix='files'):
        upload_folder = os.path.join('static', 'uploads')
        os.makedirs(upload_folder, exist_ok=True)
        paths = []
        if key_prefix == 'files':
            for f in req_files.getlist(key_prefix):
                if f and f.filename:
                    filename = secure_filename(str(uuid.uuid4())[:8] + "_" + f.filename)
                    f.save(os.path.join(upload_folder, filename))
                    paths.append(f"/static/uploads/{filename}")
        return paths

    def process_entry_attachments(self, entry_id, req):
        upload_folder = os.path.join('static', 'uploads')
        os.makedirs(upload_folder, exist_ok=True)
        atts_str = req.form.get('attachments', '[]')
        try:
            atts = json.loads(atts_str)
        except:
            atts = []
            
        saved_files = {}
        for key, file_obj in req.files.items():
            if key.startswith('att_file_') and file_obj and file_obj.filename:
                idx = int(key.split('_')[-1])
                filename = secure_filename(str(uuid.uuid4())[:8] + "_" + file_obj.filename)
                file_obj.save(os.path.join(upload_folder, filename))
                saved_files[idx] = f"/static/uploads/{filename}"
                
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

    def _save_sheet(self, sheet_name, new_df):
        # We need to rewrite the entire excel file, keeping other sheets intact.
        sheets_dict = pd.read_excel(EXCEL_FILE, sheet_name=None, dtype=str)
        sheets_dict[sheet_name] = new_df
        
        with pd.ExcelWriter(EXCEL_FILE, engine='openpyxl') as writer:
            for s_name, df in sheets_dict.items():
                # Ensure no NaN gets written
                df = df.fillna('')
                df.to_excel(writer, sheet_name=s_name, index=False)
