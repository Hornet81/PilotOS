// ============================================================
//  PilotOS — Módulo: Documentos (Pilot Wallet)
//  Rediseño Fase 1: hero de cumplimiento + "¿Legal para volar?"
//  + tarjetas dinámicas, modo día/noche. MISMO almacenamiento
//  (localStorage 'pilotos_docs', mismos ids) → cero pérdida de datos.
//  Depende de globales de index.html: lsGet, showToast.
//  Debe cargarse DESPUÉS del <script> inline que define lsGet.
// ============================================================

// ── Catálogo de documentos ──────────────────────────────────
// required:true → cuenta para "¿Legal para volar?"
// renewLead → días de antelación recomendada para renovar (aviso proactivo)
const DOCS_META = {
  medical:    { name: 'Certificado Médico',       icon: '🏥', authority: 'AeMC / AME',  required: true,  renewLead: 45 },
  license:    { name: 'Licencia (ATPL/CPL)',      icon: '🪪', authority: 'AESA',         required: true,  renewLead: 60 },
  typerating: { name: 'Habilitación de Tipo',     icon: '✈️', authority: 'AESA / TRE',   required: true,  renewLead: 60 },
  lang:       { name: 'Competencia Lingüística',  icon: '🌐', authority: 'AESA',         required: true,  renewLead: 90 },
  passport:   { name: 'Pasaporte',                icon: '🛂', authority: 'Min. Interior',                 renewLead: 120 },
  company:    { name: 'Tarjeta de Compañía',      icon: '🪪', authority: 'Vueling',                       renewLead: 30 },
};
const MAX_FILE_MB = 5;
let docsData = {};
try { docsData = JSON.parse(lsGet('pilotos_docs','{}')); } catch(e) {}

// ── Estado de un documento ──────────────────────────────────
function docStatus(id) {
  const d = docsData[id];
  const meta = DOCS_META[id] || {};
  if (!d || (!d.fileName && !d.expiry && !d.issued)) return { state:'empty', label:'Sin documento', days:null };
  if (!d.expiry) return { state:'ok', label:'Subido · sin caducidad', days:null };
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(d.expiry);
  const days = Math.floor((exp - today) / 86400000);
  const expStr = exp.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
  if (days < 0)  return { state:'exp',  label:'CADUCADO · ' + expStr, days };
  if (days <= 90) {
    let lbl = 'Caduca en ' + days + 'd · ' + expStr;
    if (meta.renewLead && days <= meta.renewLead) lbl = 'Caduca en ' + days + 'd · toca renovar';
    return { state:'warn', label:lbl, days };
  }
  return { state:'ok', label:'Válido · ' + expStr, days };
}

// ── ¿Legal para volar? (según documentos) ───────────────────
function docLegalToFly() {
  const req = Object.keys(DOCS_META).filter(id => DOCS_META[id].required);
  let state = 'ok';
  const probs = [];
  req.forEach(id => {
    const s = docStatus(id);
    if (s.state === 'empty') { probs.push(DOCS_META[id].name + ' (sin datos)'); if (state === 'ok') state = 'warn'; }
    else if (s.state === 'exp') { probs.push(DOCS_META[id].name + ' caducado'); state = 'bad'; }
    else if (s.state === 'warn' && s.days != null && s.days <= 30) { probs.push(DOCS_META[id].name + ' ' + s.days + 'd'); if (state !== 'bad') state = 'warn'; }
  });
  return { state, probs };
}

// ── Render: hero de cumplimiento ─────────────────────────────
function renderHero() {
  const host = document.getElementById('docs-hero');
  if (!host) return;
  const ids = Object.keys(DOCS_META);
  let tracked = 0, valid = 0, next = null;
  ids.forEach(id => {
    const s = docStatus(id);
    if (s.state !== 'empty') { tracked++; if (s.state !== 'exp') valid++; }
    if (s.days != null && s.days >= 0) { if (!next || s.days < next.days) next = { id, days:s.days }; }
  });
  const pct = tracked ? Math.round(valid / tracked * 100) : 0;
  const ringCol = tracked === 0 ? '#64748B' : (pct >= 80 ? '#22C55E' : (pct >= 50 ? '#F59E0B' : '#EF4444'));
  const circ = 2 * Math.PI * 25;
  const off = circ * (1 - (tracked ? pct : 0) / 100);
  const subTxt = tracked === 0 ? 'Añade tus documentos para empezar' : (valid + ' de ' + tracked + ' vigentes · ' + ids.length + ' tipos');
  let nextHtml = '';
  if (next) {
    const nc = next.days <= 30 ? '#EF4444' : (next.days <= 90 ? '#F97316' : '#22C55E');
    nextHtml = '<div class="dw-hero-next" onclick="openDoc(\'' + next.id + '\')">'
      + '<div class="dw-hero-next-lbl">PRÓXIMA</div>'
      + '<div class="dw-hero-next-days" style="color:' + nc + '">' + next.days + ' d</div>'
      + '<div class="dw-hero-next-name">' + DOCS_META[next.id].name + '</div></div>';
  }
  host.innerHTML =
    '<div class="dw-hero">'
    + '<div class="dw-hero-ring">'
      + '<svg width="66" height="66"><circle cx="33" cy="33" r="25" fill="none" stroke="rgba(120,140,170,.18)" stroke-width="5"/>'
      + '<circle cx="33" cy="33" r="25" fill="none" stroke="' + ringCol + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" style="transition:stroke-dashoffset 1.1s ease .1s"/></svg>'
      + '<span class="dw-ring-ico">🛡️</span>'
    + '</div>'
    + '<div class="dw-hero-main">'
      + '<div class="dw-hero-eyebrow">ESTADO GENERAL</div>'
      + '<div class="dw-hero-pct">' + (tracked ? pct + '%' : '—') + (tracked ? ' <span style="font-size:12px;font-weight:600;color:' + ringCol + '">compliant</span>' : '') + '</div>'
      + '<div class="dw-hero-sub">' + subTxt + '</div>'
    + '</div>'
    + nextHtml
    + '</div>';
}

// ── Render: banner "¿Legal para volar?" ─────────────────────
function renderLegal() {
  const host = document.getElementById('docs-legal');
  if (!host) return;
  const { state, probs } = docLegalToFly();
  const map = {
    ok:   { ico:'🛫', title:'Legal para volar hoy',    sub:'Médico, licencia, habilitación e inglés vigentes' },
    warn: { ico:'⚠️', title:'Atención antes de volar',  sub: probs.join(' · ') },
    bad:  { ico:'⛔', title:'Revisa antes de volar',    sub: probs.join(' · ') },
  };
  const m = map[state];
  host.innerHTML =
    '<div class="dw-legal ' + state + '">'
    + '<span class="dw-legal-ico">' + m.ico + '</span>'
    + '<div class="dw-legal-main"><div class="dw-legal-title">' + m.title + '</div>'
    + '<div class="dw-legal-sub">' + m.sub + '</div></div>'
    + '<span class="dw-legal-tag">SEGÚN DOCS</span>'
    + '</div>';
}

// ── Render: tarjetas de documentos ──────────────────────────
function renderGrid() {
  const grid = document.getElementById('doc-grid');
  if (!grid) return;
  let html = '';
  Object.keys(DOCS_META).forEach(id => {
    const meta = DOCS_META[id];
    const d = docsData[id] || {};
    const s = docStatus(id);
    const cardState = (s.state === 'exp') ? 'expired' : (s.state === 'warn') ? 'expiring' : ((d.fileName || d.expiry) ? 'uploaded' : '');
    const chip = (s.days != null)
      ? '<span class="doc-days-chip" style="color:' + (s.days < 0 ? '#F87171' : (s.days <= 90 ? '#F59E0B' : '#4ADE80')) + '">' + (s.days < 0 ? '!' : s.days + 'd') + '</span>'
      : '';
    const badge = d.fileName
      ? '<div class="doc-file-badge">' + (d.fileType === 'application/pdf' ? 'PDF' : 'JPEG') + ' · ' + (d.fileSize || '') + '</div>'
      : '';
    const dl = d.fileData
      ? '<a class="doc-download-btn" href="' + d.fileData + '" download="' + meta.name + '_offline' + (d.fileType === 'application/pdf' ? '.pdf' : '.jpg') + '" title="Descargar offline" onclick="event.stopPropagation()">💾</a>'
      : '';
    const showImg = d.fileData && d.fileType && d.fileType.indexOf('image/') === 0;
    const imgWrap = '<div id="doc-' + id + '-img-wrap"' + (showImg ? '' : ' style="display:none"') + '><img id="doc-' + id + '-img" src="' + (showImg ? d.fileData : '') + '" alt="" class="doc-preview-img"></div>';
    html +=
      '<div class="doc-card ' + cardState + '" id="doc-' + id + '">'
      + '<div class="doc-card-header" onclick="toggleDocPreview(\'' + id + '\')">'
        + '<div class="doc-card-icon">' + meta.icon + '</div>'
        + '<div class="doc-card-info">'
          + '<div class="doc-card-name">' + meta.name + '</div>'
          + '<div class="doc-card-status ' + s.state + '" id="doc-' + id + '-status"><span class="doc-expiry-dot"></span>' + s.label + '</div>'
          + badge
        + '</div>'
        + '<div class="doc-actions">' + chip + dl + '<div class="doc-action-btn" onclick="event.stopPropagation();toggleDocPreview(\'' + id + '\')">✎</div></div>'
      + '</div>'
      + '<div class="doc-preview" id="doc-' + id + '-preview">'
        + '<div class="doc-upload-area"><div class="doc-upload-row">'
          + '<label class="doc-upload-single"><input type="file" accept="image/jpeg,image/jpg,application/pdf" onchange="handleDocUpload(\'' + id + '\',this)">📎 Archivo</label>'
          + '<label class="doc-upload-single camera"><input type="file" accept="image/jpeg,image/jpg" capture="environment" onchange="handleDocUpload(\'' + id + '\',this)">📷 Cámara</label>'
        + '</div><div style="font-size:10px;opacity:.6;text-align:center;padding-top:2px">JPEG o PDF · máx 5 MB · en este dispositivo</div></div>'
        + imgWrap
        + '<div class="doc-date-form">'
          + '<div class="doc-date-input"><label>Fecha emisión</label><input type="date" id="doc-' + id + '-issued" value="' + (d.issued || '') + '"></div>'
          + '<div class="doc-date-input"><label>Fecha caducidad</label><input type="date" id="doc-' + id + '-expiry" value="' + (d.expiry || '') + '"></div>'
        + '</div>'
        + '<button class="doc-save-btn" onclick="saveDoc(\'' + id + '\')">Guardar →</button>'
      + '</div>'
      + '</div>';
  });
  grid.innerHTML = html;
}

// ── Render: tira de estado superior ─────────────────────────
function renderDocsStrip() {
  const strip = document.getElementById('docs-strip');
  if (!strip) return;
  let items = '';
  Object.keys(DOCS_META).forEach(id => {
    const meta = DOCS_META[id];
    const s = docStatus(id);
    if (s.state === 'empty') { items += '<div class="dss-item dss-empty"><span class="dss-dot"></span>' + meta.name + '</div>'; return; }
    if (s.state === 'exp')   { items += '<div class="dss-item dss-exp"><span class="dss-dot"></span>⚠ ' + meta.name + '</div>'; return; }
    if (s.state === 'warn')  { items += '<div class="dss-item dss-warn"><span class="dss-dot"></span>' + meta.name + ' · ' + s.days + 'd</div>'; return; }
    items += '<div class="dss-item dss-ok"><span class="dss-dot"></span>' + meta.name + ' ✓</div>';
  });
  strip.innerHTML = items;
}

// ── Render completo del wallet ──────────────────────────────
function renderWallet() {
  const grid = document.getElementById('doc-grid');
  if (!grid) return;
  renderHero();
  renderLegal();
  renderGrid();
  renderDocsStrip();
}
// Compat: antiguo renderDocStatus → re-render completo
function renderDocStatus() { renderWallet(); }

// ── Abrir/expandir una tarjeta concreta ─────────────────────
function openDoc(id) {
  const el = document.getElementById('doc-' + id);
  if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
  const pv = document.getElementById('doc-' + id + '-preview');
  if (pv && !pv.classList.contains('open')) pv.classList.add('open');
}

function toggleDocPreview(id) {
  const el = document.getElementById('doc-' + id + '-preview');
  if (el) el.classList.toggle('open');
}

// ── Subir archivo (sin re-render: mantiene el editor abierto) ─
function handleDocUpload(id, input) {
  const file = input.files[0];
  if (!file) return;
  const allowed = ['image/jpeg','image/jpg','application/pdf'];
  if (!allowed.includes(file.type)) { showToast('❌ Solo se aceptan JPEG o PDF'); input.value = ''; return; }
  if (file.size > MAX_FILE_MB * 1024 * 1024) { showToast('❌ Archivo demasiado grande (máx ' + MAX_FILE_MB + ' MB)'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!docsData[id]) docsData[id] = {};
    docsData[id].fileData = e.target.result;
    docsData[id].fileName = file.name;
    docsData[id].fileType = file.type;
    docsData[id].fileSize = (file.size / 1024).toFixed(0) + ' KB';
    const isImg = file.type.indexOf('image/') === 0;
    const img = document.getElementById('doc-' + id + '-img');
    const wrap = document.getElementById('doc-' + id + '-img-wrap');
    if (isImg && img && wrap) { img.src = e.target.result; wrap.style.display = 'block'; }
    showToast('✓ Archivo cargado. Guarda para confirmar.');
  };
  reader.readAsDataURL(file);
}

function updateDocDates() {}

// ── Guardar: persiste y re-renderiza ────────────────────────
function saveDoc(id) {
  const iss = document.getElementById('doc-' + id + '-issued');
  const exp = document.getElementById('doc-' + id + '-expiry');
  if (!docsData[id]) docsData[id] = {};
  docsData[id].issued = iss ? iss.value : '';
  docsData[id].expiry = exp ? exp.value : '';
  try { localStorage.setItem('pilotos_docs', JSON.stringify(docsData)); }
  catch(e) { showToast('⚠ Almacenamiento lleno. Imagen demasiado grande.'); return; }
  renderWallet();
  showToast('✓ ' + DOCS_META[id].name + ' guardado');
}

// ── Aviso de caducidades (al arrancar) ──────────────────────
function checkDocExpiry() {
  renderWallet();
  const alerts = [];
  Object.keys(DOCS_META).forEach(id => {
    const s = docStatus(id);
    if (s.state === 'exp') alerts.push({ id, msg: DOCS_META[id].name + ' está CADUCADO', urgent: true });
    else if (s.state === 'warn') alerts.push({ id, msg: DOCS_META[id].name + ' caduca en ' + s.days + ' días', urgent: s.days <= 30 });
  });
  if (alerts.length > 0) {
    const most = alerts.slice().sort((a,b) => b.urgent - a.urgent)[0];
    showToast('⚠️ ' + most.msg);
    if (alerts.some(a => a.urgent)) setTimeout(() => offerEmailAlert(alerts), 2500);
  }
}

function offerEmailAlert(alerts) {
  const msg = alerts.map(a => '• ' + a.msg).join('\n');
  const subject = 'PilotOS — Alerta de caducidad';
  const body = 'Estimado piloto,\n\nDocumentos que requieren atención:\n\n' + msg + '\n\nPilotOS';
  if (confirm('Documentos próximos a caducar. ¿Enviar aviso por email?')) {
    window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
}

document.addEventListener('DOMContentLoaded', () => { renderWallet(); });
