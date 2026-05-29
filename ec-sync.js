/* PilotOS — eCrews Sync Script v3
 * Intercepts SchedulerEvents XHR/fetch.
 * Lets user pick individual days before sending to PilotOS.
 * Logs raw JSON to console for debugging (matrícula, tripulantes).
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

  var _data    = null;   // raw payload
  var _entries = [];     // parsed entries

  // ── Send selected entries to PilotOS ────────────────────────────
  function sendSelected(ids){
    var toSend = _entries.filter(function(e){ return ids.indexOf(e._id)!==-1; });
    var payload = {
      SchedulerEvents: _data.SchedulerEvents,
      BlockDutyTimes:  _data.BlockDutyTimes||{},
      PeriodStart:     _data.PeriodStart||'',
      _selected:       toSend
    };
    if(window.opener){
      try{ window.opener.postMessage({type:'ECREWS_DATA',payload:payload},TARGET); }catch(e){}
    }
    try{ window.postMessage({type:'ECREWS_DATA',payload:payload},'*'); }catch(e){}
    showSent(toSend.length);
  }

  // ── Parse raw event into display entry ──────────────────────────
  function parseEvent(ev, idx){
    var type    = (ev.type||'').toLowerCase();
    var text    = (ev.text||'').trim();
    var details = (ev.details||'').trim();
    var date    = (ev.start||'').slice(0,10);

    // ── Try to extract aircraft registration (EC-XXX) ──
    var regMatch = (details+' '+(ev.registration||'')+(ev.aircraft||'')+(ev.acType||'')+(ev.tail||''))
                   .match(/\b([A-Z]{1,2}-[A-Z]{3,4})\b/);
    var reg = regMatch ? regMatch[1] : (ev.registration||ev.tail||ev.aircraft||'');

    // ── Try to extract crew names ──
    // Common formats: "Name, Surname" or in a dedicated array
    var crew = [];
    if(Array.isArray(ev.crew))       crew = ev.crew;
    else if(Array.isArray(ev.Crew))  crew = ev.Crew;
    else if(ev.crewMembers)          crew = ev.crewMembers;
    else if(ev.CrewMembers)          crew = ev.CrewMembers;
    // Fallback: scan details for name-like lines (SURNAME, Name pattern)
    if(!crew.length && details){
      var lines = details.split('\n');
      lines.forEach(function(l){
        l = l.trim();
        if(/^[A-ZÁÉÍÓÚÑ]{2,},\s*[A-ZÁÉÍÓÚÑ]/.test(l)) crew.push(l);
      });
    }

    // ── Flight legs from details ──
    var legs = [];
    if(type==='flight'){
      (details.split('\n')||[]).forEach(function(line){
        line=line.trim();
        var m=line.match(/^([A-Z0-9]+)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)/);
        if(m) legs.push({
          fNum: 'VY'+m[1], dep:m[2],
          std: m[3].slice(0,2)+':'+m[3].slice(2),
          arr: m[4],
          sta: m[5].slice(0,2)+':'+m[5].slice(2)
        });
      });
    }

    return {
      _id:     idx,
      date:    date,
      type:    type,
      text:    text,
      legs:    legs,
      reg:     reg,
      crew:    crew,
      report:  ev.report||'',
      debrief: ev.debrief||'',
      raw:     ev
    };
  }

  // ── Handle captured data ─────────────────────────────────────────
  function onData(d){
    if(_data) return; // already captured
    _data = d;

    // Log raw JSON so we can inspect all fields
    console.log('[PilotOS] eCrews raw payload:', JSON.stringify(d, null, 2));
    console.log('[PilotOS] First 3 SchedulerEvents:',
      (d.SchedulerEvents||[]).slice(0,3).map(function(e){ return JSON.stringify(e); }).join('\n'));

    _entries = (d.SchedulerEvents||[]).map(function(ev,i){ return parseEvent(ev,i); });
    renderList();
  }

  // ── XHR interceptor ─────────────────────────────────────────────
  function installXHR(win){
    if(!win||win._ecXhr) return;
    try{
      win._ecXhr=true;
      var orig=win.XMLHttpRequest.prototype.open;
      win.XMLHttpRequest.prototype.open=function(m,u){
        if(u&&u.toString().indexOf('SchedulerEvents')!==-1){
          this.addEventListener('load',function(){
            try{ var d=JSON.parse(this.responseText); if(d&&d.SchedulerEvents) onData(d); }catch(e){}
          });
        }
        return orig.apply(this,arguments);
      };
    }catch(e){}
  }

  // ── Fetch interceptor ────────────────────────────────────────────
  function installFetch(win){
    if(!win||win._ecFetch||!win.fetch) return;
    try{
      win._ecFetch=true;
      var orig=win.fetch.bind(win);
      win.fetch=function(input,init){
        var url=(typeof input==='string')?input:(input&&input.url)||'';
        var p=orig(input,init);
        if(url.indexOf('SchedulerEvents')!==-1){
          p.then(function(r){ r.clone().json().then(function(d){ if(d&&d.SchedulerEvents) onData(d); }).catch(function(){}); }).catch(function(){});
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

  // ── UI helpers ───────────────────────────────────────────────────
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

  // ── Render selection list ─────────────────────────────────────────
  function renderList(){
    var panel=$('_ecPanel');
    if(!panel) return;
    panel.innerHTML='';

    // Header
    var hdr=mkEl('div','display:flex;align-items:center;justify-content:space-between;margin-bottom:12px');
    var ht=mkEl('div','font-size:13px;font-weight:700;color:#F0FFFE');
    var period=(_data.PeriodStart||'').slice(0,7);
    var flights=_entries.filter(function(e){return e.type==='flight';}).length;
    ht.textContent='✓ '+period+' · '+_entries.length+' eventos · '+flights+' vuelos';
    var selAll=mkEl('button','font-size:10px;background:none;border:none;color:rgba(8,145,178,.8);cursor:pointer;padding:2px 6px','Todo');
    var selNone=mkEl('button','font-size:10px;background:none;border:none;color:rgba(248,250,252,.3);cursor:pointer;padding:2px 6px','Ninguno');
    selAll.onclick=function(){ document.querySelectorAll('._ecCb').forEach(function(c){c.checked=true;}); };
    selNone.onclick=function(){ document.querySelectorAll('._ecCb').forEach(function(c){c.checked=false;}); };
    hdr.appendChild(ht);
    var btns=mkEl('div','display:flex;gap:2px');
    btns.appendChild(selAll); btns.appendChild(selNone);
    hdr.appendChild(btns);
    panel.appendChild(hdr);

    // List
    var list=mkEl('div','max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:5px;margin-bottom:12px');
    _entries.forEach(function(e){
      var row=mkEl('label','display:flex;align-items:flex-start;gap:8px;padding:7px 9px;background:rgba(8,145,178,.06);border:1px solid rgba(8,145,178,.14);border-radius:10px;cursor:pointer');
      var cb=document.createElement('input');
      cb.type='checkbox'; cb.className='_ecCb'; cb.dataset.id=e._id; cb.checked=true;
      cb.style.cssText='margin-top:2px;accent-color:#0891B2;flex-shrink:0';

      var info=mkEl('div','flex:1;min-width:0');
      var top=mkEl('div','display:flex;align-items:center;gap:6px;flex-wrap:wrap');
      var day=mkEl('span','font-size:10px;color:rgba(8,145,178,.7);font-family:monospace',fmtDate(e.date)+' · '+e.date);
      var typ=mkEl('span','font-size:10px;padding:1px 5px;background:rgba(8,145,178,.15);border-radius:4px;color:#7DD3FC',e.type.toUpperCase());
      top.appendChild(day); top.appendChild(typ);

      if(e.reg){
        var rg=mkEl('span','font-size:10px;padding:1px 5px;background:rgba(245,158,11,.12);border-radius:4px;color:#FCD34D',e.reg);
        top.appendChild(rg);
      }
      info.appendChild(top);

      if(e.legs.length){
        e.legs.forEach(function(l){
          var leg=mkEl('div','font-size:11px;font-family:monospace;color:#F0FFFE;margin-top:3px',
            l.fNum+' '+l.dep+'→'+l.arr+' '+l.std+'–'+l.sta);
          info.appendChild(leg);
        });
      } else {
        var tx=mkEl('div','font-size:11px;color:rgba(248,250,252,.45);margin-top:2px',e.text.split('\n')[0]);
        info.appendChild(tx);
      }

      if(e.crew.length){
        var cr=mkEl('div','font-size:10px;color:rgba(248,250,252,.35);margin-top:2px',
          '👥 '+e.crew.slice(0,3).join(' · ')+(e.crew.length>3?' +'+( e.crew.length-3):''));
        info.appendChild(cr);
      }

      row.appendChild(cb); row.appendChild(info);
      list.appendChild(row);
    });
    panel.appendChild(list);

    // Send button
    var sendBtn=mkEl('button',
      'width:100%;padding:13px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:800;cursor:pointer',
      'ENVIAR A PILOTOS →');
    sendBtn.onclick=function(){
      var ids=[];
      document.querySelectorAll('._ecCb:checked').forEach(function(c){ ids.push(parseInt(c.dataset.id)); });
      if(!ids.length){ return; }
      sendSelected(ids);
    };
    panel.appendChild(sendBtn);
  }

  // ── Sent confirmation ────────────────────────────────────────────
  function showSent(n){
    var ov=$('_ecOv'); if(!ov) return;
    ov.innerHTML='';
    var box=mkEl('div','background:#0A1628;border:1.5px solid rgba(8,145,178,.45);border-radius:24px;padding:32px 24px;text-align:center;max-width:280px;width:88%');
    box.appendChild(mkEl('div','font-size:48px;margin-bottom:10px','✅'));
    box.appendChild(mkEl('div','font-size:16px;font-weight:700;color:#F0FFFE;margin-bottom:6px',n+' entrada'+(n===1?'':'s')+' enviada'+(n===1?'':'s')));
    box.appendChild(mkEl('div','font-size:12px;color:rgba(248,250,252,.4);margin-bottom:20px','Vuelve a PilotOS para confirmar'));
    var cl=mkEl('button','padding:10px 24px;background:rgba(8,145,178,.2);border:1px solid rgba(8,145,178,.35);border-radius:10px;color:#7DD3FC;font-size:13px;cursor:pointer','Cerrar');
    cl.onclick=function(){ ov.remove(); };
    box.appendChild(cl);
    ov.appendChild(box);
  }

  // ── Build overlay ────────────────────────────────────────────────
  var existing=$('_ecOv'); if(existing) existing.remove();

  var ov=mkEl('div','position:fixed;inset:0;z-index:999999;background:rgba(3,8,18,.92);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif;padding-bottom:20px');
  ov.id='_ecOv';

  var sheet=mkEl('div','width:100%;max-width:400px;background:linear-gradient(180deg,#0A1628,#060E1C);border:1.5px solid rgba(8,145,178,.3);border-radius:22px;padding:20px 18px;box-shadow:0 -8px 40px rgba(0,0,0,.6)');

  // Title bar
  var tbar=mkEl('div','display:flex;align-items:center;justify-content:space-between;margin-bottom:16px');
  var tl=mkEl('div','display:flex;align-items:center;gap:8px');
  tl.appendChild(mkEl('span','font-size:22px','✈'));
  var ttl=mkEl('div');
  ttl.appendChild(mkEl('div','font-size:15px;font-weight:700;color:#F0FFFE','PilotOS Sync'));
  ttl.appendChild(mkEl('div','font-size:11px;color:rgba(8,145,178,.7)',TARGET));
  tl.appendChild(ttl);
  tbar.appendChild(tl);
  var cl=mkEl('button','background:none;border:none;color:rgba(248,250,252,.3);font-size:20px;cursor:pointer;padding:4px 8px','×');
  cl.onclick=function(){ ov.remove(); };
  tbar.appendChild(cl);
  sheet.appendChild(tbar);

  // Main panel (waiting or list)
  var panel=mkEl('div'); panel.id='_ecPanel';

  // Waiting state
  var wait=mkEl('div','text-align:center;padding:20px 0');
  var dot=mkEl('div','font-size:11px;color:rgba(8,145,178,.7);margin-bottom:16px');
  dot.innerHTML='⏳ Esperando datos de eCrews&hellip;';
  wait.appendChild(dot);
  wait.appendChild(mkEl('div','font-size:12px;color:rgba(248,250,252,.35);line-height:1.7',
    'Navega entre meses en eCrews\no pulsa cualquier vuelo.\nEl script captura automáticamente.'));
  panel.appendChild(wait);
  sheet.appendChild(panel);
  ov.appendChild(sheet);
  document.body.appendChild(ov);

  // Install interceptors immediately + poll iframes
  installAll();
  var poll=setInterval(installAll, 800);
  setTimeout(function(){ clearInterval(poll); }, 30000);

})();
