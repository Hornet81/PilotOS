/* PilotOS — eCrews Sync Script v8.3
 * Floating pill → bottom sheet (mobile-first).
 * Sends payload in the format PilotOS expects: {SchedulerEvents, BlockDutyTimes, PeriodStart}
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

  var isMobile = window.innerWidth < 680 || ('ontouchstart' in window);

  var _lastPayload    = null;
  var _allEntries     = [];
  var _rawPayloads    = [];
  var _capturedMonths = [];
  var _sheetOpen      = false;
  var _tailMap        = {};   // {flightNum: 'EC-NDB'} captured from popups

  // ── MutationObserver: capture tail from Pairing Details popup ────
  try {
    var _observer = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes.forEach(function(node){
          if(node.nodeType !== 1) return;
          var html = node.innerHTML || '';
          // Look for "Tail EC-XXX" pattern in popup
          var tailM = (node.innerText||node.textContent||'').match(/Tail\s+([A-Z]{1,2}-[A-Z0-9]{3,4})/);
          if(!tailM) return;
          var tail = tailM[1];
          // Find flight number in same popup (e.g. "| 8002")
          var fnM  = (node.innerText||node.textContent||'').match(/\|\s*(\d{3,4})\b/g);
          if(fnM){
            fnM.forEach(function(f){
              var num = f.replace(/\|\s*/,'').trim();
              _tailMap['VY'+num] = tail;
              console.log('[PilotOS] Tail capturada: VY'+num+' → '+tail);
            });
          }
          // Also try without flight number: store as last seen tail
          _tailMap['_last'] = tail;
        });
      });
    });
    _observer.observe(document.body, { childList: true, subtree: true });
    // Also observe any iframes
    document.querySelectorAll('iframe').forEach(function(f){
      try{ if(f.contentDocument && f.contentDocument.body)
        _observer.observe(f.contentDocument.body, {childList:true, subtree:true});
      }catch(e){}
    });
  } catch(e){}

  // ── Get all searchable documents (main + iframes) ────────────────
  function getSearchDocs(){
    var docs = [document];
    var frames = document.querySelectorAll('iframe');
    for(var i=0; i<frames.length; i++){
      try{ var d = frames[i].contentDocument; if(d) docs.push(d); }catch(e){}
    }
    return docs;
  }

  // ── Helpers ──────────────────────────────────────────────────────
  function mkEl(tag, css, txt){
    var el = document.createElement(tag);
    if(css) el.style.cssText = css;
    if(txt !== undefined) el.textContent = txt;
    return el;
  }
  function $(id){ return document.getElementById(id); }
  var DAY = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
  function fmtDate(d){
    var o = new Date(d+'T12:00:00Z');
    return DAY[o.getUTCDay()]+' '+o.getUTCDate();
  }

  // ── Parse one event (keep rawEv reference) ───────────────────────
  function parseEvent(ev, uid){
    var type    = (ev.type||'').toLowerCase();
    var text    = (ev.text||'').trim();
    var details = (ev.details||'').trim();
    var date    = (ev.start||'').slice(0,10);

    var regSrc   = [details, ev.registration||'', ev.aircraft||'', ev.acType||'', ev.tail||'', ev.reg||''].join(' ');
    var regMatch = regSrc.match(/\b([A-Z]{1,2}-[A-Z0-9]{3,4})\b/);
    var reg = regMatch ? regMatch[1] : '';

    var crew = [];
    if(Array.isArray(ev.crew))      crew = ev.crew.map(function(c){ return typeof c==='string'?c:(c.name||c.Name||''); });
    else if(Array.isArray(ev.Crew)) crew = ev.Crew.map(function(c){ return typeof c==='string'?c:(c.name||c.Name||''); });
    else if(ev.crewMembers)         crew = [].concat(ev.crewMembers);
    else if(ev.CrewMembers)         crew = [].concat(ev.CrewMembers);
    if(!crew.length && details){
      details.split('\n').forEach(function(l){
        l = l.trim();
        if(/^[A-ZÁÉÍÓÚÑ]{2,},\s*[A-ZÁÉÍÓÚÑ]/.test(l)) crew.push(l);
      });
    }

    var legs = [];
    if(type === 'flight'){
      details.split('\n').forEach(function(line){
        line = line.trim();
        var m = line.match(/^([A-Z0-9]+)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)\s+-\s+([A-Z]{3})\s+\(A?(\d{4})\)/);
        if(m){
          var fNum = 'VY'+m[1];
          var tail = _tailMap[fNum] || _tailMap['_last'] || '';
          legs.push({ fNum:fNum, dep:m[2],
            std: m[3].slice(0,2)+':'+m[3].slice(2),
            arr: m[4], sta: m[5].slice(0,2)+':'+m[5].slice(2),
            tail: tail });
        }
      });
      // If reg not found in details text, use tailMap
      if(!reg && legs.length) reg = legs[0].tail || '';
    }

    return {
      _id: uid, date: date, type: type, text: text,
      legs: legs, reg: reg, crew: crew,
      report: ev.report||'', debrief: ev.debrief||'',
      rawEv: ev   // ← keep raw event for sending
    };
  }

  // ── Interceptors ─────────────────────────────────────────────────
  function installXHR(win){
    if(!win||win._ecXhr) return;
    try{
      win._ecXhr = true;
      var orig = win.XMLHttpRequest.prototype.open;
      win.XMLHttpRequest.prototype.open = function(m, u){
        if(u && u.toString().indexOf('SchedulerEvents') !== -1){
          this.addEventListener('load', function(){
            try{
              var d = JSON.parse(this.responseText);
              if(d && d.SchedulerEvents){ _lastPayload = d; window._ecDbg = d; onNewPayload(); }
            }catch(e){}
          });
        }
        return orig.apply(this, arguments);
      };
    }catch(e){}
  }

  function installFetch(win){
    if(!win||win._ecFetch||!win.fetch) return;
    try{
      win._ecFetch = true;
      var orig = win.fetch.bind(win);
      win.fetch = function(input, init){
        var url = (typeof input==='string') ? input : (input&&input.url)||'';
        var p = orig(input, init);
        if(url.indexOf('SchedulerEvents') !== -1){
          p.then(function(r){
            r.clone().json().then(function(d){
              if(d && d.SchedulerEvents){ _lastPayload = d; window._ecDbg = d; onNewPayload(); }
            }).catch(function(){});
          }).catch(function(){});
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

  // ── New payload available ─────────────────────────────────────────
  function onNewPayload(){
    var period = (_lastPayload.PeriodStart||'').slice(0,7);
    var nf = (_lastPayload.SchedulerEvents||[]).filter(function(e){
      return (e.type||'').toLowerCase()==='flight';
    }).length;

    // Update pill
    var pill = $('_ecPill');
    if(pill){
      pill.style.background = 'linear-gradient(135deg,#0891B2,#0369A1)';
      pill.style.boxShadow  = '0 0 0 3px rgba(8,145,178,.4)';
      $('_ecPillTxt').textContent = '📥 ' + period + ' listo';
    }

    // Update capBtn if sheet is open
    var capBtn = $('_ecCapBtn');
    if(capBtn){
      capBtn.disabled = false;
      capBtn.style.opacity = '1';
      capBtn.textContent = '📥  CAPTURAR  ' + period + '  (' + nf + ' vuelos)';
    }
    var hint = $('_ecHint');
    if(hint){ hint.textContent = '✓ Mes listo — pulsa CAPTURAR o navega a otro.'; hint.style.color = 'rgba(74,222,128,.8)'; }
  }

  // ── Find calendar event DOM element (searches main doc + iframes) ─
  function findEventEl(ev){
    var text0 = (ev.text||'').split(/\r\n|\n/)[0].trim();
    var evId  = (ev.id||'').toString();
    var docs  = getSearchDocs();
    console.log('[PilotOS] findEventEl "'+text0+'" — docs:'+docs.length);

    var idVariants = ['event_'+evId, evId];
    var nums = evId.match(/\d+/g)||[];
    nums.forEach(function(n){ idVariants.push('event_'+n); });

    for(var di=0; di<docs.length; di++){
      var doc = docs[di];

      // 1. getElementById variants
      for(var v=0; v<idVariants.length; v++){
        var f1 = doc.getElementById(idVariants[v]);
        if(f1){ console.log('[PilotOS] ✓ id:'+idVariants[v]+' iframe:'+di); return f1; }
      }

      // 2. Attribute selectors
      for(var j=0; j<nums.length; j++){
        var f2 = doc.querySelector('[event_id="'+nums[j]+'"]') ||
                 doc.querySelector('[data-id="'+nums[j]+'"]');
        if(f2){ console.log('[PilotOS] ✓ attr iframe:'+di); return f2; }
      }

      // 3. DHTMLX class search
      var dhxEls = doc.querySelectorAll('[class*="dhx_cal_event"],[class*="dhx_event"]');
      console.log('[PilotOS] dhx els iframe:'+di+' → '+dhxEls.length);
      for(var d=0; d<dhxEls.length; d++){
        if(text0 && (dhxEls[d].innerText||dhxEls[d].textContent||'').indexOf(text0)!==-1){
          console.log('[PilotOS] ✓ dhx iframe:'+di); return dhxEls[d];
        }
      }

      // 4. Generic text search
      if(text0){
        var all = doc.querySelectorAll('div,td,a,span');
        for(var i=0; i<all.length; i++){
          var node = all[i];
          if(node.children.length > 6) continue;
          var t = (node.innerText||node.textContent||'').split('\n')[0].trim();
          if(t === text0){ console.log('[PilotOS] ✓ text iframe:'+di); return node; }
        }
      }
    }

    console.log('[PilotOS] ✗ not found "'+text0+'"');
    return null;
  }

  // ── Close Pairing Details popup ───────────────────────────────────
  function closePopup(){
    var docs = getSearchDocs();
    for(var di=0; di<docs.length; di++){
      var all = docs[di].querySelectorAll('a,button,span');
      for(var i=0; i<all.length; i++){
        var t = (all[i].innerText||all[i].textContent||'').trim();
        if(t==='Exit'||t.indexOf('Exit')!==-1){ all[i].click(); return; }
      }
    }
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true}));
  }

  // ── Trigger click bypassing isTrusted check ──────────────────────
  function triggerEventClick(el, evId, iframeWin){
    // Strategy 1: DHTMLX scheduler.callEvent — bypasses DOM isTrusted check entirely
    if(iframeWin){
      var sched = iframeWin.scheduler || iframeWin.Scheduler;
      if(sched && typeof sched.callEvent === 'function'){
        var nums = (evId||'').match(/\d+/g)||[];
        var fakeEv = {isTrusted:true, type:'click', target:el,
          stopPropagation:function(){}, preventDefault:function(){}};
        // Try most likely IDs (last number in id string is usually the pairing ID)
        for(var j=nums.length-1; j>=0; j--){
          try{
            sched.callEvent('onEventClick', [nums[j], fakeEv]);
            sched.callEvent('onClick',       [nums[j], fakeEv]);
            console.log('[PilotOS] scheduler.callEvent id='+nums[j]);
          }catch(e){}
        }
        return;
      }
    }
    // Strategy 2: call onclick handler directly as function (no DOM event bubbling)
    if(el && typeof el.onclick === 'function'){
      try{
        el.onclick.call(el, {isTrusted:true, type:'click', target:el,
          stopPropagation:function(){}, preventDefault:function(){}});
        console.log('[PilotOS] direct el.onclick()');
        return;
      }catch(e){}
    }
    // Strategy 3: standard click (will likely be blocked, but try anyway)
    if(el) el.click();
  }

  // ── Store tail from popup text ────────────────────────────────────
  function storeTailText(text, tail){
    var fns = text.match(/\|\s*(\d{3,4})/g)||[];
    fns.forEach(function(f){ _tailMap['VY'+f.replace(/\|\s*/,'').trim()] = tail; });
    _tailMap['_last'] = tail;
    console.log('[PilotOS] Matrícula capturada:', tail, fns.map(function(f){ return 'VY'+f.replace(/\|\s*/,'').trim(); }));
  }

  // ── Auto-click all flights to capture tails ───────────────────────
  function autoCaptureTails(flights, onDone){
    if(!flights.length){ onDone(); return; }

    // Overlay — visible pero pointer-events:none para no bloquear clicks del script
    var ov = mkEl('div',
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'+
      'background:rgba(5,10,25,.97);display:flex;flex-direction:column;'+
      'align-items:center;justify-content:center;font-family:system-ui,sans-serif;'+
      'gap:12px');
    ov.id = '_ecImportOv';

    var spin = mkEl('div','font-size:52px;animation:_ecSpin 1.5s linear infinite','✈');
    var style = document.createElement('style');
    style.textContent = '@keyframes _ecSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    var ttl  = mkEl('div','font-size:20px;font-weight:700;color:#F0FFFE','Importando tu roster…');
    var prog = mkEl('div','font-size:13px;color:rgba(8,145,178,.8)','Preparando…');
    prog.id  = '_ecProgTxt';
    var bar  = mkEl('div','width:200px;height:3px;background:rgba(8,145,178,.2);border-radius:2px;overflow:hidden');
    var fill = mkEl('div','height:100%;background:#0891B2;width:0%;transition:width .3s ease;border-radius:2px');
    fill.id  = '_ecProgFill';
    bar.appendChild(fill);

    [spin,ttl,prog,bar].forEach(function(el){ ov.appendChild(el); });
    document.body.appendChild(ov);

    console.log('[PilotOS] autoCaptureTails: '+flights.length+' flights to process');

    // Get iframe window for scheduler access
    var _iframeWin = null;
    try{
      var _iframes = document.querySelectorAll('iframe');
      for(var _fi=0; _fi<_iframes.length; _fi++){
        try{
          var _iw = _iframes[_fi].contentWindow;
          if(_iw && (_iw.scheduler||_iw.Scheduler)){ _iframeWin = _iw; break; }
          if(_iw && _iw.document && _iw.document.querySelector('[class*="dhx"]')){ _iframeWin = _iw; }
        }catch(e){}
      }
      if(!_iframeWin && _iframes.length){ _iframeWin = _iframes[_iframes.length-1].contentWindow; }
    }catch(e){}
    console.log('[PilotOS] iframe win:', !!_iframeWin, 'scheduler:', !!(_iframeWin&&(_iframeWin.scheduler||_iframeWin.Scheduler)));

    var idx = 0;

    function next(){
      if(idx >= flights.length){
        console.log('[PilotOS] autoCaptureTails done. _tailMap:', JSON.stringify(_tailMap));
        ov.remove();
        style.remove();
        onDone();
        return;
      }
      var ev = flights[idx++];
      var pct = Math.round((idx/flights.length)*100);
      var pt = $('_ecProgTxt');  if(pt)  pt.textContent  = idx+' / '+flights.length+' vuelos';
      var pf = $('_ecProgFill'); if(pf)  pf.style.width  = pct+'%';

      var el = findEventEl(ev);
      if(!el){ setTimeout(next, 80); return; }

      var done = false;
      var obs = new MutationObserver(function(muts){
        if(done) return;
        muts.forEach(function(m){
          if(done) return;
          m.addedNodes.forEach(function(node){
            if(done||node.nodeType!==1) return;
            var t = node.innerText||node.textContent||'';
            var tm = t.match(/Tail\s+([A-Z]{1,2}-[A-Z0-9]{3,4})/);
            if(!tm) return;
            done = true; obs.disconnect();
            storeTailText(t, tm[1]);
            setTimeout(function(){ closePopup(); setTimeout(next, 350); }, 150);
          });
        });
      });
      // Observe main doc AND all iframes
      getSearchDocs().forEach(function(d){
        try{ obs.observe(d.body||d.documentElement,{childList:true,subtree:true}); }catch(e){}
      });

      triggerEventClick(el, ev.id, _iframeWin);

      // Timeout if popup doesn't open
      setTimeout(function(){
        if(!done){ done=true; obs.disconnect(); closePopup(); setTimeout(next,300); }
      }, 2500);
    }

    setTimeout(next, 300);
  }

  // ── CAPTURAR action ───────────────────────────────────────────────
  function doCapture(){
    if(!_lastPayload) return;
    var period = (_lastPayload.PeriodStart||'').slice(0,7);
    if(_capturedMonths.indexOf(period) !== -1){
      var hint = $('_ecHint');
      if(hint){ hint.textContent = period+' ya capturado. Navega a otro mes.'; hint.style.color = 'rgba(251,146,60,.8)'; }
      return;
    }

    var flights = (_lastPayload.SchedulerEvents||[]).filter(function(e){
      return (e.type||'').toLowerCase()==='flight';
    });

    // Auto-click all flights to collect tails, then capture
    autoCaptureTails(flights, function(){
      var uid = _allEntries.length;
      var newEntries = (_lastPayload.SchedulerEvents||[]).map(function(ev,i){ return parseEvent(ev,uid+i); });
      _allEntries     = _allEntries.concat(newEntries);
      _rawPayloads.push(_lastPayload);
      _capturedMonths.push(period);
      _lastPayload = null;

      var pill = $('_ecPill');
      if(pill){
        pill.style.background = 'linear-gradient(135deg,#1e3a5f,#0f2040)';
        pill.style.boxShadow  = 'none';
        $('_ecPillTxt').textContent = '✈ PilotOS · '+_capturedMonths.length+' mes'+(_capturedMonths.length===1?'':'es');
      }
      renderSheet();
    });
  }

  // ── Send selected entries to PilotOS ─────────────────────────────
  function sendSelected(ids){
    // Reconstruct payload in the format PilotOS expects
    var selectedEntries = _allEntries.filter(function(e){ return ids.indexOf(e._id) !== -1; });
    var rawEvents = selectedEntries.map(function(e){ return e.rawEv; });

    // Merge BlockDutyTimes from all captured months
    var bdt = {};
    _rawPayloads.forEach(function(p){
      var b = p.BlockDutyTimes || {};
      Object.keys(b).forEach(function(k){ bdt[k] = b[k]; });
    });

    var payload = {
      SchedulerEvents: rawEvents,
      BlockDutyTimes:  bdt,
      PeriodStart:     _capturedMonths[0] ? _capturedMonths[0]+'-01' : ''
    };

    function doSend(win){
      try{ win.postMessage({type:'ECREWS_DATA', payload:payload}, TARGET); return true; }catch(e){ return false; }
    }

    if(window.opener && doSend(window.opener)){
      // sent to opener (eCrews opened from PilotOS) — done
    } else {
      // No opener: open PilotOS and send after it loads its listener
      var w = window.open(TARGET, '_pilotosSync');
      if(w){
        var attempts = 0;
        var interval = setInterval(function(){
          attempts++;
          try{ w.postMessage({type:'ECREWS_DATA', payload:payload}, TARGET); }catch(e){}
          if(attempts >= 8) clearInterval(interval);
        }, 800);
      }
    }

    // Confirm in sheet
    var body = $('_ecSheetBody'); if(!body) return;
    body.innerHTML = '';
    var ok = mkEl('div','text-align:center;padding:24px 0');
    ok.appendChild(mkEl('div','font-size:48px;margin-bottom:10px','✅'));
    ok.appendChild(mkEl('div','font-size:16px;font-weight:700;color:#F0FFFE;margin-bottom:6px',
      selectedEntries.length+' entrada'+(selectedEntries.length===1?'':'s')+' enviada'+(selectedEntries.length===1?'':'s')));
    ok.appendChild(mkEl('div','font-size:13px;color:rgba(248,250,252,.4)','Confirma la importación en PilotOS'));
    body.appendChild(ok);
  }

  // ── Render sheet body ─────────────────────────────────────────────
  function renderSheet(){
    var body = $('_ecSheetBody'); if(!body) return;
    body.innerHTML = '';

    // Captured month chips
    if(_capturedMonths.length){
      var chips = mkEl('div','display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px');
      _capturedMonths.forEach(function(m){
        chips.appendChild(mkEl('span',
          'font-size:11px;padding:3px 10px;background:rgba(8,145,178,.2);border:1px solid rgba(8,145,178,.35);border-radius:12px;color:#7DD3FC',
          '✓ '+m));
      });
      body.appendChild(chips);
    }

    // Hint
    var hint = mkEl('div','font-size:12px;color:rgba(248,250,252,.4);margin-bottom:12px;line-height:1.5',
      'Navega al mes en eCrews y pulsa CAPTURAR.');
    hint.id = '_ecHint';
    body.appendChild(hint);

    // CAPTURAR button
    var hasPayload = !!_lastPayload;
    var period     = hasPayload ? (_lastPayload.PeriodStart||'').slice(0,7) : '';
    var nf         = hasPayload ? (_lastPayload.SchedulerEvents||[]).filter(function(e){ return (e.type||'').toLowerCase()==='flight'; }).length : 0;

    var capBtn = mkEl('button',
      'width:100%;padding:16px;background:linear-gradient(135deg,#0891B2,#0369A1);border:none;border-radius:14px;'+
      'color:#fff;font-size:'+(isMobile?'16':'14')+'px;font-weight:800;cursor:pointer;margin-bottom:16px;'+
      'opacity:'+(hasPayload?'1':'.35')+';min-height:54px',
      hasPayload ? '📥  CAPTURAR  '+period+'  ('+nf+' vuelos)' : '📥  CAPTURAR MES');
    capBtn.id = '_ecCapBtn';
    capBtn.disabled = !hasPayload;
    capBtn.onclick  = doCapture;
    body.appendChild(capBtn);

    // Entry list (if any captured)
    if(_allEntries.length){
      body.appendChild(mkEl('div','border-top:1px solid rgba(8,145,178,.15);margin-bottom:12px'));

      var bar = mkEl('div','display:flex;justify-content:space-between;align-items:center;margin-bottom:8px');
      bar.appendChild(mkEl('span','font-size:11px;color:rgba(248,250,252,.4)',
        _allEntries.length+' entradas · '+_allEntries.filter(function(e){ return e.type==='flight'; }).length+' vuelos'));
      var bRow = mkEl('div','display:flex;gap:8px');
      var sa = mkEl('button','font-size:11px;background:none;border:none;color:rgba(8,145,178,.8);cursor:pointer;padding:4px 8px','Todo');
      var sn = mkEl('button','font-size:11px;background:none;border:none;color:rgba(248,250,252,.3);cursor:pointer;padding:4px 8px','Ninguno');
      sa.onclick = function(){ document.querySelectorAll('._ecCb').forEach(function(c){ c.checked=true; }); };
      sn.onclick = function(){ document.querySelectorAll('._ecCb').forEach(function(c){ c.checked=false; }); };
      bRow.appendChild(sa); bRow.appendChild(sn);
      bar.appendChild(bRow);
      body.appendChild(bar);

      var list = mkEl('div',
        'display:flex;flex-direction:column;gap:5px;margin-bottom:14px;'+
        'max-height:'+(isMobile?'35vh':'220px')+';overflow-y:auto;-webkit-overflow-scrolling:touch');

      _allEntries.forEach(function(e){
        var row = mkEl('label',
          'display:flex;align-items:flex-start;gap:10px;padding:'+(isMobile?'10px':'6px 8px')+';'+
          'background:rgba(8,145,178,.05);border:1px solid rgba(8,145,178,.12);border-radius:10px;cursor:pointer');

        var cb = document.createElement('input');
        cb.type='checkbox'; cb.className='_ecCb'; cb.dataset.id=e._id; cb.checked=true;
        cb.style.cssText='margin-top:3px;accent-color:#0891B2;flex-shrink:0;width:'+(isMobile?'18':'14')+'px;height:'+(isMobile?'18':'14')+'px';

        var info = mkEl('div','flex:1;min-width:0');
        var top  = mkEl('div','display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:2px');
        top.appendChild(mkEl('span','font-size:'+(isMobile?'11':'10')+'px;color:rgba(8,145,178,.7);font-family:monospace',fmtDate(e.date)+' · '+e.date));
        top.appendChild(mkEl('span','font-size:9px;padding:1px 5px;background:rgba(8,145,178,.15);border-radius:4px;color:#7DD3FC',e.type.toUpperCase()));
        if(e.reg) top.appendChild(mkEl('span','font-size:9px;padding:1px 5px;background:rgba(245,158,11,.12);border-radius:4px;color:#FCD34D',e.reg));
        info.appendChild(top);

        if(e.legs.length){
          e.legs.forEach(function(l){
            info.appendChild(mkEl('div','font-size:'+(isMobile?'13':'11')+'px;font-family:monospace;color:#F0FFFE',
              l.fNum+' '+l.dep+'→'+l.arr+'  '+l.std+'–'+l.sta));
          });
        } else {
          info.appendChild(mkEl('div','font-size:'+(isMobile?'12':'10')+'px;color:rgba(248,250,252,.4)',e.text.split('\n')[0].slice(0,40)));
        }
        if(e.crew.length){
          info.appendChild(mkEl('div','font-size:'+(isMobile?'11':'9')+'px;color:rgba(248,250,252,.3);margin-top:2px',
            '👥 '+e.crew.slice(0,2).join(' · ')+(e.crew.length>2?' +'+(e.crew.length-2):'')));
        }

        row.appendChild(cb); row.appendChild(info);
        list.appendChild(row);
      });
      body.appendChild(list);

      var sendBtn = mkEl('button',
        'width:100%;padding:'+(isMobile?'18':'13')+'px;background:linear-gradient(135deg,#059669,#047857);border:none;border-radius:14px;'+
        'color:#fff;font-size:'+(isMobile?'16':'13')+'px;font-weight:800;cursor:pointer;min-height:'+(isMobile?'58':'44')+'px',
        'ENVIAR A PILOTOS →');
      sendBtn.onclick = function(){
        var ids = [];
        document.querySelectorAll('._ecCb:checked').forEach(function(c){ ids.push(parseInt(c.dataset.id)); });
        if(!ids.length) return;
        sendSelected(ids);
      };
      body.appendChild(sendBtn);
    }
  }

  // ── Toggle sheet ──────────────────────────────────────────────────
  function toggleSheet(){
    _sheetOpen = !_sheetOpen;
    var sheet   = $('_ecSheet');
    var overlay = $('_ecOverlay');
    if(!sheet) return;
    if(_sheetOpen){
      renderSheet();
      sheet.style.transform = 'translateY(0)';
      sheet.style.opacity   = '1';
      if(overlay) overlay.style.display = 'block';
    } else {
      sheet.style.transform = 'translateY(100%)';
      sheet.style.opacity   = '0';
      if(overlay) overlay.style.display = 'none';
    }
  }

  // ── Build floating UI ─────────────────────────────────────────────
  ['_ecPill','_ecSheet','_ecOverlay'].forEach(function(id){ var el=$(id); if(el) el.remove(); });

  // Backdrop
  var overlay = mkEl('div','display:none;position:fixed;inset:0;z-index:999997;background:rgba(0,0,0,.4)');
  overlay.id  = '_ecOverlay';
  overlay.onclick = function(){ if(_sheetOpen) toggleSheet(); };
  document.body.appendChild(overlay);

  // Pill
  var pill = mkEl('div',
    'position:fixed;bottom:'+(isMobile?'88':'20')+'px;right:16px;z-index:999999;'+
    'background:linear-gradient(135deg,#1e3a5f,#0f2040);'+
    'border:1.5px solid rgba(8,145,178,.5);border-radius:24px;'+
    'padding:'+(isMobile?'12px 18px':'8px 14px')+';'+
    'display:flex;align-items:center;gap:8px;cursor:pointer;'+
    'box-shadow:0 4px 20px rgba(0,0,0,.5);user-select:none;'+
    'font-family:system-ui,sans-serif;transition:background .25s,box-shadow .25s');
  pill.id = '_ecPill';
  pill.appendChild(mkEl('span','font-size:'+(isMobile?'20':'16')+'px;line-height:1','✈'));
  var pillTxt = mkEl('span','font-size:'+(isMobile?'14':'12')+'px;font-weight:700;color:#F0FFFE;white-space:nowrap','✈ PilotOS Sync');
  pillTxt.id = '_ecPillTxt';
  pill.appendChild(pillTxt);
  pill.onclick = toggleSheet;
  document.body.appendChild(pill);

  // Bottom sheet
  var sheet = mkEl('div',
    'position:fixed;bottom:0;left:0;right:0;z-index:999998;'+
    'background:linear-gradient(180deg,#0D1E35,#060E1C);'+
    'border-top:2px solid rgba(8,145,178,.4);border-radius:22px 22px 0 0;'+
    'padding:0 16px env(safe-area-inset-bottom,20px);'+
    'font-family:system-ui,sans-serif;'+
    'transform:translateY(100%);opacity:0;'+
    'transition:transform .3s ease,opacity .25s ease;'+
    'max-height:85vh;overflow-y:auto;-webkit-overflow-scrolling:touch');
  sheet.id = '_ecSheet';

  // Handle bar
  var handle = mkEl('div','display:flex;justify-content:center;padding:12px 0 4px');
  handle.appendChild(mkEl('div','width:36px;height:4px;background:rgba(8,145,178,.4);border-radius:2px'));
  sheet.appendChild(handle);

  // Sheet header
  var shHdr = mkEl('div','display:flex;align-items:center;justify-content:space-between;margin-bottom:16px');
  var shLeft = mkEl('div','display:flex;align-items:center;gap:10px');
  shLeft.appendChild(mkEl('span','font-size:'+(isMobile?'24':'20')+'px','✈'));
  var shTitles = mkEl('div');
  shTitles.appendChild(mkEl('div','font-size:'+(isMobile?'16':'14')+'px;font-weight:700;color:#F0FFFE','PilotOS Sync'));
  shTitles.appendChild(mkEl('div','font-size:11px;color:rgba(8,145,178,.6)','eCrews → PilotOS'));
  shLeft.appendChild(shTitles);
  shHdr.appendChild(shLeft);
  var closeBtn = mkEl('button',
    'background:rgba(255,255,255,.06);border:none;color:rgba(248,250,252,.5);'+
    'font-size:18px;cursor:pointer;padding:6px 10px;border-radius:8px;line-height:1','×');
  closeBtn.onclick = toggleSheet;
  shHdr.appendChild(closeBtn);
  sheet.appendChild(shHdr);

  var shBody = mkEl('div','padding-bottom:8px');
  shBody.id = '_ecSheetBody';
  sheet.appendChild(shBody);
  document.body.appendChild(sheet);

  // Install interceptors + poll for iframes
  installAll();
  var poll = setInterval(installAll, 1000);
  setTimeout(function(){ clearInterval(poll); }, 120000);

})();
