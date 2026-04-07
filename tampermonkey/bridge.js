// bridge.js — Final Omega v5.0 (Sunshine Edition)
// RT, Resgate, URL Memory, loop async, anti-hibernação, MFA/OAuth
(function(){
  var isANTT = location.hostname.indexOf('rntrcdigital.antt.gov.br') !== -1;
  var isGovBr = location.hostname.indexOf('acesso.gov.br') !== -1;
  var U = window.OmegaUtils || null;

  function gmGet(k,d){ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : ''; }
  function gmSet(k,v){ try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); }catch(e){} }

  // ══════════════════════════════════════════════════════════════
  // ESPERA DINÂMICA (Promises + MutationObserver)
  // ══════════════════════════════════════════════════════════════

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

  // Detecta toast de erro OU sucesso da página
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

  // ══════════════════════════════════════════════════════════════
  // MÁQUINA DE ESTADOS (GM_setValue)
  // ══════════════════════════════════════════════════════════════

  function salvarEstado(nome, dados) { gmSet('omega_state', JSON.stringify({ estado: nome, dados: dados, ts: Date.now(), returnUrl: window.location.href })); log('Estado: ' + nome, 'ok'); }
  function lerEstado() { try { var r = gmGet('omega_state',''); if(!r)return null; var s=JSON.parse(r); if(Date.now()-s.ts>900000){limparEstado();return null;} return s; } catch(e){return null;} }
  function limparEstado() { gmSet('omega_state', ''); }

  // ══════════════════════════════════════════════════════════════
  // CONFIG & VARIÁVEIS
  // ══════════════════════════════════════════════════════════════

  var VPS_URL=gmGet('omega_vps_url',''), VPS_TOKEN=gmGet('omega_vps_token',''), DEVICE_NAME=gmGet('omega_device_name',''), DEVICE_ID=gmGet('omega_device_id','');
  var ws=null, connected=false, paused=false, currentTask=null;
  var reconnectTimer=null, reconnectDelay=5000, RECONNECT_MAX=60000, RECONNECT_BASE=5000;
  var errorCount=0, ERROR_THRESHOLD=5, lastErrorTime=0, ERROR_WINDOW=30000;
  var logs=[], MAX_LOGS=15, wakeLockSentinel=null;

  function resetBackoff(){reconnectDelay=RECONNECT_BASE;} function nextBackoff(){reconnectDelay=Math.min(reconnectDelay*2,RECONNECT_MAX);}

  // ══════════════════════════════════════════════════════════════
  // LOGGING & TOAST
  // ══════════════════════════════════════════════════════════════

  function log(msg,tipo){var now=new Date();var ts=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+':'+String(now.getSeconds()).padStart(2,'0');logs.push({ts:ts,msg:msg,tipo:tipo||'ok'});if(logs.length>MAX_LOGS)logs.shift();console.log('[BRIDGE '+ts+'] '+msg);renderLogs();}
  function renderLogs(){if(!isANTT)return;var el=document.getElementById('omega-bridge-log');if(!el)return;el.innerHTML=logs.map(function(l){var c=l.tipo==='err'?'om-log-err':l.tipo==='warn'?'om-log-warn':'om-log-ok';return'<span style="color:#555e70">'+l.ts+'</span> <span class="'+c+'">'+l.msg+'</span>';}).join('<br>');el.scrollTop=el.scrollHeight;}

  // ══════════════════════════════════════════════════════════════
  // ANTI-HIBERNAÇÃO
  // ══════════════════════════════════════════════════════════════

  async function requestWakeLock(){try{if('wakeLock' in navigator){wakeLockSentinel=await navigator.wakeLock.request('screen');}}catch(e){}}
  function releaseWakeLock(){if(wakeLockSentinel){try{wakeLockSentinel.release();}catch(e){}wakeLockSentinel=null;}}
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){if(VPS_URL&&!connected&&!paused)conectar();if(currentTask)requestWakeLock();}});

  // ══════════════════════════════════════════════════════════════
  // ABA BRIDGE (ANTT) + MINI-PAINEL (Gov.br)
  // ══════════════════════════════════════════════════════════════

  if(isANTT&&U){
    U.registrarAba('bridge','Bridge',''
      +'<div class="om-section-title">Conexao VPS</div>'
      +'<div class="om-mb-sm"><label class="om-label">URL</label><input id="omega-bridge-url" class="om-input" placeholder="wss://omhk.com.br/ws"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Token</label><input id="omega-bridge-token" class="om-input" type="password" placeholder="Senha"></div><div><label class="om-label">Nome</label><input id="omega-bridge-name" class="om-input" placeholder="Celular"></div></div>'
      +'<div class="om-grid om-grid-3 om-mb"><button type="button" id="omega-bridge-connect" class="om-btn om-btn-green om-btn-sm">Conectar</button><button type="button" id="omega-bridge-pause" class="om-btn om-btn-amber om-btn-sm" style="display:none">Pausar</button><button type="button" id="omega-bridge-disconnect" class="om-btn om-btn-coral om-btn-sm" style="display:none">Desconectar</button></div>'
      +'<div id="omega-bridge-status"></div><div id="omega-bridge-task" style="margin-top:6px"></div>'
      +'<div class="om-section-title" style="margin-top:10px">Log</div><div id="omega-bridge-log" class="om-log"></div>'
    ,function(){
      var u=document.getElementById('omega-bridge-url'),t=document.getElementById('omega-bridge-token'),n=document.getElementById('omega-bridge-name');
      if(u&&VPS_URL)u.value=VPS_URL;if(t&&VPS_TOKEN)t.value=VPS_TOKEN;if(n&&DEVICE_NAME)n.value=DEVICE_NAME;
      atualizarUI();renderLogs();
    });

    // Input scroll fix (mobile keyboard)
    document.querySelectorAll('#antt-helper input').forEach(function(inp){
      inp.addEventListener('focus',function(){this.scrollIntoView({behavior:'smooth',block:'center'});});
    });

    document.getElementById('omega-bridge-connect').addEventListener('click',function(e){e.preventDefault();VPS_URL=document.getElementById('omega-bridge-url').value.trim();VPS_TOKEN=document.getElementById('omega-bridge-token').value.trim();DEVICE_NAME=document.getElementById('omega-bridge-name').value.trim()||'Dispositivo';if(!VPS_URL)return U.box(document.getElementById('omega-bridge-status'),false,'URL vazia.');gmSet('omega_vps_url',VPS_URL);gmSet('omega_vps_token',VPS_TOKEN);gmSet('omega_device_name',DEVICE_NAME);paused=false;errorCount=0;resetBackoff();conectar();});
    document.getElementById('omega-bridge-pause').addEventListener('click',function(e){e.preventDefault();if(paused){paused=false;errorCount=0;resetBackoff();conectar();}else pausarConexao('Pausado');});
    document.getElementById('omega-bridge-disconnect').addEventListener('click',function(e){e.preventDefault();desconectar(true);});
  }

  // ── MINI-PAINEL GOV.BR (independente do core.js) ──
  if(isGovBr){
    // Injeta CSS mínimo
    var govCss=document.createElement('style');
    govCss.textContent=''
      +'#omega-gov-panel{position:fixed;bottom:16px;right:16px;z-index:999999;background:rgba(14,18,30,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 16px;font-family:"Segoe UI",Arial,sans-serif;color:#c8cdd8;font-size:12px;backdrop-filter:blur(20px);box-shadow:0 4px 24px rgba(0,0,0,0.5);min-width:260px;max-width:320px;transition:all 0.3s}'
      +'#omega-gov-panel .og-title{font-weight:700;color:#5a9cf5;letter-spacing:2px;font-size:13px;margin-bottom:8px}'
      +'#omega-gov-panel .og-row{margin-bottom:6px}'
      +'#omega-gov-panel input{width:100%;padding:6px 8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#c8cdd8;font-size:11px;outline:none;box-sizing:border-box}'
      +'#omega-gov-panel input:focus{border-color:rgba(90,156,245,0.4)}'
      +'#omega-gov-panel button{padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;margin-right:4px;transition:all 0.2s}'
      +'.og-btn-green{background:linear-gradient(135deg,#34a853,#2d8f47);color:#fff}'
      +'.og-btn-coral{background:linear-gradient(135deg,#e07065,#c0392b);color:#fff}'
      +'#omega-gov-panel .og-status{margin-top:6px;font-size:11px;padding:4px 8px;border-radius:6px}'
      +'.og-status-ok{background:rgba(52,168,83,0.1);color:#5ddb7a;border:1px solid rgba(52,168,83,0.15)}'
      +'.og-status-err{background:rgba(192,57,43,0.1);color:#e07065;border:1px solid rgba(192,57,43,0.15)}'
      +'.og-status-info{background:rgba(26,115,232,0.1);color:#5a9cf5;border:1px solid rgba(26,115,232,0.15)}';
    document.head.appendChild(govCss);

    var govPanel=document.createElement('div');
    govPanel.id='omega-gov-panel';
    var temConfig=!!VPS_URL;

    if(temConfig){
      // Já configurado — mostra status compacto + conecta automaticamente
      govPanel.innerHTML=''
        +'<div class="og-title">OMEGA</div>'
        +'<div id="og-conn-status" class="og-status og-status-info">Conectando ao VPS...</div>'
        +'<div id="og-task-status" style="margin-top:6px;font-size:10px;color:#555e70"></div>';
    } else {
      // Sem config — formulário
      govPanel.innerHTML=''
        +'<div class="og-title">OMEGA — Bridge</div>'
        +'<div class="og-row"><input id="og-url" placeholder="wss://omhk.com.br/ws" value=""></div>'
        +'<div class="og-row" style="display:flex;gap:4px"><input id="og-token" type="password" placeholder="Token" value=""><input id="og-name" placeholder="Nome" value=""></div>'
        +'<div style="margin-top:8px"><button class="og-btn-green" id="og-save">Conectar</button><button class="og-btn-coral" id="og-hide">Fechar</button></div>'
        +'<div id="og-conn-status" class="og-status" style="display:none"></div>';
    }

    document.body.appendChild(govPanel);

    // Atualiza o status visual do mini-painel
    function atualizarGovStatus(texto, tipo){
      var el=document.getElementById('og-conn-status');
      if(!el)return;
      el.style.display='block';
      el.className='og-status og-status-'+(tipo||'info');
      el.textContent=texto;
    }

    // Sobrescreve o log pra também atualizar o mini-painel
    var _logOriginal = log;
    log = function(msg, tipo){
      _logOriginal(msg, tipo);
      // Atualiza mini-painel Gov.br com últimos status
      var taskEl=document.getElementById('og-task-status');
      if(taskEl) taskEl.textContent=msg;
    };

    // Eventos do formulário
    var saveBtn=document.getElementById('og-save');
    if(saveBtn){
      saveBtn.addEventListener('click',function(){
        var url=(document.getElementById('og-url')||{}).value||'';
        var token=(document.getElementById('og-token')||{}).value||'';
        var name=(document.getElementById('og-name')||{}).value||'Dispositivo';
        url=url.trim();token=token.trim();name=name.trim()||'Dispositivo';
        if(!url){atualizarGovStatus('URL vazia','err');return;}
        VPS_URL=url;VPS_TOKEN=token;DEVICE_NAME=name;
        gmSet('omega_vps_url',url);gmSet('omega_vps_token',token);gmSet('omega_device_name',name);
        paused=false;errorCount=0;resetBackoff();
        // Troca formulário por status compacto
        govPanel.innerHTML=''
          +'<div class="og-title">OMEGA</div>'
          +'<div id="og-conn-status" class="og-status og-status-info">Conectando...</div>'
          +'<div id="og-task-status" style="margin-top:6px;font-size:10px;color:#555e70"></div>';
        conectar();
      });
    }
    var hideBtn=document.getElementById('og-hide');
    if(hideBtn){hideBtn.addEventListener('click',function(){govPanel.style.display='none';});}

    // Hook no WebSocket pra atualizar status visual do Gov.br
    var _conectarOriginal = conectar;
    var _origOnOpen = null;
    // Monitoramos connected pra atualizar o mini-painel
    setInterval(function(){
      if(connected) atualizarGovStatus('Conectado ✓ (1 disp. livre)','ok');
      else if(paused) atualizarGovStatus('Pausado','err');
      else if(VPS_URL) atualizarGovStatus('Reconectando...','info');
    }, 2000);
  }

  // ══════════════════════════════════════════════════════════════
  // WEBSOCKET
  // ══════════════════════════════════════════════════════════════

  function pausarConexao(m){paused=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();log(m||'Pausado','warn');if(U){U.box(document.getElementById('omega-bridge-status'),false,'⏸ '+(m||'Pausado'));U.toast('Bridge pausado',false);}}
  function registrarErro(m){var a=Date.now();errorCount=(a-lastErrorTime<ERROR_WINDOW)?errorCount+1:1;lastErrorTime=a;log(m,'err');if(errorCount>=ERROR_THRESHOLD){pausarConexao('Auto-pause: flood');errorCount=0;}}

  function conectar(){
    if(paused||!VPS_URL)return;if(ws){try{ws.close();}catch(e){}ws=null;}log('Conectando...','ok');
    var url=VPS_URL+(VPS_TOKEN?((VPS_URL.indexOf('?')===-1?'?':'&')+'token='+encodeURIComponent(VPS_TOKEN)):'');
    try{ws=new WebSocket(url);}catch(e){log('URL invalida','err');return;}
    ws.onopen=function(){connected=true;resetBackoff();errorCount=0;if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}ws.send(JSON.stringify({type:'register',deviceId:DEVICE_ID,name:DEVICE_NAME}));log('Conectado','ok');atualizarUI();if(U){U.box(document.getElementById('omega-bridge-status'),true,'Conectado!');U.toast('Bridge conectado',true);}var fab=document.getElementById('omega-fab');if(fab)fab.classList.add('om-fab-connected');};
    ws.onmessage=function(evt){var msg;try{msg=JSON.parse(evt.data);}catch{return;}if(msg.type==='registered'){DEVICE_ID=msg.deviceId;gmSet('omega_device_id',DEVICE_ID);}if(msg.type==='task')receberTarefa(msg);if(msg.type==='stop')pararTarefa();};
    ws.onclose=function(evt){connected=false;atualizarUI();var fab=document.getElementById('omega-fab');if(fab)fab.classList.remove('om-fab-connected');if(evt.code===4001){log('Token incorreto','err');return;}if(!paused&&VPS_URL){var s=Math.round(reconnectDelay/1000);log('Retry '+s+'s','warn');reconnectTimer=setTimeout(function(){nextBackoff();conectar();},reconnectDelay);}};
    ws.onerror=function(){log('Erro WS','err');};
  }

  function desconectar(i){paused=false;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}if(i){VPS_URL='';gmSet('omega_vps_url','');}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();if(U)U.clearBox(document.getElementById('omega-bridge-status'));log('Desconectado','warn');}

  function enviarStatus(status,message,extra){if(!ws||ws.readyState!==1)return;var p={type:'status',status:status,message:message||''};if(extra)for(var k in extra)p[k]=extra[k];try{ws.send(JSON.stringify(p));}catch(e){}if(U){var pn=document.getElementById('antt-helper');if(pn&&pn.classList.contains('om-hidden'))U.toast(message||status,status!=='error'&&status!=='error_critical');}if(status==='error'||status==='error_critical')registrarErro(message||'Erro');else errorCount=0;log(message||status,(status==='error'||status==='error_critical')?'err':'ok');}

  function atualizarUI(){if(!isANTT)return;var c=document.getElementById('omega-bridge-connect'),p=document.getElementById('omega-bridge-pause'),d=document.getElementById('omega-bridge-disconnect');if(!c)return;if(connected){c.style.display='none';p.style.display='block';p.textContent='Pausar';p.className='om-btn om-btn-amber om-btn-sm';d.style.display='block';}else if(paused){c.style.display='none';p.style.display='block';p.textContent='Continuar';p.className='om-btn om-btn-green om-btn-sm';d.style.display='block';}else{c.style.display='block';p.style.display='none';d.style.display=VPS_URL?'block':'none';}}

  // ══════════════════════════════════════════════════════════════
  // LOGIN GOV.BR
  // ══════════════════════════════════════════════════════════════

  async function processarLoginGovBr(){
    var estado=lerEstado();if(!estado||estado.estado!=='login_govbr')return;
    var cred=estado.dados.credenciais||{};if(!cred.cpf||!cred.senha)return;
    log('Gov.br — login...','ok');
    try{
      var cpfF=await waitForElement('#accountId',15000);await typeSlowly(cpfF,cred.cpf.replace(/\D/g,''),60);await delay(500);
      var btnC=await waitForElement('#enter-account-id',5000);btnC.click();await delay(3000);
      try{var senhaF=await waitForElement('input#password[type="password"]',20000);await delay(1000);await typeSlowly(senhaF,cred.senha,50);await delay(300);var btnE=await waitForElement('#submit-button',3000);btnE.click();await delay(3000);}catch(e){log('Senha nao encontrada','warn');salvarEstado('aguardando_captcha',estado.dados);enviarStatus('error','hCaptcha. Resolva manualmente.');return;}
      // MFA
      try{await waitForElement('.login-mandatory-mfa-acquiring',5000);log('MFA — aguardando skip...','warn');var bSkip=await waitUntilEnabled('button[value="confirm-skip-mandatory-mfa"]',120000);bSkip.click();await delay(1000);try{var cb=await waitForElement('#confirmSkipMandatoryMfaCheckBox',5000);cb.checked=true;cb.click();cb.dispatchEvent(new Event('change',{bubbles:true}));await delay(500);var bConf=await waitForElement('#confirmSkipMandatoryMfaButton',3000);bConf.click();log('MFA pulado','ok');await delay(2000);}catch(e){}}catch(e){}
      // OAuth
      try{await waitForElement('#authorize-info',5000);log('OAuth — autorizando...','ok');var bAuth=await waitForElement('button[name="user_oauth_approval"][value="true"]',5000);bAuth.click();await delay(3000);}catch(e){}
      log('Login concluido','ok');
    }catch(e){log('Erro login: '+e.message,'err');enviarStatus('error','Login: '+e.message);}
  }

  // ══════════════════════════════════════════════════════════════
  // INCLUSÃO DE VEÍCULO (modular)
  // ══════════════════════════════════════════════════════════════

  async function processarInclusaoVeiculo(placa,renavam){
    log('Incluindo: '+placa,'ok');enviarStatus('running','Incluindo '+placa,{step:'veiculo'});
    var btnN=document.querySelector('[data-action*="VeiculoPedido/Novo"],[data-action*="Veiculo/Novo"]');
    if(!btnN)throw new Error('Botao veiculo nao encontrado');
    btnN.click();await waitForElement('#Placa',10000);await delay(500);
    var cp=document.getElementById('Placa');cp.removeAttribute('disabled');
    await typeSlowly(cp,placa.replace(/[^A-Z0-9]/gi,'').toUpperCase(),80);await delay(200);
    var cr=document.getElementById('Renavam');cr.removeAttribute('disabled');cr.value=renavam;cr.dispatchEvent(new Event('input',{bubbles:true}));cr.dispatchEvent(new Event('change',{bubbles:true}));await delay(500);
    try{var bv=await waitForElement('#verificar,#btnBuscarVeiculo',5000);bv.click();}catch(e){var jq=unsafeWindow.jQuery;if(jq)jq.ajax({type:'GET',url:'/Veiculo/BuscarVeiculo',cache:false,data:{placa:placa,renavam:renavam}});}
    await delay(3000);
    // Alertas dinâmicos
    try{var bb=document.querySelector('.bootbox-confirm button[data-bb-handler="confirm"]');if(bb&&bb.offsetParent!==null){bb.click();await delay(2000);}var ex=document.querySelector('.btn-confirmar-exclusao');if(ex&&ex.offsetParent!==null){ex.click();await delay(1500);var inc=document.querySelector('.btn-confirmar-inclusao');if(inc){inc.click();await delay(1500);}}}catch(e){}
    try{var tara=await waitForElement('#Tara',5000);if(!tara.value||tara.value===''){tara.removeAttribute('disabled');tara.value='2';tara.dispatchEvent(new Event('input',{bubbles:true}));tara.dispatchEvent(new Event('change',{bubbles:true}));}}catch(e){}
    await delay(1000);
    var bs=document.querySelector('.btn-salvar-veiculo,.btn-confirmar-inclusao');
    if(bs){bs.removeAttribute('disabled');bs.click();log('Salvo: '+placa,'ok');enviarStatus('running','Salvo: '+placa,{step:'veiculo_ok'});}
    else throw new Error('Botao salvar nao encontrado');
    await delay(1500);try{document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();});}catch(e){}
  }

  // ══════════════════════════════════════════════════════════════
  // RESGATE: RECUPERAR PEDIDO PRESO
  // ══════════════════════════════════════════════════════════════

  async function recuperarPedidoPreso(cpfCnpj) {
    log('Resgate: pedido preso detectado','warn');
    enviarStatus('running','Resgatando pedido preso...',{step:'resgate'});

    window.location.href = 'https://rntrcdigital.antt.gov.br/AcompanharPedidos';
    await delay(5000);

    // Seleciona CPF/CNPJ
    try {
      var selDoc = await waitForElement('#CpfCnpjTransportadorCertificado', 10000);
      var jq = unsafeWindow.jQuery || unsafeWindow.$;
      for(var i=0;i<selDoc.options.length;i++){
        if(selDoc.options[i].value.replace(/\D/g,'').indexOf(cpfCnpj.replace(/\D/g,''))!==-1){
          selDoc.value=selDoc.options[i].value;
          if(jq)jq(selDoc).trigger('change');else selDoc.dispatchEvent(new Event('change',{bubbles:true}));
          break;
        }
      }
      await delay(500);

      // Situação = Em Cadastramento
      var selSit = document.getElementById('SituacaoPedido');
      if(selSit){selSit.value='CAD';selSit.dispatchEvent(new Event('change',{bubbles:true}));}
      await delay(300);

      // Consultar
      var btnConsultar = document.querySelector('.btn-consultar, button.btn-blue');
      if(btnConsultar) btnConsultar.click();
      await delay(3000);

      // Analisa tabela
      var rows = document.querySelectorAll('table tbody tr, .table tbody tr');
      var encontrou = false;

      for(var r=0;r<rows.length;r++){
        var txt = rows[r].textContent || '';
        if(txt.indexOf('EM CADASTRAMENTO') === -1) continue;

        // Cenário A: tem botão Editar
        var btnEditar = rows[r].querySelector('a[title="Editar"]');
        if(btnEditar){
          var href = btnEditar.getAttribute('href');
          log('Resgate A: retomando via Editar','ok');
          enviarStatus('running','Pedido encontrado! Retomando...',{step:'resgate_ok'});
          window.location.href = href.startsWith('http') ? href : 'https://rntrcdigital.antt.gov.br' + href;
          encontrou = true;
          break;
        }

        // Cenário B: sem Editar — clica Histórico
        var btnHist = rows[r].querySelector('a[title="Histórico"], a[data-toggle-modal="true"], .fa-inbox');
        if(btnHist){
          log('Resgate B: sem acesso — lendo historico','warn');
          if(btnHist.tagName === 'I') btnHist = btnHist.closest('a');
          if(btnHist) btnHist.click();
          await delay(2000);

          // Lê modal
          var detalhes = {dataHora:'?',situacao:'?',usuario:'?',nome:'?',entidade:'?'};
          try{
            var modal = document.querySelector('.modal-body, .modal.show .modal-body');
            if(modal){
              var lis = modal.querySelectorAll('li');
              lis.forEach(function(li){
                var label = (li.childNodes[0]||{}).textContent||'';
                var valor = '';
                var p = li.querySelector('p');
                var span = li.querySelector('span');
                if(span) valor = span.textContent.trim();
                else if(p) valor = p.textContent.trim();

                if(label.indexOf('Data')!==-1&&label.indexOf('Hora')!==-1) detalhes.dataHora = valor;
                else if(label.indexOf('Situa')!==-1) detalhes.situacao = valor;
                else if(label.indexOf('Usu')!==-1&&label.indexOf('Sistema')!==-1) detalhes.usuario = valor;
                else if(label.indexOf('Nome')!==-1) detalhes.nome = valor;
                else if(label.indexOf('Entidade')!==-1) detalhes.entidade = valor;
              });
            }
          }catch(e){}

          enviarStatus('erro_fatal','Pedido bloqueado por: '+(detalhes.nome||detalhes.usuario),{detalhes:detalhes});
          log('BLOQUEIO: '+JSON.stringify(detalhes),'err');
          encontrou = true;
          break;
        }
      }

      if(!encontrou){
        enviarStatus('error','Nenhum pedido em cadastramento encontrado.');
      }

    }catch(e){
      log('Resgate erro: '+e.message,'err');
      enviarStatus('error','Falha no resgate: '+e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // DESPACHO DE TAREFAS
  // ══════════════════════════════════════════════════════════════

  function receberTarefa(msg){
    currentTask=msg;requestWakeLock();enviarStatus('running','Tarefa: '+msg.modo);
    if(U)U.box(document.getElementById('omega-bridge-task'),true,'Tarefa: <b>'+(msg.modo||'?')+'</b>');
    if(msg.credenciais&&msg.credenciais.cpf&&msg.credenciais.senha){salvarEstado('login_govbr',msg);if(isANTT){window.location.href='https://rntrcdigital.antt.gov.br/';return;}processarLoginGovBr();return;}
    executarFluxo(msg);
  }

  async function executarFluxo(task){
    try{
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
  // UTILITÁRIOS COMPARTILHADOS
  // ══════════════════════════════════════════════════════════════

  async function navegarGerenciamentoFrota(transp){
    if(location.href.indexOf('Transportador')===-1&&location.href.indexOf('GerenciamentoFrota')===-1){
      var dd=document.querySelector('#dropdownTransportador,[data-toggle="dropdown"]');if(dd){dd.click();await delay(1500);}
      var gf=document.querySelector('a[href*="GerenciamentoFrota"],a[href*="Movimentacao"]');if(gf){gf.click();await delay(3000);}
    }
    enviarStatus('running','Selecionando transportador...',{step:'dropdown'});await delay(2000);
    var found=false;document.querySelectorAll('select').forEach(function(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(transp)!==-1||sel.options[i].value.replace(/\D/g,'').indexOf(transp)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));found=true;break;}}});
    if(!found){enviarStatus('error','Transportador nao encontrado: '+transp);return false;}
    await delay(2000);return true;
  }

  async function criarPedidoComResgate(cpfCnpj){
    var btnCriar=document.querySelector('#btnCriarPedido,[data-action*="Criar"],button[type="submit"]');
    if(!btnCriar)return;
    btnCriar.click();

    // Promise.race: sucesso ou toast de erro
    var resultado = await waitForToastOrSuccess('.nav-tabs, #Identidade, #TransportadorEtc_SituacaoCapacidadeFinanceira', 10000);

    if(resultado.tipo === 'toast_erro' && resultado.texto.indexOf('pedido') !== -1){
      log('Toast erro: '+resultado.texto,'err');
      await recuperarPedidoPreso(cpfCnpj);
      return; // Resgate assume o controle
    }
    await delay(2000);
  }

  async function preencherEndereco(d){
    var cep=(d.cep||'').replace(/\D/g,'');
    if(!cep){var ceps={MG:['32220390','32017900'],SP:['04805140','01002900'],RJ:['23032486','20211110']};var est=['MG','SP','RJ'][Math.floor(Math.random()*3)];var l=ceps[est]||ceps.MG;cep=l[Math.floor(Math.random()*l.length)];}
    var btn=document.querySelector('[data-action*="Endereco/Novo"],[data-action*="EnderecoPedido"]');if(btn){btn.click();await delay(1500);}
    try{await waitForElement('#Cep,input[name*="Cep"]',10000);}catch(e){return;}
    try{document.querySelector('#CodigoTipoEndereco').value='1';document.querySelector('#CodigoTipoEndereco').dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}await delay(300);
    var cf=document.querySelector('#Cep,input[name*="Cep"]');if(cf){await typeSlowly(cf,cep,60);await delay(2000);}
    if(d.logradouro){var f=document.querySelector('#Logradouro');if(f){f.value=d.logradouro;f.dispatchEvent(new Event('change',{bubbles:true}));}}else{var f=document.querySelector('#Logradouro');if(f){f.value='0';f.dispatchEvent(new Event('change',{bubbles:true}));}}
    var nf=document.querySelector('#Numero');if(nf){nf.value=d.numero||'0';nf.dispatchEvent(new Event('change',{bubbles:true}));}
    if(d.complemento){var cf2=document.querySelector('#Complemento');if(cf2)cf2.value=d.complemento;}
    var bf=document.querySelector('#Bairro');if(bf){bf.value=d.bairro||'0';bf.dispatchEvent(new Event('change',{bubbles:true}));}
    var me=document.querySelector('#MesmoEndereco,#mesmoEndereco');if(me){me.checked=true;me.dispatchEvent(new Event('change',{bubbles:true}));}await delay(500);
    var bs=document.querySelector('.btn-salvar,.modal .btn-primary,[data-action*="Salvar"]');if(bs){bs.click();await delay(1500);}
    try{document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();});}catch(e){}
  }

  async function adicionarContato(tipo,valor){
    var btn=document.querySelector('[data-action*="ContatoPedido/Novo"]');if(!btn)return false;
    btn.click();await delay(1000);try{await waitForElement('#CodigoTipoContato',5000);}catch(e){return false;}
    try{document.querySelector('#CodigoTipoContato').value=tipo;document.querySelector('#CodigoTipoContato').dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}await delay(300);
    var cf=document.querySelector('#Contato');if(cf)await typeSlowly(cf,valor,40);await delay(500);
    var bs=document.querySelector('.btn-salvar-contato,.modal .btn-primary');if(bs){bs.click();await delay(1000);}
    var err=document.querySelector('.validation-summary-errors,.alert-danger,.field-validation-error');
    if(err){var fc=document.querySelector('.modal .close,[data-dismiss="modal"]');if(fc)fc.click();await delay(500);return false;}
    try{document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();});}catch(e){}return true;
  }

  async function preencherGestor(cpf){
    enviarStatus('running','Gestor/socio...',{step:'gestor'});
    var btn=document.querySelector('[data-action*="Gestor/Criar"],[data-action*="GestorPedido/Novo"]');if(!btn){log('Botao gestor nao encontrado','err');return;}
    btn.click();await delay(1500);try{await waitForElement('.modal.show select,.modal.in select',10000);}catch(e){return;}
    document.querySelectorAll('.modal.show select,.modal.in select').forEach(function(s){for(var i=0;i<s.options.length;i++){if(s.options[i].text.toLowerCase().indexOf('socio')!==-1||s.options[i].text.toLowerCase().indexOf('sócio')!==-1){s.value=s.options[i].value;s.dispatchEvent(new Event('change',{bubbles:true}));break;}}});await delay(500);
    var cf=document.querySelector('.modal #Cpf,.modal input[name="Cpf"],.modal input[name="CpfCnpj"]');if(cf){await typeSlowly(cf,cpf,50);cf.dispatchEvent(new Event('blur',{bubbles:true}));}await delay(2000);
    for(var i=0;i<30;i++){var nf=document.querySelector('.modal #Nome,.modal input[name="Nome"]');if(nf&&nf.value&&nf.value.length>2)break;await delay(500);}
    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked),.modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){d.click();});await delay(300);
    var bs=document.querySelector('.modal .btn-salvar,.modal .btn-primary');if(bs){bs.click();await delay(1500);}
    try{document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();});}catch(e){}
  }

  async function preencherRT(){
    enviarStatus('running','RT...',{step:'rt'});
    var cpfRT=gmGet('omega_rt_cpf','')||'07141753664';
    var btn=document.querySelector('[data-action*="ResponsavelTecnico/Criar"]');if(!btn){log('Botao RT nao encontrado','warn');return;}
    btn.click();await delay(1500);try{await waitForElement('.modal #Cpf',10000);}catch(e){return;}
    var cf=document.querySelector('.modal #Cpf');if(cf){await typeSlowly(cf,cpfRT,50);cf.dispatchEvent(new Event('blur',{bubbles:true}));}await delay(2000);
    for(var i=0;i<30;i++){var nf=document.querySelector('.modal #Nome');if(nf&&nf.value&&nf.value.length>2)break;await delay(500);}
    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked),.modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){d.click();});await delay(300);
    var bs=document.querySelector('.modal .btn-salvar,.modal .btn-primary');if(bs){bs.click();await delay(1500);}
    try{document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();});}catch(e){}
  }

  function gerarEmailAleatorio(){var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<12;i++)s+=c[Math.floor(Math.random()*c.length)];return s+'@yahoo.com';}

  // ══════════════════════════════════════════════════════════════
  // FLUXO 1: INCLUSÃO
  // ══════════════════════════════════════════════════════════════

  async function fluxoInclusao(task){
    enviarStatus('running','Inclusao',{step:'inclusao'});
    var transp=(task.transportador||task.credenciais.cpf||'').replace(/\D/g,'');
    var veiculos=task.veiculos||[];

    // Processa veículos sequencialmente
    for(var vi=0;vi<veiculos.length;vi++){
      var v=veiculos[vi];var tipoV=(v.tipo_veiculo||'proprio').toLowerCase();

      if(tipoV==='terceiro'&&v.placa&&v.renavam){
        enviarStatus('running','Terceiro: arrendamento '+v.placa,{step:'desvio'});
        // URL Memory: salva onde estamos
        gmSet('omega_return_url',window.location.href);
        salvarEstado('inclusao_pendente_arrendamento',{transportador:transp,veiculos:veiculos,currentVehicleIndex:vi,credenciais:task.credenciais,arrendamento:{placa:v.placa,renavam:v.renavam,cpf_arrendante:v.cpf_arrendante||'',nome_arrendante:v.nome_arrendante||''}});
        window.location.href='https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';
        return;
      }

      // Próprio ou após arrendamento
      if(!vi){var ok=await navegarGerenciamentoFrota(transp);if(!ok)return;await criarPedidoComResgate(transp);}
      enviarStatus('running','Veiculo '+(vi+1)+'/'+veiculos.length+': '+v.placa,{step:'veiculo_'+(vi+1)});
      await processarInclusaoVeiculo(v.placa,v.renavam);await delay(2000);
    }

    enviarStatus('running','Finalizando...',{step:'finalizar'});
    var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);}
    var btnConf=document.querySelector('.modal .btn-primary,.btn-confirmar');if(btnConf){btnConf.click();await delay(3000);}
    enviarStatus('done','Inclusao concluida!');
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 2: ARRENDAMENTO
  // ══════════════════════════════════════════════════════════════

  async function fluxoArrendamento(task){
    enviarStatus('running','Arrendamento',{step:'arrendamento'});
    var arr=task.arrendamento||task;
    if(location.href.indexOf('ContratoArrendamento/Criar')===-1){salvarEstado('arrendamento',task);window.location.href='https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';return;}
    await delay(2000);
    var cpfArr=(arr.cpf_arrendante||arr.cpf_cnpj_proprietario||'').replace(/\D/g,'');
    var jq=unsafeWindow.jQuery||unsafeWindow.$;
    if(cpfArr){var sel=document.getElementById('CPFCNPJArrendanteTransportador');if(sel&&jq){for(var i=0;i<sel.options.length;i++){if(sel.options[i].value.replace(/\D/g,'')===cpfArr||sel.options[i].text.replace(/\D/g,'')===cpfArr){jq(sel).val(sel.options[i].value).trigger('change');break;}}}}
    var cp=await waitForElement('#Placa',5000);cp.removeAttribute('disabled');await typeSlowly(cp,(arr.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase(),80);await delay(200);
    var cr=document.getElementById('Renavam');if(cr){cr.removeAttribute('disabled');cr.value=arr.renavam||'';cr.dispatchEvent(new Event('change',{bubbles:true}));}await delay(500);
    enviarStatus('running','Verificando...',{step:'arrendamento_verificar'});
    if(jq)jq.ajax({type:'GET',url:'/ContratoArrendamento/verificarVeiculo',cache:false,data:{placa:cp.value.toUpperCase(),renavam:(cr?cr.value:''),cpfCnpjProprietario:document.getElementById('CPFCNPJArrendante').value}});
    await delay(3000);
    var hj=new Date();var di=String(hj.getDate()).padStart(2,'0')+'/'+String(hj.getMonth()+1).padStart(2,'0')+'/'+hj.getFullYear();var fim=new Date(hj);fim.setFullYear(fim.getFullYear()+1);var df=String(fim.getDate()).padStart(2,'0')+'/'+String(fim.getMonth()+1).padStart(2,'0')+'/'+fim.getFullYear();
    if(U){U.injetarData('DataInicio',di);U.injetarData('DataFim',df);}await delay(500);
    var c1=document.getElementById('ExisteContrato'),c2=document.getElementById('InformacoesVerdadeiras');if(c1){c1.checked=true;c1.dispatchEvent(new Event('change',{bubbles:true}));}if(c2){c2.checked=true;c2.dispatchEvent(new Event('change',{bubbles:true}));}await delay(500);
    var cpfArrendatario=(arr.cpf_arrendatario||'').replace(/\D/g,'');
    if(cpfArrendatario){var af=document.getElementById('CPFCNPJArrendatario')||document.querySelector('input[name*="CpfCnpjArrendatario"]');if(af){af.removeAttribute('disabled');af.value=cpfArrendatario;af.dispatchEvent(new Event('change',{bubbles:true}));af.dispatchEvent(new Event('blur',{bubbles:true}));}}await delay(500);
    enviarStatus('running','Salvando...',{step:'arrendamento_salvar'});
    var btnS=document.querySelector('#btnSalvar,.btn-salvarContrato');if(btnS)btnS.click();await delay(3000);
    try{
      await waitForURL('ContratoArrendamento/Index',15000);enviarStatus('done','Arrendamento OK!');log('Arrendamento OK','ok');
      var ep=lerEstado();
      if(ep&&ep.estado==='pendente_arrendamento'){salvarEstado('retorno_cadastro',ep.dados);window.location.href='https://rntrcdigital.antt.gov.br/Transportador/Cadastro';}
      else if(ep&&ep.estado==='inclusao_pendente_arrendamento'){
        // URL Memory: volta pra onde estava
        var returnUrl=gmGet('omega_return_url','')||'https://rntrcdigital.antt.gov.br/Transportador/GerenciarFrota';
        gmSet('omega_return_url','');
        salvarEstado('retorno_inclusao_avulsa',ep.dados);
        window.location.href=returnUrl;
      }
    }catch(e){enviarStatus('error','Arrendamento falhou.');}
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 3: CADASTRO CPF
  // ══════════════════════════════════════════════════════════════

  async function fluxoCadastroCPF(task){
    enviarStatus('running','Cadastro CPF',{step:'cadastro_cpf'});var d=task.transportador||task;
    if(location.href.indexOf('Transportador')===-1){var dd=document.querySelector('#dropdownTransportador,[data-toggle="dropdown"]');if(dd){dd.click();await delay(1500);}var nc=document.querySelector('a[href*="NovoCadastro"],a[href*="Pedido/Criar"]');if(nc){nc.click();await delay(3000);}}
    var cpfLogin=(task.credenciais&&task.credenciais.cpf||'').replace(/\D/g,'');await delay(2000);
    document.querySelectorAll('select').forEach(function(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(cpfLogin)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}}});
    await delay(1500);
    await criarPedidoComResgate(cpfLogin);
    enviarStatus('running','Dados CPF...',{step:'dados_cpf'});
    var idf=document.getElementById('Identidade');if(idf){idf.value=d.identidade||d.cnh||'000000';idf.dispatchEvent(new Event('change',{bubbles:true}));}
    try{document.querySelector('#OrgaoEmissor').value='SSP';document.querySelector('#OrgaoEmissor').dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}
    if(d.uf){try{var uf=document.querySelector('#UfIdentidade');if(uf){uf.value=d.uf.toUpperCase();uf.dispatchEvent(new Event('change',{bubbles:true}));}}catch(e){}}
    await preencherEndereco(d);
    await processarVeiculos(task);
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 4: CADASTRO CNPJ
  // ══════════════════════════════════════════════════════════════

  async function fluxoCadastroCNPJ(task){
    enviarStatus('running','Cadastro CNPJ',{step:'cadastro_cnpj'});var d=task.transportador||task;
    if(location.href.indexOf('Transportador')===-1){var dd=document.querySelector('#dropdownTransportador,[data-toggle="dropdown"]');if(dd){dd.click();await delay(1500);}var nc=document.querySelector('a[href*="NovoCadastro"],a[href*="Pedido/Criar"]');if(nc){nc.click();await delay(3000);}}
    var cnpj=(d.cnpj||(task.cnpj_data&&task.cnpj_data.cnpj)||'').replace(/\D/g,'');await delay(2000);
    document.querySelectorAll('select').forEach(function(sel){for(var i=0;i<sel.options.length;i++){if(sel.options[i].text.replace(/\D/g,'').indexOf(cnpj)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}}});
    await delay(1500);
    await criarPedidoComResgate(cnpj);
    enviarStatus('running','Dados CNPJ...',{step:'dados_cnpj'});
    var cap=document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira');if(cap){cap.checked=true;cap.dispatchEvent(new Event('change',{bubbles:true}));}
    await preencherEndereco(d);
    var tel=d.telefone||'0000000000';await adicionarContato('2',tel);await delay(1500);
    var email=d.email||gerarEmailAleatorio();var eOk=await adicionarContato('4',email);if(!eOk){email=gerarEmailAleatorio();await adicionarContato('4',email);}
    var cpfSocio=d.cpf_socio||(task.cnpj_data&&task.cnpj_data.cpf_socio)||'';
    if(cpfSocio)await preencherGestor(cpfSocio.replace(/\D/g,''));
    // RT usa CPF fixo do .env (nunca muda)
    await preencherRT();
    await processarVeiculos(task);
  }

  // ══════════════════════════════════════════════════════════════
  // VEÍCULOS (loop async for...of com desvio)
  // ══════════════════════════════════════════════════════════════

  async function processarVeiculos(task){
    var veiculos=task.veiculos||[];
    var d=task.transportador||task;

    // Compatibilidade: se não tem array mas tem placa/renavam direto
    if(veiculos.length===0&&d.placa&&d.renavam){
      veiculos=[{tipo_veiculo:d.tipo_veiculo||d.tipoVeiculo||'nao',placa:d.placa,renavam:d.renavam,cpf_arrendante:d.cpf_arrendante||'',nome_arrendante:d.nome_arrendante||''}];
    }

    // Sem veículos
    if(veiculos.length===0||(veiculos.length===1&&(veiculos[0].tipo_veiculo||'nao').toLowerCase()==='nao')){
      enviarStatus('running','Finalizando sem veiculo...',{step:'finalizar'});
      var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);}
      var btnConf=document.querySelector('.modal .btn-primary,.btn-confirmar,.bootbox-accept');if(btnConf){btnConf.click();await delay(2000);}
      enviarStatus('done','Cadastro concluido (sem veiculo)!');
      return;
    }

    // Loop async
    for(var vi=0;vi<veiculos.length;vi++){
      var v=veiculos[vi];var tipoV=(v.tipo_veiculo||'proprio').toLowerCase();
      if(tipoV==='nao')continue;

      gmSet('omega_current_vehicle_index',String(vi));

      if(tipoV==='terceiro'&&v.placa&&v.renavam){
        enviarStatus('running','Terceiro: arrendamento '+v.placa,{step:'desvio'});
        gmSet('omega_return_url',window.location.href);
        salvarEstado('pendente_arrendamento',{transportador:task.transportador||task,veiculos:veiculos,currentVehicleIndex:vi,credenciais:task.credenciais,cnpj_data:task.cnpj_data,arrendamento:{placa:v.placa,renavam:v.renavam,cpf_arrendante:v.cpf_arrendante||'',nome_arrendante:v.nome_arrendante||''}});
        window.location.href='https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';
        return;
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
  // RETOMADA APÓS NAVEGAÇÃO
  // ══════════════════════════════════════════════════════════════

  function verificarEstadoPendente(){
    var estado=lerEstado();if(!estado)return;
    log('Estado: '+estado.estado,'warn');

    if(isGovBr&&estado.estado==='login_govbr'){processarLoginGovBr();return;}

    if(isANTT&&estado.estado==='pendente_arrendamento'&&location.href.indexOf('ContratoArrendamento/Criar')!==-1){
      setTimeout(function(){if(VPS_URL)conectar();setTimeout(function(){currentTask=estado.dados;fluxoArrendamento(estado.dados);},2000);},1000);return;
    }

    if(isANTT&&estado.estado==='inclusao_pendente_arrendamento'&&location.href.indexOf('ContratoArrendamento/Criar')!==-1){
      setTimeout(function(){if(VPS_URL)conectar();setTimeout(function(){currentTask=estado.dados;var arrData=estado.dados.arrendamento||{};arrData.placa=arrData.placa||estado.dados.placa||'';arrData.renavam=arrData.renavam||estado.dados.renavam||'';fluxoArrendamento({modo:'arrendamento',arrendamento:arrData,credenciais:estado.dados.credenciais});},2000);},1000);return;
    }

    if(isANTT&&estado.estado==='arrendamento'&&location.href.indexOf('ContratoArrendamento/Criar')!==-1){
      setTimeout(function(){if(VPS_URL)conectar();setTimeout(function(){currentTask=estado.dados;fluxoArrendamento(estado.dados);},2000);},1000);return;
    }

    if(isANTT&&estado.estado==='retorno_cadastro'){
      setTimeout(function(){if(VPS_URL)conectar();setTimeout(async function(){
        currentTask=estado.dados;limparEstado();enviarStatus('running','Retomando...',{step:'retorno'});await delay(5000);
        var d=estado.dados;var vi=parseInt(gmGet('omega_current_vehicle_index','0'))||0;
        var veiculos=d.veiculos||[];
        if(veiculos[vi]&&veiculos[vi].placa){await processarInclusaoVeiculo(veiculos[vi].placa,veiculos[vi].renavam);await delay(2000);}
        // Continua com os próximos veículos
        for(var j=vi+1;j<veiculos.length;j++){
          var v=veiculos[j];if(!v.placa||(v.tipo_veiculo||'').toLowerCase()==='nao')continue;
          enviarStatus('running','Veiculo '+(j+1)+'/'+veiculos.length,{step:'veiculo_'+(j+1)});
          await processarInclusaoVeiculo(v.placa,v.renavam);await delay(2000);
        }
        var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);}
        enviarStatus('done','Cadastro concluido!');
      },2000);},1000);return;
    }

    if(isANTT&&estado.estado==='retorno_inclusao_avulsa'){
      setTimeout(function(){if(VPS_URL)conectar();setTimeout(async function(){
        currentTask=estado.dados;limparEstado();enviarStatus('running','Retomando inclusao...',{step:'retorno'});
        var d=estado.dados;var transp=(d.transportador||'').replace(/\D/g,'');var vi=parseInt(gmGet('omega_current_vehicle_index','0'))||0;
        var veiculos=d.veiculos||[];
        var ok=await navegarGerenciamentoFrota(transp);if(!ok)return;
        await criarPedidoComResgate(transp);
        for(var j=vi;j<veiculos.length;j++){
          if(!veiculos[j].placa)continue;
          enviarStatus('running','Veiculo '+(j+1)+'/'+veiculos.length,{step:'veiculo_'+(j+1)});
          await processarInclusaoVeiculo(veiculos[j].placa,veiculos[j].renavam);await delay(2000);
        }
        var btnFin=document.querySelector('#btnFinalizar,[data-action*="Finalizar"]');if(btnFin){btnFin.click();await delay(3000);}
        enviarStatus('done','Inclusao concluida!');
      },2000);},1000);return;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════

  // Auto-connect na ANTT E no Gov.br se tem URL salva
  if(VPS_URL&&!paused)setTimeout(function(){conectar();},2000);
  setTimeout(verificarEstadoPendente,3000);
  if(isANTT&&U&&U.restaurarAbaSalva)setTimeout(function(){U.restaurarAbaSalva();},500);
  console.log('[BRIDGE] v5.1 Sunshine — '+(isGovBr?'Gov.br':'ANTT')+(VPS_URL?' — auto-connect':' — sem config'));
})();
