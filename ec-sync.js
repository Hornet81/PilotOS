/* PilotOS — eCrews Sync Script v4
 * Floating widget — no blocking overlay.
 * User can use eCrews normally while the script listens.
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

  var _data    = null;
  var _entries = [];
  var _minimized = false;

  // ── mk helpers ───────────────────────────────────────────────────
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

  // ── Parse event ──────────────────────────────────────────────────
  function parseEvent(ev, idx){
    var type    = (ev.type||'').toLowerCase();
    var text    = (ev.text||'').trim();
    var details = (ev.details||'').trim();
    var date    = (ev.start||'').slice(0,10);

    // Aircraft registration: look for XX-XXX pattern
    var regSrc  = [details, ev.registration||'', ev.aircraft||'', ev.acType||'', ev.tail||'', ev.reg||''].join(' ');
    var regMatch = regSrc.match(/\b([A-Z]{1,2}-[A-Z0-9]{3,4})\b/);
    var reg = regMatch ? regMatch[1] : '';

    // Crew names
    var crew = [];
    if(Array.isArray(ev.crew))         crew = ev.crew.map(function(c){ return typeof c==='string'?c:(c.name||c.Name||JSON.stringify(c)); });
    else if(Array.isArray(ev.Crew))    crew = ev.Crew.map(function(c){ return typeof c==='string'?c:(c.name||c.Name||JSON.stringify(c)); });
    else if(ev.crewMembers)            crew = [].concat(ev.crewMembers);
    else if(ev.CrewMembers)            crew = [].concat(ev.CrewMembers);
    // Scan details lines for SURNAME, Name pattern
    if(!crew.length && details){
      details.split('\n').forEach(function(l){
        l=l.trim();
        if(/^[A-ZÁÉÍÓÚÑ]{2,},\s*[A-ZÁÉÍÓÚÑ]/.test(l)) crew.push(l);
      });
    }

    // Flight legs
    var legs = [];
    if(type==='flight'){
      details.split('\n').forEach(function(line){
        line=line.trim();
        var m=line.match(/^([A-Z0-9]+)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)/);
        if(m) legs.push({
          fNum:'VY'+m[1], dep:m[2],
          std:m[3].slice(0,2)+':'+m[3].slice(2),
          arr:m[4],
          sta:m[5].slice(0,2)+':'+m[5].slice(2)
        });
      });
    }

    return { _id:idx, date:date, type:type, text:text, legs:legs, reg:reg, crew:crew,
             report:ev.report||'', debrief:ev.debrief||'', raw:ev };
  }

  // ── Receive data ─────────────────────────────────────────────────
  function onData(d){
    if(_data) return;
    _data = d;
    console.log('[PilotOS] raw payload:', JSON.stringify(d, null, 2));
    _entries = (d.SchedulerEvents||[]).map(function(ev,i){ return parseEvent(ev,i); });
    showList();
  }

  // ── XHR interceptor ──────────────────────────────────────────────
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

  // ── Widget body: waiting state ───────────────────────────────────
  function showWaiting(){
    var body = $('_ecBody'); if(!body) return;
    body.innerHTML = '';
    body.style.display = 'block';
    var d = mkEl('div','padding:10px 0 4px;text-align:center');
    d.appendChild(mkEl('div','font-size:11px;color:rgba(8,145,178,.8);margin-bottom:6px','⏳ Escuchando eCrews…'));
    d.appendChild(mkEl('div','font-size:10px;color:rgba(248,250,252,.35);line-height:1.6','Navega por My Schedule\ny capturaré automáticamente.'));
    body.appendChild(d);
  }

  // ── Widget body: entry list ──────────────────────────────────────
  function showList(){
    var widget = $('_ecWidget'); if(!widget) return;
    // Expand widget when data arrives
    widget.style.width  = '340px';
    widget.style.maxHeight = '500px';

    var titleEl = $('_ecTitle');
    if(titleEl){
      var period = (_data.PeriodStart||'').slice(0,7);
      var nf = _entries.filter(function(e){ return e.type==='flight'; }).length;
      titleEl.textContent = '✓ '+period+' · '+nf+' vuelos';
    }

    var body = $('_ecBody'); if(!body) return;
    body.innerHTML = '';
    body.style.display = 'block';

    // Select all / none
    var bar = mkEl('div','display:flex;justify-content:flex-end;gap:4px;margin-bottom:6px');
    var sa = mkEl('button','font-size:10px;background:none;border:none;color:rgba(8,145,178,.8);cursor:pointer;padding:2px 5px','Todo');
    var sn = mkEl('button','font-size:10px;background:none;border:none;color:rgba(248,250,252,.3);cursor:pointer;padding:2px 5px','Ninguno');
    sa.onclick=function(){ document.querySelectorAll('._ecCb').forEach(function(c){c.checked=true;}); };
    sn.onclick=function(){ document.querySelectorAll('._ecCb').forEach(function(c){c.checked=false;}); };
    bar.appendChild(sa); bar.appendChild(sn);
    body.appendChild(bar);

    // Scrollable list
    var list = mkEl('div','max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:10px');
    _entries.forEach(function(e){
      var row = mkEl('label','display:flex;align-items:flex-start;gap:7px;padding:6px 8px;background:rgba(8,145,178,.06);border:1px solid rgba(8,145,178,.12);border-radius:8px;cursor:pointer');
      var cb  = document.createElement('input');
      cb.type='checkbox'; cb.className='_ecCb'; cb.dataset.id=e._id; cb.checked=true;
      cb.style.cssText='margin-top:2px;accent-color:#0891B2;flex-shrink:0';

      var info = mkEl('div','flex:1;min-width:0');
      var top  = mkEl('div','display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px');
      top.appendChild(mkEl('span','font-size:10px;color:rgba(8,145,178,.7);font-family:monospace',fmtDate(e.date)+' · '+e.date));
      top.appendChild(mkEl('span','font-size:9px;padding:1px 4px;background:rgba(8,145,178,.15);border-radius:3px;color:#7DD3FC',e.type.toUpperCase()));
      if(e.reg) top.appendChild(mkEl('span','font-size:9px;padding:1px 4px;background:rgba(245,158,11,.15);border-radius:3px;color:#FCD34D',e.reg));
      info.appendChild(top);

      if(e.legs.length){
        e.legs.forEach(function(l){
          info.appendChild(mkEl('div','font-size:11px;font-family:monospace;color:#F0FFFE',
            l.fNum+' '+l.dep+'→'+l.arr+' '+l.std+'–'+l.sta));
        });
      } else {
        info.appendChild(mkEl('div','font-size:10px;color:rgba(248,250,252,.4)',e.text.split('\n')[0].slice(0,40)));
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
    var btn = mkEl('button',
      'width:100%;padding:11px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:800;cursor:pointer',
      'ENVIAR A PILOTOS →');
    btn.onclick = function(){
      var ids = [];
      document.querySelectorAll('._ecCb:checked').forEach(function(c){ ids.push(parseInt(c.dataset.id)); });
      if(!ids.length) return;
      sendSelected(ids);
    };
    body.appendChild(btn);
  }

  // ── Send ─────────────────────────────────────────────────────────
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

    // Confirmation in widget
    var body=$('_ecBody'); if(!body) return;
    body.innerHTML='';
    var ok=mkEl('div','text-align:center;padding:10px 0');
    ok.appendChild(mkEl('div','font-size:32px;margin-bottom:6px','✅'));
    ok.appendChild(mkEl('div','font-size:12px;font-weight:700;color:#F0FFFE;margin-bottom:4px',
      toSend.length+' entrada'+(toSend.length===1?'':'s')+' enviada'+(toSend.length===1?'':'s')));
    ok.appendChild(mkEl('div','font-size:10px;color:rgba(248,250,252,.35)','Vuelve a PilotOS para confirmar'));
    body.appendChild(ok);
  }

  // ── Build floating widget ─────────────────────────────────────────
  var existing=$('_ecWidget'); if(existing) existing.remove();

  var widget = mkEl('div',
    'position:fixed;bottom:20px;right:16px;z-index:999999;'+
    'width:200px;max-height:60px;overflow:hidden;'+
    'background:linear-gradient(180deg,#0A1628,#060E1C);'+
    'border:1.5px solid rgba(8,145,178,.4);border-radius:16px;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.6);'+
    'font-family:system-ui,sans-serif;'+
    'transition:width .25s ease,max-height .3s ease');
  widget.id = '_ecWidget';

  // Header (always visible, click to minimize/expand)
  var hdr = mkEl('div',
    'display:flex;align-items:center;justify-content:space-between;'+
    'padding:10px 12px;cursor:pointer;user-select:none');
  var hl  = mkEl('div','display:flex;align-items:center;gap:7px');
  hl.appendChild(mkEl('span','font-size:16px','✈'));
  var titles = mkEl('div');
  var t1 = mkEl('div','font-size:12px;font-weight:700;color:#F0FFFE','PilotOS Sync');
  t1.id = '_ecTitle';
  var t2 = mkEl('div','font-size:10px;color:rgba(8,145,178,.6)','eCrews → PilotOS');
  titles.appendChild(t1); titles.appendChild(t2);
  hl.appendChild(titles);
  hdr.appendChild(hl);

  var minBtn = mkEl('button',
    'background:none;border:none;color:rgba(248,250,252,.35);font-size:16px;cursor:pointer;padding:0 4px;line-height:1',
    '×');
  minBtn.onclick = function(e){
    e.stopPropagation();
    widget.remove();
  };
  hdr.appendChild(minBtn);

  hdr.onclick = function(){
    _minimized = !_minimized;
    var body = $('_ecBody');
    if(body) body.style.display = _minimized ? 'none' : 'block';
    widget.style.maxHeight = _minimized ? '44px' : '500px';
  };

  widget.appendChild(hdr);

  // Body
  var body = mkEl('div','padding:0 12px 12px');
  body.id = '_ecBody';
  widget.appendChild(body);

  document.body.appendChild(widget);
  showWaiting();

  // Expand widget
  widget.style.maxHeight = '500px';

  // Install interceptors + poll
  installAll();
  var poll = setInterval(installAll, 800);
  setTimeout(function(){ clearInterval(poll); }, 60000);

})();
