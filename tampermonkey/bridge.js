// bridge.js — Final Omega v4.0: Autonomia total
// Login Gov.br, MFA skip, OAuth, anti-hibernação, 4 fluxos, máquina de estados
(function(){
  // ══════════════════════════════════════════════════════════════
  // DETECÇÃO DE DOMÍNIO — só carrega UI na ANTT, login roda em ambos
  // ══════════════════════════════════════════════════════════════
  var isANTT = location.hostname.indexOf('rntrcdigital.antt.gov.br') !== -1;
  var isGovBr = location.hostname.indexOf('acesso.gov.br') !== -1;

  // Core/Utils pode não existir no Gov.br (não injeta UI lá)
  var U = window.OmegaUtils || null;

  function gmGet(k,d){ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : ''; }
  function gmSet(k,v){ try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); }catch(e){} }

  // ══════════════════════════════════════════════════════════════
  // FUNÇÕES CORE DE ESPERA DINÂMICA (Promises)
  // ══════════════════════════════════════════════════════════════

  function waitForElement(selector, timeout) {
    timeout = timeout || 30000;
    return new Promise(function(resolve, reject) {
      var el = document.querySelector(selector);
      if (el) return resolve(el);
      var obs = new MutationObserver(function() {
        var el = document.querySelector(selector);
        if (el) { obs.disconnect(); clearTimeout(timer); resolve(el); }
      });
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      var timer = setTimeout(function() { obs.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
  }

  function waitUntilEnabled(selector, timeout) {
    timeout = timeout || 60000;
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('Timeout enabled: ' + selector)); }, timeout);
      function check() {
        var el = document.querySelector(selector);
        if (el && !el.disabled && !el.getAttribute('disabled')) { clearTimeout(timer); resolve(el); return; }
        setTimeout(check, 500);
      }
      check();
    });
  }

  function waitForURL(substring, timeout) {
    timeout = timeout || 60000;
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('Timeout URL: ' + substring)); }, timeout);
      function check() {
        if (location.href.indexOf(substring) !== -1) { clearTimeout(timer); resolve(); return; }
        setTimeout(check, 500);
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
        if (i >= text.length) {
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
          el.dispatchEvent(new Event('blur', {bubbles:true}));
          return resolve();
        }
        el.value = text.substring(0, i + 1);
        el.dispatchEvent(new Event('input', {bubbles:true}));
        i++; setTimeout(next, ms);
      }
      next();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // MÁQUINA DE ESTADOS (persiste entre navegações)
  // ══════════════════════════════════════════════════════════════

  function salvarEstado(nome, dados) {
    gmSet('omega_state', JSON.stringify({ estado: nome, dados: dados, ts: Date.now() }));
    log('Estado salvo: ' + nome, 'ok');
  }

  function lerEstado() {
    try {
      var raw = gmGet('omega_state', '');
      if (!raw) return null;
      var s = JSON.parse(raw);
      // Expira em 15 min
      if (Date.now() - s.ts > 15 * 60 * 1000) { limparEstado(); return null; }
      return s;
    } catch(e) { return null; }
  }

  function limparEstado() { gmSet('omega_state', ''); }

  // ══════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO E VARIÁVEIS
  // ══════════════════════════════════════════════════════════════

  var VPS_URL     = gmGet('omega_vps_url', '');
  var VPS_TOKEN   = gmGet('omega_vps_token', '');
  var DEVICE_NAME = gmGet('omega_device_name', '');
  var DEVICE_ID   = gmGet('omega_device_id', '');

  var ws = null, connected = false, paused = false, currentTask = null;
  var reconnectTimer = null, reconnectDelay = 5000;
  var RECONNECT_MAX = 60000, RECONNECT_BASE = 5000;
  var errorCount = 0, ERROR_THRESHOLD = 5, lastErrorTime = 0, ERROR_WINDOW = 30000;
  var logs = [], MAX_LOGS = 15;
  var wakeLockSentinel = null;

  function resetBackoff() { reconnectDelay = RECONNECT_BASE; }
  function nextBackoff() { reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX); }

  // ══════════════════════════════════════════════════════════════
  // LOGGING
  // ══════════════════════════════════════════════════════════════

  function log(msg, tipo) {
    var now = new Date();
    var ts = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
    logs.push({ ts: ts, msg: msg, tipo: tipo || 'ok' });
    if (logs.length > MAX_LOGS) logs.shift();
    console.log('[BRIDGE ' + ts + '] ' + msg);
    renderLogs();
  }

  function renderLogs() {
    if (!isANTT) return;
    var el = document.getElementById('omega-bridge-log');
    if (!el) return;
    el.innerHTML = logs.map(function(l) {
      var cls = l.tipo === 'err' ? 'om-log-err' : l.tipo === 'warn' ? 'om-log-warn' : 'om-log-ok';
      return '<span style="color:#555e70">' + l.ts + '</span> <span class="' + cls + '">' + l.msg + '</span>';
    }).join('<br>');
    el.scrollTop = el.scrollHeight;
  }

  // ══════════════════════════════════════════════════════════════
  // ANTI-HIBERNAÇÃO (Wake Lock + visibilitychange)
  // ══════════════════════════════════════════════════════════════

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        log('Wake lock ativado', 'ok');
      }
    } catch(e) { /* Não suportado ou negado */ }
  }

  function releaseWakeLock() {
    if (wakeLockSentinel) { try { wakeLockSentinel.release(); } catch(e){} wakeLockSentinel = null; }
  }

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      // Aba voltou ao foco — reconecta se caiu
      if (VPS_URL && !connected && !paused) {
        log('Aba focada — reconectando', 'warn');
        conectar();
      }
      if (currentTask) requestWakeLock();
    }
  });

  // ══════════════════════════════════════════════════════════════
  // ABA BRIDGE (só na ANTT)
  // ══════════════════════════════════════════════════════════════

  if (isANTT && U) {
    U.registrarAba('bridge', 'Bridge', ''
      +'<div class="om-section-title">Conexao VPS</div>'
      +'<div class="om-mb-sm"><label class="om-label">URL</label><input id="omega-bridge-url" class="om-input" placeholder="wss://omhk.com.br/ws"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm">'
        +'<div><label class="om-label">Token</label><input id="omega-bridge-token" class="om-input" type="password" placeholder="Senha"></div>'
        +'<div><label class="om-label">Nome</label><input id="omega-bridge-name" class="om-input" placeholder="Celular"></div>'
      +'</div>'
      +'<div class="om-grid om-grid-3 om-mb">'
        +'<button type="button" id="omega-bridge-connect" class="om-btn om-btn-green om-btn-sm">Conectar</button>'
        +'<button type="button" id="omega-bridge-pause" class="om-btn om-btn-amber om-btn-sm" style="display:none">Pausar</button>'
        +'<button type="button" id="omega-bridge-disconnect" class="om-btn om-btn-coral om-btn-sm" style="display:none">Desconectar</button>'
      +'</div>'
      +'<div id="omega-bridge-status"></div>'
      +'<div id="omega-bridge-task" style="margin-top:6px"></div>'
      +'<div class="om-section-title" style="margin-top:10px">Log</div>'
      +'<div id="omega-bridge-log" class="om-log"></div>'
    , function(){
      var urlEl = document.getElementById('omega-bridge-url');
      var tokenEl = document.getElementById('omega-bridge-token');
      var nameEl = document.getElementById('omega-bridge-name');
      if(urlEl && VPS_URL) urlEl.value = VPS_URL;
      if(tokenEl && VPS_TOKEN) tokenEl.value = VPS_TOKEN;
      if(nameEl && DEVICE_NAME) nameEl.value = DEVICE_NAME;
      atualizarUI();
      renderLogs();
    });

    document.getElementById('omega-bridge-connect').addEventListener('click', function(e){
      e.preventDefault();
      VPS_URL = document.getElementById('omega-bridge-url').value.trim();
      VPS_TOKEN = document.getElementById('omega-bridge-token').value.trim();
      DEVICE_NAME = document.getElementById('omega-bridge-name').value.trim() || 'Dispositivo';
      if(!VPS_URL) return U.box(document.getElementById('omega-bridge-status'), false, 'URL vazia.');
      gmSet('omega_vps_url', VPS_URL); gmSet('omega_vps_token', VPS_TOKEN); gmSet('omega_device_name', DEVICE_NAME);
      paused = false; errorCount = 0; resetBackoff(); conectar();
    });

    document.getElementById('omega-bridge-pause').addEventListener('click', function(e){
      e.preventDefault();
      if(paused) { paused = false; errorCount = 0; resetBackoff(); log('Retomado', 'ok'); conectar(); }
      else pausarConexao('Pausado manualmente');
    });

    document.getElementById('omega-bridge-disconnect').addEventListener('click', function(e){
      e.preventDefault(); desconectar(true);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // WEBSOCKET
  // ══════════════════════════════════════════════════════════════

  function pausarConexao(motivo) {
    paused = true;
    if(reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if(ws) { try{ws.close();}catch(e){} ws=null; }
    connected = false; releaseWakeLock(); atualizarUI();
    log(motivo || 'Pausado', 'warn');
    if(U) { U.box(document.getElementById('omega-bridge-status'), false, '⏸ ' + (motivo||'Pausado')); U.toast('Bridge pausado', false); }
  }

  function registrarErro(msg) {
    var agora = Date.now();
    errorCount = (agora - lastErrorTime < ERROR_WINDOW) ? errorCount + 1 : 1;
    lastErrorTime = agora;
    log(msg, 'err');
    if(errorCount >= ERROR_THRESHOLD) { pausarConexao('Auto-pause: flood detectado'); errorCount = 0; }
  }

  function conectar(){
    if(paused || !VPS_URL) return;
    if(ws) { try{ws.close();}catch(e){} ws=null; }
    log('Conectando...', 'ok');

    var fullUrl = VPS_URL + (VPS_TOKEN ? ((VPS_URL.indexOf('?')===-1?'?':'&') + 'token=' + encodeURIComponent(VPS_TOKEN)) : '');
    try { ws = new WebSocket(fullUrl); } catch(e) { log('URL invalida: ' + e.message, 'err'); return; }

    ws.onopen = function(){
      connected = true; resetBackoff(); errorCount = 0;
      if(!DEVICE_ID) { DEVICE_ID = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,4); gmSet('omega_device_id', DEVICE_ID); }
      ws.send(JSON.stringify({ type: 'register', deviceId: DEVICE_ID, name: DEVICE_NAME }));
      log('Conectado', 'ok'); atualizarUI();
      if(U) { U.box(document.getElementById('omega-bridge-status'), true, 'Conectado!'); U.toast('Bridge conectado', true); }
      var fab = document.getElementById('omega-fab'); if(fab) fab.classList.add('om-fab-connected');
    };

    ws.onmessage = function(evt){
      var msg; try { msg = JSON.parse(evt.data); } catch { return; }
      if(msg.type === 'registered') { DEVICE_ID = msg.deviceId; gmSet('omega_device_id', DEVICE_ID); log('Registrado: ' + DEVICE_ID, 'ok'); }
      if(msg.type === 'task') receberTarefa(msg);
      if(msg.type === 'stop') pararTarefa();
    };

    ws.onclose = function(evt){
      connected = false; atualizarUI();
      var fab = document.getElementById('omega-fab'); if(fab) fab.classList.remove('om-fab-connected');
      if(evt.code === 4001) { log('Token incorreto', 'err'); return; }
      if(!paused && VPS_URL) {
        var secs = Math.round(reconnectDelay / 1000);
        log('Retry em ' + secs + 's', 'warn');
        reconnectTimer = setTimeout(function(){ nextBackoff(); conectar(); }, reconnectDelay);
      }
    };
    ws.onerror = function(){ log('Erro WS', 'err'); };
  }

  function desconectar(intencional){
    paused = false;
    if(reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if(intencional) { VPS_URL = ''; gmSet('omega_vps_url', ''); }
    if(ws) { try{ws.close();}catch(e){} ws=null; }
    connected = false; releaseWakeLock(); atualizarUI();
    if(U) U.clearBox(document.getElementById('omega-bridge-status'));
    log('Desconectado', 'warn');
  }

  function enviarStatus(status, message, extra){
    if(!ws || ws.readyState !== 1) return;
    var payload = { type: 'status', status: status, message: message || '' };
    if(extra) for(var k in extra) payload[k] = extra[k];
    try { ws.send(JSON.stringify(payload)); } catch(e){}

    if(U) {
      var painel = document.getElementById('antt-helper');
      if(painel && painel.classList.contains('om-hidden')) U.toast(message || status, status !== 'error' && status !== 'error_critical');
    }
    if(status === 'error' || status === 'error_critical') registrarErro(message || 'Erro');
    else errorCount = 0;
    log(message || status, (status === 'error' || status === 'error_critical') ? 'err' : 'ok');
  }

  function atualizarUI(){
    if(!isANTT) return;
    var btnC = document.getElementById('omega-bridge-connect');
    var btnP = document.getElementById('omega-bridge-pause');
    var btnD = document.getElementById('omega-bridge-disconnect');
    if(!btnC) return;
    if(connected) { btnC.style.display='none'; btnP.style.display='block'; btnP.textContent='Pausar'; btnP.className='om-btn om-btn-amber om-btn-sm'; btnD.style.display='block'; }
    else if(paused) { btnC.style.display='none'; btnP.style.display='block'; btnP.textContent='Continuar'; btnP.className='om-btn om-btn-green om-btn-sm'; btnD.style.display='block'; }
    else { btnC.style.display='block'; btnP.style.display='none'; btnD.style.display=VPS_URL?'block':'none'; }
  }

  // ══════════════════════════════════════════════════════════════
  // LOGIN GOV.BR (roda no domínio sso.acesso.gov.br)
  // ══════════════════════════════════════════════════════════════

  async function processarLoginGovBr() {
    var estado = lerEstado();
    if (!estado || estado.estado !== 'login_govbr') return;
    var cred = estado.dados.credenciais || {};
    if (!cred.cpf || !cred.senha) return;

    log('Gov.br detectado — iniciando login...', 'ok');

    try {
      // Campo CPF
      var cpfField = await waitForElement('#accountId', 15000);
      await typeSlowly(cpfField, cred.cpf.replace(/\D/g, ''), 60);
      await delay(500);

      // Botão continuar
      var btnContinuar = await waitForElement('#enter-account-id', 5000);
      btnContinuar.click();
      log('CPF enviado, aguardando...', 'ok');

      // Aguarda: tela de senha OU hCaptcha OU redirecionamento
      await delay(3000);

      // Tenta campo de senha
      try {
        var senhaField = await waitForElement('input#password[type="password"]', 20000);
        await delay(1000);
        await typeSlowly(senhaField, cred.senha, 50);
        await delay(300);

        var btnEntrar = await waitForElement('#submit-button', 3000);
        btnEntrar.click();
        log('Senha enviada', 'ok');
        await delay(3000);
      } catch(e) {
        log('Campo senha nao encontrado: ' + e.message, 'warn');
        // Pode ser hCaptcha — salva estado e espera resolução manual
        salvarEstado('aguardando_captcha', estado.dados);
        enviarStatus('error', 'hCaptcha detectado. Resolva manualmente.');
        return;
      }

      // ── MFA Skip ──
      try {
        var mfaScreen = await waitForElement('.login-mandatory-mfa-acquiring', 5000);
        if (mfaScreen) {
          log('MFA detectado — aguardando botao Pular...', 'warn');
          var btnSkip = await waitUntilEnabled('button[value="confirm-skip-mandatory-mfa"]', 120000);
          btnSkip.click();
          await delay(1000);

          // Modal de confirmação
          try {
            var checkbox = await waitForElement('#confirmSkipMandatoryMfaCheckBox', 5000);
            checkbox.checked = true; checkbox.click(); checkbox.dispatchEvent(new Event('change', {bubbles:true}));
            await delay(500);
            var btnConfirm = await waitForElement('#confirmSkipMandatoryMfaButton', 3000);
            btnConfirm.click();
            log('MFA pulado', 'ok');
            await delay(2000);
          } catch(e) { log('Modal MFA: ' + e.message, 'warn'); }
        }
      } catch(e) { /* Sem MFA — normal */ }

      // ── OAuth Autorizar ──
      try {
        var authScreen = await waitForElement('#authorize-info', 5000);
        if (authScreen) {
          log('OAuth — autorizando...', 'ok');
          var btnAuth = await waitForElement('button[name="user_oauth_approval"][value="true"]', 5000);
          btnAuth.click();
          await delay(3000);
        }
      } catch(e) { /* Sem OAuth */ }

      log('Login Gov.br concluido — aguardando redirecionamento', 'ok');

    } catch(e) {
      log('Erro login: ' + e.message, 'err');
      enviarStatus('error', 'Erro no login Gov.br: ' + e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // MÓDULO: INCLUSÃO DE VEÍCULO (reutilizado por todos os fluxos)
  // ══════════════════════════════════════════════════════════════

  async function processarInclusaoVeiculo(placa, renavam) {
    log('Incluindo veiculo: ' + placa, 'ok');
    enviarStatus('running', 'Incluindo veiculo ' + placa, {step:'veiculo'});

    // Abre modal de veículo
    var btnNovo = document.querySelector('[data-action*="VeiculoPedido/Novo"], [data-action*="Veiculo/Novo"]');
    if (!btnNovo) throw new Error('Botao adicionar veiculo nao encontrado');
    btnNovo.click();

    // Aguarda modal abrir
    await waitForElement('#Placa', 10000);
    await delay(500);

    // Preenche placa char a char
    var campoPlaca = document.getElementById('Placa');
    campoPlaca.removeAttribute('disabled');
    await typeSlowly(campoPlaca, placa.replace(/[^A-Z0-9]/gi, '').toUpperCase(), 80);
    await delay(200);

    // Preenche renavam
    var campoRenavam = document.getElementById('Renavam');
    campoRenavam.removeAttribute('disabled');
    campoRenavam.value = renavam;
    campoRenavam.dispatchEvent(new Event('input', {bubbles:true}));
    campoRenavam.dispatchEvent(new Event('change', {bubbles:true}));
    await delay(500);

    // Clica verificar
    try {
      var btnVerificar = await waitForElement('#verificar, #btnBuscarVeiculo', 5000);
      btnVerificar.click();
      log('Verificando placa...', 'ok');
    } catch(e) {
      // Tenta AJAX direto como fallback
      var jqR = unsafeWindow.jQuery || unsafeWindow.$;
      if (jqR) { jqR.ajax({ type:'GET', url:'/Veiculo/BuscarVeiculo', cache:false, data:{placa:placa,renavam:renavam} }); }
    }

    // Aguarda resposta — pode ser: Chassi (sucesso), bootbox (transferência), ou exclusão
    await delay(3000);

    // Lida com alertas dinâmicos
    try {
      // Bootbox de confirmação de transferência
      var bbBtn = document.querySelector('.bootbox-confirm button[data-bb-handler="confirm"]');
      if (bbBtn && bbBtn.offsetParent !== null) {
        log('Confirmando transferencia...', 'ok');
        bbBtn.click();
        await delay(2000);
      }

      // Botão de exclusão
      var exBtn = document.querySelector('.btn-confirmar-exclusao');
      if (exBtn && exBtn.offsetParent !== null) {
        exBtn.click();
        await delay(1500);
        var incBtn = document.querySelector('.btn-confirmar-inclusao');
        if (incBtn) { incBtn.click(); await delay(1500); }
      }
    } catch(e) { log('Alert handling: ' + e.message, 'warn'); }

    // Preenche Tara se vazio
    try {
      var tara = await waitForElement('#Tara', 5000);
      if (!tara.value || tara.value === '') {
        tara.removeAttribute('disabled');
        tara.value = '2';
        tara.dispatchEvent(new Event('input', {bubbles:true}));
        tara.dispatchEvent(new Event('change', {bubbles:true}));
      }
    } catch(e) { /* Tara já preenchida */ }

    // Salvar veículo
    await delay(1000);
    var btnSalvar = document.querySelector('.btn-salvar-veiculo, .btn-confirmar-inclusao');
    if (btnSalvar) {
      btnSalvar.removeAttribute('disabled');
      btnSalvar.click();
      log('Veiculo salvo: ' + placa, 'ok');
      enviarStatus('running', 'Veiculo salvo: ' + placa, {step:'veiculo_ok'});
    } else {
      throw new Error('Botao salvar veiculo nao encontrado');
    }

    // Mata toasts do portal
    await delay(1500);
    try { document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();}); } catch(e){}
  }

  // ══════════════════════════════════════════════════════════════
  // RECEBER E DESPACHAR TAREFAS
  // ══════════════════════════════════════════════════════════════

  function receberTarefa(msg){
    currentTask = msg;
    requestWakeLock();
    enviarStatus('running', 'Tarefa: ' + msg.modo);
    if(U) U.box(document.getElementById('omega-bridge-task'), true, 'Tarefa: <b>' + (msg.modo || '?') + '</b>');

    // Se precisa login, salva estado e navega
    if (msg.credenciais && msg.credenciais.cpf && msg.credenciais.senha) {
      salvarEstado('login_govbr', msg);
      if (isANTT) {
        // Navega pro portal (vai redirecionar pro Gov.br)
        window.location.href = 'https://rntrcdigital.antt.gov.br/';
        return;
      }
      // Já está no Gov.br
      processarLoginGovBr();
      return;
    }

    // Sem credenciais = já logado, executa direto
    executarFluxo(msg);
  }

  async function executarFluxo(task) {
    try {
      switch(task.modo) {
        case 'cadcpf':       await fluxoCadastroCPF(task); break;
        case 'cadcnpj':      await fluxoCadastroCNPJ(task); break;
        case 'inclusao':     await fluxoInclusao(task); break;
        case 'arrendamento': await fluxoArrendamento(task); break;
        // Compatibilidade v3
        case 'cadastro':     if(task.tipo==='cnpj') await fluxoCadastroCNPJ(task); else await fluxoCadastroCPF(task); break;
        case 'arrendamento_avulso': await fluxoArrendamento(task); break;
        case 'inclusao_avulsa': await fluxoInclusao(task); break;
        default: enviarStatus('error', 'Modo desconhecido: ' + task.modo);
      }
    } catch(e) {
      enviarStatus('error_critical', 'Erro fatal: ' + e.message);
      log('FATAL: ' + e.message, 'err');
    } finally {
      currentTask = null;
      releaseWakeLock();
      limparEstado();
    }
  }

  function pararTarefa(){
    currentTask = null; releaseWakeLock(); limparEstado();
    if(U) U.box(document.getElementById('omega-bridge-task'), false, 'Cancelada.');
    enviarStatus('idle', 'Cancelada');
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 1: INCLUSÃO AVULSA
  // ══════════════════════════════════════════════════════════════

  async function fluxoInclusao(task) {
    enviarStatus('running', 'Inclusao avulsa', {step:'inclusao'});
    var transp = (task.transportador || task.credenciais.cpf || '').replace(/\D/g, '');

    // Navega pra gerenciamento de frota se necessário
    if (location.href.indexOf('Transportador') === -1 && location.href.indexOf('GerenciamentoFrota') === -1) {
      // Abre dropdown transportador
      var dd = document.querySelector('#dropdownTransportador, [data-toggle="dropdown"]');
      if(dd) { dd.click(); await delay(1500); }
      var gf = document.querySelector('a[href*="GerenciamentoFrota"], a[href*="Movimentacao"]');
      if(gf) { gf.click(); await delay(3000); }
    }

    // Seleciona transportador no dropdown
    enviarStatus('running', 'Selecionando transportador...', {step:'dropdown'});
    await delay(2000);
    var found = false;
    document.querySelectorAll('select').forEach(function(sel) {
      for(var i=0;i<sel.options.length;i++) {
        if(sel.options[i].text.replace(/\D/g,'').indexOf(transp) !== -1 || sel.options[i].value.replace(/\D/g,'').indexOf(transp) !== -1) {
          sel.value = sel.options[i].value;
          sel.dispatchEvent(new Event('change', {bubbles:true}));
          found = true; break;
        }
      }
    });
    if(!found) { enviarStatus('error', 'Transportador nao encontrado: ' + transp); return; }
    await delay(2000);

    // Criar pedido
    var btnCriar = document.querySelector('#btnCriarPedido, [data-action*="Criar"], button[type="submit"]');
    if(btnCriar) { btnCriar.click(); await delay(3000); }

    // Incluir veículos
    var veiculos = task.veiculos || [];
    if(task.placa && task.renavam) veiculos.push({placa:task.placa, renavam:task.renavam});

    for(var i=0; i<veiculos.length; i++) {
      enviarStatus('running', 'Veiculo ' + (i+1) + '/' + veiculos.length, {step:'veiculo_'+(i+1)});
      await processarInclusaoVeiculo(veiculos[i].placa, veiculos[i].renavam);
      await delay(2000);
    }

    // Finalizar
    enviarStatus('running', 'Finalizando...', {step:'finalizar'});
    var btnFin = document.querySelector('#btnFinalizar, [data-action*="Finalizar"]');
    if(btnFin) { btnFin.click(); await delay(3000); }
    var btnConfFin = document.querySelector('.modal .btn-primary, .btn-confirmar');
    if(btnConfFin) { btnConfFin.click(); await delay(3000); }

    enviarStatus('done', 'Inclusao concluida!');
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 2: ARRENDAMENTO AVULSO
  // ══════════════════════════════════════════════════════════════

  async function fluxoArrendamento(task) {
    enviarStatus('running', 'Arrendamento', {step:'arrendamento'});
    var arr = task.arrendamento || task;

    // Navega se necessário
    if(location.href.indexOf('ContratoArrendamento/Criar') === -1) {
      salvarEstado('arrendamento', task);
      window.location.href = 'https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';
      return;
    }

    await delay(2000);

    // Preenche CPF/Nome arrendante via substituição
    var cpfArrante = (arr.cpf_arrendante || arr.cpf_cnpj_proprietario || '').replace(/\D/g, '');
    var nomeArrante = (arr.nome_arrendante || arr.nome_proprietario || '').toUpperCase();

    // Substituição direta no DOM (mesma lógica do arrendamento.js)
    var jqR = unsafeWindow.jQuery || unsafeWindow.$;
    if(cpfArrante) {
      var sel = document.getElementById('CPFCNPJArrendanteTransportador');
      if(sel && jqR) {
        for(var i=0;i<sel.options.length;i++) {
          if(sel.options[i].value.replace(/\D/g,'') === cpfArrante || sel.options[i].text.replace(/\D/g,'') === cpfArrante) {
            jqR(sel).val(sel.options[i].value).trigger('change'); break;
          }
        }
      }
    }

    // Placa e Renavam
    var campoPlaca = await waitForElement('#Placa', 5000);
    campoPlaca.removeAttribute('disabled');
    await typeSlowly(campoPlaca, (arr.placa || '').replace(/[^A-Z0-9]/gi,'').toUpperCase(), 80);
    await delay(200);

    var campoRenavam = document.getElementById('Renavam');
    if(campoRenavam) { campoRenavam.removeAttribute('disabled'); campoRenavam.value = arr.renavam || ''; campoRenavam.dispatchEvent(new Event('change',{bubbles:true})); }
    await delay(500);

    // Verificar
    enviarStatus('running', 'Verificando veiculo...', {step:'arrendamento_verificar'});
    if(jqR) {
      jqR.ajax({ type:'GET', url:'/ContratoArrendamento/verificarVeiculo', cache:false,
        data:{ placa:campoPlaca.value.toUpperCase(), renavam:(campoRenavam?campoRenavam.value:''), cpfCnpjProprietario:document.getElementById('CPFCNPJArrendante').value }
      });
    }
    await delay(3000);

    // Datas (hoje + 1 ano)
    enviarStatus('running', 'Preenchendo datas...', {step:'arrendamento_datas'});
    var hj = new Date();
    var di = String(hj.getDate()).padStart(2,'0')+'/'+String(hj.getMonth()+1).padStart(2,'0')+'/'+hj.getFullYear();
    var fim = new Date(hj); fim.setFullYear(fim.getFullYear()+1);
    var df = String(fim.getDate()).padStart(2,'0')+'/'+String(fim.getMonth()+1).padStart(2,'0')+'/'+fim.getFullYear();

    if(U) { U.injetarData('DataInicio', di); U.injetarData('DataFim', df); }
    await delay(500);

    // Declarações
    var c1 = document.getElementById('ExisteContrato');
    var c2 = document.getElementById('InformacoesVerdadeiras');
    if(c1) { c1.checked = true; c1.dispatchEvent(new Event('change',{bubbles:true})); }
    if(c2) { c2.checked = true; c2.dispatchEvent(new Event('change',{bubbles:true})); }
    await delay(500);

    // Arrendatário
    var cpfArrendatario = (arr.cpf_arrendatario || '').replace(/\D/g, '');
    if(cpfArrendatario) {
      var arrField = document.getElementById('CPFCNPJArrendatario') || document.querySelector('input[name*="CpfCnpjArrendatario"]');
      if(arrField) { arrField.removeAttribute('disabled'); arrField.value = cpfArrendatario; arrField.dispatchEvent(new Event('change',{bubbles:true})); arrField.dispatchEvent(new Event('blur',{bubbles:true})); }
    }
    await delay(500);

    // Salvar
    enviarStatus('running', 'Salvando contrato...', {step:'arrendamento_salvar'});
    var btnSalvar = document.querySelector('#btnSalvar, .btn-salvarContrato');
    if(btnSalvar) { btnSalvar.click(); }
    await delay(3000);

    // Critério de sucesso: redirecionamento
    try {
      await waitForURL('ContratoArrendamento/Index', 15000);
      enviarStatus('done', 'Arrendamento concluido!');
      log('Arrendamento OK — redirecionado', 'ok');

      // Se veio de um cadastro (desvio), restaura
      var estadoPendente = lerEstado();
      if(estadoPendente && estadoPendente.estado === 'pendente_arrendamento') {
        log('Retornando ao cadastro...', 'ok');
        salvarEstado('retorno_cadastro', estadoPendente.dados);
        window.location.href = 'https://rntrcdigital.antt.gov.br/Transportador/Cadastro';
      }
    } catch(e) {
      enviarStatus('error', 'Arrendamento pode ter falhado — nao redirecionou.');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 3: CADASTRO CPF
  // ══════════════════════════════════════════════════════════════

  async function fluxoCadastroCPF(task) {
    enviarStatus('running', 'Cadastro CPF', {step:'cadastro_cpf'});
    var d = task.transportador || task;

    // Navega pro novo cadastro se necessário
    if(location.href.indexOf('Transportador') === -1) {
      var dd = document.querySelector('#dropdownTransportador, [data-toggle="dropdown"]');
      if(dd) { dd.click(); await delay(1500); }
      var nc = document.querySelector('a[href*="NovoCadastro"], a[href*="Pedido/Criar"]');
      if(nc) { nc.click(); await delay(3000); }
    }

    // Seleciona CPF no dropdown
    var cpfLogin = (task.credenciais && task.credenciais.cpf || '').replace(/\D/g, '');
    await delay(2000);
    document.querySelectorAll('select').forEach(function(sel){
      for(var i=0;i<sel.options.length;i++){
        if(sel.options[i].text.replace(/\D/g,'').indexOf(cpfLogin)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}
      }
    });
    await delay(1500);

    // Criar pedido
    var btnCriar = document.querySelector('#btnCriarPedido, [data-action*="Criar"], button[type="submit"]');
    if(btnCriar) { btnCriar.click(); await delay(3000); }

    // Preenche identidade
    enviarStatus('running', 'Preenchendo dados CPF...', {step:'dados_cpf'});
    var identField = document.getElementById('Identidade');
    if(identField) { identField.value = d.identidade || d.cnh || '000000'; identField.dispatchEvent(new Event('change',{bubbles:true})); }

    // Órgão emissor
    try { document.querySelector('#OrgaoEmissor').value = 'SSP'; document.querySelector('#OrgaoEmissor').dispatchEvent(new Event('change',{bubbles:true})); } catch(e){}

    // UF
    if(d.uf) {
      try { var ufSel = document.querySelector('#UfIdentidade'); if(ufSel) { ufSel.value = d.uf.toUpperCase(); ufSel.dispatchEvent(new Event('change',{bubbles:true})); } } catch(e){}
    }

    // Endereço (via modal)
    await preencherEndereco(d);

    // Veículos
    var tipoVeiculo = (d.tipo_veiculo || d.tipoVeiculo || 'nao').toLowerCase();
    if(tipoVeiculo === 'nao' || tipoVeiculo === 'não') {
      // Finalizar sem veículo
      enviarStatus('running', 'Finalizando sem veiculo...', {step:'finalizar'});
      var btnFin = document.querySelector('#btnFinalizar, [data-action*="Finalizar"]');
      if(btnFin) { btnFin.click(); await delay(3000); }
      // Popup "sem automotor"
      var btnConf = document.querySelector('.modal .btn-primary, .btn-confirmar, .bootbox-accept');
      if(btnConf) { btnConf.click(); await delay(2000); }
      enviarStatus('done', 'Cadastro CPF concluido (sem veiculo)!');

    } else if(tipoVeiculo === 'proprio') {
      await processarInclusaoVeiculo(d.placa, d.renavam);
      // Finalizar
      var btnFin2 = document.querySelector('#btnFinalizar, [data-action*="Finalizar"]');
      if(btnFin2) { btnFin2.click(); await delay(3000); }
      enviarStatus('done', 'Cadastro CPF concluido (proprio)!');

    } else if(tipoVeiculo === 'terceiro') {
      // Desvio complexo: salva estado → arrendamento → volta
      enviarStatus('running', 'Desvio: arrendamento necessario', {step:'desvio_arrendamento'});
      salvarEstado('pendente_arrendamento', task);
      window.location.href = 'https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';
      // O fluxo continua após o arrendamento redirecionar de volta
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FLUXO 4: CADASTRO CNPJ
  // ══════════════════════════════════════════════════════════════

  async function fluxoCadastroCNPJ(task) {
    enviarStatus('running', 'Cadastro CNPJ', {step:'cadastro_cnpj'});
    var d = task.transportador || task;

    // Navega
    if(location.href.indexOf('Transportador') === -1) {
      var dd = document.querySelector('#dropdownTransportador, [data-toggle="dropdown"]');
      if(dd) { dd.click(); await delay(1500); }
      var nc = document.querySelector('a[href*="NovoCadastro"], a[href*="Pedido/Criar"]');
      if(nc) { nc.click(); await delay(3000); }
    }

    // Seleciona CNPJ
    var cnpj = (d.cnpj || (task.cnpj_data && task.cnpj_data.cnpj) || '').replace(/\D/g, '');
    await delay(2000);
    document.querySelectorAll('select').forEach(function(sel){
      for(var i=0;i<sel.options.length;i++){
        if(sel.options[i].text.replace(/\D/g,'').indexOf(cnpj)!==-1){sel.value=sel.options[i].value;sel.dispatchEvent(new Event('change',{bubbles:true}));break;}
      }
    });
    await delay(1500);

    var btnCriar = document.querySelector('#btnCriarPedido, [data-action*="Criar"], button[type="submit"]');
    if(btnCriar) { btnCriar.click(); await delay(3000); }

    // Capacidade financeira
    enviarStatus('running', 'Preenchendo dados CNPJ...', {step:'dados_cnpj'});
    var capFin = document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira');
    if(capFin) { capFin.checked = true; capFin.dispatchEvent(new Event('change',{bubbles:true})); }

    // Endereço
    await preencherEndereco(d);

    // Contato (telefone + email)
    var tel = d.telefone || '0000000000';
    await adicionarContato('2', tel);
    await delay(1500);
    var email = d.email || gerarEmailAleatorio();
    var emailOk = await adicionarContato('4', email);
    if(!emailOk) { email = gerarEmailAleatorio(); await adicionarContato('4', email); }

    // Gestor/Sócio
    var cpfSocio = d.cpf_socio || (task.cnpj_data && task.cnpj_data.cpf_socio) || '';
    if(cpfSocio) await preencherGestor(cpfSocio.replace(/\D/g, ''));

    // RT
    await preencherRT();

    // Veículos (mesma lógica do CPF)
    var tipoVeiculo = (d.tipo_veiculo || d.tipoVeiculo || 'nao').toLowerCase();
    if(tipoVeiculo === 'nao' || tipoVeiculo === 'não') {
      var btnFin = document.querySelector('#btnFinalizar, [data-action*="Finalizar"]');
      if(btnFin) { btnFin.click(); await delay(3000); }
      var btnConf = document.querySelector('.modal .btn-primary, .btn-confirmar, .bootbox-accept');
      if(btnConf) { btnConf.click(); await delay(2000); }
      enviarStatus('done', 'Cadastro CNPJ concluido (sem veiculo)!');
    } else if(tipoVeiculo === 'proprio') {
      await processarInclusaoVeiculo(d.placa, d.renavam);
      var btnFin2 = document.querySelector('#btnFinalizar, [data-action*="Finalizar"]');
      if(btnFin2) { btnFin2.click(); await delay(3000); }
      enviarStatus('done', 'Cadastro CNPJ concluido (proprio)!');
    } else if(tipoVeiculo === 'terceiro') {
      salvarEstado('pendente_arrendamento', task);
      window.location.href = 'https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FUNÇÕES AUXILIARES DE CADASTRO
  // ══════════════════════════════════════════════════════════════

  async function preencherEndereco(d) {
    var cep = (d.cep || '').replace(/\D/g, '');
    if(!cep) {
      var estados = ['MG','SP','RJ'];
      var est = estados[Math.floor(Math.random()*estados.length)];
      var ceps = {MG:['32220390','32017900'],SP:['04805140','01002900'],RJ:['23032486','20211110']};
      var lista = ceps[est] || ceps.MG;
      cep = lista[Math.floor(Math.random()*lista.length)];
      log('CEP aleatorio: ' + cep, 'warn');
    }

    var btnEnd = document.querySelector('[data-action*="Endereco/Novo"], [data-action*="EnderecoPedido"]');
    if(btnEnd) { btnEnd.click(); await delay(1500); }

    // Aguarda modal
    try { await waitForElement('#Cep, input[name*="Cep"]', 10000); } catch(e) { log('Modal endereco nao abriu', 'err'); return; }

    try { document.querySelector('#CodigoTipoEndereco').value = '1'; document.querySelector('#CodigoTipoEndereco').dispatchEvent(new Event('change',{bubbles:true})); } catch(e){}
    await delay(300);

    var cepField = document.querySelector('#Cep, input[name*="Cep"]');
    if(cepField) { await typeSlowly(cepField, cep, 60); await delay(2000); }

    if(d.logradouro) { var f = document.querySelector('#Logradouro'); if(f) { f.value = d.logradouro; f.dispatchEvent(new Event('change',{bubbles:true})); } }
    var num = d.numero || '0';
    var nf = document.querySelector('#Numero'); if(nf) { nf.value = num; nf.dispatchEvent(new Event('change',{bubbles:true})); }
    if(d.complemento) { var cf = document.querySelector('#Complemento'); if(cf) cf.value = d.complemento; }
    var bairro = d.bairro || '0';
    var bf = document.querySelector('#Bairro'); if(bf) { bf.value = bairro; bf.dispatchEvent(new Event('change',{bubbles:true})); }

    // Mesmo endereço checkbox
    var me = document.querySelector('#MesmoEndereco, #mesmoEndereco');
    if(me) { me.checked = true; me.dispatchEvent(new Event('change',{bubbles:true})); }

    await delay(500);
    var btnSalvar = document.querySelector('.btn-salvar, .modal .btn-primary, [data-action*="Salvar"]');
    if(btnSalvar) { btnSalvar.click(); await delay(1500); }
    try { document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();}); } catch(e){}
  }

  async function adicionarContato(tipo, valor) {
    var btn = document.querySelector('[data-action*="ContatoPedido/Novo"]');
    if(!btn) return false;
    btn.click(); await delay(1000);
    try { await waitForElement('#CodigoTipoContato', 5000); } catch(e) { return false; }
    try { document.querySelector('#CodigoTipoContato').value = tipo; document.querySelector('#CodigoTipoContato').dispatchEvent(new Event('change',{bubbles:true})); } catch(e){}
    await delay(300);
    var cf = document.querySelector('#Contato');
    if(cf) await typeSlowly(cf, valor, 40);
    await delay(500);
    var bs = document.querySelector('.btn-salvar-contato, .modal .btn-primary');
    if(bs) { bs.click(); await delay(1000); }
    var err = document.querySelector('.validation-summary-errors, .alert-danger, .field-validation-error');
    if(err) { var fc = document.querySelector('.modal .close, [data-dismiss="modal"]'); if(fc) fc.click(); await delay(500); return false; }
    try { document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();}); } catch(e){}
    return true;
  }

  async function preencherGestor(cpf) {
    enviarStatus('running', 'Preenchendo gestor/socio...', {step:'gestor'});
    var btn = document.querySelector('[data-action*="Gestor/Criar"], [data-action*="GestorPedido/Novo"]');
    if(!btn) { log('Botao gestor nao encontrado', 'err'); return; }
    btn.click(); await delay(1500);
    try { await waitForElement('.modal.show select, .modal.in select', 10000); } catch(e) { log('Modal gestor nao abriu', 'err'); return; }

    // Seleciona "Sócio"
    var selects = document.querySelectorAll('.modal.show select, .modal.in select');
    selects.forEach(function(s){ for(var i=0;i<s.options.length;i++){ if(s.options[i].text.toLowerCase().indexOf('socio')!==-1||s.options[i].text.toLowerCase().indexOf('sócio')!==-1){s.value=s.options[i].value;s.dispatchEvent(new Event('change',{bubbles:true}));break;} } });
    await delay(500);

    var cpfField = document.querySelector('.modal #Cpf, .modal input[name="Cpf"], .modal input[name="CpfCnpj"]');
    if(cpfField) {
      await typeSlowly(cpfField, cpf, 50);
      cpfField.dispatchEvent(new Event('blur',{bubbles:true}));
    }
    await delay(2000);

    // Aguarda nome carregar
    for(var i=0;i<30;i++){
      var nf = document.querySelector('.modal #Nome, .modal input[name="Nome"]');
      if(nf && nf.value && nf.value.length > 2) break;
      await delay(500);
    }

    // Marca checkboxes
    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked), .modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){d.click();});
    await delay(300);

    var bs = document.querySelector('.modal .btn-salvar, .modal .btn-primary');
    if(bs) { bs.click(); await delay(1500); }
    try { document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();}); } catch(e){}
  }

  async function preencherRT() {
    enviarStatus('running', 'Preenchendo RT...', {step:'rt'});
    var cpfRT = gmGet('omega_rt_cpf', '') || '07141753664';
    var btn = document.querySelector('[data-action*="ResponsavelTecnico/Criar"]');
    if(!btn) { log('Botao RT nao encontrado', 'warn'); return; }
    btn.click(); await delay(1500);
    try { await waitForElement('.modal #Cpf', 10000); } catch(e) { return; }

    var cf = document.querySelector('.modal #Cpf');
    if(cf) { await typeSlowly(cf, cpfRT, 50); cf.dispatchEvent(new Event('blur',{bubbles:true})); }
    await delay(2000);

    for(var i=0;i<30;i++){
      var nf = document.querySelector('.modal #Nome');
      if(nf && nf.value && nf.value.length > 2) break;
      await delay(500);
    }

    document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked), .modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){d.click();});
    await delay(300);
    var bs = document.querySelector('.modal .btn-salvar, .modal .btn-primary');
    if(bs) { bs.click(); await delay(1500); }
    try { document.querySelectorAll('.toast-close-button').forEach(function(b){b.click();}); } catch(e){}
  }

  function gerarEmailAleatorio() {
    var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';
    for(var i=0;i<12;i++)s+=c[Math.floor(Math.random()*c.length)];
    return s+'@yahoo.com';
  }

  // ══════════════════════════════════════════════════════════════
  // RETOMADA APÓS NAVEGAÇÃO (máquina de estados)
  // ══════════════════════════════════════════════════════════════

  function verificarEstadoPendente() {
    var estado = lerEstado();
    if (!estado) return;

    log('Estado pendente: ' + estado.estado, 'warn');

    // Login no Gov.br
    if (isGovBr && estado.estado === 'login_govbr') {
      processarLoginGovBr();
      return;
    }

    // Arrendamento pendente (desvio do cadastro)
    if (isANTT && estado.estado === 'pendente_arrendamento' && location.href.indexOf('ContratoArrendamento/Criar') !== -1) {
      // Reconecta ao VPS e executa arrendamento
      setTimeout(function(){
        if(VPS_URL) conectar();
        setTimeout(function(){
          currentTask = estado.dados;
          fluxoArrendamento(estado.dados);
        }, 2000);
      }, 1000);
      return;
    }

    // Arrendamento em andamento
    if (isANTT && estado.estado === 'arrendamento' && location.href.indexOf('ContratoArrendamento/Criar') !== -1) {
      setTimeout(function(){
        if(VPS_URL) conectar();
        setTimeout(function(){
          currentTask = estado.dados;
          fluxoArrendamento(estado.dados);
        }, 2000);
      }, 1000);
      return;
    }

    // Retorno ao cadastro após arrendamento
    if (isANTT && estado.estado === 'retorno_cadastro') {
      log('Retomando cadastro apos arrendamento...', 'ok');
      setTimeout(function(){
        if(VPS_URL) conectar();
        setTimeout(async function(){
          currentTask = estado.dados;
          limparEstado();
          // Espera a aba de veículos e inclui
          enviarStatus('running', 'Retomando inclusao apos arrendamento', {step:'retorno_inclusao'});
          await delay(5000);
          var d = estado.dados.transportador || estado.dados;
          if(d.placa && d.renavam) {
            await processarInclusaoVeiculo(d.placa, d.renavam);
            var btnFin = document.querySelector('#btnFinalizar, [data-action*="Finalizar"]');
            if(btnFin) { btnFin.click(); await delay(3000); }
            enviarStatus('done', 'Cadastro concluido (terceiro)!');
          }
        }, 2000);
      }, 1000);
      return;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ══════════════════════════════════════════════════════════════

  // Auto-connect na ANTT se tem URL salva
  if (isANTT && VPS_URL && !paused) {
    setTimeout(function(){ conectar(); }, 2000);
  }

  // Verifica estados pendentes
  setTimeout(verificarEstadoPendente, 3000);

  // Restaura aba salva
  if (isANTT && U && U.restaurarAbaSalva) {
    setTimeout(function(){ U.restaurarAbaSalva(); }, 500);
  }

  console.log('[BRIDGE] v4.0 — ' + (isGovBr ? 'Gov.br' : 'ANTT') + ' — autonomia total');
})();
