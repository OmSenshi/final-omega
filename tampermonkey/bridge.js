// bridge.js — Final Omega v9.2 (Sunshine Edition)
// Active Bootbox Hunter, Contact Duplication Check, Save Button Forcer
(function(){
  var isANTT = location.hostname.indexOf('rntrcdigital.antt.gov.br') !== -1;
  var isGovBr = location.hostname.indexOf('acesso.gov.br') !== -1;
  var U = window.OmegaUtils || null;

  function gmGet(k,d){ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : ''; }
  function gmSet(k,v){ try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); }catch(e){} }

  // ══════════════════════════════════════════════════════════════
  // RADAR DE VISIBILIDADE, ESPERAS E ANIQUILAÇÃO NUCLEAR DE TOASTS
  // ══════════════════════════════════════════════════════════════
  function getVisible(selector) {
      var els = document.querySelectorAll(selector);
      for(var i=0; i<els.length; i++) { if (els[i].offsetParent !== null) return els[i]; }
      return null;
  }

  function waitForVisible(selector, timeout) {
      timeout = timeout || 15000;
      return new Promise(function(resolve, reject) {
          var t = setTimeout(function() { reject(new Error('Timeout visible: ' + selector)); }, timeout);
          function check() {
              var el = getVisible(selector);
              if (el) { clearTimeout(t); resolve(el); return; }
              setTimeout(check, 300);
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
        if (el) { obs.disconnect(); clearTimeout(t); resolve(el); }
      });
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      var t = setTimeout(function() { obs.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
  }

  function waitForToastOrSuccess(successSelector, timeout) {
    timeout = timeout || 15000;
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function() { resolve({ tipo: 'timeout' }); }, timeout);
      function check() {
        var toast = getVisible('#toast-container .toast-error');
        if (toast) { clearTimeout(t); resolve({ tipo: 'toast_erro', texto: toast.textContent || '' }); return; }
        var ok = getVisible(successSelector);
        if (ok) { clearTimeout(t); resolve({ tipo: 'sucesso', el: ok }); return; }
        setTimeout(check, 300);
      }
      check();
    });
  }

  function waitBlockUI(timeout) {
      timeout = timeout || 15000;
      return new Promise(function(resolve) {
          var t = setTimeout(function() { resolve(); }, timeout);
          function check() {
              var block = document.querySelector('.blockUI');
              if (!block || block.style.display === 'none') { clearTimeout(t); resolve(); return; }
              setTimeout(check, 300);
          }
          check();
      });
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function limparToasts() {
      var tc = document.getElementById('toast-container');
      if (tc) { tc.innerHTML = ''; tc.remove(); }
      document.querySelectorAll('.toast, .toast-success, .toast-error').forEach(function(t) {
          t.remove();
      });
  }

  function typeSlowly(el, text, ms) {
    ms = ms || 80;
    return new Promise(function(resolve) {
      el.value = ''; el.focus(); var i = 0;
      function next() {
        if (i >= text.length) { el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return resolve(); }
        el.value = text.substring(0, i + 1); el.dispatchEvent(new Event('input',{bubbles:true}));
        i++; setTimeout(next, ms);
      }
      next();
    });
  }

  async function abrirAba(seletorAba, seletorPainel) {
      var aba = document.querySelector(seletorAba);
      if (aba) {
          var isSelected = aba.getAttribute('aria-selected') === 'true' || aba.classList.contains('active');
          if (!isSelected) {
              aba.click();
              log('Abrindo aba: ' + seletorAba, 'ok');
              try { await waitForVisible(seletorPainel, 8000); } catch(e) { log('Aba demorou a responder', 'warn'); }
              await delay(1000); 
          }
      }
  }

  function salvarEstado(nome, dados) { gmSet('omega_state', JSON.stringify({ estado: nome, dados: dados, ts: Date.now(), returnUrl: window.location.href })); log('Estado salvo: ' + nome, 'ok'); }
  function lerEstado() { try { var r = gmGet('omega_state',''); if(!r)return null; var s=JSON.parse(r); if(Date.now()-s.ts>900000){limparEstado();return null;} return s; } catch(e){return null;} }
  function limparEstado() { gmSet('omega_state', ''); }

  function getTargetDoc(task) {
      if (!task) return '';
      if (task.modo === 'arrendamento_avulso' || task.modo === 'arrendamento') {
          var arr = task.arrendamento || task;
          if (arr.cpf_arrendatario) return String(arr.cpf_arrendatario).replace(/\D/g, '');
      }
      var d = task.transportador || task;
      if (typeof d === 'string') return d.replace(/\D/g, '');
      var isCnpj = task.modo === 'cadcnpj' || task.tipo === 'cnpj';
      if (isCnpj) {
          var c = d.cnpj || (task.cnpj_data && task.cnpj_data.cnpj) || d.cpf_cnpj;
          if (c) return String(c).replace(/\D/g, '');
      }
      var doc = d.cnpj || d.cpf || d.cpf_cnpj;
      if (doc) return String(doc).replace(/\D/g, '');
      return (task.credenciais && task.credenciais.cpf ? String(task.credenciais.cpf) : '').replace(/\D/g, '');
  }

  var VPS_URL=gmGet('omega_vps_url',''), VPS_TOKEN=gmGet('omega_vps_token',''), DEVICE_NAME=gmGet('omega_device_name',''), DEVICE_ID=gmGet('omega_device_id','');
  var ws=null, connected=false, paused=false, currentTask=null;
  var reconnectTimer=null, reconnectDelay=5000, RECONNECT_MAX=60000, RECONNECT_BASE=5000;
  var errorCount=0, ERROR_THRESHOLD=5, lastErrorTime=0, ERROR_WINDOW=30000;
  var logs=[], MAX_LOGS=15, wakeLockSentinel=null;
  var govPollInterval=null;

  function resetBackoff(){reconnectDelay=RECONNECT_BASE;} function nextBackoff(){reconnectDelay=Math.min(reconnectDelay*2,RECONNECT_MAX);}

  function log(msg,tipo){var now=new Date();var ts=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');logs.push({ts:ts,msg:msg,tipo:tipo||'ok'});if(logs.length>MAX_LOGS)logs.shift();console.log('[BRIDGE '+ts+'] '+msg);renderLogs();}
  function renderLogs(){if(!isANTT)return;var el=document.getElementById('omega-bridge-log');if(!el)return;el.innerHTML=logs.map(function(l){var c=l.tipo==='err'?'om-log-err':l.tipo==='warn'?'om-log-warn':'om-log-ok';return'<span style="color:#555e70">'+l.ts+'</span> <span class="'+c+'">'+l.msg+'</span>';}).join('<br>');el.scrollTop=el.scrollHeight;}

  async function requestWakeLock(){try{if('wakeLock' in navigator){wakeLockSentinel=await navigator.wakeLock.request('screen');}}catch(e){}}
  function releaseWakeLock(){if(wakeLockSentinel){try{wakeLockSentinel.release();}catch(e){}wakeLockSentinel=null;}}
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){if(VPS_URL&&!connected&&!paused){if(isGovBr)conectarGov();else conectar();}if(currentTask)requestWakeLock();}});

  if(isANTT&&U){
    U.registrarAba('bridge','Bridge',''
      +'<div class="om-section-title">Conexao VPS</div>'
      +'<div class="om-mb-sm"><label class="om-label">URL</label><input id="omega-bridge-url" class="om-input" placeholder="https://omhk.com.br"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Token</label><input id="omega-bridge-token" class="om-input" type="password" placeholder="Senha"></div><div><label class="om-label">Nome</label><input id="omega-bridge-name" class="om-input" placeholder="Celular"></div></div>'
      +'<div class="om-grid om-grid-3 om-mb"><button type="button" id="omega-bridge-connect" class="om-btn om-btn-green om-btn-sm">Conectar</button><button type="button" id="omega-bridge-pause" class="om-btn om-btn-amber om-btn-sm" style="display:none">Pausar</button><button type="button" id="omega-bridge-disconnect" class="om-btn om-btn-coral om-btn-sm" style="display:none">Desconectar</button></div>'
      +'<div id="omega-bridge-status"></div><div id="omega-bridge-task" style="margin-top:6px"></div>'
      +'<div class="om-section-title" style="margin-top:10px">Log</div><div id="omega-bridge-log" class="om-log"></div>'
    ,function(){
      var u=document.getElementById('omega-bridge-url'),t=document.getElementById('omega-bridge-token'),n=document.getElementById('omega-bridge-name');
      if(u&&VPS_URL)u.value=VPS_URL;if(t&&VPS_TOKEN)t.value=VPS_TOKEN;if(n&&DEVICE_NAME)n.value=DEVICE_NAME;
      atualizarUI();renderLogs();
    });

    document.getElementById('omega-bridge-connect').addEventListener('click',function(e){e.preventDefault();VPS_URL=document.getElementById('omega-bridge-url').value.trim();VPS_TOKEN=document.getElementById('omega-bridge-token').value.trim();DEVICE_NAME=document.getElementById('omega-bridge-name').value.trim()||'Dispositivo';if(!VPS_URL)return U.box(document.getElementById('omega-bridge-status'),false,'URL vazia.');gmSet('omega_vps_url',VPS_URL);gmSet('omega_vps_token',VPS_TOKEN);gmSet('omega_device_name',DEVICE_NAME);paused=false;errorCount=0;resetBackoff();conectar();});
    document.getElementById('omega-bridge-pause').addEventListener('click',function(e){e.preventDefault();if(paused){paused=false;errorCount=0;resetBackoff();conectar();}else pausarConexao('Pausado');});
    document.getElementById('omega-bridge-disconnect').addEventListener('click',function(e){e.preventDefault();desconectar(true);});
  }

  // ── MINI-PAINEL GOV.BR ──
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
      if(resetBtn){ resetBtn.addEventListener('click',function(){ paused=true; if(govPollInterval){clearInterval(govPollInterval);govPollInterval=null;} connected=false; gmSet('omega_vps_url','');gmSet('omega_vps_token','');gmSet('omega_device_name',''); VPS_URL='';VPS_TOKEN='';DEVICE_NAME=''; renderGovForm(); }); }
    }

    function atualizarGovStatus(texto,tipo){ var el=govPanel.querySelector('#og-conn-status'); if(!el)return; el.style.display='block'; el.className='og-status og-status-'+(tipo||'info'); el.textContent=texto; }

    function conectarGov(){
      if(paused||!VPS_URL)return;
      if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}
      if(govPollInterval) clearInterval(govPollInterval);
      var baseWs = VPS_URL.toLowerCase().trim(); var apiUrl = baseWs.replace(/^wss?:\/\//i, 'https://').replace(/\/ws\/?$/, '') + '/api/govbr/poll';
      function fazerPoll() {
          if(paused||!VPS_URL)return;
          GM_xmlhttpRequest({ method: "POST", url: apiUrl, headers: { "Content-Type": "application/json", "x-session": VPS_TOKEN }, data: JSON.stringify({ deviceId: DEVICE_ID, name: (DEVICE_NAME||'Dispositivo')+' (Gov.br)', status: currentTask?'running':'idle' }),
              onload: function(res) { if(res.status===200){ if(!connected){ connected=true; atualizarGovStatus('Conectado ✓ — HTTP Polling','ok'); } try{ var data=JSON.parse(res.responseText); if(data.type==='task') receberTarefa(data.task); if(data.type==='stop') pararTarefa(); }catch(e){} } else { connected=false; atualizarGovStatus('Erro Polling (Status '+res.status+')','err'); } },
              onerror: function() { connected=false; atualizarGovStatus('Erro de Conexao','err'); }
          });
      }
      fazerPoll(); govPollInterval = setInterval(fazerPoll, 3000);
    }

    var _enviarStatusOriginal=enviarStatus;
    enviarStatus=function(status,message,extra){
      if(isGovBr && VPS_URL){ var baseWs = VPS_URL.toLowerCase().trim(); var apiUrl = baseWs.replace(/^wss?:\/\//i, 'https://').replace(/\/ws\/?$/, '') + '/api/govbr/poll'; var payload = { deviceId: DEVICE_ID, status: status, message: message||'' }; if(extra) Object.assign(payload, extra); GM_xmlhttpRequest({ method: "POST", url: apiUrl, headers: { "Content-Type": "application/json", "x-session": VPS_TOKEN }, data: JSON.stringify(payload) }); }
      if(status==='error'||status==='error_critical')registrarErro(message||'Erro'); else errorCount=0; log(message||status,(status==='error'||status==='error_critical')?'err':'ok');
      if(!isGovBr)_enviarStatusOriginal(status,message,extra);
    };

    waitForElement('form, #accountId, .login-content', 15000).then(function() { document.body.appendChild(govPanel); if(temConfig){ renderGovStatus('Conectando...','info'); setTimeout(function(){conectarGov();}, 1500); } else { renderGovForm(); } }).catch(function() { document.body.appendChild(govPanel); if(temConfig){ renderGovStatus('Conectando...','info'); conectarGov(); } else { renderGovForm(); } });

    var _logOriginal=log; log=function(msg,tipo){_logOriginal(msg,tipo);var ts=govPanel.querySelector('#og-task-status');if(ts)ts.textContent=msg;};
  }

  function pausarConexao(m){paused=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();log(m||'Pausado','warn');if(U){U.box(document.getElementById('omega-bridge-status'),false,'⏸ '+(m||'Pausado'));U.toast('Bridge pausado',false);}}
  function registrarErro(m){var a=Date.now();errorCount=(a-lastErrorTime<ERROR_WINDOW)?errorCount+1:1;lastErrorTime=a;log(m,'err');if(errorCount>=ERROR_THRESHOLD){pausarConexao('Auto-pause: flood');errorCount=0;}}

  function conectar(){
    if(paused||!VPS_URL)return;if(ws){try{ws.close();}catch(e){}ws=null;}log('Conectando...','ok');
    var wsUrl = VPS_URL.toLowerCase().trim(); if(wsUrl.indexOf('http')===0) wsUrl = wsUrl.replace(/^http/i, 'ws'); if(wsUrl.indexOf('/ws')===-1) wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    var url=wsUrl+(VPS_TOKEN?((wsUrl.indexOf('?')===-1?'?':'&')+'token='+encodeURIComponent(VPS_TOKEN)):'');
    try{ws=new WebSocket(url);}catch(e){log('URL invalida','err');return;}
    ws.onopen=function(){connected=true;resetBackoff();errorCount=0;if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}ws.send(JSON.stringify({type:'register',deviceId:DEVICE_ID,name:DEVICE_NAME}));log('Conectado','ok');atualizarUI();if(U){U.box(document.getElementById('omega-bridge-status'),true,'Conectado!');U.toast('Bridge conectado',true);}var fab=document.getElementById('omega-fab');if(fab)fab.classList.add('om-fab-connected');};
    ws.onmessage=function(evt){var msg;try{msg=JSON.parse(evt.data);}catch{return;}if(msg.type==='registered'){DEVICE_ID=msg.deviceId;gmSet('omega_device_id',DEVICE_ID);}if(msg.type==='task')receberTarefa(msg);if(msg.type==='stop')pararTarefa();};
    ws.onclose=function(evt){connected=false;atualizarUI();var fab=document.getElementById('omega-fab');if(fab)fab.classList.remove('om-fab-connected');if(evt.code===4001){log('Token incorreto','err');return;}if(!paused&&VPS_URL){var s=Math.round(reconnectDelay/1000);log('Retry '+s+'s','warn');reconnectTimer=setTimeout(function(){nextBackoff();conectar();},reconnectDelay);}};
    ws.onerror=function(){log('Erro WS','err');};
  }

  function desconectar(i){paused=false;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}if(i){VPS_URL='';gmSet('omega_vps_url','');}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();if(U)U.clearBox(document.getElementById('omega-bridge-status'));log('Desconectado','warn');}

  function enviarStatus(status,message,extra){if(!ws||ws.readyState!==1)return;var p={type:'status',status:status,message:message||''};if(extra)for(var k in extra)p[k]=extra[k];try{ws.send(JSON.stringify(p));}catch(e){}if(U){var pn=document.getElementById('antt-helper');if(pn&&pn.classList.contains('om-hidden'))U.toast(message||status,status!=='error'&&status!=='error_critical');}if(status==='error'||status==='error_critical')registrarErro(message||'Erro');else errorCount=0;log(message||status,(status==='error'||status==='error_critical')?'err':'ok');}

  function atualizarUI(){if(!isANTT)return;var c=document.getElementById('omega-bridge-connect'),p=document.getElementById('omega-bridge-pause'),d=document.getElementById('omega-bridge-disconnect');if(!c)return;if(connected){c.style.display='none';p.style.display='block';p.textContent='Pausar';p.className='om-btn om-btn-amber om-btn-sm';d.style.display='block';}else if(paused){c.style.display='none';p.style.display='block';p.textContent='Continuar';p.className='om-btn om-btn-green om-btn-sm';d.style.display='block';}else{c.style.display='block';p.style.display='none';d.style.display=VPS_URL?'block':'none';}}

  function receberTarefa(msg){
    currentTask=msg;requestWakeLock();enviarStatus('running','Tarefa: '+msg.modo);
    if(U)U.box(document.getElementById('omega-bridge-task'),true,'Tarefa: <b>'+(msg.modo||'?')+'</b>');
    if(msg.credenciais&&msg.credenciais.cpf&&msg.credenciais.senha){
      if(isANTT){ executarFluxo(msg); return; }
      salvarEstado('login_govbr',msg);
      processarLoginGovBr();
      return;
    }
    executarFluxo(msg);
  }

  if (typeof unsafeWindow !== 'undefined') { unsafeWindow.OmegaStartLocalTask = receberTarefa; } else { window.OmegaStartLocalTask = receberTarefa; }

  // ══════════════════════════════════════════════════════════════
  // MÁQUINA DE ESTADOS GOV.BR
  // ══════════════════════════════════════════════════════════════
  async function processarLoginGovBr(){
    var estado=lerEstado();if(!estado||estado.estado!=='login_govbr')return;
    var cred=estado.dados.credenciais||{};if(!cred.cpf||!cred.senha)return;
    await delay(1000); 
    try {
        var btnAuth = document.querySelector('button[name="user_oauth_approval"][value="true"]');
        var btnSkipMfa = document.querySelector('button[value="confirm-skip-mandatory-mfa"]');
        var senhaF = document.getElementById('password');
        var cpfF = document.getElementById('accountId');

        if(btnAuth) { log('OAuth — autorizando...','ok'); btnAuth.click(); return; }

        if(btnSkipMfa) {
            log('MFA — pulando...','warn'); btnSkipMfa.click(); await delay(1000);
            var cb = document.getElementById('confirmSkipMandatoryMfaCheckBox');
            if(cb){ cb.checked=true; cb.click(); cb.dispatchEvent(new Event('change',{bubbles:true})); await delay(500); }
            var bConf = document.getElementById('confirmSkipMandatoryMfaButton');
            if(bConf) bConf.click();
            return;
        }

        if(senhaF) {
            log('Tela Senha detectada','ok'); senhaF.focus();
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(senhaF, cred.senha);
            senhaF.dispatchEvent(new Event('input', {bubbles: true}));
            senhaF.dispatchEvent(new Event('change', {bubbles: true}));
            await delay(500);
            var btnE = document.getElementById('submit-button');
            if(btnE){ btnE.removeAttribute('disabled'); btnE.click(); }
            return;
        }

        if(cpfF) {
            log('Tela CPF detectada','ok');
            await typeSlowly(cpfF, cred.cpf.replace(/\D/g,''), 60); await delay(500);
            var btnC = document.getElementById('enter-account-id');
            if(btnC) btnC.click();
            return;
        }

        if(document.querySelector('.h-captcha') || document.querySelector('.g-recaptcha')){
            log('Captcha detectado','warn'); salvarEstado('aguardando_captcha',estado.dados);
            enviarStatus('error','Captcha detectado. Resolva manualmente.');
        }
    }catch(e){ log('Erro login: '+e.message,'err'); enviarStatus('error','Login: '+e.message); }
  }

  // ══════════════════════════════════════════════════════════════
  // ROTEADOR CENTRAL E EXECUÇÃO
  // ══════════════════════════════════════════════════════════════
  async function executarFluxo(task){
    try{
      currentTask = task;
      var url = window.location.href;
      log('Processando Fluxo: ' + task.modo, 'ok');

      if (url.indexOf('Home/ExibirTermo') !== -1) {
          enviarStatus('running', 'Aceitando termo de uso...', {step: 'termo'});
          var chkTermo = document.getElementById('ckTermo');
          if (chkTermo) {
              var jq = unsafeWindow.jQuery; 
              if (jq) { jq(chkTermo).iCheck('check'); jq(chkTermo).prop('checked', true).trigger('change'); } 
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
      if (isFormulario) {
          if (task.modo === 'cadcpf' || (task.modo === 'cadastro' && task.tipo !== 'cnpj')) { await fluxoCadastroCPF(task); }
          else if (task.modo === 'cadcnpj' || (task.modo === 'cadastro' && task.tipo === 'cnpj')) { await fluxoCadastroCNPJ(task); }
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

      var isHome = url.endsWith('.gov.br/') || url.indexOf('Home') !== -1 || (url.indexOf('Transportador/Cadastro') === -1 && url.indexOf('Pedido/Criar') === -1 && url.indexOf('NovoCadastro') === -1 && url.indexOf('Identidade') === -1 && !document.getElementById('Identidade') && !document.getElementById('TransportadorTac_Identidade') && !document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira') && url.indexOf('/Pedido/') === -1 && url.indexOf('GerenciarFrota') === -1 && url.indexOf('GerenciamentoFrota') === -1 && url.indexOf('Movimentacao') === -1 && url.indexOf('ContratoArrendamento/Criar') === -1);

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
  // MÁQUINA DE RESGATE
  // ══════════════════════════════════════════════════════════════
  async function executarResgateNaPagina(cpfCnpj, task) {
    try {
      enviarStatus('running', 'Processando resgate...', {step:'resgate_ok'});
      var selDoc = await waitForElement('#CpfCnpjTransportadorCertificado', 10000);
      var jq = unsafeWindow.jQuery || unsafeWindow.$;
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

  // ══════════════════════════════════════════════════════════════
  // INICIAR PEDIDO
  // ══════════════════════════════════════════════════════════════
  async function iniciarPedidoCadastro(task) {
      enviarStatus('running', 'Selecionando Perfil...', {step:'iniciar_pedido'});
      await delay(2000);
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
              var btns = document.querySelectorAll('button');
              for(var b=0; b<btns.length; b++) { if(btns[b].textContent.indexOf('Criar Pedido') !== -1) { btnCriar = btns[b]; break; } }
          }
          
          if(btnCriar) {
              salvarEstado('tarefa_pendente_navegacao', task);
              btnCriar.click();
              
              var resultado = await waitForToastOrSuccess('.nav-tabs, #Identidade, #TransportadorTac_Identidade, #TransportadorEtc_SituacaoCapacidadeFinanceira', 10000);
              
              if(resultado && resultado.tipo === 'toast_erro'){ 
                  var msgLower = resultado.texto.toLowerCase();
                  log('Erro ANTT: ' + resultado.texto, 'err');
                  
                  if(msgLower.indexOf('pedido') !== -1 || msgLower.indexOf('cadastramento') !== -1){
                      log('Pedido bloqueado. Iniciando Resgate...','warn');
                      limparEstado();
                      salvarEstado('resgate_pedido', { cpfCnpj: doc, task: task });
                      window.location.href = 'https://rntrcdigital.antt.gov.br/AcompanharPedidos';
                      return;
                  } 
                  else if (msgLower.indexOf('já possui') !== -1 || msgLower.indexOf('ativo') !== -1 || msgLower.indexOf('cadastrado') !== -1) {
                      enviarStatus('erro_fatal', 'Bloqueio: ' + resultado.texto);
                      limparEstado(); return;
                  } 
                  else {
                      enviarStatus('error', 'Falha ANTT: ' + resultado.texto);
                      limparEstado(); return;
                  }
              }
          } else {
              enviarStatus('error', 'Botão Criar Pedido não encontrado.'); limparEstado(); return;
          }
      } else {
          enviarStatus('error', 'Lista de transportadores não encontrada.'); limparEstado(); return;
      }
  }

  // ══════════════════════════════════════════════════════════════
  // PREENCHIMENTO DE DADOS
  // ══════════════════════════════════════════════════════════════

  async function preencherEndereco(d, tipoDefault){
    var cep=(d.cep||'').replace(/\D/g,''); if(!cep){var ceps={MG:['32220390','32017900'],SP:['04805140','01002900'],RJ:['23032486','20211110']};var est=['MG','SP','RJ'][Math.floor(Math.random()*3)];var l=ceps[est]||ceps.MG;cep=l[Math.floor(Math.random()*l.length)];}
    
    await abrirAba('a.contatos, a[href="#contatos"]', '#EnderecoPedidoPanel, [data-action*="Endereco/Novo"]');
    
    var btn = getVisible('[data-action*="Endereco/Novo"], [data-action*="EnderecoPedido"]');
    if(btn){ btn.click(); }

    var cf = await waitForVisible('#Cep, input[name*="Cep"]', 10000);
    await delay(1500); 
    
    var selTipo = getVisible('#CodigoTipoEndereco');
    if(selTipo) {
        var valToSelect = '';
        for(var i=0; i<selTipo.options.length; i++) {
            if(selTipo.options[i].value === tipoDefault) valToSelect = tipoDefault;
        }
        if(!valToSelect && selTipo.options.length>0) valToSelect = selTipo.options[1].value || selTipo.options[0].value;

        selTipo.value = valToSelect; 
        selTipo.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(selTipo).trigger('change');
    }
    await delay(1500); 

    if(cf){ 
        cf.removeAttribute('disabled');
        cf.focus();
        await new Promise(function(resolve){
            if(U && U.digitarCharAChar) U.digitarCharAChar(cf, cep, { delay:60, onDone: resolve });
            else typeSlowly(cf, cep, 60).then(resolve);
        });
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
        await delay(500);
        await waitBlockUI(10000); 
        await delay(1000);
    }

    var f = getVisible('#Logradouro'); 
    if(f){ 
        f.removeAttribute('disabled'); f.focus();
        let val = d.logradouro || '0';
        await new Promise(r => U.digitarCharAChar ? U.digitarCharAChar(f, val, {delay:40, onDone:r}) : typeSlowly(f, val, 40).then(r));
        f.dispatchEvent(new Event('blur',{bubbles:true})); 
    }

    var nf = getVisible('#Numero'); 
    if(nf){ 
        nf.removeAttribute('disabled'); nf.focus();
        let val = d.numero || '0';
        await new Promise(r => U.digitarCharAChar ? U.digitarCharAChar(nf, val, {delay:40, onDone:r}) : typeSlowly(nf, val, 40).then(r));
        nf.dispatchEvent(new Event('blur',{bubbles:true})); 
    }
    
    if(d.complemento) { 
        var cf2 = getVisible('#Complemento'); 
        if(cf2) { 
            cf2.removeAttribute('disabled'); cf2.focus();
            await new Promise(r => U.digitarCharAChar ? U.digitarCharAChar(cf2, d.complemento, {delay:40, onDone:r}) : typeSlowly(cf2, d.complemento, 40).then(r));
            cf2.dispatchEvent(new Event('blur',{bubbles:true})); 
        } 
    }

    var bf = getVisible('#Bairro'); 
    if(bf){ 
        bf.removeAttribute('disabled'); bf.focus();
        let val = d.bairro || '0';
        await new Promise(r => U.digitarCharAChar ? U.digitarCharAChar(bf, val, {delay:40, onDone:r}) : typeSlowly(bf, val, 40).then(r));
        bf.dispatchEvent(new Event('blur',{bubbles:true})); 
    }
    
    var me = getVisible('#MesmoEndereco, #mesmoEndereco');
    if(me){ 
        if(!me.checked) me.click();
        me.checked = true; 
        me.dispatchEvent(new Event('change',{bubbles:true})); 
        var jq = unsafeWindow.jQuery; if(jq) { jq(me).trigger('change'); jq('.icheckbox_flat-blue input').iCheck('check'); }
    }
    await delay(1000);

    limparToasts();
    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary, [data-action*="Salvar"]');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); await waitBlockUI(10000); await delay(1000); }
    else { log('Botao de salvar endereco nao encontrado', 'err'); }
  }

  async function adicionarContato(tipo,valor){
    await abrirAba('a.contatos, a[href="#contatos"]', '#ContatoPedidoPanel, [data-action*="ContatoPedido/Novo"]');

    // CHECAGEM DE DUPLICIDADE
    var panel = getVisible('#ContatoPedidoPanel');
    if(panel) {
        var str = panel.innerText.toLowerCase();
        if ((tipo === '1' || tipo === '2') && (str.indexOf('telefone') !== -1 || str.indexOf('celular') !== -1 || str.indexOf('(00) 0000-0000') !== -1)) {
            log('Telefone/Celular ja existe. Pulando.', 'warn'); return true;
        }
        if (tipo === '4' && (str.indexOf('email') !== -1 || str.indexOf('@') !== -1)) {
            log('Email ja existe. Pulando.', 'warn'); return true;
        }
    }

    var btn = getVisible('[data-action*="ContatoPedido/Novo"]');
    if(!btn) return false;
    btn.click(); 

    var cf = await waitForVisible('#Contato', 5000);
    await delay(1500);
    
    var selTipo = getVisible('#CodigoTipoContato');
    if(selTipo) {
        selTipo.value = tipo;
        selTipo.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(selTipo).trigger('change');
    }
    await delay(500);

    if(cf) {
        cf.removeAttribute('disabled');
        cf.focus();
        await new Promise(function(resolve){
            if(U && U.digitarCharAChar) U.digitarCharAChar(cf, valor, { delay:60, onDone: resolve });
            else typeSlowly(cf, valor, 60).then(resolve);
        });
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(500);

    limparToasts();
    var bs = getVisible('.modal .btn-salvar-contato, .modal .btn-primary');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); await waitBlockUI(10000); await delay(1000); }

    var err = getVisible('.validation-summary-errors, .alert-danger, .field-validation-error');
    if(err){
        var fc = getVisible('.modal .close, [data-dismiss="modal"]');
        if(fc) fc.click();
        await delay(500); return false;
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
                sel.value = sel.options[i].value;
                sel.dispatchEvent(new Event('change',{bubbles:true}));
                var jq = unsafeWindow.jQuery; if(jq) jq(sel).trigger('change');
                break;
            }
        }
    }
    await delay(500);

    var cf = getVisible('.modal #Cpf, .modal input[name="Cpf"], .modal input[name="CpfCnpj"]');
    if(cf){
        cf.removeAttribute('disabled');
        cf.focus();
        await new Promise(function(resolve){
            if(U && U.digitarCharAChar) U.digitarCharAChar(cf, cpf, { delay:70, onDone: resolve });
            else typeSlowly(cf, cpf, 70).then(resolve);
        });
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(3000); 

    for(var i=0; i<30; i++){
        var nf = getVisible('.modal #Nome, .modal input[name="Nome"]');
        if(nf && nf.value && nf.value.length > 2) break;
        await delay(500);
    }

    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked), .modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){
        if(d.offsetParent !== null) d.click();
    });
    await delay(500);

    limparToasts();
    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); await waitBlockUI(10000); await delay(1000); }
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
        cf.focus();
        await new Promise(function(resolve){
            if(U && U.digitarCharAChar) U.digitarCharAChar(cf, cpfRT, { delay:70, onDone: resolve });
            else typeSlowly(cf, cpfRT, 70).then(resolve);
        });
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(3000); 

    for(var i=0; i<30; i++){
        var nf = getVisible('.modal #Nome');
        if(nf && nf.value && nf.value.length > 2) break;
        await delay(500);
    }

    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked), .modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){
        if(d.offsetParent !== null) d.click();
    });
    await delay(500);

    limparToasts();
    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); await waitBlockUI(10000); await delay(1000); }
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
    cp.focus();
    var pLimpa = placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    
    await new Promise(function(resolve){
        if(U && U.digitarCharAChar) U.digitarCharAChar(cp, pLimpa, { delay:80, delayEspecial:{4:150}, onDone: resolve });
        else typeSlowly(cp, pLimpa, 80).then(resolve);
    });
    cp.dispatchEvent(new Event('blur',{bubbles:true}));

    var cr=getVisible('#Renavam');
    if(cr) {
        cr.removeAttribute('disabled');
        cr.value=renavam;
        cr.dispatchEvent(new Event('input',{bubbles:true})); 
        cr.dispatchEvent(new Event('change',{bubbles:true})); 
        cr.dispatchEvent(new Event('blur',{bubbles:true})); 
    }
    await delay(500);
    
    var bv = getVisible('#verificar, #btnBuscarVeiculo');
    if(bv) bv.click();
    
    enviarStatus('running','Aguardando ANTT (Dados)...',{step:'veiculo_wait'});
    await delay(1000); 
    
    // CAÇADOR DE BOOTBOX (Movimentacao de Frota)
    var waitLimit = 0;
    while(waitLimit < 30) {
        var bb = getVisible('.bootbox-confirm button[data-bb-handler="confirm"], .btn-confirmar-exclusao');
        if (bb) {
            log('Modal de movimentacao detectado. Confirmando...', 'warn');
            bb.click();
            await delay(1500);
        }

        var tara = getVisible('#Tara');
        var uiBlock = document.querySelector('.blockUI');
        if (tara && !tara.hasAttribute('disabled') && (!uiBlock || uiBlock.style.display === 'none')) break;
        await delay(1000);
        waitLimit++;
    }

    var taraEl = getVisible('#Tara');
    if(taraEl && (!taraEl.value || taraEl.value.trim() === '')) {
        taraEl.removeAttribute('disabled');
        taraEl.value = '2';
        taraEl.dispatchEvent(new Event('input',{bubbles:true}));
        taraEl.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(taraEl).trigger('change');
    }

    var eixos = getVisible('#Eixos');
    if(eixos && (!eixos.value || eixos.value.trim() === '' || eixos.value === '0')) {
        eixos.removeAttribute('disabled');
        eixos.value = '2';
        eixos.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(eixos).trigger('change');
    }

    await delay(500);

    limparToasts();

    var bs = getVisible('.btn-salvar-veiculo, .btn-confirmar-inclusao');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); log('Salvo: '+placa,'ok'); } 
    else { throw new Error('Botao salvar nao encontrado'); }

    await delay(1000);
    var bbFinal = getVisible('.bootbox-confirm button[data-bb-handler="confirm"], .btn-confirmar-exclusao');
    if(bbFinal) { bbFinal.click(); await delay(1500); }

    await waitBlockUI(10000); await delay(1000);
  }

  async function processarVeiculos(task){
    var veiculos=task.veiculos||[]; var d=task.transportador||task;
    
    if(veiculos.length===0&&d.placa&&d.renavam) veiculos=[{tipo_veiculo:d.tipo_veiculo||d.tipoVeiculo||'nao',placa:d.placa,renavam:d.renavam,cpf_arrendante:d.cpf_arrendante||'',nome_arrendante:d.nome_arrendante||''}];
    
    if(veiculos.length===0||(veiculos.length===1&&(veiculos[0].tipo_veiculo||'nao').toLowerCase()==='nao')){
      await finalizarPedidoANTT(); return;
    }
    
    await abrirAba('a.veiculo, a[href="#veiculo"]', '#VeiculoPedidoPanel, [data-action*="Veiculo/Novo"]');

    var vi = parseInt(gmGet('omega_current_vehicle_index','0')) || 0;

    for(; vi<veiculos.length; vi++){
      var v=veiculos[vi];var tipoV=(v.tipo_veiculo||'proprio').toLowerCase(); if(tipoV==='nao')continue;
      
      gmSet('omega_current_vehicle_index', String(vi));

      if(tipoV==='terceiro'&&v.placa&&v.renavam){
        enviarStatus('running','Terceiro: arrendamento '+v.placa,{step:'desvio'}); 
        gmSet('omega_return_url', window.location.href);
        salvarEstado('inclusao_pendente_arrendamento',{
            modo: 'arrendamento', 
            transportador:task.transportador||task, veiculos:veiculos, currentVehicleIndex:vi, 
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
    var transp=getTargetDoc(task);
    
    var btnCriar = document.querySelector('#btnCriarPedido') || document.querySelector('button[type="submit"]') || document.querySelector('.btn-primary');
    var formAberto = document.querySelector('[data-action*="VeiculoPedido/Novo"], [data-action*="Veiculo/Novo"]');
    
    if(!formAberto && btnCriar) {
        var sel = document.querySelector('select');
        if(sel) {
            for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(transp)!==-1||sel.options[i].value.replace(/\D/g,'').indexOf(transp)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true})); break;}}
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
        setTimeout(function(){ executarFluxo(task); }, 2000);
        return;
    }
    if (formAberto) { await processarVeiculos(task); }
  }

  // ══════════════════════════════════════════════════════════════
  // OS FLUXOS PRINCIPAIS (CPF e CNPJ sincronizados)
  // ══════════════════════════════════════════════════════════════
  async function fluxoCadastroCPF(task){
    enviarStatus('running','Dados CPF...',{step:'dados_cpf'}); var d=task.transportador||task;
    
    var tabTransp = getVisible('a[href="#transportador"], a.transportador');
    if(tabTransp && tabTransp.getAttribute('aria-selected') !== 'true') {
        tabTransp.click();
        await delay(1000);
    }

    var idf= await waitForVisible('#Identidade, #TransportadorTac_Identidade, input[name*="Identidade"]', 10000);
    await delay(1500); 

    if(idf){
        idf.removeAttribute('disabled');
        idf.focus();
        var num = (d.identidade||d.cnh||'000000').replace(/\D/g,'');
        await new Promise(function(resolve){
            if(U && U.digitarCharAChar) U.digitarCharAChar(idf, num, { delay:60, onDone: resolve });
            else typeSlowly(idf, num, 60).then(resolve);
        });
        idf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(idf).trigger('blur');
        await delay(1500);
    }

    var oe = getVisible('#OrgaoEmissor, #TransportadorTac_OrgaoEmissor, input[name*="OrgaoEmissor"], select[name*="OrgaoEmissor"]');
    if(oe){
        oe.value='SSP';
        oe.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(oe).trigger('change');
    }
    await delay(500);

    if(d.uf){
        var uf = getVisible('#UfIdentidade, #TransportadorTac_Uf, select[name*="Uf"]');
        if(uf){
            for(var i=0; i<uf.options.length; i++){
                if(uf.options[i].value.toUpperCase() === d.uf.toUpperCase()){
                    uf.value = uf.options[i].value;
                    uf.dispatchEvent(new Event('change',{bubbles:true}));
                    if(unsafeWindow.jQuery) unsafeWindow.jQuery(uf).trigger('change');
                    break;
                }
            }
        }
    }
    await delay(1000);

    await preencherEndereco(d, 'RES'); 
    
    var tel=d.telefone||'0000000000'; await adicionarContato('2',tel);
    var email=d.email||gerarEmailAleatorio(); await adicionarContato('4',email);
    
    await processarVeiculos(task);
  }

  async function fluxoCadastroCNPJ(task){
    enviarStatus('running','Dados CNPJ...',{step:'dados_cnpj'}); var d=task.transportador||task;
    
    var tabTransp = getVisible('a[href="#transportador"], a.transportador');
    if(tabTransp && tabTransp.getAttribute('aria-selected') !== 'true') {
        tabTransp.click();
        await delay(1000);
    }

    var cap = document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira');
    if(cap){
        var jq = unsafeWindow.jQuery; 
        if(jq) { jq(cap).iCheck('check'); jq(cap).prop('checked', true).trigger('change'); } 
        else { cap.checked = true; cap.dispatchEvent(new Event('change',{bubbles:true})); cap.dispatchEvent(new Event('click',{bubbles:true})); }
    }
    
    await preencherEndereco(d, 'COM'); // Cadastro CNPJ usa 'COM' (Comercial)
    
    var tel=d.telefone||'0000000000';await adicionarContato('2',tel);
    var email=d.email||gerarEmailAleatorio();var eOk=await adicionarContato('4',email);if(!eOk){email=gerarEmailAleatorio();await adicionarContato('4',email);}
    
    var cpfSocio=d.cpf_socio||(task.cnpj_data&&task.cnpj_data.cpf_socio)||''; if(cpfSocio)await preencherGestor(cpfSocio.replace(/\D/g,''));
    
    await preencherRT(); 
    await processarVeiculos(task);
  }

  async function fluxoArrendamento(task){
    enviarStatus('running','Arrendamento',{step:'arrendamento'}); var arr=task.arrendamento||task;
    var jq = unsafeWindow.jQuery || unsafeWindow.$;
    
    var cpfArrendanteOriginal = (arr.cpf_arrendante || arr.cpf_cnpj_proprietario || '').replace(/\D/g,'');
    var nomeArrendante = (arr.nome_arrendante || '').toUpperCase();
    var sel = await waitForVisible('#CPFCNPJArrendanteTransportador', 10000);

    if (sel) {
        for(var w=0; w<30; w++){ if(sel.options.length>1) break; await delay(500); }
        var selecionou = false;
        for(var i=0; i<sel.options.length; i++){
            if(sel.options[i].value.replace(/\D/g,'')===cpfArrendanteOriginal || sel.options[i].text.replace(/\D/g,'')===cpfArrendanteOriginal){
                if(jq) jq(sel).val(sel.options[i].value).trigger('change');
                else { sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
                selecionou = true; break;
            }
        }
        if(!selecionou){
            for(var i=0; i<sel.options.length; i++){
                if(sel.options[i].text && sel.options[i].text.toLowerCase().indexOf('selecione') === -1){
                    if(jq) jq(sel).val(sel.options[i].value).trigger('change');
                    else { sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
                    break;
                }
            }
        }
    }
    await delay(1500); 

    if (cpfArrendanteOriginal || nomeArrendante) {
        enviarStatus('running','Substituindo HTML Proprietario...', {step: 'arrendamento_subst'});
        var ap = null;
        var nt = document.getElementById('NomesTransportador');
        if(nt && nt.value) { try { var jArr=JSON.parse(nt.value); if(jArr&&jArr[0]&&jArr[0].CpfCnpj) ap=jArr[0].CpfCnpj.replace(/\D/g,''); } catch(e){} }
        if(!ap && U) ap = U.getDoc();

        if(cpfArrendanteOriginal && ap && U){ U.substituirTudo(U.fAuto(ap), U.fAuto(cpfArrendanteOriginal)); U.substituirTudo(ap, cpfArrendanteOriginal); }
        if(nomeArrendante && U){
            var an = U.getNome();
            if(an) U.substituirTudo(an, nomeArrendante);
            var cv = document.getElementById('NomeArrendanteInput') || document.getElementById('NomeArrendante');
            if(cv) { cv.removeAttribute('disabled'); cv.value = nomeArrendante; cv.setAttribute('disabled','disabled'); }
        }
        var novoJson = JSON.stringify([{"CpfCnpj":cpfArrendanteOriginal, "Nome":nomeArrendante}]);
        if(nt) { nt.value = novoJson; nt.setAttribute('value', novoJson); }
        ['Placa','Renavam','DataInicio','DataFim'].forEach(function(id){
            var el = document.getElementById(id);
            if(el && el.getAttribute('cpfcnpjs')) el.setAttribute('cpfcnpjs',novoJson);
        });

        await delay(500);
        var selRefresh = document.getElementById('CPFCNPJArrendanteTransportador');
        if (selRefresh) {
            for(var i=0; i<selRefresh.options.length; i++){
                if(selRefresh.options[i].value.replace(/\D/g,'') === cpfArrendanteOriginal || selRefresh.options[i].text.replace(/\D/g,'') === cpfArrendanteOriginal){
                    if(jq) jq(selRefresh).val(selRefresh.options[i].value).trigger('change');
                    else { selRefresh.value = selRefresh.options[i].value; selRefresh.dispatchEvent(new Event('change',{bubbles:true})); }
                    break;
                }
            }
        }
    }
    await delay(1000);

    var cp = await waitForVisible('#Placa', 5000);
    if(cp){
        cp.removeAttribute('disabled');
        cp.focus();
        var pLimpa = (arr.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
        await new Promise(function(resolve){
            if(U && U.digitarCharAChar) U.digitarCharAChar(cp, pLimpa, { delay:80, delayEspecial:{4:150}, onDone: resolve });
            else typeSlowly(cp, pLimpa, 80).then(resolve);
        });
        cp.dispatchEvent(new Event('blur',{bubbles:true}));
    }
    await delay(300);

    var cr = document.getElementById('Renavam');
    if(cr){
        cr.removeAttribute('disabled'); cr.value = arr.renavam||'';
        cr.dispatchEvent(new Event('input',{bubbles:true}));
        cr.dispatchEvent(new Event('change',{bubbles:true}));
        cr.dispatchEvent(new Event('blur',{bubbles:true}));
    }
    await delay(500);

    enviarStatus('running','Verificando...', {step:'arrendamento_verificar'});
    var bv = document.getElementById('verificar');
    if(bv) {
        bv.click();
        var waitLimit = 0;
        while(waitLimit < 30) {
            var di = document.getElementById('DataInicio');
            var uiBlock = document.querySelector('.blockUI');
            if (di && !di.hasAttribute('disabled') && (!uiBlock || uiBlock.style.display === 'none')) break;
            await delay(1000);
            waitLimit++;
        }
    }
    await delay(1000); 

    var hj=new Date();var di=String(hj.getDate()).padStart(2,'0')+'/'+String(hj.getMonth()+1).padStart(2,'0')+'/'+hj.getFullYear();var fim=new Date(hj);fim.setFullYear(fim.getFullYear()+1);var df=String(fim.getDate()).padStart(2,'0')+'/'+String(fim.getMonth()+1).padStart(2,'0')+'/'+fim.getFullYear();
    if(U){U.injetarData('DataInicio',di);U.injetarData('DataFim',df);}await delay(500);
    
    var c1=document.getElementById('ExisteContrato'),c2=document.getElementById('InformacoesVerdadeiras');
    if(c1){c1.checked=true;c1.dispatchEvent(new Event('change',{bubbles:true}));if(jq)jq(c1).trigger('change');}
    if(c2){c2.checked=true;c2.dispatchEvent(new Event('change',{bubbles:true}));if(jq)jq(c2).trigger('change');}await delay(500);
    
    var targetDoc = getTargetDoc(task);
    var cpfArrendatario = (arr.cpf_arrendatario || targetDoc || '').replace(/\D/g,'');
    if(cpfArrendatario){
        var af = document.getElementById('CPFCNPJArrendatario') || document.querySelector('input[name*="CpfCnpjArrendatario"]');
        if(af){
            af.removeAttribute('disabled');
            af.focus();
            await new Promise(function(resolve){
                if(U && U.digitarCharAChar) U.digitarCharAChar(af, cpfArrendatario, { delay:60, onDone: resolve });
                else typeSlowly(af, cpfArrendatario, 60).then(resolve);
            });
            af.dispatchEvent(new Event('blur',{bubbles:true}));
            var btnBuscarArrendatario = document.getElementById('btnBuscarArrendatario'); 
            if(btnBuscarArrendatario && getVisible('#btnBuscarArrendatario')) { btnBuscarArrendatario.click(); await delay(1000); }
        }
    }
    await delay(1000);

    limparToasts();

    enviarStatus('running','Salvando...',{step:'arrendamento_salvar'}); var btnS=document.querySelector('#btnSalvar,.btn-salvarContrato');if(btnS)btnS.click();await delay(3000);
    try{
      await waitForURL('ContratoArrendamento/Index',15000);enviarStatus('done','Arrendamento OK!');
      var returnUrl=gmGet('omega_return_url','');
      if (returnUrl) {
          gmSet('omega_return_url','');
          salvarEstado('tarefa_pendente_navegacao', task); 
          window.location.href = returnUrl;
      }
    }catch(e){enviarStatus('error','Arrendamento falhou.');}
  }

  // ══════════════════════════════════════════════════════════════
  // O GUARDA DE TRÂNSITO
  // ══════════════════════════════════════════════════════════════
  function verificarEstadoPendente(){
    var estado = lerEstado(); if(!estado) return;
    log('Memoria detectada: ' + estado.estado, 'warn');
    
    if(isGovBr && estado.estado === 'login_govbr'){ processarLoginGovBr(); return; }

    if(isANTT && (estado.estado === 'login_govbr' || estado.estado === 'tarefa_pendente_navegacao' || estado.estado === 'inclusao_pendente_arrendamento' || estado.estado === 'pendente_arrendamento')) {
        var task = estado.dados;
        limparEstado(); 
        currentTask = task;
        setTimeout(function(){
             if(VPS_URL && !connected) conectar();
             executarFluxo(task); 
        }, 1500);
        return;
    }

    if(isANTT && estado.estado === 'resgate_pedido' && location.href.indexOf('AcompanharPedidos') !== -1) {
        setTimeout(function(){
            if(VPS_URL && !connected) conectar();
            executarResgateNaPagina(estado.dados.cpfCnpj, estado.dados.task);
        }, 2000);
        return;
    }
  }

  if(VPS_URL&&!paused)setTimeout(function(){if(isGovBr)conectarGov();else conectar();},2000);
  setTimeout(verificarEstadoPendente,3000);
  if(isANTT&&U&&U.restaurarAbaSalva)setTimeout(function(){U.restaurarAbaSalva();},500);
})();
