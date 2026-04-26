import os
import json
import uuid
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, render_template
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
READ_PIN = os.environ.get('READ_PIN', '1111')
WRITE_PIN = os.environ.get('WRITE_PIN', '2222')
from services.google_svc import DataService

data_service = DataService()

# ---------------------------------------------------------
# AUTHENTICATION
# ---------------------------------------------------------

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        pin = request.headers.get('X-Access-Pin')
        if not pin or pin not in [READ_PIN, WRITE_PIN]:
            return jsonify({'error': 'Unauthorized'}), 401
            
        if request.method != 'GET' and pin != WRITE_PIN:
            return jsonify({'error': 'Forbidden - Write Role Required'}), 403
            
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or request.form.to_dict()
    pin = data.get('pin')
    if pin == str(WRITE_PIN):
        return jsonify({'success': True, 'role': 'write'})
    elif pin == str(READ_PIN):
        return jsonify({'success': True, 'role': 'read'})
    return jsonify({'error': 'Invalid PIN'}), 401

@app.route('/api/drive/proxy', methods=['GET'])
def proxy_drive_file():
    pin = request.args.get('pin')
    if not pin or pin not in [READ_PIN, WRITE_PIN]:
        return "Unauthorized: Invalid PIN", 401
    link = request.args.get('link')
    if not link:
        return "Missing link", 400
    
    file_bytes, mime_type = data_service.stream_file(link)
    if not file_bytes:
        return "File not found or unreadable", 404
        
    from flask import Response
    return Response(file_bytes, mimetype=mime_type)

# ---------------------------------------------------------
# UI ROUTES
# ---------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')

# ---------------------------------------------------------
# API ROUTES: PEOPLE
# ---------------------------------------------------------

@app.route('/api/people', methods=['GET'])
@login_required
def get_people():
    return jsonify(data_service.get_records('People'))

@app.route('/api/people', methods=['POST'])
@login_required
def create_person():
    data = request.get_json(silent=True) or request.form.to_dict()
    data_service.create_record('People', data)
    return jsonify({'success': True, 'id': data.get('id')})

@app.route('/api/people/<person_id>', methods=['PUT', 'DELETE'])
@login_required
def modify_person(person_id):
    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form.to_dict()
        data_service.update_record('People', person_id, data)
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        data_service.delete_record('People', person_id)
        return jsonify({'success': True})

# ---------------------------------------------------------
# API ROUTES: ENTRIES (Health)
# ---------------------------------------------------------

@app.route('/api/entries', methods=['GET'])
@login_required
def get_entries():
    return jsonify(data_service.get_records('Health_Entries'))

@app.route('/api/entries', methods=['POST'])
@login_required
def create_entry():
    data = request.get_json(silent=True) or request.form.to_dict()
    data_service.create_record('Health_Entries', data)
    
    data_service.process_entry_attachments(data.get('id'), request)
    return jsonify({'success': True, 'id': data.get('id')})

@app.route('/api/entries/<entry_id>', methods=['PUT', 'DELETE'])
@login_required
def modify_entry(entry_id):
    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form.to_dict()
        data_service.update_record('Health_Entries', entry_id, data)
        # Note: robust editing of attachments would involve deleting old ones or merging. For this mock we just append.
        data_service.process_entry_attachments(entry_id, request)
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        data_service.delete_record('Health_Entries', entry_id)
        # Assuming cascading deletes ideally, simple mock ignores it for now
        return jsonify({'success': True})

@app.route('/api/entries/<entry_id>/full', methods=['GET'])
@login_required
def get_entry_full(entry_id):
    entries = data_service.get_records('Health_Entries')
    entry = next((e for e in entries if e['id'] == entry_id), None)
    if not entry:
        return jsonify({'error': 'Not found'}), 404
        
    atts = [a for a in data_service.get_records('Health_Attachments') if a['entry_id'] == entry_id]
    meds = [m for m in data_service.get_records('Health_Medicines') if m.get('entry_id') == entry_id]
    
    return jsonify({
        'entry': entry,
        'attachments': atts,
        'medicines': meds
    })

# ---------------------------------------------------------
# API ROUTES: ATTACHMENTS
# ---------------------------------------------------------

@app.route('/api/attachments', methods=['GET'])
@login_required
def get_attachments():
    return jsonify(data_service.get_records('Health_Attachments'))

# ---------------------------------------------------------
# API ROUTES: MEDICINES
# ---------------------------------------------------------

@app.route('/api/medicines', methods=['GET'])
@login_required
def get_medicines():
    return jsonify(data_service.get_records('Health_Medicines'))

@app.route('/api/medicines', methods=['POST'])
@login_required
def create_medicine():
    data = request.get_json(silent=True) or request.form.to_dict()
    data_service.create_record('Health_Medicines', data)
    return jsonify({'success': True, 'id': data.get('id')})

@app.route('/api/medicines/<medicine_id>', methods=['PUT', 'DELETE'])
@login_required
def modify_medicine(medicine_id):
    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form.to_dict()
        data_service.update_record('Health_Medicines', medicine_id, data)
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        data_service.delete_record('Health_Medicines', medicine_id)
        return jsonify({'success': True})

# ---------------------------------------------------------
# API ROUTES: INSURANCE
# ---------------------------------------------------------

@app.route('/api/insurance', methods=['GET'])
@login_required
def get_insurance():
    return jsonify(data_service.get_records('Health_Insurance'))

@app.route('/api/insurance', methods=['POST'])
@login_required
def create_insurance():
    data = request.get_json(silent=True) or request.form.to_dict()
    existing = data.pop('existing_file_links', '')
    paths = data_service.handle_files(request.files, 'files', upload_context={'type': 'insurance', 'data': data})
    all_paths = [p for p in existing.split(',') if p] + paths
    data['file_paths'] = ",".join(all_paths)
    data['file_drive_links'] = ",".join(all_paths)
    data_service.create_record('Health_Insurance', data)
    return jsonify({'success': True, 'id': data.get('id')})

@app.route('/api/insurance/<insurance_id>', methods=['PUT', 'DELETE'])
@login_required
def modify_insurance(insurance_id):
    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form.to_dict()
        existing = data.pop('existing_file_links', '')
        paths = data_service.handle_files(request.files, 'files', upload_context={'type': 'insurance', 'data': data})
        all_paths = [p for p in existing.split(',') if p] + paths
        data['file_paths'] = ",".join(all_paths)
        data['file_drive_links'] = ",".join(all_paths)
        data_service.update_record('Health_Insurance', insurance_id, data)
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        data_service.delete_record('Health_Insurance', insurance_id)
        return jsonify({'success': True})

# ---------------------------------------------------------
# API ROUTES: VAULT
# ---------------------------------------------------------

@app.route('/api/vault', methods=['GET'])
@login_required
def get_vault():
    return jsonify(data_service.get_records('Vault_Documents'))

@app.route('/api/vault', methods=['POST'])
@login_required
def create_vault_doc():
    data = request.get_json(silent=True) or request.form.to_dict()
    existing = data.pop('existing_file_links', '')
    paths = data_service.handle_files(request.files, 'files')
    all_paths = [p for p in existing.split(',') if p] + paths
    data['file_paths'] = ",".join(all_paths)
    data['file_drive_links'] = ",".join(all_paths)
    data_service.create_record('Vault_Documents', data)
    return jsonify({'success': True, 'id': data.get('id')})

@app.route('/api/vault/<vault_id>', methods=['PUT', 'DELETE'])
@login_required
def modify_vault_doc(vault_id):
    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form.to_dict()
        existing = data.pop('existing_file_links', '')
        paths = data_service.handle_files(request.files, 'files')
        all_paths = [p for p in existing.split(',') if p] + paths
        data['file_paths'] = ",".join(all_paths)
        data['file_drive_links'] = ",".join(all_paths)
        data_service.update_record('Vault_Documents', vault_id, data)
        return jsonify({'success': True})
    elif request.method == 'DELETE':
        data_service.delete_record('Vault_Documents', vault_id)
        return jsonify({'success': True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
