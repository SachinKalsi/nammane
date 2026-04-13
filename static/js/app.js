// ════════════════════════════════════════════════════════
// STATE & CONFIG
// ════════════════════════════════════════════════════════
const API = window.location.origin;
const WHEN_OPTIONS = ['Morning','Afternoon','Night','Before food','After food'];
const VAULT_CATS   = ['All','Identity','Property','Vehicle','Other'];
const CAT_ICONS    = { Identity:'bi-person-vcard', Property:'bi-house', Vehicle:'bi-car-front', Other:'bi-folder' };

let S = {
  people:    [],
  entries:   [],
  medicines: [],
  insurance: [],
  vault:     [],
  // filter states
  homeMedPid:   'all',
  repPid:       'all',
  medPid:       'all',
  insPid:       'all',
  vaultCat:     'All',
  vaultPid:     'all',
  repLimit:     5,
  medLimit:     5,
  // editing
  editingPersonId:   null,
  editingEntryId:    null,
  editingMedId:      null,
  editingInsId:      null,
  editingVaultId:    null,
  // temp files
  insFiles:  [],
  vaultFiles:[],
  insExistingFiles: [],
  vaultExistingFiles: [],
  // auth
  currentPin: localStorage.getItem('nammane_pin') || null,
  role: null,
};

// ════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════
const $  = id => document.getElementById(id);
const fmtDate = d => { try { if(!d) return '—'; return new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch { return d; } };
const fmtMoney = n => n ? '₹'+Number(n).toLocaleString('en-IN') : '—';
const genId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)+Date.now().toString(36);
const initials = n => (n||'').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const getPerson = id => S.people.find(p=>p.id===id) || {};
const daysUntil = d => { if(!d) return 9999; return Math.ceil((new Date(d)-new Date())/(1000*60*60*24)); };

function toast(msg, type='ok') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast-msg show' + (type==='err'?' err':type==='warn'?' warn':'');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.remove('show'), 2600);
}

function overlay(show, msg='Saving...', pct=0) {
  $('overlay').classList.toggle('show', show);
  $('overlay-msg').textContent = msg;
  $('overlay-bar').style.width = pct+'%';
}

function closeModal(id) {
  $(id).classList.remove('show');
}
function openModal(id) {
  $(id).classList.add('show');
  $(id).addEventListener('click', e => { if(e.target === $(id)) closeModal(id); }, {once:true});
}

// ════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════
let pin = '';
function updateDots() {
  for(let i=0;i<4;i++) $('d'+i).classList.toggle('filled', i < pin.length);
}
document.querySelector('.pin-pad').addEventListener('click', async e => {
  const btn = e.target.closest('.pin-btn'); if(!btn) return;
  const n = btn.dataset.n;
  if(n==='clr') pin='';
  else if(n==='del') pin=pin.slice(0,-1);
  else if(pin.length<4) pin+=n;
  updateDots(); $('pin-error').textContent='';
  if(pin.length===4) await submitPin();
});

async function submitPin(autoPin = null) {
  const p = autoPin || pin;
  try {
    const r = await fetch(API+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin: p})});
    const d = await r.json();
    if(r.ok) { 
        S.currentPin = p; S.role = d.role; 
        localStorage.setItem('nammane_pin', p);
        
        // Apply read-only stylings
        if (!document.getElementById('ro-style')) {
            const st = document.createElement('style');
            st.id = 'ro-style';
            st.innerHTML = `
              body.role-read .primary { display: none !important; }
              body.role-read .add-btn { display: none !important; }
              body.role-read .delete-btn { display: none !important; }
              body.role-read .remove-row-btn { display: none !important; }
              body.role-read .upload-zone { pointer-events: none; opacity: 0.5; }
              body.role-read button[onclick*="delete"] { display: none !important; }
              body.role-read button[onclick*="save"] { display: none !important; }
              body.role-read .btn-danger { display: none !important; }
              body.role-read .btn-primary-brand { display: none !important; }
            `;
            document.head.appendChild(st);
        }
        document.body.classList.toggle('role-read', S.role === 'read');
        
        bootApp(); 
    }
    else { 
        $('pin-error').textContent='Wrong PIN. Try again.'; pin=''; updateDots(); 
        localStorage.removeItem('nammane_pin');
    }
  } catch { $('pin-error').textContent='Cannot reach server.'; pin=''; updateDots(); }
}

async function checkAuth() {
  if (S.currentPin) {
    await submitPin(S.currentPin);
  }
}

function doLogout() {
  S.currentPin = null; S.role = null;
  localStorage.removeItem('nammane_pin');
  document.body.classList.remove('role-read');
  $('app').style.display='none';
  $('login-screen').style.display='flex';
  pin=''; updateDots();
}

// ════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════
async function bootApp() {
  $('login-screen').style.display='none';
  $('app').style.display='block';
  overlay(true,'Loading your vault...',20);
  await loadAll();
  overlay(false);
  renderAll();
}

async function api(path, opts={}) {
  const headers = new Headers(opts.headers || {});
  if(S.currentPin) headers.append('X-Access-Pin', S.currentPin);
  
  const r = await fetch(API+path, { ...opts, headers });
  if(!r.ok) {
    if(r.status === 401) { doLogout(); throw new Error('Session Expired'); }
    throw new Error(await r.text());
  }
  return r.json();
}

async function loadAll() {
  try {
    const [people,entries,medicines,insurance,vault] = await Promise.all([
      api('/api/people'), api('/api/entries'), api('/api/medicines'),
      api('/api/insurance'), api('/api/vault')
    ]);
    S.people=people; S.entries=entries; S.medicines=medicines;
    S.insurance=insurance; S.vault=vault;
  } catch(e) { toast('Error loading data: '+e.message,'err'); }
}

function renderAll() {
  renderPeople();
  renderInsurancePage();
  renderReportsPage();
  renderMedicinesPage();
  renderVaultPage();
  rebuildPersonFilters();
}

// ════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  $(id).classList.add('active');
  const map = {'page-home':'nav-home','page-insurance':'nav-insurance','page-reports':'nav-reports','page-medicines':'nav-medicines'};
  if(map[id]) $(map[id]).classList.add('active');
}

// ════════════════════════════════════════════════════════
// PERSON FILTERS (shared utility)
// ════════════════════════════════════════════════════════
function buildFilterStrip(containerId, currentPid, onChange) {
  const el = $(containerId); if(!el) return;
  el.innerHTML = `<button class="fpill ${currentPid==='all'?'active':''}" data-pid="all">All</button>`
    + S.people.map(p=>`<button class="fpill ${currentPid===p.id?'active':''}" data-pid="${p.id}">${p.name.split(' ')[0]}</button>`).join('');
  el.querySelectorAll('.fpill').forEach(btn => btn.addEventListener('click',()=>{
    el.querySelectorAll('.fpill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    onChange(btn.dataset.pid);
  }));
}

function rebuildPersonFilters() {
  buildFilterStrip('ins-filter', S.insPid, pid=>{ S.insPid=pid; renderInsurancePage(); });
  buildFilterStrip('rep-filter', S.repPid, pid=>{ S.repPid=pid; S.repLimit=5; renderReportsPage(); });
  buildFilterStrip('med-filter', S.medPid, pid=>{ S.medPid=pid; S.medLimit=5; renderMedicinesPage(); });
  // vault category filter
  const vcf = $('vault-cat-filter');
  if(vcf) {
    vcf.innerHTML = VAULT_CATS.map(c=>`<button class="fpill ${S.vaultCat===c?'active':''}" data-cat="${c}">${c}</button>`).join('');
    vcf.querySelectorAll('.fpill').forEach(btn=>btn.addEventListener('click',()=>{
      vcf.querySelectorAll('.fpill').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); S.vaultCat=btn.dataset.cat; renderVaultPage();
    }));
  }
  buildFilterStrip('vault-person-filter', S.vaultPid, pid=>{ S.vaultPid=pid; renderVaultPage(); });
}

// ════════════════════════════════════════════════════════
// PEOPLE RENDER
// ════════════════════════════════════════════════════════
function renderPeople() {
  const tbody = $('people-tbody');
  if(!tbody) return;
  if(!S.people.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--muted);font-size:0.82rem;">No people added yet</td></tr>`;
    return;
  }
  tbody.innerHTML = S.people.map(p => {
    const meds = S.medicines.filter(m=>m.person_id===p.id && m.ongoing==='TRUE').map(m=>m.medicine_name);
    const medDisplay = meds.length ? meds.join(', ') : null;
    return `<tr>
      <td>
        <div class="person-name-cell">${p.name}</div>
        <div class="person-rel">${[p.relation, p.blood_group].filter(Boolean).join(' · ')||''}</div>
      </td>
      <td class="${medDisplay?'meds-cell':'meds-cell none'}">${medDisplay||'—'}</td>
      <td style="white-space:nowrap;text-align:right;">
        <button class="btn-xs" style="margin-right:4px;" onclick="openPersonDetail('${p.id}')">View More</button>
        <button class="btn-xs primary" onclick="openPersonModal('${p.id}')">Edit</button>
      </td>
    </tr>`;
  }).join('');
}

// ════════════════════════════════════════════════════════
// HOME — MEDICINES
// ════════════════════════════════════════════════════════
function renderHomeMeds() {
  let meds = S.medicines.filter(m=>m.ongoing==='TRUE');
  if(S.homeMedPid!=='all') meds=meds.filter(m=>m.person_id===S.homeMedPid);
  meds = meds.slice(0,5);
  const el = $('home-meds-list');
  if(!meds.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-capsule"></i><p>No ongoing medicines</p></div>'; return; }
  el.innerHTML = `<div class="card-base" style="padding:10px 14px;">${meds.map(m=>`
    <div class="med-row" onclick="openMedicineModal('${m.id}')">
      <div class="med-dot"></div>
      <div style="flex:1;">
        <div class="med-name">${m.medicine_name} <span style="font-weight:400;color:var(--muted);font-size:0.75rem;">${m.dosage||''}</span></div>
        <div class="med-meta">${getPerson(m.person_id).name||'—'} · ${m.when_to_take||''}</div>
      </div>
    </div>`).join('')}</div>`;
}

// ════════════════════════════════════════════════════════
// HOME — INSURANCE
// ════════════════════════════════════════════════════════
function renderHomeInsurance() {
  const el = $('home-insurance-list');
  if(!S.insurance.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-shield"></i><p>No insurance policies added</p></div>'; return; }
  el.innerHTML = [...S.insurance].sort((a,b)=>daysUntil(a.premium_due_date)-daysUntil(b.premium_due_date)).map(i=>insCardHtml(i)).join('');
}

function insCardHtml(ins) {
  const days = daysUntil(ins.premium_due_date);
  const cls  = days<=7?'danger':days<=30?'warn':'';
  const dueLabel = ins.premium_due_date ? (days<0?'Overdue':days===0?'Due today':`Due in ${days}d`) : '—';
  const persons  = (ins.persons_covered||'').split(',').map(id=>getPerson(id.trim()).name||id).filter(Boolean).join(', ');
  return `<div class="ins-card ${cls}" onclick="openInsuranceDetail('${ins.id}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div class="ins-name">${ins.policy_name||ins.provider}</div>
        <div class="ins-meta">${ins.provider} · ${ins.type} · ${persons}</div>
        <div class="ins-meta">Sum insured: ${fmtMoney(ins.sum_insured)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.72rem;color:var(--muted);">Premium</div>
        <div style="font-weight:600;font-size:0.88rem;">${fmtMoney(ins.premium_amount)}</div>
      </div>
    </div>
    <div class="ins-due ${cls}"><i class="bi bi-calendar-event me-1"></i>${dueLabel} · ${fmtDate(ins.premium_due_date)}</div>
  </div>`;
}

// ════════════════════════════════════════════════════════
// HOME — VAULT
// ════════════════════════════════════════════════════════
function renderHomeVault() {
  const el = $('home-vault-list');
  const docs = S.vault.slice(0,3);
  if(!docs.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-folder2"></i><p>No documents added</p></div>'; return; }
  el.innerHTML = docs.map(d=>vaultCardHtml(d)).join('');
}

function vaultCardHtml(d) {
  const icon = CAT_ICONS[d.category]||'bi-folder';
  const person = d.person_id ? getPerson(d.person_id).name : 'Family';
  return `<div class="vault-card" onclick="openVaultDetail('${d.id}')">
    <div class="vault-icon"><i class="bi ${icon}"></i></div>
    <div style="flex:1;min-width:0;">
      <div class="vault-name">${d.name}</div>
      <div class="vault-meta">${d.category} · ${person}${d.document_number?' · '+d.document_number:''}</div>
    </div>
    <i class="bi bi-chevron-right" style="color:var(--border);font-size:0.85rem;"></i>
  </div>`;
}

// ════════════════════════════════════════════════════════
// INSURANCE PAGE
// ════════════════════════════════════════════════════════
function renderInsurancePage() {
  let list = [...S.insurance];
  if(S.insPid!=='all') list=list.filter(i=>i.persons_covered&&i.persons_covered.includes(S.insPid));
  list.sort((a,b)=>daysUntil(a.premium_due_date)-daysUntil(b.premium_due_date));
  const el = $('insurance-list');
  if(!list.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-shield"></i><p>No policies found</p></div>'; return; }

  const rows = list.map(ins => {
    const days = daysUntil(ins.premium_due_date);
    const dueCls = days<=7?'renew-danger':days<=30?'renew-warn':'renew-ok';
    const dueStr = !ins.premium_due_date ? '—'
      : days<0 ? 'Overdue!'
      : days===0 ? 'Today!'
      : days<=7 ? `${days}d left`
      : fmtDate(ins.premium_due_date);
    const persons = (ins.persons_covered||'').split(',').map(id=>getPerson(id.trim()).name||id).filter(Boolean).join(', ');
    return `<tr onclick="openInsuranceDetail('${ins.id}')">
      <td><div style="font-weight:600;">${ins.provider}</div><div style="font-size:0.7rem;color:var(--muted);">${ins.policy_name||''}</div></td>
      <td><span class="badge-cat">${ins.type}</span></td>
      <td class="${dueCls}">${dueStr}</td>
      <td class="ins-col-hide" style="font-size:0.78rem;color:var(--muted);">${ins.policy_number||'—'}</td>
      <td class="ins-col-hide" style="font-size:0.78rem;">${persons}</td>
      <td><button class="btn-xs" onclick="event.stopPropagation();openInsuranceDetail('${ins.id}')">View</button></td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="table-wrap">
    <table class="ins-table">
      <thead><tr>
        <th>Provider</th>
        <th>Type</th>
        <th>Renew Date</th>
        <th class="ins-col-hide">Policy No.</th>
        <th class="ins-col-hide">Covered</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ════════════════════════════════════════════════════════
// REPORTS PAGE
// ════════════════════════════════════════════════════════
function renderReportsPage() {
  let list = [...S.entries];
  if(S.repPid!=='all') list=list.filter(e=>e.person_id===S.repPid);
  list.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const shown = list.slice(0,S.repLimit);
  const el = $('reports-list');
  if(!shown.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-file-medical"></i><p>No reports found</p></div>'; return; }

  el.innerHTML = `<div class="table-wrap"><table class="entry-table">
    <thead><tr>
      <th>Name</th><th>Person</th><th>Date</th><th>Doctor</th>
    </tr></thead>
    <tbody>${shown.map(e=>`<tr onclick="openEntryDetail('${e.id}')">
      <td style="font-weight:600;">${e.name}</td>
      <td>${getPerson(e.person_id).name||'—'}</td>
      <td style="white-space:nowrap;">${fmtDate(e.date)}</td>
      <td style="color:var(--muted);">${e.doctor||'—'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;

  $('rep-viewall-btn').style.display = list.length>S.repLimit ? '' : 'none';
}
function loadMoreReports() { S.repLimit+=10; renderReportsPage(); }

// ════════════════════════════════════════════════════════
// MEDICINES PAGE
// ════════════════════════════════════════════════════════
function renderMedicinesPage() {
  let list = [...S.medicines];
  if(S.medPid!=='all') list=list.filter(m=>m.person_id===S.medPid);
  list.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const shown = list.slice(0,S.medLimit);
  const el = $('medicines-list');
  if(!shown.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-capsule"></i><p>No medicines found</p></div>'; return; }

  const rows = shown.map(m=>`
    <tr onclick="openMedicineModal('${m.id}')">
      <td>
        <div style="font-weight:600;">${m.medicine_name}</div>
        <div style="font-size:0.7rem;color:var(--muted);">${m.dosage||''}</div>
      </td>
      <td style="font-size:0.78rem;">${getPerson(m.person_id).name||'—'}</td>
      <td style="font-size:0.75rem;color:var(--muted);">${m.when_to_take||'—'}</td>
      <td style="font-size:0.75rem;color:var(--muted);">${fmtDate(m.from_date)}</td>
      <td style="text-align:center;">
        <input type="checkbox" ${m.ongoing==='TRUE'?'checked':''} disabled
          style="width:16px;height:16px;accent-color:var(--brand);cursor:default;">
      </td>
    </tr>`).join('');

  el.innerHTML = `<div class="table-wrap">
    <table class="entry-table">
      <thead><tr>
        <th>Medicine</th><th>Person</th><th>When</th><th>From</th><th style="text-align:center;">Ongoing</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
  $('med-viewall-btn').style.display = list.length>S.medLimit ? '' : 'none';
}
function loadMoreMeds() { S.medLimit+=10; renderMedicinesPage(); }

// ════════════════════════════════════════════════════════
// VAULT PAGE
// ════════════════════════════════════════════════════════
function renderVaultPage() {
  let list = [...S.vault];
  if(S.vaultCat!=='All') list=list.filter(d=>d.category===S.vaultCat);
  if(S.vaultPid!=='all') list=list.filter(d=>d.person_id===S.vaultPid);
  const el = $('vault-list');
  if(!list.length){ el.innerHTML='<div class="empty-state"><i class="bi bi-folder2"></i><p>No documents found</p></div>'; return; }
  el.innerHTML = list.map(d=>vaultCardHtml(d)).join('');
}

// ════════════════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════════════════
$('search-input').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const el = $('search-results');
  if(q.length<2){ el.innerHTML='<div class="empty-state"><i class="bi bi-search"></i><p>Type to search everything</p></div>'; return; }

  const match = (obj, fields) => fields.some(f=>(obj[f]||'').toLowerCase().includes(q));

  const people  = S.people.filter(p=>match(p,['name','relation','allergies','description']));
  const entries = S.entries.filter(e=>match(e,['name','doctor','hospital','description']));
  const meds    = S.medicines.filter(m=>match(m,['medicine_name','purpose','notes']));
  const ins     = S.insurance.filter(i=>match(i,['provider','policy_name','policy_number','notes']));
  const vault   = S.vault.filter(d=>match(d,['name','document_number','description']));

  let html='';
  if(!people.length&&!entries.length&&!meds.length&&!ins.length&&!vault.length){
    el.innerHTML=`<div class="empty-state"><i class="bi bi-search"></i><p>No results for "<strong>${q}</strong>"</p></div>`; return;
  }
  if(entries.length) html+=`<div class="detail-section-title" style="margin-bottom:8px;">Reports (${entries.length})</div>`+entries.map(e=>`<div class="card-base card-tap" onclick="openEntryDetail('${e.id}')"><div style="font-weight:600;font-size:0.85rem;">${e.name}</div><div style="font-size:0.72rem;color:var(--muted);">${getPerson(e.person_id).name||'—'} · ${fmtDate(e.date)}</div></div>`).join('');
  if(meds.length) html+=`<div class="detail-section-title" style="margin:12px 0 8px;">Medicines (${meds.length})</div>`+meds.map(m=>`<div class="card-base card-tap" onclick="openMedicineModal('${m.id}')"><div style="font-weight:600;font-size:0.85rem;">${m.medicine_name}</div><div style="font-size:0.72rem;color:var(--muted);">${getPerson(m.person_id).name||'—'} · ${m.dosage||''}</div></div>`).join('');
  if(ins.length) html+=`<div class="detail-section-title" style="margin:12px 0 8px;">Insurance (${ins.length})</div>`+ins.map(i=>insCardHtml(i)).join('');
  if(vault.length) html+=`<div class="detail-section-title" style="margin:12px 0 8px;">Documents (${vault.length})</div>`+vault.map(d=>vaultCardHtml(d)).join('');
  if(people.length) html+=`<div class="detail-section-title" style="margin:12px 0 8px;">People (${people.length})</div>`+people.map(p=>`<div class="card-base card-tap" onclick="openPersonDetail('${p.id}')"><div style="font-weight:600;font-size:0.85rem;">${p.name}</div><div style="font-size:0.72rem;color:var(--muted);">${p.relation||'—'}</div></div>`).join('');
  el.innerHTML = html;
});

// ════════════════════════════════════════════════════════
// PERSON MODAL (add/edit)
// ════════════════════════════════════════════════════════
function openPersonModal(pid=null) {
  S.editingPersonId = pid;
  const p = pid ? S.people.find(x=>x.id===pid) : null;
  $('person-modal-title').textContent = p ? 'Edit Person' : 'Add Person';
  $('pm-id').value       = p?.id||'';
  $('pm-name').value     = p?.name||'';
  $('pm-dob').value      = p?.dob||'';
  $('pm-relation').value = p?.relation||'';
  $('pm-blood').value    = p?.blood_group||'';
  $('pm-allergies').value= p?.allergies||'';
  $('pm-desc').value     = p?.description||'';
  $('pm-del-btn').style.display = p ? '' : 'none';
  openModal('person-modal');
}

async function savePerson() {
  const name = $('pm-name').value.trim();
  if(!name){ toast('Name is required','warn'); return; }
  const payload = {
    name, dob:$('pm-dob').value, relation:$('pm-relation').value,
    blood_group:$('pm-blood').value, allergies:$('pm-allergies').value,
    description:$('pm-desc').value
  };
  overlay(true,'Saving person...',50);
  try {
    const pid = $('pm-id').value;
    if(pid) await api('/api/people/'+pid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    else await api('/api/people',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:genId(),...payload})});
    await loadAll(); renderAll();
    closeModal('person-modal'); overlay(false); toast(pid?'Person updated':'Person added');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

async function deletePerson() {
  const pid = $('pm-id').value; if(!pid) return;
  if(!confirm('Delete this person? Their records will remain.')) return;
  overlay(true,'Deleting...',50);
  try {
    await api('/api/people/'+pid,{method:'DELETE'});
    await loadAll(); renderAll();
    closeModal('person-modal'); overlay(false); toast('Person deleted');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

// ════════════════════════════════════════════════════════
// PERSON DETAIL
// ════════════════════════════════════════════════════════
function openPersonDetail(pid) {
  const p = S.people.find(x=>x.id===pid); if(!p) return;
  const meds    = S.medicines.filter(m=>m.person_id===pid&&m.ongoing==='TRUE');
  const entries = S.entries.filter(e=>e.person_id===pid).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
  const age     = p.dob ? Math.floor((Date.now()-new Date(p.dob))/(365.25*24*3600*1000)) : null;

  $('person-detail-content').innerHTML=`
    <div style="margin-bottom:18px;">
      <div style="font-family:'Lora',serif;font-size:1.2rem;font-weight:600;">${p.name}</div>
      <div style="font-size:0.78rem;color:var(--muted);margin-top:3px;">${[p.relation,age?age+' yrs':null,p.blood_group].filter(Boolean).join(' · ')}</div>
      ${p.allergies?`<div style="font-size:0.75rem;color:var(--danger);margin-top:4px;"><i class="bi bi-exclamation-triangle me-1"></i>Allergies: ${p.allergies}</div>`:''}
    </div>

    ${p.description?`<div class="detail-section">
      <div class="detail-section-title">Medical History</div>
      <div class="card-base" style="white-space:pre-wrap;font-size:0.82rem;line-height:1.6;">${p.description}</div>
      <button class="btn-xs" style="margin-top:8px;width:auto;padding:6px 14px;" onclick="closeModal('person-detail-modal');openPersonModal('${p.id}')">Edit History</button>
    </div>`:'<div class="detail-section"><div class="detail-section-title">Medical History</div><p style="font-size:0.8rem;color:var(--muted);">No history added. <button class="btn-xs" onclick="closeModal(\'person-detail-modal\');openPersonModal(\'${p.id}\')" style="width:auto;padding:4px 10px;">Add</button></p></div>'}

    <div class="detail-section">
      <div class="detail-section-title">Current Medicines</div>
      ${meds.length ? `<div class="card-base" style="padding:10px 14px;">${meds.map(m=>`<div class="med-row"><div class="med-dot"></div><div><div class="med-name">${m.medicine_name} <span style="font-weight:400;color:var(--muted);font-size:0.75rem;">${m.dosage||''}</span></div><div class="med-meta">${m.when_to_take||''} · Since ${fmtDate(m.from_date)}</div></div></div>`).join('')}</div>` : '<p style="font-size:0.8rem;color:var(--muted);">No ongoing medicines</p>'}
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Recent Reports</div>
      ${entries.length ? entries.map(e=>`<div class="card-base card-tap" onclick="closeModal('person-detail-modal');openEntryDetail('${e.id}')"><div style="font-weight:600;font-size:0.85rem;">${e.name}</div><div style="font-size:0.72rem;color:var(--muted);">${fmtDate(e.date)} · ${e.doctor||'No doctor'}</div></div>`).join('') : '<p style="font-size:0.8rem;color:var(--muted);">No reports</p>'}
    </div>`;
  openModal('person-detail-modal');
}

// ════════════════════════════════════════════════════════
// ENTRY MODAL (add/edit medical report)
// ════════════════════════════════════════════════════════
async function openEntryModal(eid=null) {
  S.editingEntryId = eid;
  const e = eid ? S.entries.find(x=>x.id===eid) : null;
  $('entry-modal-title').textContent = e ? 'Edit Medical Report' : 'Add Medical Report';
  $('em-id').value       = e?.id||'';
  $('em-date').value     = e?.date || new Date().toISOString().split('T')[0];
  $('em-name').value     = e?.name||'';
  $('em-doctor').value   = e?.doctor||'';
  $('em-hospital').value = e?.hospital||'';
  $('em-next').value     = e?.next_visit_date||'';
  $('em-desc').value     = e?.description||'';
  $('em-del-btn').style.display = e ? '' : 'none';

  // Person dropdown
  $('em-person').innerHTML = S.people.map(p=>`<option value="${p.id}"${e?.person_id===p.id?' selected':''}>${p.name}</option>`).join('');

  // Attachments — start with one empty row
  $('em-attachments').innerHTML='';
  if (eid) {
    overlay(true, 'Loading report details...', 50);
    try {
        const full = await api('/api/entries/'+eid+'/full');
        const atts = full.attachments || [];
        if (atts.length) atts.forEach(a => addAttachmentRow(a));
        else addAttachmentRow();
    } catch(err) { addAttachmentRow(); }
    overlay(false);
  } else {
    addAttachmentRow();
  }

  openModal('entry-modal');
}

function addAttachmentRow(att=null) {
  const id = 'att_'+genId().slice(0,8);
  const div = document.createElement('div');
  div.className='repeat-row'; div.id=id;
  div.innerHTML=`
    <button class="remove-row-btn" onclick="this.closest('.repeat-row').remove()"><i class="bi bi-x-lg"></i></button>
    <div class="form-group">
      <label class="form-label">Name *</label>
      <input type="text" class="form-control att-name" value="${att?.name||''}" placeholder="Blood Report, BP Reading, Prescription...">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-group">
        <label class="form-label">Value (optional)</label>
        <input type="text" class="form-control att-value" value="${att?.value||''}" placeholder="120/80 mmHg">
      </div>
      <div class="form-group">
        <label class="form-label">Date & Time</label>
        <input type="datetime-local" class="form-control att-datetime" value="${att?.datetime||''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">File (optional)</label>
      <div class="upload-zone att-zone" style="padding:14px;">
        ${att?.file_drive_link ? `<i class="bi bi-file-earmark-check" style="font-size:1.3rem;color:var(--brand)"></i><p style="margin:4px 0 0;font-size:0.75rem;"><a href="${API}/api/drive/proxy?pin=${S.currentPin}&link=${encodeURIComponent(att.file_drive_link)}" target="_blank" onclick="event.stopPropagation()">View Existing</a><br>or tap to replace</p>` : `<i class="bi bi-cloud-upload" style="font-size:1.3rem;"></i><p>Tap to upload</p>`}
        <input type="file" class="att-file" accept="image/*,application/pdf" style="display:none;">
      </div>
      <div class="att-file-list"></div>
      <input type="hidden" class="att-existing" value="${att?.file_drive_link||''}">
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label class="form-label">Description</label>
      <input type="text" class="form-control att-desc" value="${att?.description||''}" placeholder="Optional notes">
    </div>`;
  const zone = div.querySelector('.att-zone');
  const finput = div.querySelector('.att-file');
  const flist  = div.querySelector('.att-file-list');
  const existingInput = div.querySelector('.att-existing');
  zone.addEventListener('click',()=>finput.click());
  finput.addEventListener('change',()=>{
      renderFileList(finput.files, flist);
      if(finput.files.length > 0) {
          existingInput.value = '';
          zone.querySelector('i').className = 'bi bi-cloud-upload';
          zone.querySelector('p').innerHTML = 'Tap to change';
      }
  });
  $('em-attachments').appendChild(div);
}

function addMedicineRow(containerId) {
  const div = document.createElement('div');
  div.className='repeat-row';
  div.innerHTML=`
    <button class="remove-row-btn" onclick="this.closest('.repeat-row').remove()"><i class="bi bi-x-lg"></i></button>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-group">
        <label class="form-label">Medicine Name *</label>
        <input type="text" class="form-control med-name" placeholder="Metformin">
      </div>
      <div class="form-group">
        <label class="form-label">Dosage</label>
        <input type="text" class="form-control med-dosage" placeholder="500mg">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Purpose</label>
      <input type="text" class="form-control med-purpose" placeholder="For blood sugar control">
    </div>
    <div class="form-group">
      <label class="form-label">When to Take</label>
      <div class="chip-group med-when">
        ${WHEN_OPTIONS.map(w=>`<div class="chip" data-val="${w}">${w}</div>`).join('')}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div class="form-group">
        <label class="form-label">From Date</label>
        <input type="date" class="form-control med-from">
      </div>
      <div class="form-group">
        <label class="form-label">Until Date</label>
        <input type="date" class="form-control med-until">
      </div>
    </div>
    <div class="form-group" style="margin-bottom:0;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.82rem;font-weight:600;color:var(--brand);">
        <input type="checkbox" class="med-ongoing" style="width:15px;height:15px;accent-color:var(--brand);"> Ongoing
      </label>
    </div>`;
  div.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>c.classList.toggle('selected')));
  $(containerId).appendChild(div);
}

function renderFileList(files, container) {
  container.innerHTML='';
  Array.from(files).forEach(f=>{
    const d = document.createElement('div'); d.className='file-item';
    d.innerHTML=`<i class="bi bi-file-earmark"></i><span class="file-item-name">${f.name}</span><span style="font-size:0.7rem;color:var(--muted);">${(f.size/1024).toFixed(0)}KB</span>`;
    container.appendChild(d);
  });
}

async function saveEntry() {
  const name = $('em-name').value.trim();
  const pid  = $('em-person').value;
  const date = $('em-date').value;
  if(!name||!pid||!date){ toast('Name, person and date are required','warn'); return; }

  const fd = new FormData();
  fd.append('id', $('em-id').value || genId());
  fd.append('person_id', pid);
  fd.append('name', name);
  fd.append('doctor', $('em-doctor').value);
  fd.append('hospital', $('em-hospital').value);
  fd.append('date', date);
  fd.append('next_visit_date', $('em-next').value);
  fd.append('description', $('em-desc').value);
  // Collect attachment rows
  const attRows = $('em-attachments').querySelectorAll('.repeat-row');
  const atts = [];
  attRows.forEach((row,i)=>{
    const n = row.querySelector('.att-name')?.value?.trim();
    if(!n) return;
    atts.push({ name:n, value:row.querySelector('.att-value')?.value||'', datetime:row.querySelector('.att-datetime')?.value||'', description:row.querySelector('.att-desc')?.value||'', existing_file_link: row.querySelector('.att-existing')?.value||'' });
    const f = row.querySelector('.att-file')?.files?.[0];
    if(f) fd.append('att_file_'+i, f);
    atts[atts.length-1].file_index = f ? i : -1;
  });
  fd.append('attachments', JSON.stringify(atts));


  overlay(true,'Saving report...',30);
  try {
    const eid = $('em-id').value;
    const hdrs = S.currentPin ? { 'X-Access-Pin': S.currentPin } : {};
    if(eid) await fetch(API+'/api/entries/'+eid,{method:'PUT',headers: hdrs,body:fd});
    else await fetch(API+'/api/entries',{method:'POST',headers: hdrs,body:fd});
    await loadAll(); renderAll();
    closeModal('entry-modal'); overlay(false); toast('Report saved!');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

async function deleteEntry() {
  const eid = $('em-id').value; if(!eid) return;
  if(!confirm('Delete this report and all its attachments?')) return;
  overlay(true,'Deleting...',50);
  try {
    await api('/api/entries/'+eid,{method:'DELETE'});
    await loadAll(); renderAll();
    closeModal('entry-modal'); overlay(false); toast('Report deleted');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

// ════════════════════════════════════════════════════════
// ENTRY DETAIL
// ════════════════════════════════════════════════════════
async function openEntryDetail(eid) {
  overlay(true,'Loading...',50);
  try {
    const data = await api('/api/entries/'+eid+'/full');
    overlay(false);
    const e    = data.entry;
    const atts = data.attachments||[];
    const meds = data.medicines||[];
    const linked = e.linked_entry_id ? S.entries.find(x=>x.id===e.linked_entry_id) : null;

    $('detail-modal-content').innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
        <div>
          <div style="font-family:'Lora',serif;font-size:1.1rem;font-weight:600;">${e.name}</div>
          <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">${getPerson(e.person_id).name||'—'} · ${fmtDate(e.date)}</div>
        </div>
        <button class="btn-xs primary" onclick="closeModal('detail-modal');openEntryModal('${e.id}')">Edit</button>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        ${[['Doctor',e.doctor],['Hospital',e.hospital],['Next Visit',fmtDate(e.next_visit_date)],['Linked Entry',linked?.name]].filter(([,v])=>v).map(([l,v])=>`<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
        ${e.description?`<div style="margin-top:10px;font-size:0.82rem;line-height:1.6;white-space:pre-wrap;">${e.description}</div>`:''}
      </div>

      ${atts.length?`<div class="detail-section">
        <div class="detail-section-title">Attachments (${atts.length})</div>
        ${atts.map(a=>`<div class="card-base" style="margin-bottom:8px;">
          <div style="font-weight:600;font-size:0.85rem;">${a.name}</div>
          ${a.value?`<div style="font-size:0.9rem;font-weight:600;color:var(--brand);margin-top:2px;">${a.value}</div>`:''}
          ${a.datetime?`<div style="font-size:0.72rem;color:var(--muted);">${new Date(a.datetime).toLocaleString('en-IN')}</div>`:''}
          ${a.description?`<div style="font-size:0.78rem;color:var(--muted);margin-top:3px;">${a.description}</div>`:''}
          ${a.file_drive_link?`<a href="${API}/api/drive/proxy?pin=${S.currentPin}&link=${encodeURIComponent(a.file_drive_link)}" target="_blank" style="font-size:0.75rem;color:var(--accent);margin-top:6px;display:inline-block;"><i class="bi bi-cloud me-1"></i>View file</a>`:''}
        </div>`).join('')}
      </div>`:''}

      ${meds.length?`<div class="detail-section">
        <div class="detail-section-title">Medicines (${meds.length})</div>
        ${meds.map(m=>`<div class="card-base" style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;">
            <div style="font-weight:600;font-size:0.85rem;">${m.medicine_name} <span style="font-weight:400;color:var(--muted);">${m.dosage||''}</span></div>
            <span class="badge-cat ${m.ongoing==='TRUE'?'badge-ongoing':'badge-stopped'}">${m.ongoing==='TRUE'?'Ongoing':'Stopped'}</span>
          </div>
          ${m.purpose?`<div style="font-size:0.75rem;color:var(--brand-mid);margin-top:2px;">${m.purpose}</div>`:''}
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;">${m.when_to_take||''} · From ${fmtDate(m.from_date)}</div>
        </div>`).join('')}
      </div>`:''}`;

    $('detail-modal-footer').innerHTML=`<button class="btn-secondary-brand" onclick="closeModal('detail-modal')">Close</button>`;
    openModal('detail-modal');
  } catch(e){ overlay(false); toast('Error: '+e.message,'err'); }
}

// ════════════════════════════════════════════════════════
// MEDICINE MODAL (standalone)
// ════════════════════════════════════════════════════════
function openMedicineModal(mid=null) {
  S.editingMedId = mid;
  const m = mid ? S.medicines.find(x=>x.id===mid) : null;
  $('med-modal-title').textContent = m ? 'Edit Medicine' : 'Add Medicine';
  $('mm-id').value      = m?.id||'';
  $('mm-name').value    = m?.medicine_name||'';
  $('mm-purpose').value = m?.purpose||'';
  $('mm-dosage').value  = m?.dosage||'';
  $('mm-from').value    = m?.from_date||'';
  $('mm-until').value   = m?.until_date||'';
  $('mm-notes').value   = m?.notes||'';
  $('mm-ongoing').checked = m?.ongoing==='TRUE';

  $('mm-person').innerHTML = S.people.map(p=>`<option value="${p.id}"${m?.person_id===p.id?' selected':''}>${p.name}</option>`).join('');
  $('mm-entry').innerHTML  = '<option value="">None</option>'+S.entries.map(e=>`<option value="${e.id}"${m?.entry_id===e.id?' selected':''}>${e.name} (${fmtDate(e.date)})</option>`).join('');

  // When chips
  const selected = (m?.when_to_take||'').split(',').map(x=>x.trim());
  $('mm-when').querySelectorAll('.chip').forEach(c=>{
    c.classList.toggle('selected', selected.includes(c.dataset.val));
    c.onclick = ()=>c.classList.toggle('selected');
  });

  $('mm-del-btn').style.display = m ? '' : 'none';
  openModal('medicine-modal');
}

async function saveMedicine() {
  const name = $('mm-name').value.trim();
  const pid  = $('mm-person').value;
  if(!name||!pid){ toast('Name and person required','warn'); return; }
  const when = Array.from($('mm-when').querySelectorAll('.chip.selected')).map(c=>c.dataset.val).join(',');
  const payload = {
    person_id:pid, medicine_name:name, purpose:$('mm-purpose').value,
    dosage:$('mm-dosage').value, when_to_take:when,
    from_date:$('mm-from').value, until_date:$('mm-until').value,
    ongoing:$('mm-ongoing').checked?'TRUE':'FALSE',
    entry_id:$('mm-entry').value, notes:$('mm-notes').value
  };
  overlay(true,'Saving medicine...',50);
  try {
    const mid = $('mm-id').value;
    if(mid) await api('/api/medicines/'+mid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    else await api('/api/medicines',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:genId(),...payload})});
    await loadAll(); renderAll();
    closeModal('medicine-modal'); overlay(false); toast(mid?'Medicine updated':'Medicine added');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

async function deleteMedicine() {
  const mid = $('mm-id').value; if(!mid) return;
  if(!confirm('Delete this medicine record?')) return;
  overlay(true,'Deleting...',50);
  try {
    await api('/api/medicines/'+mid,{method:'DELETE'});
    await loadAll(); renderAll();
    closeModal('medicine-modal'); overlay(false); toast('Deleted');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

// ════════════════════════════════════════════════════════
// INSURANCE MODAL
// ════════════════════════════════════════════════════════
function openInsuranceModal(iid=null) {
  S.editingInsId = iid;
  const ins = iid ? S.insurance.find(x=>x.id===iid) : null;
  $('ins-modal-title').textContent = ins ? 'Edit Insurance' : 'Add Insurance Policy';
  $('im-id').value       = ins?.id||'';
  $('im-provider').value = ins?.provider||'';
  $('im-type').value     = ins?.type||'Health';
  $('im-pname').value    = ins?.policy_name||'';
  $('im-pnum').value     = ins?.policy_number||'';
  $('im-sum').value      = ins?.sum_insured||'';
  $('im-premium').value  = ins?.premium_amount||'';
  $('im-freq').value     = ins?.premium_frequency||'Annual';
  $('im-due').value      = ins?.premium_due_date||'';
  $('im-renewal').value  = ins?.renewal_date||'';
  $('im-notes').value    = ins?.notes||'';
  $('im-del-btn').style.display = ins ? '' : 'none';
  S.insFiles = [];
  S.insExistingFiles = (ins?.file_drive_links||'').split(',').filter(Boolean);
  renderInsExistingFiles();

  // People multi-select
  const covered = (ins?.persons_covered||'').split(',').map(x=>x.trim());
  $('im-persons').innerHTML = S.people.map(p=>`<div class="people-chip ${covered.includes(p.id)?'selected':''}" data-pid="${p.id}">${p.name.split(' ')[0]}</div>`).join('');
  $('im-persons').querySelectorAll('.people-chip').forEach(c=>c.addEventListener('click',()=>c.classList.toggle('selected')));

  openModal('insurance-modal');
}

$('im-upload-zone').addEventListener('click',()=>$('im-files').click());
$('im-files').addEventListener('change',e=>{
  S.insFiles = Array.from(e.target.files);
  renderInsExistingFiles();
});

function renderInsExistingFiles() {
  const ex = S.insExistingFiles.map(link => `<div class="file-item"><i class="bi bi-cloud-check me-2"></i><span class="file-item-name"><a href="${API}/api/drive/proxy?pin=${S.currentPin}&link=${encodeURIComponent(link)}" target="_blank">Existing File</a></span><button type="button" class="btn-xs" style="margin-left:auto;padding:2px 6px;" onclick="S.insExistingFiles = S.insExistingFiles.filter(l => l !== '${link}'); renderInsExistingFiles()"><i class="bi bi-x-lg"></i></button></div>`).join('');
  const nw = S.insFiles.map(f=>`<div class="file-item"><i class="bi bi-file-earmark"></i><span class="file-item-name">${f.name}</span></div>`).join('');
  $('im-file-list').innerHTML = ex + nw;
}

async function saveInsurance() {
  const provider = $('im-provider').value.trim();
  const persons  = Array.from($('im-persons').querySelectorAll('.people-chip.selected')).map(c=>c.dataset.pid).join(',');
  if(!provider||!persons){ toast('Provider and persons covered required','warn'); return; }

  const fd = new FormData();
  fd.append('id', $('im-id').value||genId());
  fd.append('persons_covered', persons);
  fd.append('provider', provider);
  fd.append('type', $('im-type').value);
  fd.append('policy_name', $('im-pname').value);
  fd.append('policy_number', $('im-pnum').value);
  fd.append('sum_insured', $('im-sum').value);
  fd.append('premium_amount', $('im-premium').value);
  fd.append('premium_frequency', $('im-freq').value);
  fd.append('premium_due_date', $('im-due').value);
  fd.append('renewal_date', $('im-renewal').value);
  fd.append('notes', $('im-notes').value);
  fd.append('existing_file_links', S.insExistingFiles.join(','));
  S.insFiles.forEach(f=>fd.append('files',f));

  overlay(true,'Saving insurance...',30);
  try {
    const iid = $('im-id').value;
    const hdrs = S.currentPin ? { 'X-Access-Pin': S.currentPin } : {};
    if(iid) await fetch(API+'/api/insurance/'+iid,{method:'PUT',headers: hdrs,body:fd});
    else await fetch(API+'/api/insurance',{method:'POST',headers: hdrs,body:fd});
    await loadAll(); renderAll();
    closeModal('insurance-modal'); overlay(false); toast('Insurance saved!');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

function openInsuranceDetail(iid) {
  const ins = S.insurance.find(x=>x.id===iid); if(!ins) return;
  const persons = (ins.persons_covered||'').split(',').map(id=>getPerson(id.trim()).name||id).filter(Boolean).join(', ');
  const days = daysUntil(ins.premium_due_date);
  const dueLabel = ins.premium_due_date ? (days<0?'Overdue!':days===0?'Due today!':days<=7?`Due in ${days} days`:fmtDate(ins.premium_due_date)) : '—';

  $('detail-modal-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div>
        <div style="font-family:'Lora',serif;font-size:1.1rem;font-weight:600;">${ins.policy_name||ins.provider}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">${ins.provider} · ${ins.type}</div>
      </div>
      <button class="btn-xs primary" onclick="closeModal('detail-modal');openInsuranceModal('${ins.id}')">Edit</button>
    </div>
    <div class="detail-section">
      ${[['Persons Covered',persons],['Policy No.',ins.policy_number],['Sum Insured',fmtMoney(ins.sum_insured)],['Premium',fmtMoney(ins.premium_amount)+' / '+ins.premium_frequency],['Next Due',dueLabel],['Renewal',fmtDate(ins.renewal_date)]].filter(([,v])=>v).map(([l,v])=>`<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
    </div>
    ${ins.notes?`<div class="detail-section"><div class="detail-section-title">Notes</div><div style="font-size:0.82rem;">${ins.notes}</div></div>`:''}
    ${ins.file_drive_links?(ins.file_drive_links.split(',').filter(Boolean).map((l,i)=>`<a href="${API}/api/drive/proxy?pin=${S.currentPin}&link=${encodeURIComponent(l.trim())}" target="_blank" style="display:inline-block;margin-right:8px;font-size:0.78rem;color:var(--accent);"><i class="bi bi-cloud me-1"></i>Document ${i+1}</a>`).join('')):''}`;
  $('detail-modal-footer').innerHTML=`<button class="btn-secondary-brand" onclick="closeModal('detail-modal')">Close</button>`;
  openModal('detail-modal');
}

async function deleteInsurance() {
  const iid = $('im-id').value; if(!iid) return;
  if(!confirm('Delete this policy?')) return;
  overlay(true,'Deleting...',50);
  try {
    await api('/api/insurance/'+iid,{method:'DELETE'});
    await loadAll(); renderAll();
    closeModal('insurance-modal'); overlay(false); toast('Deleted');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

// ════════════════════════════════════════════════════════
// VAULT MODAL
// ════════════════════════════════════════════════════════
function openVaultModal(vid=null) {
  S.editingVaultId = vid;
  const d = vid ? S.vault.find(x=>x.id===vid) : null;
  $('vault-modal-title').textContent = d ? 'Edit Document' : 'Add Document';
  $('vm-id').value     = d?.id||'';
  $('vm-cat').value    = d?.category||'Identity';
  $('vm-name').value   = d?.name||'';
  $('vm-num').value    = d?.document_number||'';
  $('vm-issuer').value = d?.issued_by||'';
  $('vm-issue').value  = d?.issue_date||'';
  $('vm-expiry').value = d?.expiry_date||'';
  $('vm-desc').value   = d?.description||'';
  $('vm-del-btn').style.display = d ? '' : 'none';
  S.vaultFiles=[];
  S.vaultExistingFiles=(d?.file_drive_links||'').split(',').filter(Boolean);
  renderVaultExistingFiles();

  $('vm-person').innerHTML = '<option value="">Family / All</option>'+S.people.map(p=>`<option value="${p.id}"${d?.person_id===p.id?' selected':''}>${p.name}</option>`).join('');
  openModal('vault-modal');
}

$('vm-upload-zone').addEventListener('click',()=>$('vm-files').click());
$('vm-files').addEventListener('change',e=>{
  S.vaultFiles=Array.from(e.target.files);
  renderVaultExistingFiles();
});

function renderVaultExistingFiles() {
  const ex = S.vaultExistingFiles.map(link => `<div class="file-item"><i class="bi bi-cloud-check me-2"></i><span class="file-item-name"><a href="${API}/api/drive/proxy?pin=${S.currentPin}&link=${encodeURIComponent(link)}" target="_blank">Existing File</a></span><button type="button" class="btn-xs" style="margin-left:auto;padding:2px 6px;" onclick="S.vaultExistingFiles = S.vaultExistingFiles.filter(l => l !== '${link}'); renderVaultExistingFiles()"><i class="bi bi-x-lg"></i></button></div>`).join('');
  const nw = S.vaultFiles.map(f=>`<div class="file-item"><i class="bi bi-file-earmark"></i><span class="file-item-name">${f.name}</span></div>`).join('');
  $('vm-file-list').innerHTML = ex + nw;
}

async function saveVaultDoc() {
  const name = $('vm-name').value.trim();
  if(!name){ toast('Document name required','warn'); return; }
  const fd = new FormData();
  fd.append('id', $('vm-id').value||genId());
  fd.append('category', $('vm-cat').value);
  fd.append('person_id', $('vm-person').value);
  fd.append('name', name);
  fd.append('document_number', $('vm-num').value);
  fd.append('issued_by', $('vm-issuer').value);
  fd.append('issue_date', $('vm-issue').value);
  fd.append('expiry_date', $('vm-expiry').value);
  fd.append('description', $('vm-desc').value);
  fd.append('existing_file_links', S.vaultExistingFiles.join(','));
  S.vaultFiles.forEach(f=>fd.append('files',f));

  overlay(true,'Saving document...',30);
  try {
    const vid = $('vm-id').value;
    const hdrs = S.currentPin ? { 'X-Access-Pin': S.currentPin } : {};
    if(vid) await fetch(API+'/api/vault/'+vid,{method:'PUT',headers: hdrs,body:fd});
    else await fetch(API+'/api/vault',{method:'POST',headers: hdrs,body:fd});
    await loadAll(); renderAll();
    closeModal('vault-modal'); overlay(false); toast('Document saved!');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

function openVaultDetail(vid) {
  const d = S.vault.find(x=>x.id===vid); if(!d) return;
  const person = d.person_id ? getPerson(d.person_id).name : 'Family';
  $('detail-modal-content').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
      <div>
        <div style="font-family:'Lora',serif;font-size:1.1rem;font-weight:600;">${d.name}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:2px;">${d.category} · ${person}</div>
      </div>
      <button class="btn-xs primary" onclick="closeModal('detail-modal');openVaultModal('${d.id}')">Edit</button>
    </div>
    <div class="detail-section">
      ${[['Doc Number',d.document_number],['Issued By',d.issued_by],['Issue Date',fmtDate(d.issue_date)],['Expiry Date',fmtDate(d.expiry_date)]].filter(([,v])=>v).map(([l,v])=>`<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
    </div>
    ${d.description?`<div class="detail-section"><div class="detail-section-title">Notes</div><div style="font-size:0.82rem;">${d.description}</div></div>`:''}
    ${d.file_drive_links?(d.file_drive_links.split(',').filter(Boolean).map((l,i)=>`<a href="${API}/api/drive/proxy?pin=${S.currentPin}&link=${encodeURIComponent(l.trim())}" target="_blank" style="display:inline-block;margin-right:8px;margin-bottom:4px;font-size:0.78rem;color:var(--accent);"><i class="bi bi-cloud me-1"></i>File ${i+1}</a>`).join('')):''}`;
  $('detail-modal-footer').innerHTML=`<button class="btn-secondary-brand" onclick="closeModal('detail-modal')">Close</button>`;
  openModal('detail-modal');
}

async function deleteVaultDoc() {
  const vid = $('vm-id').value; if(!vid) return;
  if(!confirm('Delete this document?')) return;
  overlay(true,'Deleting...',50);
  try {
    await api('/api/vault/'+vid,{method:'DELETE'});
    await loadAll(); renderAll();
    closeModal('vault-modal'); overlay(false); toast('Deleted');
  } catch(e){ overlay(false); toast(e.message,'err'); }
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});