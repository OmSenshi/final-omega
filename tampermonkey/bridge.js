// bridge.js — Final Omega v14.1 (Sunshine Ultimate Fix)
// Inclusao Silent Stop Fix, GovBr Login Restore, Smart Button Hunter
(function(){
  var isANTT = location.hostname.indexOf('rntrcdigital.antt.gov.br') !== -1;
  var isGovBr = location.hostname.indexOf('acesso.gov.br') !== -1;
  var U = window.OmegaUtils || null;

  var nativeSetTimeout = window.setTimeout;
  var nativeClearTimeout = window.clearTimeout;
  var nativeSetInterval = window.setInterval;
  var nativeClearInterval = window.clearInterval;

  if (typeof unsafeWindow !== 'undefined' && unsafeWindow.setTimeout) {
      nativeSetTimeout = function(fn, ms) { return unsafeWindow.setTimeout(fn, ms); };
      nativeClearTimeout = function(id) { return unsafeWindow.clearTimeout(id); };
      nativeSetInterval = function(fn, ms) { return unsafeWindow.setInterval(fn, ms); };
      nativeClearInterval = function(id) { return unsafeWindow.clearInterval(id); };
  }

  function delay(ms) { return new Promise(function(r) { nativeSetTimeout(r, ms); }); }
  function gmGet(k,d){ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : ''; }
  function gmSet(k,v){ try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); }catch(e){} }

  function getVisible(selector) {
      var els = document.querySelectorAll(selector);
      for(var i=0; i<els.length; i++) { if (els[i].offsetParent !== null) return els[i]; }
      return null;
  }

  function waitForVisible(selector, timeout) {
      timeout = timeout || 15000;
      return new Promise(function(resolve, reject) {
          var t = nativeSetTimeout(function() { reject(new Error('Timeout visible: ' + selector)); }, timeout);
          function check() {
              var el = getVisible(selector);
              if (el) { nativeClearTimeout(t); resolve(el); return; }
              nativeSetTimeout(check, 200);
          }
          check();
      });
  }

  function waitForElement(selector, timeout) {
      timeout = timeout || 30000;
      return new Promise(function(resolve, reject) {
          var el = document.querySelector(selector);
          if (el) return resolve(el);
          var obs = new MutationObserver(function() {
              el = document.querySelector(selector);
              if (el) { obs.disconnect(); nativeClearTimeout(t); resolve(el); }
          });
          obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
          var t = nativeSetTimeout(function() { obs.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
      });
  }

  function waitForURL(substring, timeout) {
      timeout = timeout || 60000;
      return new Promise(function(resolve, reject) {
          var t = nativeSetTimeout(function() { reject(new Error('Timeout URL: ' + substring)); }, timeout);
          function check() { if (location.href.indexOf(substring) !== -1) { nativeClearTimeout(t); resolve(); return; } nativeSetTimeout(check, 500); }
          check();
      });
  }

  function waitForToastOrSuccess(successSelector, timeout) {
      timeout = timeout || 15000;
      return new Promise(function(resolve) {
          var t = nativeSetTimeout(function() { resolve({ tipo: 'timeout' }); }, timeout);
          function check() {
              var toast = document.querySelector('#toast-container .toast-error');
              if (toast && toast.offsetParent !== null) { nativeClearTimeout(t); resolve({ tipo: 'toast_erro', texto: toast.textContent || '' }); return; }
              var ok = document.querySelector(successSelector);
              if (ok && ok.offsetParent !== null) { nativeClearTimeout(t); resolve({ tipo: 'sucesso', el: ok }); return; }
              nativeSetTimeout(check, 300);
          }
          check();
      });
  }

  function waitBlockUI(timeout) {
      timeout = timeout || 15000;
      return new Promise(function(resolve) {
          var t = nativeSetTimeout(function() { resolve(); }, timeout);
          function check() {
              var block = document.querySelector('.blockUI');
              if (!block || block.style.display === 'none') { nativeClearTimeout(t); resolve(); return; }
              nativeSetTimeout(check, 200);
          }
          check();
      });
  }

  function limparToasts() {
      var w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      try {
          if (w.toastr) { w.toastr.options.onHidden = null; w.toastr.options.onCloseClick = null; }
          var idMax = w.setTimeout(function(){}, 1);
          nativeClearTimeout(idMax);
          for(var i = idMax; i > Math.max(0, idMax - 500); i--){
              w.clearTimeout(i); w.clearInterval(i);
          }
      } catch(e){}
      document.querySelectorAll('.toast-close-button').forEach(function(b){ try{b.click();}catch(e){} });
      document.querySelectorAll('#toast-container, .toast, .toast-success, .toast-error, .toast-warning').forEach(function(t){ t.remove(); });
  }

  async function aguardarModalFechar() {
      await delay(200);
      var limit = 0;
      while (getVisible('.modal.show, .modal.in') && limit < 50) { 
          await delay(200); limit++;
      }
      limparToasts();
      await delay(300);
  }

  async function digitarMascara(el, texto, speed) {
      var U_local = window.OmegaUtils || null;
      var cleanTexto = (texto || '').replace(/[\u200B-\u200D\uFEFF]/g, ''); 
      if (U_local && U_local.digitarCharAChar) {
          await new Promise(function(resolve) { U_local.digitarCharAChar(el, cleanTexto, {delay: speed || 60, onDone: resolve}); });
      } else {
          el.value = ''; el.focus(); var i = 0;
          await new Promise(function(resolve) {
              function next() {
                  if (i >= cleanTexto.length) { el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return resolve(); }
                  el.value = cleanTexto.substring(0, i + 1); el.dispatchEvent(new Event('input',{bubbles:true}));
                  i++; nativeSetTimeout(next, speed || 60);
              }
              next();
          });
      }
  }

  function typeSlowly(el, text, ms) { return digitarMascara(el, text, ms); }

  async function abrirAba(seletorAba, seletorPainel) {
      var aba = document.querySelector(seletorAba);
      if (aba) {
          var isSelected = aba.getAttribute('aria-selected') === 'true' || aba.classList.contains('active');
          if (!isSelected) {
              aba.click(); log('Abrindo aba: ' + seletorAba, 'ok');
              try { await waitForVisible(seletorPainel, 8000); } catch(e) { }
              await delay(300); 
          }
      }
  }

  function salvarEstado(nome, dados) { gmSet('omega_state', JSON.stringify({ estado: nome, dados: dados, ts: Date.now(), returnUrl: window.location.href })); log('Estado salvo: ' + nome, 'ok'); }
  function lerEstado() { try { var r = gmGet('omega_state',''); if(!r)return null; var s=JSON.parse(r); if(Date.now()-s.ts>900000){limparEstado();return null;} return s; } catch(e){return null;} }
  function limparEstado() { gmSet('omega_state', ''); }

  function getTargetDoc(task) {
      if (!task) return '';
      if (task.modo === 'arrendamento_avulso' || task.modo === 'arrendamento') { if (task.arrendamento && task.arrendamento.cpf_arrendatario) return String(task.arrendamento.cpf_arrendatario).replace(/\D/g, ''); }
      if (task.modo === 'cadcnpj') { if (task.cnpj_data && task.cnpj_data.cnpj) return String(task.cnpj_data.cnpj).replace(/\D/g, ''); }
      if (task.modo === 'cadcpf') { if (task.credenciais && task.credenciais.cpf) return String(task.credenciais.cpf).replace(/\D/g, ''); }
      if (task.modo === 'inclusao') { if (task.transportador) return String(task.transportador).replace(/\D/g, ''); }
      return '';
  }

  var VPS_URL=gmGet('omega_vps_url',''), VPS_TOKEN=gmGet('omega_vps_token',''), DEVICE_NAME=gmGet('omega_device_name',''), DEVICE_ID=gmGet('omega_device_id','');
  var ws=null, connected=false, paused=false, currentTask=null;
  var reconnectTimer=null, reconnectDelay=5000, RECONNECT_MAX=60000, RECONNECT_BASE=5000;
  var errorCount=0, ERROR_THRESHOLD=5, lastErrorTime=0, ERROR_WINDOW=30000;
  var logs=[], MAX_LOGS=15, wakeLockSentinel=null;
  var govPollInterval=null;

  function resetBackoff(){reconnectDelay=RECONNECT_BASE;} function nextBackoff(){reconnectDelay=Math.min(reconnectDelay*2,RECONNECT_MAX);}
  function log(msg,tipo){var now=new Date();var ts=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');logs.push({ts:ts,msg:msg,tipo:tipo||'ok'});if(logs.length>MAX_LOGS)logs.shift();console.log('[BRIDGE '+ts+'] '+msg);renderLogs();}
  function renderLogs(){if(!isANTT)return;var el=document.getElementById('omega-bridge-log');if(!el)return;el.innerHTML=logs.map(function(l){var c=l.tipo==='err'?'om-log-err':l.tipo==='warn'?'om-log-warn':'om-log-ok';return'<span style="color:#555e70">'+l.ts+'</span> <span class="'+c+'">'+l.msg+'</span>';}).join('<br>');if(el)el.scrollTop=el.scrollHeight;}

  async function requestWakeLock(){try{if('wakeLock' in navigator){wakeLockSentinel=await navigator.wakeLock.request('screen');}}catch(e){}}
  function releaseWakeLock(){if(wakeLockSentinel){try{wakeLockSentinel.release();}catch(e){}wakeLockSentinel=null;}}

  function paradaDeEmergencia() {
      paused = true; currentTask = null;
      limparEstado(); limparToasts(); log('SISTEMA ABORTADO PELO USUARIO', 'err');
      var U = window.OmegaUtils || null;
      if(U) U.box(document.getElementById('omega-bridge-status'), false, '🛑 PARADA DE EMERGENCIA');
      if(U && U.toast) U.toast('Automacao Parada!', false);
  }
  if (typeof unsafeWindow !== 'undefined') unsafeWindow.OmegaParar = paradaDeEmergencia;

  if(isANTT){
    function initInterfaceANTT() {
        var U = window.OmegaUtils || null;
        if (!U) { nativeSetTimeout(initInterfaceANTT, 300); return; } 

        U.registrarAba('bridge','Bridge',''
          +'<div class="om-section-title">Conexao VPS</div>'
          +'<div class="om-mb-sm"><label class="om-label">URL</label><input id="omega-bridge-url" class="om-input" placeholder="https://omhk.com.br"></div>'
          +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Token</label><input id="omega-bridge-token" class="om-input" type="password" placeholder="Senha"></div><div><label class="om-label">Nome</label><input id="omega-bridge-name" class="om-input" placeholder="Celular"></div></div>'
          +'<div class="om-grid om-grid-3 om-mb">'
            +'<button type="button" id="omega-bridge-connect" class="om-btn om-btn-green om-btn-sm">Conectar</button>'
            +'<button type="button" id="omega-bridge-pause" class="om-btn om-btn-amber om-btn-sm" style="display:none">Pausar</button>'
            +'<button type="button" id="omega-bridge-stop" class="om-btn om-btn-coral om-btn-sm" style="display:none">Parar Tudo</button>'
          +'</div>'
          +'<div id="omega-bridge-status"></div><div id="omega-bridge-task" style="margin-top:6px"></div>'
          +'<div class="om-section-title" style="margin-top:10px">Log</div><div id="omega-bridge-log" class="om-log"></div>'
        );

        var u=document.getElementById('omega-bridge-url'), t=document.getElementById('omega-bridge-token'), n=document.getElementById('omega-bridge-name');
        if(u&&VPS_URL)u.value=VPS_URL; if(t&&VPS_TOKEN)t.value=VPS_TOKEN; if(n&&DEVICE_NAME)n.value=DEVICE_NAME;
        atualizarUI(); renderLogs();

        document.getElementById('omega-bridge-connect').addEventListener('click',function(e){e.preventDefault();VPS_URL=document.getElementById('omega-bridge-url').value.trim();VPS_TOKEN=document.getElementById('omega-bridge-token').value.trim();DEVICE_NAME=document.getElementById('omega-bridge-name').value.trim()||'Dispositivo';if(!VPS_URL)return U.box(document.getElementById('omega-bridge-status'),false,'URL vazia.');gmSet('omega_vps_url',VPS_URL);gmSet('omega_vps_token',VPS_TOKEN);gmSet('omega_device_name',DEVICE_NAME);paused=false;errorCount=0;resetBackoff();conectar();});
        document.getElementById('omega-bridge-pause').addEventListener('click',function(e){e.preventDefault();if(paused){paused=false;errorCount=0;resetBackoff();conectar();}else pausarConexao('Pausado');});
        document.getElementById('omega-bridge-stop').addEventListener('click',function(e){e.preventDefault();paradaDeEmergencia();});
        
        if(U.restaurarAbaSalva) nativeSetTimeout(function(){U.restaurarAbaSalva();},500);
    }
    initInterfaceANTT();
  }

  if(isGovBr){
    var govCss=document.createElement('style');
    govCss.textContent='#omega-gov-panel{position:fixed;bottom:16px;right:16px;z-index:999999;background:rgba(14,18,30,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 16px;font-family:"Segoe UI",Arial,sans-serif;color:#c8cdd8;font-size:12px;backdrop-filter:blur(20px);box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:260px;max-width:320px;transition:all 0.3s}#omega-gov-panel .og-title{font-weight:700;color:#5a9cf5;letter-spacing:2px;font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}#omega-gov-panel .og-row{margin-bottom:6px}#omega-gov-panel input{width:100%;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#c8cdd8;font-size:11px;outline:none;box-sizing:border-box}#omega-gov-panel input:focus{border-color:rgba(90,156,245,0.4)}#omega-gov-panel button{padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px;transition:all 0.2s}.og-btn-green{background:linear-gradient(135deg,#34a853,#2d8f47);color:#fff}.og-btn-coral{background:linear-gradient(135deg,#e07065,#c0392b);color:#fff}.og-btn-reset{background:none;border:1px solid rgba(255,255,255,0.15)!important;color:#8a92a6;font-size:10px!important;padding:3px 8px!important}.og-btn-reset:hover{border-color:rgba(224,112,101,0.4)!important;color:#e07065}#omega-gov-panel .og-status{margin-top:6px;font-size:11px;padding:4px 8px;border-radius:6px}.og-status-ok{background:rgba(52,168,83,0.1);color:#5ddb7a;border:1px solid rgba(52,168,83,0.15)}.og-status-err{background:rgba(192,57,43,0.1);color:#e07065;border:1px solid rgba(192,57,43,0.15)}.og-status-info{background:rgba(26,115,232,0.1);color:#5a9cf5;border:1px solid rgba(26,115,232,0.15)}';
    document.head.appendChild(govCss);
    var govPanel=document.createElement('div'); govPanel.id='omega-gov-panel'; var temConfig=!!VPS_URL;

    function renderGovForm(){
      govPanel.innerHTML='<div class="og-title"><span>OMEGA — Bridge</span></div><div class="og-row"><input id="og-url" placeholder="https://omhk.com.br" value="'+(VPS_URL||'')+'"></div><div class="og-row" style="display:flex;gap:4px"><input id="og-token" type="password" placeholder="Token" value="'+(VPS_TOKEN||'')+'"><input id="og-name" placeholder="Nome" value="'+(DEVICE_NAME||'')+'"></div><div style="margin-top:8px"><button class="og-btn-green" id="og-save">Conectar</button><button class="og-btn-coral" id="og-hide">Fechar</button></div><div id="og-conn-status" class="og-status" style="display:none"></div>';
      var saveBtn=govPanel.querySelector('#og-save');
      if(saveBtn){ saveBtn.addEventListener('click',function(){ var url=(govPanel.querySelector('#og-url')||{}).value||''; var token=(govPanel.querySelector('#og-token')||{}).value||''; var name=(govPanel.querySelector('#og-name')||{}).value||'Dispositivo'; url=url.trim();token=token.trim();name=name.trim()||'Dispositivo'; if(!url){atualizarGovStatus('URL vazia','err');return;} VPS_URL=url;VPS_TOKEN=token;DEVICE_NAME=name; gmSet('omega_vps_url',url);gmSet('omega_vps_token',token);gmSet('omega_device_name',name); paused=false;errorCount=0;resetBackoff(); renderGovStatus('Conectando (Polling)...','info'); conectarGov(); }); }
      var hideBtn=govPanel.querySelector('#og-hide'); if(hideBtn){hideBtn.addEventListener('click',function(){govPanel.style.display='none';});}
    }

    function renderGovStatus(statusText, tipo){
      govPanel.innerHTML='<div class="og-title"><span>OMEGA</span><button class="og-btn-reset" id="og-reset">Resetar</button></div><div id="og-conn-status" class="og-status og-status-'+(tipo||'info')+'">'+(statusText||'...')+'</div><div id="og-task-status" style="margin-top:6px;font-size:10px;color:#555e70"></div>';
      var resetBtn=govPanel.querySelector('#og-reset');
      if(resetBtn){ resetBtn.addEventListener('click',function(){ paused=true; if(govPollInterval){nativeClearInterval(govPollInterval);govPollInterval=null;} connected=false; gmSet('omega_vps_url','');gmSet('omega_vps_token','');gmSet('omega_device_name',''); VPS_URL='';VPS_TOKEN='';DEVICE_NAME=''; renderGovForm(); }); }
    }

    function atualizarGovStatus(texto,tipo){ var el=govPanel.querySelector('#og-conn-status'); if(!el)return; el.style.display='block'; el.className='og-status og-status-'+(tipo||'info'); el.textContent=texto; }

    function conectarGov(){
      if(paused||!VPS_URL)return;
      if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}
      if(govPollInterval) nativeClearInterval(govPollInterval);
      var baseWs = VPS_URL.toLowerCase().trim(); var apiUrl = baseWs.replace(/^wss?:\/\//i, 'https://').replace(/\/ws\/?$/, '') + '/api/govbr/poll';
      
      function fazerPoll() {
          if(paused||!VPS_URL)return;
          GM_xmlhttpRequest({ method: "POST", url: apiUrl, headers: { "Content-Type": "application/json", "x-session": VPS_TOKEN }, data: JSON.stringify({ deviceId: DEVICE_ID, name: (DEVICE_NAME||'Dispositivo')+' (Gov.br)', status: currentTask?'running':'idle' }),
              onload: function(res) { if(res.status===200){ if(!connected){ connected=true; atualizarGovStatus('Conectado ✓ — HTTP Polling','ok'); } try{ var data=JSON.parse(res.responseText); if(data.type==='task') receberTarefa(data.task); if(data.type==='stop') paradaDeEmergencia(); }catch(e){} } else { connected=false; atualizarGovStatus('Erro Polling (Status '+res.status+')','err'); } },
              onerror: function() { connected=false; atualizarGovStatus('Erro de Conexao','err'); }
          });
      }
      fazerPoll(); 
      govPollInterval = nativeSetInterval(fazerPoll, 3000); 
    }

    var _enviarStatusOriginal=enviarStatus;
    enviarStatus=function(status,message,extra){
      if(isGovBr && VPS_URL){ var baseWs = VPS_URL.toLowerCase().trim(); var apiUrl = baseWs.replace(/^wss?:\/\//i, 'https://').replace(/\/ws\/?$/, '') + '/api/govbr/poll'; var payload = { deviceId: DEVICE_ID, status: status, message: message||'' }; if(extra) Object.assign(payload, extra); GM_xmlhttpRequest({ method: "POST", url: apiUrl, headers: { "Content-Type": "application/json", "x-session": VPS_TOKEN }, data: JSON.stringify(payload) }); }
      if(status==='error'||status==='error_critical')registrarErro(message||'Erro'); else errorCount=0; log(message||status,(status==='error'||status==='error_critical')?'err':'ok');
      if(!isGovBr)_enviarStatusOriginal(status,message,extra);
    };

    waitForElement('form, #accountId, .login-content', 15000).then(function() { document.body.appendChild(govPanel); if(temConfig){ renderGovStatus('Conectando...','info'); nativeSetTimeout(function(){conectarGov();}, 1500); } else { renderGovForm(); } }).catch(function() { document.body.appendChild(govPanel); if(temConfig){ renderGovStatus('Conectando...','info'); conectarGov(); } else { renderGovForm(); } });

    var _logOriginal=log; log=function(msg,tipo){_logOriginal(msg,tipo);var ts=govPanel.querySelector('#og-task-status');if(ts)ts.textContent=msg;};
  }

  function pausarConexao(m){paused=true;if(reconnectTimer){nativeClearTimeout(reconnectTimer);reconnectTimer=null;}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();log(m||'Pausado','warn');var U = window.OmegaUtils || null; if(U){U.box(document.getElementById('omega-bridge-status'),false,'⏸ '+(m||'Pausado'));}}
  function registrarErro(m){var a=Date.now();errorCount=(a-lastErrorTime<ERROR_WINDOW)?errorCount+1:1;lastErrorTime=a;log(m,'err');if(errorCount>=ERROR_THRESHOLD){pausarConexao('Auto-pause: flood');errorCount=0;}}

  function conectar(){
    if(paused||!VPS_URL)return;if(ws){try{ws.close();}catch(e){}ws=null;}log('Conectando...','ok');
    var wsUrl = VPS_URL.trim(); if(wsUrl.indexOf('https://')===0) wsUrl = wsUrl.replace('https://','wss://'); else if(wsUrl.indexOf('http://')===0) wsUrl = wsUrl.replace('http://','ws://'); if(wsUrl.indexOf('/ws')===-1) wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    var url=wsUrl+(VPS_TOKEN?((wsUrl.indexOf('?')===-1?'?':'&')+'token='+encodeURIComponent(VPS_TOKEN)):'');
    try{ws=new WebSocket(url);}catch(e){log('URL invalida','err');return;}
    ws.onopen=function(){connected=true;resetBackoff();errorCount=0;if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}ws.send(JSON.stringify({type:'register',deviceId:DEVICE_ID,name:DEVICE_NAME}));log('Conectado','ok');atualizarUI();var U = window.OmegaUtils || null; if(U){U.box(document.getElementById('omega-bridge-status'),true,'Conectado!');}var fab=document.getElementById('omega-fab');if(fab)fab.classList.add('om-fab-connected');};
    ws.onmessage=function(evt){var msg;try{msg=JSON.parse(evt.data);}catch{return;}if(msg.type==='registered'){DEVICE_ID=msg.deviceId;gmSet('omega_device_id',DEVICE_ID);}if(msg.type==='stop'){paradaDeEmergencia();}if(msg.type==='task')receberTarefa(msg);};
    ws.onclose=function(evt){connected=false;atualizarUI();var fab=document.getElementById('omega-fab');if(fab)fab.classList.remove('om-fab-connected');if(evt.code===4001){log('Token incorreto','err');return;}if(!paused&&VPS_URL){var s=Math.round(reconnectDelay/1000);log('Retry '+s+'s','warn');reconnectTimer=nativeSetTimeout(function(){nextBackoff();conectar();},reconnectDelay);}};
    ws.onerror=function(){log('Erro WS','err');};
  }

  function desconectar(i){paused=false;if(reconnectTimer){nativeClearTimeout(reconnectTimer);reconnectTimer=null;}if(i){VPS_URL='';gmSet('omega_vps_url','');}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();var U = window.OmegaUtils || null; if(U)U.clearBox(document.getElementById('omega-bridge-status'));log('Desconectado','warn');}

  function enviarStatus(status,message,extra){if(!ws||ws.readyState!==1)return;var p={type:'status',status:status,message:message||''};if(extra)for(var k in extra)p[k]=extra[k];try{ws.send(JSON.stringify(p));}catch(e){}var U = window.OmegaUtils || null; if(U){var pn=document.getElementById('antt-helper');if(pn&&pn.classList.contains('om-hidden'))U.toast(message||status,status!=='error'&&status!=='error_critical');}if(status==='error'||status==='error_critical')registrarErro(message||'Erro');else errorCount=0;log(message||status,(status==='error'||status==='error_critical')?'err':'ok');}

  function atualizarUI(){if(!isANTT)return;var c=document.getElementById('omega-bridge-connect'),p=document.getElementById('omega-bridge-pause'),s=document.getElementById('omega-bridge-stop');if(!c)return;if(connected){c.style.display='none';p.style.display='block';p.textContent='Pausar';p.className='om-btn om-btn-amber om-btn-sm';s.style.display='block';}else if(paused){c.style.display='none';p.style.display='block';p.textContent='Continuar';p.className='om-btn om-btn-green om-btn-sm';s.style.display='block';}else{c.style.display='block';p.style.display='none';s.style.display=VPS_URL?'block':'none';}}

  // FIX: ROTEAMENTO DO LOGIN GOV.BR RESTAURADO
  function receberTarefa(msg){
    currentTask=msg;requestWakeLock();enviarStatus('running','Tarefa: '+msg.modo);
    var U = window.OmegaUtils || null;
    if(U)U.box(document.getElementById('omega-bridge-task'),true,'Tarefa: <b>'+(msg.modo||'?')+'</b>');
    
    // Se a tarefa veio com Login/Senha da conta GOV
    if(msg.credenciais && msg.credenciais.cpf && msg.credenciais.senha){
      if(isANTT){ executarFluxo(msg); return; }
      salvarEstado('login_govbr',msg);
      processarLoginGovBr();
      return;
    }
    
    // Se veio vazia (já logado)
    executarFluxo(msg);
  }
  if (typeof unsafeWindow !== 'undefined') { unsafeWindow.OmegaStartLocalTask = receberTarefa; }

  // ══════════════════════════════════════════════════════════════
  // ROTEADOR CENTRAL E EXECUÇÃO
  // ══════════════════════════════════════════════════════════════
  async function executarFluxo(task){
    try{
      currentTask = task;
      if (paused) return;
      var url = window.location.href;
      log('Processando Fluxo: ' + task.modo, 'ok');

      await delay(2000);

      if (url.indexOf('Home/ExibirTermo') !== -1) {
          enviarStatus('running', 'Aceitando termo de uso...', {step: 'termo'});
          var chkTermo = document.getElementById('ckTermo');
          if (chkTermo) {
              var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery;
              if (jq) { jq(chkTermo).iCheck('check'); jq(chkTermo).trigger('change'); } 
              else { chkTermo.checked = true; chkTermo.dispatchEvent(new Event('change',{bubbles:true})); }
              await delay(1000);
              var btnProsseguir = document.getElementById('bAssinarTermo');
              if (btnProsseguir) {
                  salvarEstado('tarefa_pendente_navegacao', task);
                  btnProsseguir.click();
                  return; 
              }
          }
      }

      if (url.indexOf('Transportador/Cadastro') !== -1 || url.indexOf('Pedido/Criar') !== -1 || url.indexOf('NovoCadastro') !== -1) {
          if (!document.getElementById('Identidade') && !document.getElementById('TransportadorTac_Identidade') && !document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira') && (task.modo === 'cadcpf' || task.modo === 'cadcnpj' || task.modo === 'cadastro')) {
              await iniciarPedidoCadastro(task);
              return;
          }
      }
      
      var isFormulario = document.getElementById('Identidade') || document.getElementById('TransportadorTac_Identidade') || document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira') || (url.indexOf('/Pedido/') !== -1 && url.indexOf('AcompanharPedidos') === -1);
      
      // FIX: ROTEAMENTO DA INCLUSAO DENTRO DA PAGINA DO PEDIDO
      if (isFormulario) {
          if (task.modo === 'cadcpf' || (task.modo === 'cadastro' && task.tipo !== 'cnpj')) { await fluxoCadastroCPF(task); }
          else if (task.modo === 'cadcnpj' || (task.modo === 'cadastro' && task.tipo === 'cnpj')) { await fluxoCadastroCNPJ(task); }
          else if (task.modo === 'inclusao' || task.modo === 'inclusao_avulsa') { await processarVeiculos(task); } // Faltava esta linha!
          return;
      }

      if (url.indexOf('GerenciarFrota') !== -1 || url.indexOf('GerenciamentoFrota') !== -1 || url.indexOf('Movimentacao') !== -1) {
          if (task.modo === 'inclusao' || task.modo === 'inclusao_avulsa') {
              await fluxoInclusao(task);
              return;
          }
      }

      if (url.indexOf('ContratoArrendamento/Criar') !== -1) {
          if (task.modo === 'arrendamento' || task.modo === 'arrendamento_avulso' || task.modo === 'cadcpf' || task.modo === 'cadcnpj' || task.modo === 'inclusao') {
              await fluxoArrendamento(task);
              return;
          }
      }

      var isHome = url.endsWith('.gov.br/') || url.indexOf('Home') !== -1;
      if (isHome) {
          enviarStatus('running', 'Navegando para o destino...');
          salvarEstado('tarefa_pendente_navegacao', task);
          if (task.modo.indexOf('cad') !== -1) { window.location.href = 'https://rntrcdigital.antt.gov.br/Transportador/Cadastro'; return; }
          if (task.modo.indexOf('inc') !== -1) { window.location.href = 'https://rntrcdigital.antt.gov.br/Transportador/GerenciarFrota'; return; }
          if (task.modo.indexOf('arr') !== -1) { window.location.href = 'https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar'; return; }
      }
      enviarStatus('error', 'URL não reconhecida para a tarefa: ' + url);
    }catch(e){ enviarStatus('error_critical','Fatal: '+e.message); log('FATAL: '+e.message,'err'); }
  }

  function pararTarefa(){currentTask=null;releaseWakeLock();limparEstado();if(U)U.box(document.getElementById('omega-bridge-task'),false,'Cancelada.');enviarStatus('idle','Cancelada');}

  // ══════════════════════════════════════════════════════════════
  // MÁQUINA DE RESGATE E INÍCIO DE PEDIDO
  // ══════════════════════════════════════════════════════════════
  async function executarResgateNaPagina(cpfCnpj, task) {
    try {
      enviarStatus('running', 'Processando resgate...', {step:'resgate_ok'});
      var selDoc = await waitForElement('#CpfCnpjTransportadorCertificado', 10000);
      var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery;
      for(var i=0;i<selDoc.options.length;i++){ if(selDoc.options[i].value.replace(/\D/g,'').indexOf(cpfCnpj.replace(/\D/g,''))!==-1){ selDoc.value=selDoc.options[i].value; if(jq)jq(selDoc).trigger('change');else selDoc.dispatchEvent(new Event('change',{bubbles:true})); break; } }
      await delay(500);
      var selSit = document.getElementById('SituacaoPedido'); if(selSit){selSit.value='CAD';selSit.dispatchEvent(new Event('change',{bubbles:true}));} await delay(300);
      var btnConsultar = document.querySelector('.btn-consultar, button.btn-blue'); if(btnConsultar) btnConsultar.click(); await delay(3000);
      
      var rows = document.querySelectorAll('table tbody tr, .table tbody tr'); var encontrou = false;
      for(var r=0;r<rows.length;r++){
        if((rows[r].textContent||'').indexOf('EM CADASTRAMENTO') === -1) continue;
        var btnEditar = rows[r].querySelector('a[title="Editar"]');
        if(btnEditar){
            var href = btnEditar.getAttribute('href');
            if (href && href !== 'undefined' && href.trim() !== '') {
                salvarEstado('tarefa_pendente_navegacao', task);
                window.location.href = href.startsWith('http') ? href : 'https://rntrcdigital.antt.gov.br' + href;
                encontrou = true; break;
            } else {
                salvarEstado('tarefa_pendente_navegacao', task);
                btnEditar.click(); 
                encontrou = true; break;
            }
        }
        var btnHist = rows[r].querySelector('a[title="Histórico"], a[data-toggle-modal="true"], .fa-inbox');
        if(btnHist){
          if(btnHist.tagName === 'I') btnHist = btnHist.closest('a'); if(btnHist) btnHist.click(); await delay(2000);
          var detalhes = {dataHora:'?',situacao:'?',usuario:'?',nome:'?',entidade:'?'};
          try{ var lis = document.querySelectorAll('.modal-body li'); lis.forEach(function(li){ var label = (li.childNodes[0]||{}).textContent||''; var valor = (li.querySelector('span')||li.querySelector('p')||{}).textContent||''; if(label.indexOf('Data')!==-1) detalhes.dataHora = valor.trim(); else if(label.indexOf('Situa')!==-1) detalhes.situacao = valor.trim(); else if(label.indexOf('Usu')!==-1) detalhes.usuario = valor.trim(); else if(label.indexOf('Nome')!==-1) detalhes.nome = valor.trim(); }); }catch(e){}
          enviarStatus('erro_fatal','Pedido bloqueado por: '+(detalhes.nome||detalhes.usuario),{detalhes:detalhes}); encontrou = true; limparEstado(); break;
        }
      }
      if(!encontrou) { enviarStatus('error','Nenhum pedido em cadastramento encontrado.'); limparEstado(); }
    } catch(e) { enviarStatus('error','Falha no resgate: '+e.message); limparEstado(); }
  }

  async function iniciarPedidoCadastro(task) {
      enviarStatus('running', 'Selecionando Perfil...', {step:'iniciar_pedido'});
      var doc = getTargetDoc(task); 
      var sel = document.querySelector('select#CpfCnpjTransportador') || document.querySelector('select');
      if (sel) {
          var found = false;
          for(var i=0; i<sel.options.length; i++){
              if(sel.options[i].text.replace(/\D/g,'').indexOf(doc) !== -1 || sel.options[i].value.replace(/\D/g,'').indexOf(doc) !== -1){
                  sel.value = sel.options[i].value;
                  sel.dispatchEvent(new Event('change',{bubbles:true}));
                  found = true; break;
              }
          }
          if(!found) { enviarStatus('error', 'CPF/CNPJ não disponível na conta.'); limparEstado(); return; }
          
          await delay(1500);
          var btnCriar = document.getElementById('btnCriarPedido') || document.querySelector('.btn-primary') || document.querySelector('button[type="submit"]');
          if(!btnCriar) {
              var btns = document.querySelectorAll('button, a.btn');
              for(var b=0; b<btns.length; b++) { if(btns[b].textContent.indexOf('Criar Pedido') !== -1 || btns[b].textContent.indexOf('Novo') !== -1) { btnCriar = btns[b]; break; } }
          }
          if(btnCriar) {
              salvarEstado('tarefa_pendente_navegacao', task);
              btnCriar.click();
          } else {
              enviarStatus('error', 'Botão Criar Pedido não encontrado.'); limparEstado(); return;
          }
      }
  }

  // ══════════════════════════════════════════════════════════════
  // PREENCHIMENTO DE DADOS (iCheck, Máscaras e Modais)
  // ══════════════════════════════════════════════════════════════

  async function forcarCheckboxesModal() {
      var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery;
      if(jq) {
          jq('.modal input[type="checkbox"]').each(function(){
              if(!jq(this).parent().hasClass('checked')){
                  jq(this).iCheck('check');
              }
          });
      }
  }

  async function injetarDadosHumanizadosEndereco(d) {
      var f = getVisible('#Logradouro'); 
      if(f){ f.removeAttribute('disabled'); await digitarMascara(f, d.logradouro || '0', 30); f.dispatchEvent(new Event('blur',{bubbles:true})); }

      var nf = getVisible('#Numero'); 
      if(nf){ nf.removeAttribute('disabled'); await digitarMascara(nf, d.numero || '0', 30); nf.dispatchEvent(new Event('blur',{bubbles:true})); }
      
      if(d.complemento) { 
          var cf2 = getVisible('#Complemento'); 
          if(cf2) { cf2.removeAttribute('disabled'); await digitarMascara(cf2, d.complemento, 30); cf2.dispatchEvent(new Event('blur',{bubbles:true})); } 
      }

      var bf = getVisible('#Bairro'); 
      if(bf){ bf.removeAttribute('disabled'); await digitarMascara(bf, d.bairro || '0', 30); bf.dispatchEvent(new Event('blur',{bubbles:true})); }
  }

  async function preencherEndereco(d, tipoDefault){
    var cep=(d.cep||'').replace(/\D/g,''); 
    await abrirAba('a.contatos, a[href="#contatos"]', '#EnderecoPedidoPanel, [data-action*="Endereco/Novo"]');
    
    var btn = getVisible('[data-action*="Endereco/Novo"], [data-action*="EnderecoPedido"]');
    if(btn) btn.click();

    var cf = await waitForVisible('#Cep, input[name*="Cep"]', 10000);
    await delay(1500); 

    async function esperarViaCEP() {
        return new Promise(function(resolve) {
            var blkAppeared = false;
            var timer = nativeSetTimeout(function() {
                if(obs) obs.disconnect(); resolve();
            }, 8000);
            
            var obs = new MutationObserver(function() {
                var cid = document.getElementById('DescricaoCidade');
                var blk = document.querySelector('.blockUI');
                var isBlk = blk && blk.style.display !== 'none';
                if (isBlk) blkAppeared = true;
                if (cid && cid.innerText.trim() !== '' && !isBlk && blkAppeared) {
                    nativeClearTimeout(timer); obs.disconnect(); resolve();
                }
            });
            obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
            
            nativeSetTimeout(function(){
                var cid = document.getElementById('DescricaoCidade');
                var blk = document.querySelector('.blockUI');
                if (cid && cid.innerText.trim() !== '' && (!blk || blk.style.display === 'none')) {
                     nativeClearTimeout(timer); obs.disconnect(); resolve();
                }
            }, 3000);
        });
    }

    async function injetarCepEValidar(cepParaDigitar) {
        if(cf){ 
            cf.removeAttribute('disabled');
            await digitarMascara(cf, cepParaDigitar, 60);
            
            var logTrigger = getVisible('#Logradouro');
            if (logTrigger) { logTrigger.focus(); logTrigger.click(); }
            else {
                cf.dispatchEvent(new Event('blur',{bubbles:true}));
                var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(cf).trigger('blur');
            }
            
            await delay(300);
            await esperarViaCEP();
            await delay(500); 
        }
    }

    var selTipo = getVisible('#CodigoTipoEndereco');
    if(selTipo) {
        var valToSelect = '';
        for(var i=0; i<selTipo.options.length; i++) if(selTipo.options[i].value === tipoDefault) valToSelect = tipoDefault;
        if(!valToSelect && selTipo.options.length>0) valToSelect = selTipo.options[1].value || selTipo.options[0].value;
        selTipo.value = valToSelect; selTipo.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(selTipo).trigger('change');
    }
    await delay(500);

    if(cep) await injetarCepEValidar(cep);

    var municipioEl = document.getElementById('DescricaoCidade');
    if (!municipioEl || municipioEl.innerText.trim() === '') {
        log('ViaCEP falhou ou CEP vazio. Acionando Fallback...', 'warn');
        var ufDoc = document.getElementById('UfSigla_Descricao');
        var ufTxt = ufDoc ? ufDoc.innerText.trim().toUpperCase() : '';
        var cepsFallback = { 'RJ': ['23032486', '20211110'], 'SP': ['04805140', '01002900'], 'MG': ['32220390', '32017900'] };
        var cepEmergencia = (cepsFallback[ufTxt]) ? cepsFallback[ufTxt][0] : cepsFallback['MG'][0];
        await injetarCepEValidar(cepEmergencia);
    }

    await injetarDadosHumanizadosEndereco(d);
    await delay(500);

    var me = getVisible('#MesmoEndereco, #mesmoEndereco');
    if(me){ 
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery;
        if(jq) { jq(me).iCheck('check'); jq(me).trigger('change'); }
        else { if(!me.checked) me.click(); me.checked = true; me.dispatchEvent(new Event('change',{bubbles:true})); }
    }

    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary, [data-action*="Salvar"]');
    if(bs){ 
        bs.removeAttribute('disabled'); bs.click(); 
        await waitBlockUI(10000); 
        await aguardarModalFechar();
    }
  }

  async function adicionarContato(tipo,valor){
    await abrirAba('a.contatos, a[href="#contatos"]', '#ContatoPedidoPanel, [data-action*="ContatoPedido/Novo"]');

    var panel = getVisible('#ContatoPedidoPanel');
    if(panel) {
        var str = panel.innerText.toLowerCase();
        if ((tipo === '1' || tipo === '2') && (str.indexOf('telefone') !== -1 || str.indexOf('celular') !== -1 || str.indexOf('(00) 0000-0000') !== -1)) { return true; }
        if (tipo === '4' && (str.indexOf('email') !== -1 || str.indexOf('@') !== -1)) { return true; }
    }

    var btn = getVisible('[data-action*="ContatoPedido/Novo"]');
    if(!btn) return false;
    btn.click(); 

    var cf = await waitForVisible('#Contato', 5000);
    await delay(1500);
    
    var selTipo = getVisible('#CodigoTipoContato');
    if(selTipo) {
        selTipo.value = tipo; selTipo.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(selTipo).trigger('change');
    }
    await delay(500);

    if(cf) {
        cf.removeAttribute('disabled');
        await digitarMascara(cf, valor, 60);
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(500);

    var bs = getVisible('.modal .btn-salvar-contato, .modal .btn-primary');
    if(bs){ 
        bs.removeAttribute('disabled'); bs.click(); 
        await waitBlockUI(10000); 
        await aguardarModalFechar();
    }
    return true;
  }

  async function preencherGestor(cpf){
    enviarStatus('running','Gestor/socio...',{step:'gestor'});
    await abrirAba('a.gestor, a[href="#gestor"]', '#GestorPedidoPanel, [data-action*="GestorPedido/Novo"]');

    var btn = getVisible('[data-action*="Gestor/Criar"], [data-action*="GestorPedido/Novo"]');
    if(!btn) return;
    btn.click(); 

    var sel = await waitForVisible('.modal.show select, .modal.in select', 10000);
    await delay(1500);

    if(sel) {
        for(var i=0; i<sel.options.length; i++){
            if(sel.options[i].text.toLowerCase().indexOf('socio')!==-1 || sel.options[i].text.toLowerCase().indexOf('sócio')!==-1){
                sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change',{bubbles:true}));
                var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(sel).trigger('change'); break;
            }
        }
    }
    await delay(500);

    var cf = getVisible('.modal #Cpf, .modal input[name="Cpf"], .modal input[name="CpfCnpj"]');
    if(cf){
        cf.removeAttribute('disabled'); 
        await digitarMascara(cf, cpf, 70);
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(3000); 

    for(var i=0; i<30; i++){
        var nf = getVisible('.modal #Nome, .modal input[name="Nome"]');
        if(nf && nf.value && nf.value.length > 2) break;
        await delay(500);
    }

    await forcarCheckboxesModal();
    await delay(500);

    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary');
    if(bs){ 
        bs.removeAttribute('disabled'); bs.click(); 
        await waitBlockUI(10000); 
        await aguardarModalFechar();
    }
  }

  async function preencherRT(){
    enviarStatus('running','RT...',{step:'rt'}); var cpfRT=gmGet('omega_rt_cpf','')||'07141753664';
    await abrirAba('a.responsavelTecnico, a[href="#responsavelTecnico"]', '#ResponsavelTecnicoPanel, [data-action*="ResponsavelTecnico/Criar"]');

    var btn = getVisible('[data-action*="ResponsavelTecnico/Criar"]');
    if(!btn) return;
    btn.click();

    var cf = await waitForVisible('.modal #Cpf', 10000);
    await delay(1500);

    if(cf){
        cf.removeAttribute('disabled'); 
        await digitarMascara(cf, cpfRT, 70);
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(3000); 

    for(var i=0; i<30; i++){
        var nf = getVisible('.modal #Nome');
        if(nf && nf.value && nf.value.length > 2) break;
        await delay(500);
    }

    await forcarCheckboxesModal();
    await delay(500);

    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary');
    if(bs){ 
        bs.removeAttribute('disabled'); bs.click(); 
        await waitBlockUI(10000); 
        await aguardarModalFechar();
    }
  }

  function gerarEmailAleatorio(){var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<12;i++)s+=c[Math.floor(Math.random()*c.length)];return s+'@yahoo.com';}

  async function finalizarPedidoANTT() {
      enviarStatus('running','Finalizando Pedido...',{step:'finalizar'});
      var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');
      if(btnFin){ btnFin.click(); await delay(2000); }
      
      var btnConfModal = getVisible('.bootbox-confirm button[data-bb-handler="confirm"]');
      if(btnConfModal) { btnConfModal.click(); await delay(2000); }
      
      var btnConfPadrao = getVisible('.modal .btn-primary, .btn-confirmar');
      if(btnConfPadrao) { btnConfPadrao.click(); await delay(3000); }

      enviarStatus('done','Cadastro concluido!');
  }

  // ══════════════════════════════════════════════════════════════
  // VEÍCULOS E ARRENDAMENTO
  // ══════════════════════════════════════════════════════════════

  async function processarInclusaoVeiculo(placa,renavam){
    log('Incluindo: '+placa,'ok');enviarStatus('running','Incluindo '+placa,{step:'veiculo'});
    var btnN = getVisible('[data-action*="VeiculoPedido/Novo"], [data-action*="Veiculo/Novo"]');
    if(!btnN)throw new Error('Botao veiculo nao encontrado');
    btnN.click();
    
    var cp = await waitForVisible('#Placa', 10000); 
    await delay(1500); 

    cp.removeAttribute('disabled');
    var pLimpa = placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    await digitarMascara(cp, pLimpa, 80);
    cp.dispatchEvent(new Event('blur',{bubbles:true}));

    var cr=getVisible('#Renavam');
    if(cr) {
        cr.removeAttribute('disabled'); cr.value=renavam;
        cr.dispatchEvent(new Event('input',{bubbles:true})); cr.dispatchEvent(new Event('change',{bubbles:true})); cr.dispatchEvent(new Event('blur',{bubbles:true})); 
    }
    await delay(500);
    
    var bv = getVisible('#verificar, #btnBuscarVeiculo');
    if(bv) bv.click();
    
    enviarStatus('running','Aguardando ANTT (Dados)...',{step:'veiculo_wait'});
    await delay(1000); 
    
    var waitLimit = 0;
    while(waitLimit < 30) {
        var bbs = document.querySelectorAll('.bootbox-confirm button[data-bb-handler="confirm"], .btn-confirmar-exclusao');
        var clicouAlgum = false;
        for (var idx=0; idx<bbs.length; idx++) {
            if (bbs[idx].offsetParent !== null) { bbs[idx].click(); clicouAlgum = true; await delay(1500); }
        }
        var tara = getVisible('#Tara'); var eixos = getVisible('#Eixos'); var uiBlock = document.querySelector('.blockUI');
        if (!clicouAlgum && tara && !tara.hasAttribute('disabled') && eixos && !eixos.hasAttribute('disabled') && (!uiBlock || uiBlock.style.display === 'none')) { break; }
        await delay(1000); waitLimit++;
    }

    var taraEl = getVisible('#Tara');
    if(taraEl && (!taraEl.value || taraEl.value.trim() === '')) {
        taraEl.removeAttribute('disabled'); taraEl.value = '2';
        taraEl.dispatchEvent(new Event('input',{bubbles:true})); taraEl.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(taraEl).trigger('change');
    }

    var eixosEl = getVisible('#Eixos');
    if(eixosEl && (!eixosEl.value || eixosEl.value.trim() === '' || eixosEl.value === '0')) {
        eixosEl.removeAttribute('disabled'); eixosEl.value = '2';
        eixosEl.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = typeof unsafeWindow !== 'undefined' ? unsafeWindow.jQuery : window.jQuery; if(jq) jq(eixosEl).trigger('change');
    }
    await delay(500);

    var bs = getVisible('.btn-salvar-veiculo, .btn-confirmar-inclusao');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); log('Salvo: '+placa,'ok'); } 
    else { throw new Error('Botao salvar nao encontrado'); }

    await delay(1000);
    var bbFinal = getVisible('.bootbox-confirm button[data-bb-handler="confirm"], .btn-confirmar-exclusao');
    if(bbFinal) { bbFinal.click(); await delay(1500); }

    await waitBlockUI(10000); 
    await aguardarModalFechar();
  }

  async function processarVeiculos(task){
    if (paused) return;
    var veiculos=task.veiculos||[]; var d=task.transportador||task;
    
    if(veiculos.length===0&&d.placa&&d.renavam) veiculos=[{tipo_veiculo:d.tipo_veiculo||d.tipoVeiculo||'nao',placa:d.placa,renavam:d.renavam,cpf_arrendante:d.cpf_arrendante||'',nome_arrendante:d.nome_arrendante||''}];
    if(veiculos.length===0||(veiculos.length===1&&(veiculos[0].tipo_veiculo||'nao').toLowerCase()==='nao')){
      await finalizarPedidoANTT(); return;
    }
    
    await abrirAba('a.veiculo, a[href="#veiculo"]', '#VeiculoPedidoPanel, [data-action*="Veiculo/Novo"]');
    var vi = parseInt(gmGet('omega_current_vehicle_index','0')) || 0;

    for(; vi<veiculos.length; vi++){
      if (paused) return;
      var v=veiculos[vi];var tipoV=(v.tipo_veiculo||'proprio').toLowerCase(); if(tipoV==='nao')continue;
      
      gmSet('omega_current_vehicle_index', String(vi));

      if(tipoV==='terceiro'&&v.placa&&v.renavam){
        enviarStatus('running','Terceiro: arrendamento '+v.placa,{step:'desvio'}); 
        gmSet('omega_return_url', window.location.href);
        salvarEstado('inclusao_pendente_arrendamento',{
            modo: 'arrendamento', transportador:task.transportador||task, veiculos:veiculos, currentVehicleIndex:vi, 
            credenciais:task.credenciais, cnpj_data:task.cnpj_data, 
            arrendamento:{placa:v.placa, renavam:v.renavam, cpf_arrendante:v.cpf_arrendante||'', nome_arrendante:v.nome_arrendante||''}
        });
        window.location.href='https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar'; return;
      }
      enviarStatus('running','Veiculo '+(vi+1)+'/'+veiculos.length+': '+v.placa,{step:'veiculo_'+(vi+1)});
      await processarInclusaoVeiculo(v.placa,v.renavam);await delay(2000);
    }
    
    await finalizarPedidoANTT();
    gmSet('omega_current_vehicle_index', '0');
  }

  async function fluxoInclusao(task){
    enviarStatus('running','Acessando Frota',{step:'inclusao'}); 
    var transp = getTargetDoc(task);
    var formAberto = null; var btnCriar = null;

    for(var i=0; i<20; i++){
        formAberto = getVisible('[data-action*="VeiculoPedido/Novo"], [data-action*="Veiculo/Novo"]');
        if(formAberto) break;
        // FIX: BUSCADOR DE BOTÕES MAIS INTELIGENTE
        btnCriar = getVisible('#btnCriarPedido, button[type="submit"], .btn-primary, a.btn-blue');
        if (!btnCriar) {
            var btns = document.querySelectorAll('button, a.btn');
            for(var b=0; b<btns.length; b++) {
                if(btns[b].textContent.indexOf('Criar Pedido') !== -1 || btns[b].textContent.indexOf('Novo') !== -1 || btns[b].textContent.indexOf('Adicionar') !== -1) {
                    if(btns[b].offsetParent !== null) { btnCriar = btns[b]; break; }
                }
            }
        }
        if(btnCriar) break;
        await delay(500);
    }
    
    if(formAberto) { await processarVeiculos(task); return; }

    if(btnCriar) {
        var sel = document.querySelector('select');
        if(sel) {
            for(var i=0;i<sel.options.length;i++){
                if(sel.options[i].text.replace(/\D/g,'').indexOf(transp)!==-1 || sel.options[i].value.replace(/\D/g,'').indexOf(transp)!==-1){
                    sel.value=sel.options[i].value; sel.dispatchEvent(new Event('change',{bubbles:true})); break;
                }
            }
        }
        await delay(1000);
        salvarEstado('tarefa_pendente_navegacao', task);
        btnCriar.click();
        
        var resultado = await waitForToastOrSuccess('[data-action*="VeiculoPedido/Novo"]', 10000);
        if(resultado && resultado.tipo === 'toast_erro') { 
            var msgLower = resultado.texto.toLowerCase();
            if(msgLower.indexOf('pedido') !== -1 || msgLower.indexOf('cadastramento') !== -1) {
                limparEstado(); salvarEstado('resgate_pedido', { cpfCnpj: transp, task: task }); window.location.href = 'https://rntrcdigital.antt.gov.br/AcompanharPedidos'; return;
            } else {
                enviarStatus('erro_fatal', 'Falha ao acessar frota: ' + resultado.texto); limparEstado(); return;
            }
        }
        nativeSetTimeout(function(){ executarFluxo(task); }, 2000);
        return;
    }
    enviarStatus('error', 'Painel de frota nao carregou a tempo.');
  }

  function verificarEstadoPendente(){
    var estado = lerEstado(); if(!estado) return;
    log('Memoria detectada: ' + estado.estado, 'warn');
    if(isGovBr && estado.estado === 'login_govbr'){ processarLoginGovBr(); return; }
    if(isANTT && (estado.estado === 'login_govbr' || estado.estado === 'tarefa_pendente_navegacao' || estado.estado === 'inclusao_pendente_arrendamento' || estado.estado === 'pendente_arrendamento')) {
        var task = estado.dados; limparEstado(); currentTask = task;
        nativeSetTimeout(function(){ if(VPS_URL && !connected) conectar(); executarFluxo(task); }, 1500); return;
    }
    if(isANTT && estado.estado === 'resgate_pedido' && location.href.indexOf('AcompanharPedidos') !== -1) {
        nativeSetTimeout(function(){ if(VPS_URL && !connected) conectar(); executarResgateNaPagina(estado.dados.cpfCnpj, estado.dados.task); }, 2000); return;
    }
  }

  if(VPS_URL&&!paused)nativeSetTimeout(function(){if(isGovBr)conectarGov();else conectar();},2000);
  nativeSetTimeout(verificarEstadoPendente,3000);

})();
