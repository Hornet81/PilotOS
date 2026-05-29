/* PilotOS — eCrews Sync Script v2
 * Loaded by bookmarklet on eCrews page.
 * Intercepts XHR + fetch SchedulerEvents and posts data back to PilotOS.
 */
(function(){
  // Derive PilotOS origin from this script's src
  var TARGET = 'https://pilotos.aero';
  try {
    var scripts = document.getElementsByTagName('script');
    for(var i = scripts.length - 1; i >= 0; i--){
      var src = scripts[i].src || '';
      if(src.indexOf('ec-sync.js') !== -1){
        var a = document.createElement('a');
        a.href = src;
        TARGET = a.protocol + '//' + a.host;
        break;
      }
    }
  } catch(e){}

  var _sent = false;

  // ── Send data to PilotOS ───────────────────────────────────────
  function send(data){
    if(_sent) return; // only send once
    _sent = true;
    if(window.opener){
      try{ window.opener.postMessage({ type:'ECREWS_DATA', payload:data }, TARGET); } catch(e){}
    }
    try{ window.postMessage({ type:'ECREWS_DATA', payload:data }, '*'); } catch(e){}
    showSuccess(data);
  }

  // ── Install XHR interceptor on a window ───────────────────────
  function installXHR(win){
    if(!win || win._ecXhrInstalled) return;
    try {
      win._ecXhrInstalled = true;
      var origOpen = win.XMLHttpRequest.prototype.open;
      win.XMLHttpRequest.prototype.open = function(m, u){
        if(u && u.toString().indexOf('SchedulerEvents') !== -1){
          this.addEventListener('load', function(){
            try{
              var d = JSON.parse(this.responseText);
              if(d && d.SchedulerEvents) send(d);
            } catch(e){}
          });
        }
        return origOpen.apply(this, arguments);
      };
    } catch(e){}
  }

  // ── Install fetch interceptor on a window ─────────────────────
  function installFetch(win){
    if(!win || win._ecFetchInstalled || !win.fetch) return;
    try {
      win._ecFetchInstalled = true;
      var origFetch = win.fetch.bind(win);
      win.fetch = function(input, init){
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var p = origFetch(input, init);
        if(url.indexOf('SchedulerEvents') !== -1){
          p.then(function(resp){
            resp.clone().json().then(function(d){
              if(d && d.SchedulerEvents) send(d);
            }).catch(function(){});
          }).catch(function(){});
        }
        return p;
      };
    } catch(e){}
  }

  // ── Install on main window + all iframes ──────────────────────
  function installAll(){
    installXHR(window);
    installFetch(window);
    var frames = document.querySelectorAll('iframe');
    frames.forEach(function(f){
      try{
        installXHR(f.contentWindow);
        installFetch(f.contentWindow);
      } catch(e){}
    });
  }

  // ── UI helpers ─────────────────────────────────────────────────
  function setStatus(text, color){
    var el = document.getElementById('pilotosStatus');
    if(el){ el.textContent = text; el.style.color = color || 'rgba(248,250,252,.45)'; }
  }

  function showSuccess(data){
    var flights = (data.SchedulerEvents||[]).filter(function(e){ return e.type==='Flight'; }).length;
    var period  = (data.PeriodStart||'').slice(0,7);
    var ov = document.getElementById('pilotosOv');
    if(!ov) return;
    while(ov.firstChild) ov.removeChild(ov.firstChild);

    var inner = mkEl('div','background:#0A1628;border:1.5px solid rgba(8,145,178,.45);border-radius:24px;padding:32px 28px;text-align:center;max-width:320px;width:90%');
    var ic  = mkEl('div','font-size:52px;margin-bottom:12px'); ic.textContent = '✅';
    var tt  = mkEl('div','font-size:18px;font-weight:700;color:#F0FFFE;margin-bottom:6px'); tt.textContent = 'Roster capturado';
    var pp  = mkEl('div','font-size:13px;color:rgba(8,145,178,.9);font-weight:600;margin-bottom:8px'); pp.textContent = period;
    var fl  = mkEl('div','font-size:13px;color:rgba(248,250,252,.5);margin-bottom:24px');
    fl.textContent = flights + (flights === 1 ? ' vuelo detectado' : ' vuelos detectados');
    var cb  = mkEl('button','padding:12px 28px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;width:100%');
    cb.textContent = 'Cerrar'; cb.onclick = function(){ ov.remove(); };
    var ht  = mkEl('div','margin-top:12px;font-size:11px;color:rgba(248,250,252,.25)');
    ht.textContent = 'Vuelve a PilotOS para confirmar la importación';

    [ic,tt,pp,fl,cb,ht].forEach(function(el){ inner.appendChild(el); });
    ov.appendChild(inner);
  }

  function mkEl(tag, css){
    var el = document.createElement(tag);
    if(css) el.style.cssText = css;
    return el;
  }

  // ── Build overlay ──────────────────────────────────────────────
  var existing = document.getElementById('pilotosOv');
  if(existing) existing.remove();

  var ov = mkEl('div','position:fixed;inset:0;z-index:999999;background:rgba(3,8,18,.9);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif');
  ov.id = 'pilotosOv';

  var inner = mkEl('div','background:#0A1628;border:1.5px solid rgba(8,145,178,.45);border-radius:24px;padding:28px 24px;text-align:center;max-width:300px;width:88%');

  var icon = mkEl('div','font-size:42px;margin-bottom:10px'); icon.textContent = '✈';
  var title = mkEl('div','font-size:17px;font-weight:700;color:#F0FFFE;margin-bottom:4px'); title.textContent = 'PilotOS Sync';

  var status = mkEl('div','font-size:12px;color:rgba(248,250,252,.45);margin-bottom:20px;line-height:1.6');
  status.id = 'pilotosStatus';
  status.textContent = 'Pulsa CAPTURAR y navega un mes en eCrews';

  var capBtn = mkEl('button','width:100%;padding:15px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:800;cursor:pointer;display:block;margin-bottom:10px');
  capBtn.id = 'pilotosCaptureBtn';
  capBtn.textContent = 'CAPTURAR';

  var cancelBtn = mkEl('button','width:100%;padding:10px;background:none;border:none;color:rgba(248,250,252,.3);font-size:12px;cursor:pointer');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.onclick = function(){ ov.remove(); };

  capBtn.addEventListener('click', function(){
    if(_sent) return;
    capBtn.textContent = '⏳ Escuchando…';
    capBtn.disabled = true;
    installAll();

    // Poll for new iframes that might load after click
    var pollInterval = setInterval(installAll, 1000);

    setStatus('✓ Interceptor activo — Navega al mes anterior o siguiente en eCrews', 'rgba(74,222,128,.8)');

    // Stop polling after 30s
    setTimeout(function(){
      clearInterval(pollInterval);
      if(!_sent){
        capBtn.textContent = 'Reintentar';
        capBtn.disabled = false;
        setStatus('No se detectó la petición. Intenta navegar el mes.', 'rgba(251,146,60,.8)');
      }
    }, 30000);
  });

  [icon, title, status, capBtn, cancelBtn].forEach(function(el){ inner.appendChild(el); });
  ov.appendChild(inner);
  document.body.appendChild(ov);

  // Install interceptors immediately (in case data loads on page open)
  installAll();

})();
