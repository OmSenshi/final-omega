// bridge.js — Final Omega v6.2 (Sunshine Edition)
// Roteador Inteligente, Máquina de Estados Segura, Resgate Async, Hack Gov.br
(function(){
  var isANTT = location.hostname.indexOf('rntrcdigital.antt.gov.br') !== -1;
  var isGovBr = location.hostname.indexOf('acesso.gov.br') !== -1;
  var U = window.OmegaUtils || null;

  function gmGet(k,d){ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : ''; }
  function gmSet(k,v){ try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); }catch(e){} }

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

  function waitUntilEnabled(selector, timeout) {
    timeout = timeout || 60000;
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function() { reject(new Error('Timeout enabled: ' + selector)); }, timeout);
      function check() {
        var el = document.querySelector(selector);
        if (el && !el.disabled && !el.getAttribute('disabled')) { clearTimeout(t); resolve(el); return; }
        setTimeout(check, 500);
      }
      check();
    });
  }

  function waitForURL(substring, timeout) {
    timeout = timeout || 60000;
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function() { reject(new Error('Timeout URL: ' + substring)); }, timeout);
      function check() { if (location.href.indexOf(substring) !== -1) { clearTimeout(t); resolve(); return; } setTimeout(check, 500); }
      check();
    });
  }

  function waitForToastOrSuccess(successSelector, timeout) {
    timeout = timeout || 15000;
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function() { resolve({ tipo: 'timeout' }); }, timeout);
      function check() {
        var toast = document.querySelector('#toast-container .toast-error');
        if (toast && toast.offsetParent !== null) { clearTimeout(t); resolve({ tipo: 'toast_erro', texto: toast.textContent || '' }); return; }
        var ok = document.querySelector(successSelector);
        if (ok && ok.offsetParent !== null) { clearTimeout(t); resolve({ tipo: 'sucesso', el: ok }); return; }
        setTimeout(check, 300);
      }
      check();
    });
  }

  function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function typeSlowly(el, text, ms) {
    ms = ms || 80;
    return new Promise(function(resolve) {
      el.value = ''; el.focus();
      var i = 0;
      function next() {
        if (i >= text.length) { el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return resolve(); }
        el.value = text.substring(0, i + 1); el.dispatchEvent(new Event('input',{bubbles:true}));
        i++; setTimeout(next, ms);
      }
      next();
    });
  }

  function salvarEstado(nome, dados) { gmSet('omega_state', JSON.stringify({ estado: nome, dados: dados, ts: Date.now(), returnUrl: window.location.href })); log('Estado salvo: ' + nome, 'ok'); }
  function lerEstado() { try { var r = gmGet('omega_state',''); if(!r)return null; var s=JSON.parse(r); if(Date.now()-s.ts>900000){limparEstado();return null;} return s; } catch(e){return null;} }
  function limparEstado() { gmSet('omega_state', ''); }

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

    document.querySelectorAll('#antt-helper input').forEach(function(inp){ inp.addEventListener('focus',function(){this.scrollIntoView({behavior:'smooth',block:'center'});}); });

    document.getElementById('omega-bridge-connect').addEventListener('click',function(e){e.preventDefault();VPS_URL=document.getElementById('omega-bridge-url').value.trim();VPS_TOKEN=document.getElementById('omega-bridge-token').value.trim();DEVICE_NAME=document.getElementById('omega-bridge-name').value.trim()||'Dispositivo';if(!VPS_URL)return U.box(document.getElementById('omega-bridge-status'),false,'URL vazia.');gmSet('omega_vps_url',VPS_URL);gmSet('omega_vps_token',VPS_TOKEN);gmSet('omega_device_name',DEVICE_NAME);paused=false;errorCount=0;resetBackoff();conectar();});
    document.getElementById('omega-bridge-pause').addEventListener('click',function(e){e.preventDefault();if(paused){paused=false;errorCount=0;resetBackoff();conectar();}else pausarConexao('Pausado');});
    document.getElementById('omega-bridge-disconnect').addEventListener('click',function(e){e.preventDefault();desconectar(true);});
  }

  // ── MINI-PAINEL GOV.BR ──
  if(isGovBr){
    var govCss=document.createElement('style');
    govCss.textContent=''
      +'#omega-gov-panel{position:fixed;bottom:16px;right:16px;z-index:999999;background:rgba(14,18,30,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 16px;font-family:"Segoe UI",Arial,sans-serif;color:#c8cdd8;font-size:12px;backdrop-filter:blur(20px);box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:260px;max-width:320px;transition:all 0.3s}'
      +'#omega-gov-panel .og-title{font-weight:700;color:#5a9cf5;letter-spacing:2px;font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}'
      +'#omega-gov-panel .og-row{margin-bottom:6px}'
      +'#omega-gov-panel input{width:100%;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#c8cdd8;font-size:11px;outline:none;box-sizing:border-box}'
      +'#omega-gov-panel input:focus{border-color:rgba(90,156,245,0.4)}'
      +'#omega-gov-panel button{padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px;transition:all 0.2s}'
      +'.og-btn-green{background:linear-gradient(135deg,#34a853,#2d8f47);color:#fff}'
      +'.og-btn-coral{background:linear-gradient(135deg,#e07065,#c0392b);color:#fff}'
      +'.og-btn-reset{background:none;border:1px solid rgba(255,255,255,0.15)!important;color:#8a92a6;font-size:10px!important;padding:3px 8px!important}'
      +'.og-btn-reset:hover{border-color:rgba(224,112,101,0.4)!important;color:#e07065}'
      +'#omega-gov-panel .og-status{margin-top:6px;font-size:11px;padding:4px 8px;border-radius:6px}'
      +'.og-status-ok{background:rgba(52,168,83,0.1);color:#5ddb7a;border:1px solid rgba(52,168,83,0.15)}'
      +'.og-status-err{background:rgba(192,57,43,0.1);color:#e07065;border:1px solid rgba(192,57,43,0.15)}'
      +'.og-status-info{background:rgba(26,115,232,0.1);color:#5a9cf5;border:1px solid rgba(26,115,232,0.15)}';
    document.head.appendChild(govCss);

    var govPanel=document.createElement('div'); govPanel.id='omega-gov-panel'; var temConfig=!!VPS_URL;

    function renderGovForm(){
      govPanel.innerHTML=''
        +'<div class="og-title"><span>OMEGA — Bridge</span></div>'
        +'<div class="og-row"><input id="og-url" placeholder="https://omhk.com.br" value="'+(VPS_URL||'')+'"></div>'
        +'<div class="og-row" style="display:flex;gap:4px"><input id="og-token" type="password" placeholder="Token" value="'+(VPS_TOKEN||'')+'"><input id="og-name" placeholder="Nome" value="'+(DEVICE_NAME||'')+'"></div>'
        +'<div style="margin-top:8px"><button class="og-btn-green" id="og-save">Conectar</button><button class="og-btn-coral" id="og-hide">Fechar</button></div>'
        +'<div id="og-conn-status" class="og-status" style="display:none"></div>';
      
      var saveBtn=govPanel.querySelector('#og-save');
      if(saveBtn){
        saveBtn.addEventListener('click',function(){
          var url=(govPanel.querySelector('#og-url')||{}).value||'';
          var token=(govPanel.querySelector('#og-token')||{}).value||'';
          var name=(govPanel.querySelector('#og-name')||{}).value||'Dispositivo';
          url=url.trim();token=token.trim();name=name.trim()||'Dispositivo';
          if(!url){atualizarGovStatus('URL vazia','err');return;}
          VPS_URL=url;VPS_TOKEN=token;DEVICE_NAME=name;
          gmSet('omega_vps_url',url);gmSet('omega_vps_token',token);gmSet('omega_device_name',name);
          paused=false;errorCount=0;resetBackoff();
          renderGovStatus('Conectando (Polling)...','info');
          conectarGov();
        });
      }
      var hideBtn=govPanel.querySelector('#og-hide'); if(hideBtn){hideBtn.addEventListener('click',function(){govPanel.style.display='none';});}
    }

    function renderGovStatus(statusText, tipo){
      govPanel.innerHTML=''
        +'<div class="og-title"><span>OMEGA</span><button class="og-btn-reset" id="og-reset">Resetar</button></div>'
        +'<div id="og-conn-status" class="og-status og-status-'+(tipo||'info')+'">'+(statusText||'...')+'</div>'
        +'<div id="og-task-status" style="margin-top:6px;font-size:10px;color:#555e70"></div>';
      
      var resetBtn=govPanel.querySelector('#og-reset');
      if(resetBtn){
        resetBtn.addEventListener('click',function(){
          paused=true;
          if(govPollInterval){clearInterval(govPollInterval);govPollInterval=null;}
          connected=false;
          gmSet('omega_vps_url','');gmSet('omega_vps_token','');gmSet('omega_device_name','');
          VPS_URL='';VPS_TOKEN='';DEVICE_NAME='';
          renderGovForm();
        });
      }
    }

    function atualizarGovStatus(texto,tipo){
      var el=govPanel.querySelector('#og-conn-status');
      if(!el)return; el.style.display='block'; el.className='og-status og-status-'+(tipo||'info'); el.textContent=texto;
    }

    function conectarGov(){
      if(paused||!VPS_URL)return;
      if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}
      
      if(govPollInterval) clearInterval(govPollInterval);
      
      var baseWs = VPS_URL.toLowerCase().trim();
      var apiUrl = baseWs.replace(/^wss?:\/\//i, 'https://').replace(/\/ws\/?$/, '') + '/api/govbr/poll';

      function fazerPoll() {
          if(paused||!VPS_URL)return;
          GM_xmlhttpRequest({
              method: "POST", url: apiUrl,
              headers: { "Content-Type": "application/json", "x-session": VPS_TOKEN },
              data: JSON.stringify({ deviceId: DEVICE_ID, name: (DEVICE_NAME||'Dispositivo')+' (Gov.br)', status: currentTask?'running':'idle' }),
              onload: function(res) {
                  if(res.status===200){
                      if(!connected){
                          connected=true;
                          atualizarGovStatus('Conectado ✓ — HTTP Polling','ok');
                      }
                      try{
                          var data=JSON.parse(res.responseText);
                          if(data.type==='task') receberTarefa(data.task);
                          if(data.type==='stop') pararTarefa();
                      }catch(e){}
                  } else {
                      connected=false;
                      atualizarGovStatus('Erro Polling (Status '+res.status+')','err');
                  }
              },
              onerror: function() {
                  connected=false;
                  atualizarGovStatus('Erro de Conexao','err');
              }
          });
      }

      fazerPoll();
      govPollInterval = setInterval(fazerPoll, 3000);
    }

    var _enviarStatusOriginal=enviarStatus;
    enviarStatus=function(status,message,extra){
      if(isGovBr && VPS_URL){
        var baseWs = VPS_URL.toLowerCase().trim();
        var apiUrl = baseWs.replace(/^wss?:\/\//i, 'https://').replace(/\/ws\/?$/, '') + '/api/govbr/poll';
        var payload = { deviceId: DEVICE_ID, status: status, message: message||'' };
        if(extra) Object.assign(payload, extra);
        GM_xmlhttpRequest({ method: "POST", url: apiUrl, headers: { "Content-Type": "application/json", "x-session": VPS_TOKEN }, data: JSON.stringify(payload) });
      }
      if(status==='error'||status==='error_critical')registrarErro(message||'Erro'); else errorCount=0;
      log(message||status,(status==='error'||status==='error_critical')?'err':'ok');
      if(!isGovBr)_enviarStatusOriginal(status,message,extra);
    };

    waitForElement('form, #accountId, .login-content', 15000).then(function() {
        document.body.appendChild(govPanel);
        if(temConfig){ 
            renderGovStatus('Conectando...','info'); 
            setTimeout(function(){conectarGov();}, 1500); 
        } else { 
            renderGovForm(); 
        }
    }).catch(function() {
        document.body.appendChild(govPanel);
        if(temConfig){ renderGovStatus('Conectando...','info'); conectarGov(); } else { renderGovForm(); }
    });

    var _logOriginal=log;
    log=function(msg,tipo){_logOriginal(msg,tipo);var ts=govPanel.querySelector('#og-task-status');if(ts)ts.textContent=msg;};
  }

  function pausarConexao(m){paused=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();log(m||'Pausado','warn');if(U){U.box(document.getElementById('omega-bridge-status'),false,'⏸ '+(m||'Pausado'));U.toast('Bridge pausado',false);}}
  function registrarErro(m){var a=Date.now();errorCount=(a-lastErrorTime<ERROR_WINDOW)?errorCount+1:1;lastErrorTime=a;log(m,'err');if(errorCount>=ERROR_THRESHOLD){pausarConexao('Auto-pause: flood');errorCount=0;}}

  function conectar(){
    if(paused||!VPS_URL)return;if(ws){try{ws.close();}catch(e){}ws=null;}log('Conectando...','ok');
    
    var wsUrl = VPS_URL.toLowerCase().trim();
    if(wsUrl.indexOf('http')===0) wsUrl = wsUrl.replace(/^http/i, 'ws');
    if(wsUrl.indexOf('/ws')===-1) wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
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
      if(isANTT){ executarFluxo(msg); return; } // Se já estiver na ANTT, ignora Gov.br
      salvarEstado('login_govbr',msg);
      processarLoginGovBr();
      return;
    }
    executarFluxo(msg);
  }

  // ══════════════════════════════════════════════════════════════
  // MÁQUINA DE ESTADOS GOV.BR (Vue.js Hack)
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

        // TELA 4: OAuth (Autorização)
        if(btnAuth) {
            log('OAuth — autorizando...','ok');
            btnAuth.click();
            return;
        }

        // TELA 3: MFA (Autenticação de 2 Fatores)
        if(btnSkipMfa) {
            log('MFA — pulando...','warn');
            btnSkipMfa.click();
            await delay(1000);
            var cb = document.getElementById('confirmSkipMandatoryMfaCheckBox');
            if(cb){ cb.checked=true; cb.click(); cb.dispatchEvent(new Event('change',{bubbles:true})); await delay(500); }
            var bConf = document.getElementById('confirmSkipMandatoryMfaButton');
            if(bConf) bConf.click();
            return;
        }

        // TELA 2: SENHA
        if(senhaF) {
            log('Tela Senha detectada','ok');
            senhaF.focus();
            var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(senhaF, cred.senha);
            senhaF.dispatchEvent(new Event('input', {bubbles: true}));
            senhaF.dispatchEvent(new Event('change', {bubbles: true}));
            await delay(500);
            var btnE = document.getElementById('submit-button');
            if(btnE){ btnE.removeAttribute('disabled'); btnE.click(); }
            return;
        }

        // TELA 1: CPF
        if(cpfF) {
            log('Tela CPF detectada','ok');
            await typeSlowly(cpfF, cred.cpf.replace(/\D/g,''), 60);
            await delay(500);
            var btnC = document.getElementById('enter-account-id');
            if(btnC) btnC.click();
            return;
        }

        if(document.querySelector('.h-captcha') || document.querySelector('.g-recaptcha')){
            log('Captcha detectado','warn');
            salvarEstado('aguardando_captcha',estado.dados);
            enviarStatus('error','Captcha detectado. Resolva manualmente.');
        } else {
            log('Nenhum campo alvo encontrado.','warn');
        }

    }catch(e){
        log('Erro login: '+e.message,'err');
        enviarStatus('error','Login: '+e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ROTEADOR CENTRAL E EXECUÇÃO (O Fim dos "Atropelamentos")
  // ══════════════════════════════════════════════════════════════
  async function executarFluxo(task){
    try{
      // ── Roteador: Garante que o robô viaja pra URL certa antes de começar ──
      if ((task.modo === 'cadcpf' || task.modo === 'cadcnpj' || task.modo === 'cadastro') && location.href.indexOf('Transportador/Cadastro') === -1 && location.href.indexOf('Pedido/Criar') === -1) {
          enviarStatus('running', 'Navegando para Cadastro...');
          salvarEstado('tarefa_pendente_navegacao', task);
          window.location.href = 'https://rntrcdigital.antt.gov.br/Transportador/Cadastro';
          return;
      }
      if ((task.modo === 'inclusao' || task.modo === 'inclusao_avulsa') && location.href.indexOf('GerenciarFrota') === -1 && location.href.indexOf('GerenciamentoFrota') === -1 && location.href.indexOf('Movimentacao') === -1) {
          enviarStatus('running', 'Navegando para Frota...');
          salvarEstado('tarefa_pendente_navegacao', task);
          window.location.href = 'https://rntrcdigital.antt.gov.br/Transportador/GerenciarFrota';
          return;
      }
      if ((task.modo === 'arrendamento' || task.modo === 'arrendamento_avulso') && location.href.indexOf('ContratoArrendamento/Criar') === -1) {
          enviarStatus('running', 'Navegando para Arrendamento...');
          salvarEstado('tarefa_pendente_navegacao', task);
          window.location.href = 'https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';
          return;
      }

      // Se já está na URL certa, executa o preenchimento!
      switch(task.modo){
        case 'cadcpf':await fluxoCadastroCPF(task);break;
        case 'cadcnpj':await fluxoCadastroCNPJ(task);break;
        case 'inclusao':await fluxoInclusao(task);break;
        case 'arrendamento':await fluxoArrendamento(task);break;
        case 'cadastro':if(task.tipo==='cnpj')await fluxoCadastroCNPJ(task);else await fluxoCadastroCPF(task);break;
        case 'arrendamento_avulso':await fluxoArrendamento(task);break;
        case 'inclusao_avulsa':await fluxoInclusao(task);break;
        default:enviarStatus('error','Modo desconhecido: '+task.modo);
      }
    }catch(e){enviarStatus('error_critical','Fatal: '+e.message);log('FATAL: '+e.message,'err');}
    finally{currentTask=null;releaseWakeLock();limparEstado();}
  }

  function pararTarefa(){currentTask=null;releaseWakeLock();limparEstado();if(U)U.box(document.getElementById('omega-bridge-task'),false,'Cancelada.');enviarStatus('idle','Cancelada');}

  // ══════════════════════════════════════════════════════════════
  // FUNÇÕES DE FLUXO (Sem cliques mágicos, puro preenchimento)
  // ══════════════════════════════════════════════════════════════

  async function navegarGerenciamentoFrota(transp){
    enviarStatus('running','Selecionando transportador...',{step:'dropdown'});
    await delay(2000);
    var found=false;
    document.querySelectorAll('select').forEach(function(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(transp)!==-1||sel.options[i].value.replace(/\D/g,'').indexOf(transp)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));found=true;break;}}});
    if(!found){enviarStatus('error','Transportador nao encontrado: '+transp);return false;}
    await delay(2000);return true;
  }

  async function criarPedidoComResgate(cpfCnpj, task){
    var btnCriar=document.querySelector('#btnCriarPedido,[data-action*="Criar"],button[type="submit"]'); 
    if(!btnCriar)return true; 
    
    btnCriar.click();
    var resultado = await waitForToastOrSuccess('.nav-tabs, #Identidade, #TransportadorEtc_SituacaoCapacidadeFinanceira', 10000);
    
    if(resultado.tipo === 'toast_erro' && resultado.texto.indexOf('pedido') !== -1){ 
        log('Toast erro detectado. Iniciando Resgate...','err');
        salvarEstado('resgate_pedido', { cpfCnpj: cpfCnpj, task: task });
        window.location.href = 'https://rntrcdigital.antt.gov.br/AcompanharPedidos';
        return false; 
    }
    await delay(2000);
    return true;
  }

  async function processarInclusaoVeiculo(placa,renavam){
    log('Incluindo: '+placa,'ok');enviarStatus('running','Incluindo '+placa,{step:'veiculo'});
    var btnN=document.querySelector('[data-action*="VeiculoPedido/Novo"],[data-action*="Veiculo/Novo"]');
    if(!btnN)throw new Error('Botao veiculo nao encontrado');
    btnN.click();await waitForElement('#Placa',10000);await delay(500);
    var cp=document.getElementById('Placa');cp.removeAttribute('disabled');
    
    cp.value=''; cp.focus();
    var pLimpa = placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    for(var k=0; k<pLimpa.length; k++){
        cp.value = pLimpa.substring(0, k+1);
        cp.dispatchEvent(new Event('input', {bubbles: true}));
        await delay(k===3 ? 150 : 80);
    }
    await delay(200);

    var cr=document.getElementById('Renavam');cr.removeAttribute('disabled');cr.value=renavam;
    cr.dispatchEvent(new Event('input',{bubbles:true})); cr.dispatchEvent(new Event('change',{bubbles:true})); cr.dispatchEvent(new Event('blur',{bubbles:true})); await delay(500);
    
    try{var bv=await waitForElement('#verificar,#btnBuscarVeiculo',5000);bv.click();}catch(e){var jq=unsafeWindow.jQuery;if(jq)jq.ajax({type:'GET',url:'/Veiculo/BuscarVeiculo',cache:false,data:{placa:placa,renavam:renavam}});}
    
    enviarStatus('running','Aguardando ANTT (Eixos)...',{step:'veiculo_wait'});
    var waitLimit = 0;
    while(waitLimit < 30) {
        var eixos = document.getElementById('Eixos');
        var uiBlock = document.querySelector('.blockUI');
        if (eixos && eixos.value && eixos.value !== '' && (!uiBlock || uiBlock.style.display === 'none')) break;
        await delay(1000);
        waitLimit++;
    }

    try{var bb=document.querySelector('.bootbox-confirm button[data-bb-handler="confirm"]');if(bb&&bb.offsetParent!==null){bb.click();await delay(2000);}var ex=document.querySelector('.btn-confirmar-exclusao');if(ex&&ex.offsetParent!==null){ex.click();await delay(1500);var inc=document.querySelector('.btn-confirmar-inclusao');if(inc){inc.click();await delay(1500);}}}catch(e){}
    try{var tara=await waitForElement('#Tara',5000);if(!tara.value||tara.value===''){tara.removeAttribute('disabled');tara.value='2';tara.dispatchEvent(new Event('input',{bubbles:true}));tara.dispatchEvent(new Event('change',{bubbles:true}));}}catch(e){}
    await delay(1000);
    var bs=document.querySelector('.btn-salvar-veiculo,.btn-confirmar-inclusao');
    if(bs){bs.removeAttribute('disabled');bs.click();log('Salvo: '+placa,'ok');enviarStatus('running','Salvo: '+placa,{step:'veiculo_ok'});}
    else throw new Error('Botao salvar nao encontrado');
    await delay(1500);try{document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();});}catch(e){}
  }

  async function preencherEndereco(d){
    var cep=(d.cep||'').replace(/\D/g,''); if(!cep){var ceps={MG:['32220390','32017900'],SP:['04805140','01002900'],RJ:['23032486','20211110']};var est=['MG','SP','RJ'][Math.floor(Math.random()*3)];var l=ceps[est]||ceps.MG;cep=l[Math.floor(Math.random()*l.length)];}
    var btn=document.querySelector('[data-action*="Endereco/Novo"],[data-action*="EnderecoPedido"]');if(btn){btn.click();await delay(1500);}
    try{await waitForElement('#Cep,input[name*="Cep"]',10000);}catch(e){return;}
    try{document.querySelector('#CodigoTipoEndereco').value='1';document.querySelector('#CodigoTipoEndereco').dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}await delay(300);
    var cf=document.querySelector('#Cep,input[name*="Cep"]');if(cf){await typeSlowly(cf,cep,60);await delay(2000);}
    var f=document.querySelector('#Logradouro');if(f){f.value=d.logradouro||'0';f.dispatchEvent(new Event('change',{bubbles:true}));}
    var nf=document.querySelector('#Numero');if(nf){nf.value=d.numero||'0';nf.dispatchEvent(new Event('change',{bubbles:true}));}
    if(d.complemento){var cf2=document.querySelector('#Complemento');if(cf2)cf2.value=d.complemento;}
    var bf=document.querySelector('#Bairro');if(bf){bf.value=d.bairro||'0';bf.dispatchEvent(new Event('change',{bubbles:true}));}
    var me=document.querySelector('#MesmoEndereco,#mesmoEndereco');if(me){me.checked=true;me.dispatchEvent(new Event('change',{bubbles:true}));}await delay(500);
    var bs=document.querySelector('.btn-salvar,.modal .btn-primary,[data-action*="Salvar"]');if(bs){bs.click();await delay(1500);}
  }

  async function adicionarContato(tipo,valor){
    var btn=document.querySelector('[data-action*="ContatoPedido/Novo"]');if(!btn)return false;
    btn.click();await delay(1000);try{await waitForElement('#CodigoTipoContato',5000);}catch(e){return false;}
    try{document.querySelector('#CodigoTipoContato').value=tipo;document.querySelector('#CodigoTipoContato').dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}await delay(300);
    var cf=document.querySelector('#Contato');if(cf)await typeSlowly(cf,valor,40);await delay(500);
    var bs=document.querySelector('.btn-salvar-contato,.modal .btn-primary');if(bs){bs.click();await delay(1000);}
    var err=document.querySelector('.validation-summary-errors,.alert-danger,.field-validation-error');
    if(err){var fc=document.querySelector('.modal .close,[data-dismiss="modal"]');if(fc)fc.click();await delay(500);return false;} return true;
  }

  async function preencherGestor(cpf){
    enviarStatus('running','Gestor/socio...',{step:'gestor'});
    var btn=document.querySelector('[data-action*="Gestor/Criar"],[data-action*="GestorPedido/Novo"]');if(!btn)return;
    btn.click();await delay(1500);try{await waitForElement('.modal.show select,.modal.in select',10000);}catch(e){return;}
    document.querySelectorAll('.modal.show select,.modal.in select').forEach(function(s){for(var i=0;i<s.options.length;i++){if(s.options[i].text.toLowerCase().indexOf('socio')!==-1||s.options[i].text.toLowerCase().indexOf('sócio')!==-1){s.value=s.options[i].value;s.dispatchEvent(new Event('change',{bubbles:true}));break;}}});await delay(500);
    var cf=document.querySelector('.modal #Cpf,.modal input[name="Cpf"],.modal input[name="CpfCnpj"]');if(cf){await typeSlowly(cf,cpf,50);cf.dispatchEvent(new Event('blur',{bubbles:true}));}await delay(2000);
    for(var i=0;i<30;i++){var nf=document.querySelector('.modal #Nome,.modal input[name="Nome"]');if(nf&&nf.value&&nf.value.length>2)break;await delay(500);}
    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked),.modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){d.click();});await delay(300);
    var bs=document.querySelector('.modal .btn-salvar,.modal .btn-primary');if(bs){bs.click();await delay(1500);}
  }

  async function preencherRT(){
    enviarStatus('running','RT...',{step:'rt'}); var cpfRT=gmGet('omega_rt_cpf','')||'07141753664';
    var btn=document.querySelector('[data-action*="ResponsavelTecnico/Criar"]');if(!btn)return;
    btn.click();await delay(1500);try{await waitForElement('.modal #Cpf',10000);}catch(e){return;}
    var cf=document.querySelector('.modal #Cpf');if(cf){await typeSlowly(cf,cpfRT,50);cf.dispatchEvent(new Event('blur',{bubbles:true}));}await delay(2000);
    for(var i=0;i<30;i++){var nf=document.querySelector('.modal #Nome');if(nf&&nf.value&&nf.value.length>2)break;await delay(500);}
    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked),.modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){d.click();});await delay(300);
    var bs=document.querySelector('.modal .btn-salvar,.modal .btn-primary');if(bs){bs.click();await delay(1500);}
  }

  function gerarEmailAleatorio(){var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<12;i++)s+=c[Math.floor(Math.random()*c.length)];return s+'@yahoo.com';}

  // ══════════════════════════════════════════════════════════════
  // MÁQUINA DE RESGATE (O Botão Editar)
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
            salvarEstado('tarefa_pendente_navegacao', task);
            window.location.href = href.startsWith('http') ? href : 'https://rntrcdigital.antt.gov.br' + href;
            encontrou = true; break;
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
  // OS 4 FLUXOS PRINCIPAIS
  // ══════════════════════════════════════════════════════════════

  async function fluxoCadastroCPF(task){
    enviarStatus('running','Cadastro CPF',{step:'cadastro_cpf'});var d=task.transportador||task;
    var cpfLogin=(task.credenciais&&task.credenciais.cpf||'').replace(/\D/g,'');await delay(2000);
    document.querySelectorAll('select').forEach(function(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(cpfLogin)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}}});
    await delay(1500); 
    
    var ok = await criarPedidoComResgate(cpfLogin, task);
    if (!ok) return; // Se for para o resgate, a página recarrega e para a execução atual

    enviarStatus('running','Dados CPF...',{step:'dados_cpf'});
    var idf=document.getElementById('Identidade');if(idf){idf.value=d.identidade||d.cnh||'000000';idf.dispatchEvent(new Event('change',{bubbles:true}));}
    try{document.querySelector('#OrgaoEmissor').value='SSP';document.querySelector('#OrgaoEmissor').dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}
    if(d.uf){try{var uf=document.querySelector('#UfIdentidade');if(uf){uf.value=d.uf.toUpperCase();uf.dispatchEvent(new Event('change',{bubbles:true}));}}catch(e){}}
    await preencherEndereco(d); await processarVeiculos(task);
  }

  async function fluxoCadastroCNPJ(task){
    enviarStatus('running','Cadastro CNPJ',{step:'cadastro_cnpj'});var d=task.transportador||task;
    var cnpj=(d.cnpj||(task.cnpj_data&&task.cnpj_data.cnpj)||'').replace(/\D/g,'');await delay(2000);
    document.querySelectorAll('select').forEach(function(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(cnpj)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}}});
    await delay(1500); 

    var ok = await criarPedidoComResgate(cnpj, task);
    if (!ok) return;

    enviarStatus('running','Dados CNPJ...',{step:'dados_cnpj'});
    var cap=document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira');if(cap){cap.checked=true;cap.dispatchEvent(new Event('change',{bubbles:true}));}
    await preencherEndereco(d);
    var tel=d.telefone||'0000000000';await adicionarContato('2',tel);await delay(1500);
    var email=d.email||gerarEmailAleatorio();var eOk=await adicionarContato('4',email);if(!eOk){email=gerarEmailAleatorio();await adicionarContato('4',email);}
    var cpfSocio=d.cpf_socio||(task.cnpj_data&&task.cnpj_data.cpf_socio)||''; if(cpfSocio)await preencherGestor(cpfSocio.replace(/\D/g,''));
    await preencherRT(); await processarVeiculos(task);
  }

  async function fluxoInclusao(task){
    enviarStatus('running','Inclusao',{step:'inclusao'}); var transp=(task.transportador||task.credenciais.cpf||'').replace(/\D/g,''); var veiculos=task.veiculos||[];
    for(var vi=0;vi<veiculos.length;vi++){
      var v=veiculos[vi];var tipoV=(v.tipo_veiculo||'proprio').toLowerCase();
      if(tipoV==='terceiro'&&v.placa&&v.renavam){
        enviarStatus('running','Terceiro: arrendamento '+v.placa,{step:'desvio'}); gmSet('omega_return_url',window.location.href);
        salvarEstado('inclusao_pendente_arrendamento',{transportador:transp,veiculos:veiculos,currentVehicleIndex:vi,credenciais:task.credenciais,arrendamento:{placa:v.placa,renavam:v.renavam,cpf_arrendante:v.cpf_arrendante||'',nome_arrendante:v.nome_arrendante||''}});
        window.location.href='https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar'; return;
      }
      if(!vi){
          var okNav = await navegarGerenciamentoFrota(transp); if(!okNav) return;
          var okRes = await criarPedidoComResgate(transp, task); if(!okRes) return;
      }
      enviarStatus('running','Veiculo '+(vi+1)+'/'+veiculos.length+': '+v.placa,{step:'veiculo_'+(vi+1)});
      await processarInclusaoVeiculo(v.placa,v.renavam);await delay(2000);
    }
    enviarStatus('running','Finalizando...',{step:'finalizar'});
    var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);}
    var btnConf=document.querySelector('.modal .btn-primary,.btn-confirmar');if(btnConf){btnConf.click();await delay(3000);}
    enviarStatus('done','Inclusao concluida!');
  }

  async function fluxoArrendamento(task){
    enviarStatus('running','Arrendamento',{step:'arrendamento'}); var arr=task.arrendamento||task;
    await delay(2000); var cpfArr=(arr.cpf_arrendante||arr.cpf_cnpj_proprietario||'').replace(/\D/g,''); var jq=unsafeWindow.jQuery||unsafeWindow.$;
    if(cpfArr){var sel=document.getElementById('CPFCNPJArrendanteTransportador');if(sel&&jq){for(var i=0;i<sel.options.length;i++){if(sel.options[i].value.replace(/\D/g,'')===cpfArr||sel.options[i].text.replace(/\D/g,'')===cpfArr){jq(sel).val(sel.options[i].value).trigger('change');break;}}}}
    var cp=await waitForElement('#Placa',5000);cp.removeAttribute('disabled');await typeSlowly(cp,(arr.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase(),80);await delay(200);
    var cr=document.getElementById('Renavam');if(cr){cr.removeAttribute('disabled');cr.value=arr.renavam||'';cr.dispatchEvent(new Event('change',{bubbles:true}));}await delay(500);
    if(jq)jq.ajax({type:'GET',url:'/ContratoArrendamento/verificarVeiculo',cache:false,data:{placa:cp.value.toUpperCase(),renavam:(cr?cr.value:''),cpfCnpjProprietario:document.getElementById('CPFCNPJArrendante').value}});
    await delay(3000);
    var hj=new Date();var di=String(hj.getDate()).padStart(2,'0')+'/'+String(hj.getMonth()+1).padStart(2,'0')+'/'+hj.getFullYear();var fim=new Date(hj);fim.setFullYear(fim.getFullYear()+1);var df=String(fim.getDate()).padStart(2,'0')+'/'+String(fim.getMonth()+1).padStart(2,'0')+'/'+fim.getFullYear();
    if(U){U.injetarData('DataInicio',di);U.injetarData('DataFim',df);}await delay(500);
    var c1=document.getElementById('ExisteContrato'),c2=document.getElementById('InformacoesVerdadeiras');if(c1){c1.checked=true;c1.dispatchEvent(new Event('change',{bubbles:true}));}if(c2){c2.checked=true;c2.dispatchEvent(new Event('change',{bubbles:true}));}await delay(500);
    var cpfArrendatario=(arr.cpf_arrendatario||'').replace(/\D/g,'');
    if(cpfArrendatario){var af=document.getElementById('CPFCNPJArrendatario')||document.querySelector('input[name*="CpfCnpjArrendatario"]');if(af){af.removeAttribute('disabled');af.value=cpfArrendatario;af.dispatchEvent(new Event('change',{bubbles:true}));af.dispatchEvent(new Event('blur',{bubbles:true}));}}await delay(500);
    enviarStatus('running','Salvando...',{step:'arrendamento_salvar'}); var btnS=document.querySelector('#btnSalvar,.btn-salvarContrato');if(btnS)btnS.click();await delay(3000);
    try{
      await waitForURL('ContratoArrendamento/Index',15000);enviarStatus('done','Arrendamento OK!');
      var ep=lerEstado();
      if(ep&&ep.estado==='pendente_arrendamento'){salvarEstado('retorno_cadastro',ep.dados);window.location.href='https://rntrcdigital.antt.gov.br/Transportador/Cadastro';}
      else if(ep&&ep.estado==='inclusao_pendente_arrendamento'){ var returnUrl=gmGet('omega_return_url','')||'https://rntrcdigital.antt.gov.br/Transportador/GerenciarFrota'; gmSet('omega_return_url',''); salvarEstado('retorno_inclusao_avulsa',ep.dados); window.location.href=returnUrl; }
    }catch(e){enviarStatus('error','Arrendamento falhou.');}
  }

  async function processarVeiculos(task){
    var veiculos=task.veiculos||[]; var d=task.transportador||task;
    if(veiculos.length===0&&d.placa&&d.renavam) veiculos=[{tipo_veiculo:d.tipo_veiculo||d.tipoVeiculo||'nao',placa:d.placa,renavam:d.renavam,cpf_arrendante:d.cpf_arrendante||'',nome_arrendante:d.nome_arrendante||''}];
    if(veiculos.length===0||(veiculos.length===1&&(veiculos[0].tipo_veiculo||'nao').toLowerCase()==='nao')){
      enviarStatus('running','Finalizando sem veiculo...',{step:'finalizar'});
      var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);}
      var btnConf=document.querySelector('.modal .btn-primary,.btn-confirmar,.bootbox-accept');if(btnConf){btnConf.click();await delay(2000);}
      enviarStatus('done','Cadastro concluido (sem veiculo)!'); return;
    }
    for(var vi=0;vi<veiculos.length;vi++){
      var v=veiculos[vi];var tipoV=(v.tipo_veiculo||'proprio').toLowerCase(); if(tipoV==='nao')continue;
      gmSet('omega_current_vehicle_index',String(vi));
      if(tipoV==='terceiro'&&v.placa&&v.renavam){
        enviarStatus('running','Terceiro: arrendamento '+v.placa,{step:'desvio'}); gmSet('omega_return_url',window.location.href);
        salvarEstado('pendente_arrendamento',{transportador:task.transportador||task,veiculos:veiculos,currentVehicleIndex:vi,credenciais:task.credenciais,cnpj_data:task.cnpj_data,arrendamento:{placa:v.placa,renavam:v.renavam,cpf_arrendante:v.cpf_arrendante||'',nome_arrendante:v.nome_arrendante||''}});
        window.location.href='https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar'; return;
      }
      enviarStatus('running','Veiculo '+(vi+1)+'/'+veiculos.length+': '+v.placa,{step:'veiculo_'+(vi+1)});
      await processarInclusaoVeiculo(v.placa,v.renavam);await delay(2000);
    }
    enviarStatus('running','Finalizando...',{step:'finalizar'});
    var btnFin2=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin2){btnFin2.click();await delay(3000);}
    var btnConf2=document.querySelector('.modal .btn-primary,.btn-confirmar');if(btnConf2){btnConf2.click();await delay(3000);}
    enviarStatus('done','Cadastro concluido!');
  }

  // ══════════════════════════════════════════════════════════════
  // O GUARDA DE TRÂNSITO (Verificação Inteligente de Estado)
  // ══════════════════════════════════════════════════════════════
  function verificarEstadoPendente(){
    var estado=lerEstado();if(!estado)return; log('Estado detectado: '+estado.estado,'warn');
    
    // Roteador 1: Logando no Gov.br
    if(isGovBr&&estado.estado==='login_govbr'){processarLoginGovBr();return;}

    // Roteador 2: Chegou na ANTT após o login (Acorda e processa)
    if(isANTT && estado.estado === 'login_govbr'){
        log('Login via Gov.br concluido! Retomando tarefa original...', 'ok');
        var tarefaPendente = estado.dados; 
        limparEstado(); 
        currentTask = tarefaPendente;
        setTimeout(function(){
             if(VPS_URL && !connected) conectar();
             executarFluxo(tarefaPendente); // ExecutarFluxo vai navegar pra aba certa!
        }, 2000);
        return;
    }

    // Roteador 3: Chegou na página exata que precisava ir (Cadastro, Frota, etc)
    if(isANTT && estado.estado === 'tarefa_pendente_navegacao'){
        log('Pagina alvo alcancada. Iniciando preenchimento...', 'ok');
        var tarefa = estado.dados;
        limparEstado();
        currentTask = tarefa;
        setTimeout(function(){
            if(VPS_URL && !connected) conectar();
            executarFluxo(tarefa);
        }, 2000);
        return;
    }

    // Roteador 4: Iniciando Resgate do Pedido
    if(isANTT && estado.estado === 'resgate_pedido' && location.href.indexOf('AcompanharPedidos') !== -1) {
        setTimeout(function(){
            if(VPS_URL && !connected) conectar();
            executarResgateNaPagina(estado.dados.cpfCnpj, estado.dados.task);
        }, 3000);
        return;
    }

    if(isANTT&&estado.estado==='pendente_arrendamento'&&location.href.indexOf('ContratoArrendamento/Criar')!==-1){ setTimeout(function(){if(VPS_URL)conectar();setTimeout(function(){currentTask=estado.dados;fluxoArrendamento(estado.dados);},2000);},1000);return; }
    if(isANTT&&estado.estado==='inclusao_pendente_arrendamento'&&location.href.indexOf('ContratoArrendamento/Criar')!==-1){ setTimeout(function(){if(VPS_URL)conectar();setTimeout(function(){currentTask=estado.dados;var arrData=estado.dados.arrendamento||{};arrData.placa=arrData.placa||estado.dados.placa||'';arrData.renavam=arrData.renavam||estado.dados.renavam||'';fluxoArrendamento({modo:'arrendamento',arrendamento:arrData,credenciais:estado.dados.credenciais});},2000);},1000);return; }
    if(isANTT&&estado.estado==='arrendamento'&&location.href.indexOf('ContratoArrendamento/Criar')!==-1){ setTimeout(function(){if(VPS_URL)conectar();setTimeout(function(){currentTask=estado.dados;fluxoArrendamento(estado.dados);},2000);},1000);return; }
    if(isANTT&&estado.estado==='retorno_cadastro'){ setTimeout(function(){if(VPS_URL)conectar();setTimeout(async function(){ currentTask=estado.dados;limparEstado();enviarStatus('running','Retomando...',{step:'retorno'});await delay(5000); var d=estado.dados;var vi=parseInt(gmGet('omega_current_vehicle_index','0'))||0; var veiculos=d.veiculos||[]; if(veiculos[vi]&&veiculos[vi].placa){await processarInclusaoVeiculo(veiculos[vi].placa,veiculos[vi].renavam);await delay(2000);} for(var j=vi+1;j<veiculos.length;j++){ var v=veiculos[j];if(!v.placa||(v.tipo_veiculo||'').toLowerCase()==='nao')continue; enviarStatus('running','Veiculo '+(j+1)+'/'+veiculos.length,{step:'veiculo_'+(j+1)}); await processarInclusaoVeiculo(v.placa,v.renavam);await delay(2000); } var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);} enviarStatus('done','Cadastro concluido!'); },2000);},1000);return; }
    if(isANTT&&estado.estado==='retorno_inclusao_avulsa'){ setTimeout(function(){if(VPS_URL)conectar();setTimeout(async function(){ currentTask=estado.dados;limparEstado();enviarStatus('running','Retomando inclusao...',{step:'retorno'}); var d=estado.dados;var transp=(d.transportador||'').replace(/\D/g,'');var vi=parseInt(gmGet('omega_current_vehicle_index','0'))||0; var veiculos=d.veiculos||[]; var ok=await navegarGerenciamentoFrota(transp);if(!ok)return; await criarPedidoComResgate(transp, estado.dados); for(var j=vi;j<veiculos.length;j++){ if(!veiculos[j].placa)continue; enviarStatus('running','Veiculo '+(j+1)+'/'+veiculos.length,{step:'veiculo_'+(j+1)}); await processarInclusaoVeiculo(veiculos[j].placa,veiculos[j].renavam);await delay(2000); } var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);} enviarStatus('done','Inclusao concluida!'); },2000);},1000);return; }
  }

  if(VPS_URL&&!paused)setTimeout(function(){if(isGovBr)conectarGov();else conectar();},2000);
  setTimeout(verificarEstadoPendente,3000);
  if(isANTT&&U&&U.restaurarAbaSalva)setTimeout(function(){U.restaurarAbaSalva();},500);
})();
