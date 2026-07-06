// ============================================================
//  PilotOS — Módulo: Documentos (Documents)
//  Extraído de index.html (refactor split-frontend). SIN cambios de lógica.
//  Depende de globales definidos en index.html: lsGet, showToast.
//  Debe cargarse DESPUÉS del <script> inline que define lsGet.
// ============================================================

// ════════════════════════════════════
// DOCUMENTS SECTION
// ════════════════════════════════════
const DOCS_META = {
  passport: { name: 'Pasaporte',          icon: '🛂', hasExpiry: true },
  license:  { name: 'Licencia ATPL/CPL',  icon: '🪪', hasExpiry: true },
  medical:  { name: 'Médico',             icon: '🏥', hasExpiry: true },
  lang:     { name: 'Comp. Lingüística',  icon: '🌐', hasExpiry: true },
  company:  { name: 'Tarjeta Compañía',   icon: '🪪', hasExpiry: true },
};
const MAX_FILE_MB = 5;
let docsData = {};
try { docsData = JSON.parse(lsGet('pilotos_docs','{}')); } catch(e) {}

function toggleDocPreview(id) {
  const el = document.getElementById('doc-'+id+'-preview');
  el.classList.toggle('open');
}

function handleDocUpload(id, input) {
  const file = input.files[0];
  if (!file) return;
  // Validate type
  const allowed = ['image/jpeg','image/jpg','application/pdf'];
  if (!allowed.includes(file.type)) {
    showToast('❌ Solo se aceptan JPEG o PDF');
    input.value = '';
    return;
  }
  // Validate size
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    showToast('❌ Archivo demasiado grande (máx ' + MAX_FILE_MB + ' MB)');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!docsData[id]) docsData[id] = {};
    docsData[id].fileData = e.target.result;
    docsData[id].fileName = file.name;
    docsData[id].fileType = file.type;
    docsData[id].fileSize = (file.size / 1024).toFixed(0) + ' KB';
    // Show preview
    const isImg = file.type.startsWith('image/');
    const img = document.getElementById('doc-'+id+'-img');
    const wrap = document.getElementById('doc-'+id+'-img-wrap');
    if (isImg && img && wrap) { img.src = e.target.result; wrap.style.display = 'block'; }
    showToast('✓ Archivo cargado. Guarda para confirmar.');
  };
  reader.readAsDataURL(file);
}

function updateDocDates(id) {}

function saveDoc(id) {
  const issued = document.getElementById('doc-'+id+'-issued').value;
  const expiry = document.getElementById('doc-'+id+'-expiry').value;
  if (!docsData[id]) docsData[id] = {};
  docsData[id].issued = issued;
  docsData[id].expiry = expiry;
  try {
    localStorage.setItem('pilotos_docs', JSON.stringify(docsData));
  } catch(e) {
    showToast('⚠ Almacenamiento lleno. Imagen demasiado grande.');
    return;
  }
  renderDocStatus(id);
  renderDocsStrip();
  document.getElementById('doc-'+id+'-preview').classList.remove('open');
  showToast('✓ ' + DOCS_META[id].name + ' guardado');
}

function setCardState(cardEl, state) {
  if (!cardEl) return;
  // Only touch state classes — never touch fade-up/visible
  cardEl.classList.remove('uploaded','expiring','expired');
  if (state) cardEl.classList.add(state);
}

function renderDocStatus(id) {
  const d = docsData[id];
  const statusEl = document.getElementById('doc-'+id+'-status');
  const cardEl = document.getElementById('doc-'+id);
  const badgeEl = document.getElementById('doc-'+id+'-badge');
  const dlEl = document.getElementById('doc-'+id+'-dl');
  if (!d) {
    statusEl.className = 'doc-card-status empty';
    statusEl.innerHTML = '<span class="doc-expiry-dot"></span>Sin documento';
    setCardState(cardEl, null);
    return;
  }
  // File badge
  if (d.fileName && badgeEl) {
    badgeEl.style.display = 'inline-flex';
    const ext = d.fileType === 'application/pdf' ? 'PDF' : 'JPEG';
    badgeEl.textContent = ext + ' · ' + (d.fileSize || '');
  }
  // Download button
  if (d.fileData && dlEl) {
    dlEl.style.display = 'flex';
    dlEl.href = d.fileData;
    dlEl.download = (DOCS_META[id]&&DOCS_META[id].name?DOCS_META[id].name:id) + '_offline' + (d.fileType === 'application/pdf' ? '.pdf' : '.jpg');
  }
  // Restore preview image
  const img = document.getElementById('doc-'+id+'-img');
  const wrap = document.getElementById('doc-'+id+'-img-wrap');
  if (d.fileData && img && wrap && (d.fileType&&d.fileType.startsWith('image/'))) {
    img.src = d.fileData; wrap.style.display = 'block';
  }
  // Restore dates
  if (d.issued) { const el = document.getElementById('doc-'+id+'-issued'); if(el) el.value = d.issued; }
  if (d.expiry) { const el = document.getElementById('doc-'+id+'-expiry'); if(el) el.value = d.expiry; }
  // Status — only update className on statusEl, use classList on cardEl
  if (!d.expiry) {
    statusEl.className = 'doc-card-status ok';
    statusEl.innerHTML = '<span class="doc-expiry-dot" style="background:#4ADE80"></span>Subido · sin caducidad';
    setCardState(cardEl, 'uploaded');
    return;
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(d.expiry);
  const daysLeft = Math.floor((exp - today) / 86400000);
  const expStr = exp.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'});
  if (daysLeft < 0) {
    statusEl.className = 'doc-card-status exp';
    statusEl.innerHTML = '<span class="doc-expiry-dot" style="background:#F87171"></span>CADUCADO · ' + expStr;
    setCardState(cardEl, 'expired');
  } else if (daysLeft <= 90) {
    statusEl.className = 'doc-card-status warn';
    statusEl.innerHTML = '<span class="doc-expiry-dot" style="background:#F59E0B"></span>Caduca en ' + daysLeft + 'd · ' + expStr;
    setCardState(cardEl, 'expiring');
  } else {
    statusEl.className = 'doc-card-status ok';
    statusEl.innerHTML = '<span class="doc-expiry-dot" style="background:#4ADE80"></span>Válido · ' + expStr;
    setCardState(cardEl, 'uploaded');
  }
}

function renderDocsStrip() {
  const strip = document.getElementById('docs-strip');
  if (!strip) return;
  const today = new Date(); today.setHours(0,0,0,0);
  let items = '';
  Object.keys(DOCS_META).forEach(id => {
    const d = docsData[id];
    const meta = DOCS_META[id];
    if (!d || !d.expiry) {
      items += '<div class="dss-item dss-empty"><span class="dss-dot"></span>' + meta.name + '</div>';
      return;
    }
    const exp = new Date(d.expiry);
    const days = Math.floor((exp - today) / 86400000);
    if (days < 0) {
      items += '<div class="dss-item dss-exp"><span class="dss-dot"></span>⚠ ' + meta.name + ' CADUCADO</div>';
    } else if (days <= 90) {
      items += '<div class="dss-item dss-warn"><span class="dss-dot"></span>' + meta.name + ' · ' + days + 'd</div>';
    } else {
      items += '<div class="dss-item dss-ok"><span class="dss-dot"></span>' + meta.name + ' ✓</div>';
    }
  });
  strip.innerHTML = items;
}

function checkDocExpiry() {
  const today = new Date(); today.setHours(0,0,0,0);
  const alerts = [];
  Object.keys(DOCS_META).forEach(id => {
    const d = docsData[id];
    if (!d || !d.expiry) return;
    const exp = new Date(d.expiry);
    const days = Math.floor((exp - today) / 86400000);
    if (days < 0) alerts.push({ id, msg: DOCS_META[id].name + ' está CADUCADO', urgent: true });
    else if (days <= 90) alerts.push({ id, msg: DOCS_META[id].name + ' caduca en ' + days + ' días', urgent: days <= 30 });
  });
  if (alerts.length > 0) {
    const most = alerts.sort((a,b) => b.urgent - a.urgent)[0];
    showToast('⚠️ ' + most.msg);
    if (alerts.some(a => a.urgent)) setTimeout(() => offerEmailAlert(alerts), 2500);
  }
  Object.keys(DOCS_META).forEach(id => renderDocStatus(id));
  renderDocsStrip();
}

function offerEmailAlert(alerts) {
  const msg = alerts.map(a => '• ' + a.msg).join('\n');
  const subject = 'PilotOS — Alerta de caducidad';
  const body = 'Estimado piloto,\n\nDocumentos que requieren atención:\n\n' + msg + '\n\nPilotOS';
  if (confirm('Documentos próximos a caducar. ¿Enviar aviso por email?')) {
    window.location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  Object.keys(DOCS_META).forEach(id => renderDocStatus(id));
  renderDocsStrip();
});
