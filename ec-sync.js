/* PilotOS — eCrews Sync Script
 * Loaded by bookmarklet on eCrews page.
 * Intercepts SchedulerEvents XHR and posts data back to PilotOS.
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

  // ── Helpers ────────────────────────────────────────────────────
  function showSuccess(data){
    var flights = (data.SchedulerEvents||[]).filter(function(e){ return e.type==='Flight'; }).length;
    var period  = (data.PeriodStart||'').slice(0,7);
    var ov = document.getElementById('pilotosOv');
    if(!ov) return;
    while(ov.firstChild) ov.removeChild(ov.firstChild);

    var inner = document.createElement('div');
    inner.style.cssText = 'background:#0A1628;border:1.5px solid rgba(8,145,178,.45);border-radius:24px;padding:32px 28px;text-align:center;max-width:320px;width:90%';

    var ic = document.createElement('div');
    ic.style.fontSize = '52px'; ic.style.marginBottom = '12px'; ic.textContent = '✅';

    var tt = document.createElement('div');
    tt.style.cssText = 'font-size:18px;font-weight:700;color:#F0FFFE;margin-bottom:6px';
    tt.textContent = 'Roster capturado';

    var pp = document.createElement('div');
    pp.style.cssText = 'font-size:13px;color:rgba(8,145,178,.9);font-weight:600;margin-bottom:8px';
    pp.textContent = period;

    var fl = document.createElement('div');
    fl.style.cssText = 'font-size:13px;color:rgba(248,250,252,.5);margin-bottom:24px';
    fl.textContent = flights + (flights === 1 ? ' vuelo detectado' : ' vuelos detectados');

    var cb = document.createElement('button');
    cb.style.cssText = 'padding:12px 28px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;width:100%';
    cb.textContent = 'Cerrar';
    cb.onclick = function(){ ov.remove(); };

    var ht = document.createElement('div');
    ht.style.cssText = 'margin-top:12px;font-size:11px;color:rgba(248,250,252,.25)';
    ht.textContent = 'Vuelve a PilotOS para confirmar';

    inner.appendChild(ic); inner.appendChild(tt); inner.appendChild(pp);
    inner.appendChild(fl); inner.appendChild(cb); inner.appendChild(ht);
    ov.appendChild(inner);
  }

  function send(data){
    if(window.opener){
      try{ window.opener.postMessage({ type:'ECREWS_DATA', payload:data }, TARGET); }
      catch(e){}
    }
    // Also try same-window postMessage (if bookmarklet runs in same tab)
    try{ window.postMessage({ type:'ECREWS_DATA', payload:data }, '*'); } catch(e){}
    showSuccess(data);
  }

  function install(win){
    if(!win || win._ecInstalled) return;
    win._ecInstalled = true;
    try {
      var origOpen = win.XMLHttpRequest.prototype.open;
      win.XMLHttpRequest.prototype.open = function(m, u){
        if(u && u.indexOf('SchedulerEvents') !== -1){
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

  function doCapture(){
    var btn = document.getElementById('pilotosCaptureBtn');
    if(btn){ btn.textContent = '⏳ Capturando…'; btn.disabled = true; }

    // Install interceptor on main window + all iframes
    install(window);
    document.querySelectorAll('iframe').forEach(function(f){
      try{ install(f.contentWindow); } catch(e){}
    });

    // Try to trigger a schedule reload
    var reloaded = false;
    document.querySelectorAll('iframe').forEach(function(f){
      if(reloaded) return;
      try{
        var iw = f.contentWindow;
        if(typeof iw.RenderMySchedule === 'function'){ iw.RenderMySchedule(); reloaded = true; }
        else if(typeof iw.RenderSchedule === 'function'){ iw.RenderSchedule(); reloaded = true; }
      } catch(e){}
    });

    if(!reloaded){
      // Fallback: click Previous → Next to force XHR
      var found = false;
      document.querySelectorAll('iframe').forEach(function(f){
        if(found) return;
        try{
          var prev = f.contentDocument.querySelector(
            'button[onclick*=Previous],button[title*=Previous],.dhx_cal_prev_button'
          );
          if(prev){
            prev.click(); found = true;
            setTimeout(function(){
              var nxt = f.contentDocument.querySelector(
                'button[onclick*=Next],button[title*=Next],.dhx_cal_next_button'
              );
              if(nxt) nxt.click();
            }, 500);
          }
        } catch(e){}
      });
    }

    // Reset button after 6 s if nothing captured yet
    setTimeout(function(){
      var b = document.getElementById('pilotosCaptureBtn');
      if(b && b.disabled){ b.textContent = 'Reintentar'; b.disabled = false; }
    }, 6000);
  }

  // ── Build overlay UI ───────────────────────────────────────────
  if(document.getElementById('pilotosOv')) document.getElementById('pilotosOv').remove();

  var ov = document.createElement('div');
  ov.id = 'pilotosOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(3,8,18,.9);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';

  var inner = document.createElement('div');
  inner.style.cssText = 'background:#0A1628;border:1.5px solid rgba(8,145,178,.45);border-radius:24px;padding:32px 28px;text-align:center;max-width:300px;width:88%';

  var icon = document.createElement('div');
  icon.style.fontSize = '42px'; icon.style.marginBottom = '12px'; icon.textContent = '✈';

  var title = document.createElement('div');
  title.style.cssText = 'font-size:17px;font-weight:700;color:#F0FFFE;margin-bottom:6px';
  title.textContent = 'PilotOS Sync';

  var sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px;color:rgba(248,250,252,.45);margin-bottom:24px;line-height:1.6';
  sub.textContent = 'Pulsa para capturar el roster del mes visible';

  var capBtn = document.createElement('button');
  capBtn.id = 'pilotosCaptureBtn';
  capBtn.style.cssText = 'width:100%;padding:15px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:800;cursor:pointer;display:block;margin-bottom:10px';
  capBtn.textContent = 'CAPTURAR';
  capBtn.addEventListener('click', function(){ doCapture(); });

  var cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = 'width:100%;padding:10px;background:none;border:none;color:rgba(248,250,252,.3);font-size:12px;cursor:pointer';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.onclick = function(){ ov.remove(); };

  inner.appendChild(icon); inner.appendChild(title); inner.appendChild(sub);
  inner.appendChild(capBtn); inner.appendChild(cancelBtn);
  ov.appendChild(inner);
  document.body.appendChild(ov);
})();
