/* PilotOS — eCrews Sync Script v5
 * Floating widget. User presses CAPTURAR to save current month.
 * Can capture multiple months, then select entries and send.
 */
(function(){

  var TARGET = 'https://pilotos.aero';
  try {
    var ss = document.getElementsByTagName('script');
    for(var i = ss.length-1; i>=0; i--){
      var sr = ss[i].src||'';
      if(sr.indexOf('ec-sync.js')!==-1){
        var a=document.createElement('a'); a.href=sr;
        TARGET=a.protocol+'//'+a.host; break;
      }
    }
  }catch(e){}

  var _lastPayload = null;   // most recent XHR response (updated silently)
  var _allEntries  = [];     // accumulated across captures
  var _capturedMonths = [];  // e.g. ['2026-04','2026-05']

  // ── Helpers ──────────────────────────────────────────────────────
  function mkEl(tag,css,txt){
    var el=document.createElement(tag);
    if(css) el.style.cssText=css;
    if(txt!==undefined) el.textContent=txt;
    return el;
  }
  function $(id){ return document.getElementById(id); }
  var DAY=['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
  function fmtDate(d){
    var o=new Date(d+'T12:00:00Z');
    return DAY[o.getUTCDay()]+' '+o.getUTCDate();
  }

  // ── Parse one event ──────────────────────────────────────────────
  function parseEvent(ev, uid){
    var type    = (ev.type||'').toLowerCase();
    var text    = (ev.text||'').trim();
    var details = (ev.details||'').trim();
    var date    = (ev.start||'').slice(0,10);

    var regSrc  = [details, ev.registration||'', ev.aircraft||'', ev.acType||'', ev.tail||'', ev.reg||''].join(' ');
    var regMatch = regSrc.match(/\b([A-Z]{1,2}-[A-Z0-9]{3,4})\b/);
    var reg = regMatch ? regMatch[1] : '';

    var crew = [];
    if(Array.isArray(ev.crew))       crew = ev.crew.map(function(c){ return typeof c==='string'?c:(c.name||c.Name||''); });
    else if(Array.isArray(ev.Crew))  crew = ev.Crew.map(function(c){ return typeof c==='string'?c:(c.name||c.Name||''); });
    else if(ev.crewMembers)          crew = [].concat(ev.crewMembers);
    else if(ev.CrewMembers)          crew = [].concat(ev.CrewMembers);
    if(!crew.length && details){
      details.split('\n').forEach(function(l){
        l=l.trim();
        if(/^[A-ZÁÉÍÓÚÑ]{2,},\s*[A-ZÁÉÍÓÚÑ]/.test(l)) crew.push(l);
      });
    }

    var legs = [];
    if(type==='flight'){
      details.split('\n').forEach(function(line){
        line=line.trim();
        var m=line.match(/^([A-Z0-9]+)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)/);
        if(m) legs.push({ fNum:'VY'+m[1], dep:m[2],
          std:m[3].slice(0,2)+':'+m[3].slice(2),
          arr:m[4], sta:m[5].slice(0,2)+':'+m[5].slice(2) });
      });
    }

    return { _id:uid, date:date, type:type, text:text,
             legs:legs, reg:reg, crew:crew,
             report:ev.report||'', debrief:ev.debrief||'' };
  }

  // ── XHR interceptor (silent — just stores last payload) ──────────
  function installXHR(win){
    if(!win||win._ecXhr) return;
    try{
      win._ecXhr=true;
      var orig=win.XMLHttpRequest.prototype.open;
      win.XMLHttpRequest.prototype.open=function(m,u){
        if(u&&u.toString().indexOf('SchedulerEvents')!==-1){
          this.addEventListener('load',function(){
            try{
              var d=JSON.parse(this.responseText);
              if(d&&d.SchedulerEvents){
                _lastPayload=d;
                console.log('[PilotOS] payload disponible:', JSON.stringify(d,null,2));
                updateReadyState();
              }
            }catch(e){}
          });
        }
        return orig.apply(this,arguments);
      };
    }catch(e){}
  }

  function installFetch(win){
    if(!win||win._ecFetch||!win.fetch) return;
    try{
      win._ecFetch=true;
      var orig=win.fetch.bind(win);
      win.fetch=function(input,init){
        var url=(typeof input==='string')?input:(input&&input.url)||'';
        var p=orig(input,init);
        if(url.indexOf('SchedulerEvents')!==-1){
          p.then(function(r){ r.clone().json().then(function(d){
            if(d&&d.SchedulerEvents){
              _lastPayload=d;
              console.log('[PilotOS] payload disponible:', JSON.stringify(d,null,2));
              updateReadyState();
            }
          }).catch(function(){}); }).catch(function(){});
        }
        return p;
      };
    }catch(e){}
  }

  function installAll(){
    installXHR(window); installFetch(window);
    document.querySelectorAll('iframe').forEach(function(f){
      try{ installXHR(f.contentWindow); installFetch(f.contentWindow); }catch(e){}
    });
  }

  // ── UI state updates ─────────────────────────────────────────────
  function updateReadyState(){
    var period = (_lastPayload.PeriodStart||'').slice(0,7);
    var nf = (_lastPayload.SchedulerEvents||[]).filter(function(e){ return (e.type||'').toLowerCase()==='flight'; }).length;

    var capBtn = $('_ecCapBtn');
    if(capBtn){
      capBtn.disabled = false;
      capBtn.style.opacity = '1';
      capBtn.textContent = '📥 CAPTURAR  ' + period + ' (' + nf + ' vuelos)';
    }
    var hint = $('_ecHint');
    if(hint){ hint.textContent = 'Mes listo. Pulsa CAPTURAR o navega a otro mes.'; hint.style.color='rgba(74,222,128,.8)'; }
  }

  // ── CAPTURAR button action ───────────────────────────────────────
  function doCapture(){
    if(!_lastPayload) return;
    var period = (_lastPayload.PeriodStart||'').slice(0,7);
    if(_capturedMonths.indexOf(period)!==-1){
      var hint=$('_ecHint');
      if(hint){ hint.textContent='Ya capturaste '+period+'. Navega a otro mes.'; hint.style.color='rgba(251,146,60,.8)'; }
      return;
    }

    var uid = _allEntries.length;
    var newEntries = (_lastPayload.SchedulerEvents||[]).map(function(ev,i){ return parseEvent(ev, uid+i); });
    _allEntries = _allEntries.concat(newEntries);
    _capturedMonths.push(period);
    _lastPayload = null; // reset so next navigation loads fresh

    renderWidget();
  }

  // ── Render full widget ───────────────────────────────────────────
  function renderWidget(){
    var body = $('_ecBody'); if(!body) return;
    body.innerHTML = '';

    // Captured months chips
    if(_capturedMonths.length){
      var chips = mkEl('div','display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px');
      _capturedMonths.forEach(function(m){
        chips.appendChild(mkEl('span',
          'font-size:10px;padding:2px 8px;background:rgba(8,145,178,.2);border:1px solid rgba(8,145,178,.3);border-radius:10px;color:#7DD3FC',
          '✓ '+m));
      });
      body.appendChild(chips);
    }

    // Hint
    var hint = mkEl('div','font-size:10px;color:rgba(248,250,252,.4);margin-bottom:8px;line-height:1.5',
      _capturedMonths.length ? 'Navega a otro mes para seguir acumulando.' : 'Navega al mes que quieres en eCrews.');
    hint.id = '_ecHint';
    body.appendChild(hint);

    // CAPTURAR button
    var capBtn = mkEl('button',
      'width:100%;padding:11px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:10px;'+
      'color:#fff;font-size:12px;font-weight:800;cursor:pointer;margin-bottom:10px;opacity:.4',
      '📥 CAPTURAR MES');
    capBtn.id = '_ecCapBtn';
    capBtn.disabled = true;
    capBtn.onclick = doCapture;
    body.appendChild(capBtn);

    // If we have entries, show list
    if(_allEntries.length){
      widget.style.width    = '340px';
      widget.style.maxHeight= '520px';

      var sep = mkEl('div','border-top:1px solid rgba(8,145,178,.15);margin:0 0 8px');
      body.appendChild(sep);

      // Select all / none
      var bar = mkEl('div','display:flex;justify-content:space-between;align-items:center;margin-bottom:6px');
      var count = mkEl('span','font-size:10px;color:rgba(248,250,252,.4)',
        _allEntries.length+' entradas · '+_allEntries.filter(function(e){return e.type==='flight';}).length+' vuelos');
      var btnRow = mkEl('div','display:flex;gap:4px');
      var sa = mkEl('button','font-size:10px;background:none;border:none;color:rgba(8,145,178,.8);cursor:pointer','Todo');
      var sn = mkEl('button','font-size:10px;background:none;border:none;color:rgba(248,250,252,.3);cursor:pointer','Ninguno');
      sa.onclick=function(){ document.querySelectorAll('._ecCb').forEach(function(c){c.checked=true;}); };
      sn.onclick=function(){ document.querySelectorAll('._ecCb').forEach(function(c){c.checked=false;}); };
      btnRow.appendChild(sa); btnRow.appendChild(sn);
      bar.appendChild(count); bar.appendChild(btnRow);
      body.appendChild(bar);

      // Entry list
      var list = mkEl('div','max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;margin-bottom:10px');
      _allEntries.forEach(function(e){
        var row = mkEl('label','display:flex;align-items:flex-start;gap:6px;padding:5px 7px;background:rgba(8,145,178,.05);border:1px solid rgba(8,145,178,.1);border-radius:7px;cursor:pointer');
        var cb = document.createElement('input');
        cb.type='checkbox'; cb.className='_ecCb'; cb.dataset.id=e._id; cb.checked=true;
        cb.style.cssText='margin-top:2px;accent-color:#0891B2;flex-shrink:0';

        var info = mkEl('div','flex:1;min-width:0');
        var top  = mkEl('div','display:flex;align-items:center;gap:3px;flex-wrap:wrap;margin-bottom:1px');
        top.appendChild(mkEl('span','font-size:10px;color:rgba(8,145,178,.7);font-family:monospace',fmtDate(e.date)));
        top.appendChild(mkEl('span','font-size:9px;padding:1px 4px;background:rgba(8,145,178,.15);border-radius:3px;color:#7DD3FC',e.type.toUpperCase()));
        if(e.reg) top.appendChild(mkEl('span','font-size:9px;padding:1px 4px;background:rgba(245,158,11,.12);border-radius:3px;color:#FCD34D',e.reg));
        info.appendChild(top);

        if(e.legs.length){
          e.legs.forEach(function(l){
            info.appendChild(mkEl('div','font-size:11px;font-family:monospace;color:#F0FFFE',
              l.fNum+' '+l.dep+'→'+l.arr+' '+l.std+'–'+l.sta));
          });
        } else {
          info.appendChild(mkEl('div','font-size:10px;color:rgba(248,250,252,.4)',e.text.split('\n')[0].slice(0,38)));
        }
        if(e.crew.length){
          info.appendChild(mkEl('div','font-size:9px;color:rgba(248,250,252,.3);margin-top:1px',
            '👥 '+e.crew.slice(0,2).join(' · ')+(e.crew.length>2?' +'+(e.crew.length-2):'')));
        }

        row.appendChild(cb); row.appendChild(info);
        list.appendChild(row);
      });
      body.appendChild(list);

      // Send button
      var sendBtn = mkEl('button',
        'width:100%;padding:11px;background:linear-gradient(135deg,#059669,#047857);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer',
        'ENVIAR A PILOTOS →');
      sendBtn.onclick = function(){
        var ids=[];
        document.querySelectorAll('._ecCb:checked').forEach(function(c){ ids.push(parseInt(c.dataset.id)); });
        if(!ids.length) return;
        sendSelected(ids);
      };
      body.appendChild(sendBtn);
    }

    // Re-enable capBtn if lastPayload available
    if(_lastPayload) updateReadyState();
  }

  // ── Send ─────────────────────────────────────────────────────────
  function sendSelected(ids){
    var toSend = _allEntries.filter(function(e){ return ids.indexOf(e._id)!==-1; });
    var payload = { _selected: toSend, _months: _capturedMonths };
    if(window.opener){
      try{ window.opener.postMessage({type:'ECREWS_DATA',payload:payload},TARGET); }catch(e){}
    }
    try{ window.postMessage({type:'ECREWS_DATA',payload:payload},'*'); }catch(e){}

    var body=$('_ecBody'); if(!body) return;
    body.innerHTML='';
    var ok=mkEl('div','text-align:center;padding:12px 0');
    ok.appendChild(mkEl('div','font-size:36px;margin-bottom:6px','✅'));
    ok.appendChild(mkEl('div','font-size:12px;font-weight:700;color:#F0FFFE;margin-bottom:4px',
      toSend.length+' entrada'+(toSend.length===1?'':'s')+' enviada'+(toSend.length===1?'':'s')));
    ok.appendChild(mkEl('div','font-size:10px;color:rgba(248,250,252,.35)','Vuelve a PilotOS para confirmar'));
    body.appendChild(ok);
  }

  // ── Build floating widget ────────────────────────────────────────
  var existing=$('_ecWidget'); if(existing) existing.remove();

  var widget = mkEl('div',
    'position:fixed;bottom:20px;right:16px;z-index:999999;width:220px;'+
    'background:linear-gradient(180deg,#0A1628,#060E1C);'+
    'border:1.5px solid rgba(8,145,178,.4);border-radius:16px;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.6);font-family:system-ui,sans-serif;'+
    'transition:width .25s ease,max-height .3s ease;overflow:hidden');
  widget.id = '_ecWidget';

  // Header
  var hdr = mkEl('div','display:flex;align-items:center;justify-content:space-between;padding:10px 12px;cursor:pointer;user-select:none');
  var hl  = mkEl('div','display:flex;align-items:center;gap:7px');
  hl.appendChild(mkEl('span','font-size:16px','✈'));
  var titles = mkEl('div');
  titles.appendChild(mkEl('div','font-size:12px;font-weight:700;color:#F0FFFE','PilotOS Sync'));
  titles.appendChild(mkEl('div','font-size:10px;color:rgba(8,145,178,.6)','eCrews → PilotOS'));
  hl.appendChild(titles); hdr.appendChild(hl);

  var closeBtn = mkEl('button','background:none;border:none;color:rgba(248,250,252,.35);font-size:18px;cursor:pointer;padding:0 4px;line-height:1','×');
  closeBtn.onclick=function(e){ e.stopPropagation(); widget.remove(); };
  hdr.appendChild(closeBtn);

  var _open = true;
  hdr.onclick=function(){
    _open=!_open;
    body.style.display=_open?'block':'none';
  };

  widget.appendChild(hdr);

  var body = mkEl('div','padding:0 12px 12px');
  body.id='_ecBody';
  widget.appendChild(body);
  document.body.appendChild(widget);

  renderWidget();

  // Install interceptors + keep polling for iframes
  installAll();
  var poll=setInterval(installAll, 1000);
  setTimeout(function(){ clearInterval(poll); }, 120000);

})();
