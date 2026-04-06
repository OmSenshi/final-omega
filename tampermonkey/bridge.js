// bridge.js — Final Omega v3.1: Braco (Tampermonkey → VPS via WebSocket)
// Backoff exponencial, heartbeat pong, fila de pendentes, auth por token
(function(){
  var U   = window.OmegaUtils;
  var jqR = unsafeWindow.jQuery || unsafeWindow.$;
  if(!U) { console.error('[BRIDGE] OmegaUtils nao encontrado!'); return; }

  // ── Configuracao persistente ──
  function gmGet(k,d){ return (typeof GM_getValue!=='undefined') ? GM_getValue(k,d) : localStorage.getItem(k)||d; }
  function gmSet(k,v){ try{ if(typeof GM_setValue!=='undefined') GM_setValue(k,v); else localStorage.setItem(k,v); }catch(e){} }

  var VPS_URL     = gmGet('omega_vps_url', '');
  var VPS_TOKEN   = gmGet('omega_vps_token', '');
  var DEVICE_NAME = gmGet('omega_device_name', '');
  var DEVICE_ID   = gmGet('omega_device_id', '');

  var ws = null;
  var connected = false;
  var currentTask = null;

  // ── Reconexão com backoff exponencial ──
  var reconnectTimer = null;
  var reconnectDelay = 5000; // começa em 5s
  var RECONNECT_MAX = 60000; // máximo 60s
  var RECONNECT_BASE = 5000;
  var intentionalDisconnect = false;

  function resetBackoff() { reconnectDelay = RECONNECT_BASE; }
  function nextBackoff() { reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX); }

  // ── ABA: BRIDGE ──
  U.registrarAba('bridge', 'Bridge', ''
    +'<div class="om-section-title">Conexao com VPS</div>'
    +'<div class="om-mb-sm"><label class="om-label">URL do VPS</label><input id="omega-bridge-url" class="om-input" placeholder="wss://omhk.com.br/ws"></div>'
    +'<div class="om-grid om-grid-2 om-mb-sm">'
      +'<div><label class="om-label">Token (senha)</label><input id="omega-bridge-token" class="om-input" type="password" placeholder="Mesma do .env"></div>'
      +'<div><label class="om-label">Nome dispositivo</label><input id="omega-bridge-name" class="om-input" placeholder="Celular Augusto"></div>'
    +'</div>'
    +'<div class="om-grid om-grid-2 om-mb">'
      +'<button type="button" id="omega-bridge-connect" class="om-btn om-btn-green">Conectar</button>'
      +'<button type="button" id="omega-bridge-disconnect" class="om-btn om-btn-coral" style="display:none">Desconectar</button>'
    +'</div>'
    +'<div id="omega-bridge-status"></div>'
    +'<div id="omega-bridge-task" style="margin-top:8px"></div>'
  , function(){
    var urlEl = document.getElementById('omega-bridge-url');
    var tokenEl = document.getElementById('omega-bridge-token');
    var nameEl = document.getElementById('omega-bridge-name');
    if(urlEl && VPS_URL) urlEl.value = VPS_URL;
    if(tokenEl && VPS_TOKEN) tokenEl.value = VPS_TOKEN;
    if(nameEl && DEVICE_NAME) nameEl.value = DEVICE_NAME;
    atualizarUI();
  });

  // ── Botões ──
  document.getElementById('omega-bridge-connect').addEventListener('click', function(e){
    e.preventDefault();
    var url = document.getElementById('omega-bridge-url').value.trim();
    var token = document.getElementById('omega-bridge-token').value.trim();
    var name = document.getElementById('omega-bridge-name').value.trim() || 'Dispositivo';
    if(!url) return U.box(document.getElementById('omega-bridge-status'), false, 'Preencha a URL.');
    VPS_URL = url; VPS_TOKEN = token; DEVICE_NAME = name;
    gmSet('omega_vps_url', url); gmSet('omega_vps_token', token); gmSet('omega_device_name', name);
    intentionalDisconnect = false;
    resetBackoff();
    conectar();
  });

  document.getElementById('omega-bridge-disconnect').addEventListener('click', function(e){
    e.preventDefault();
    desconectar(true);
  });

  // ── WebSocket ──
  function conectar(){
    if(ws) { try{ws.close();}catch(e){} ws=null; }
    var st = document.getElementById('omega-bridge-status');
    U.box(st, true, 'Conectando...');

    // Monta URL com token na query string
    var fullUrl = VPS_URL;
    if(VPS_TOKEN) {
      fullUrl += (fullUrl.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(VPS_TOKEN);
    }

    try { ws = new WebSocket(fullUrl); } catch(e) {
      U.box(st, false, 'URL invalida: ' + e.message);
      return;
    }

    ws.onopen = function(){
      connected = true;
      resetBackoff();
      if(!DEVICE_ID) {
        DEVICE_ID = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
        gmSet('omega_device_id', DEVICE_ID);
      }
      ws.send(JSON.stringify({ type: 'register', deviceId: DEVICE_ID, name: DEVICE_NAME }));
      U.box(st, true, 'Conectado! Aguardando tarefas...');
      atualizarUI();
    };

    ws.onmessage = function(evt){
      var msg;
      try { msg = JSON.parse(evt.data); } catch { return; }

      if(msg.type === 'registered') {
        DEVICE_ID = msg.deviceId;
        gmSet('omega_device_id', DEVICE_ID);
        console.log('[BRIDGE] Registrado: ' + DEVICE_ID);
      }

      if(msg.type === 'task') receberTarefa(msg);
      if(msg.type === 'stop') pararTarefa();
    };

    ws.onclose = function(evt){
      connected = false;
      atualizarUI();

      // 4001 = rejeitado por autenticação
      if(evt.code === 4001) {
        var st2 = document.getElementById('omega-bridge-status');
        if(st2) U.box(st2, false, 'Token incorreto. Verifique a senha.');
        return; // Não reconecta
      }

      if(!intentionalDisconnect && VPS_URL) {
        var st2 = document.getElementById('omega-bridge-status');
        var secs = Math.round(reconnectDelay / 1000);
        if(st2) U.box(st2, false, 'Desconectado. Reconectando em ' + secs + 's...');
        reconnectTimer = window._setTimeoutNativo(function(){
          nextBackoff();
          conectar();
        }, reconnectDelay);
      }
    };

    ws.onerror = function(){
      var st2 = document.getElementById('omega-bridge-status');
      if(st2) U.box(st2, false, 'Erro de conexao.');
    };
  }

  function desconectar(intencional){
    intentionalDisconnect = !!intencional;
    if(reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if(intencional) VPS_URL = '';
    if(ws) { try{ws.close();}catch(e){} ws=null; }
    connected = false;
    atualizarUI();
    var st = document.getElementById('omega-bridge-status');
    if(st) U.clearBox(st);
  }

  function enviarStatus(status, message, extra){
    if(!ws || ws.readyState !== 1) return;
    var payload = { type: 'status', status: status, message: message || '' };
    if(extra) for(var k in extra) payload[k] = extra[k];
    try { ws.send(JSON.stringify(payload)); } catch(e){}
  }

  function atualizarUI(){
    var btnC = document.getElementById('omega-bridge-connect');
    var btnD = document.getElementById('omega-bridge-disconnect');
    if(btnC) btnC.style.display = connected ? 'none' : 'block';
    if(btnD) btnD.style.display = connected ? 'block' : 'none';
  }

  // ══════════════════════════════════════════════════════════════
  // EXECUTOR DE TAREFAS
  // ══════════════════════════════════════════════════════════════

  function receberTarefa(msg){
    currentTask = msg;
    var st = document.getElementById('omega-bridge-task');
    if(st) U.box(st, true, 'Tarefa: <b>' + (msg.modo || '?') + '</b>');
    enviarStatus('running', 'Tarefa recebida: ' + msg.modo);

    try {
      switch(msg.modo) {
        case 'cadastro':            executarCadastro(msg); break;
        case 'arrendamento_avulso': executarArrendamento(msg); break;
        case 'inclusao_avulsa':     executarInclusao(msg); break;
        default:
          enviarStatus('error', 'Modo desconhecido: ' + msg.modo);
      }
    } catch(e) {
      enviarStatus('error_critical', 'Erro: ' + e.message);
    }
  }

  function pararTarefa(){
    window._omegaAutomacaoAtiva = false;
    currentTask = null;
    var st = document.getElementById('omega-bridge-task');
    if(st) U.box(st, false, 'Tarefa cancelada.');
    enviarStatus('idle', 'Cancelada');
  }

  // ── Navegação com persistência ──
  function navegar(url){
    enviarStatus('running', 'Navegando...');
    try {
      gmSet('omega_bridge_pending', JSON.stringify({ data: currentTask }));
    } catch(e){}
    window.location.href = url;
  }

  function verificarPendente(){
    try {
      var raw = gmGet('omega_bridge_pending', '');
      if(!raw) return;
      var pending = JSON.parse(raw);
      gmSet('omega_bridge_pending', '');
      if(VPS_URL && pending.data) {
        window._setTimeoutNativo(function(){
          conectar();
          window._setTimeoutNativo(function(){
            currentTask = pending.data;
            enviarStatus('running', 'Retomando apos navegacao...');
            var url = window.location.href;
            if(url.indexOf('ContratoArrendamento/Criar') !== -1) {
              continuarArrendamento(pending.data);
            } else {
              enviarStatus('running', 'Pagina carregada.');
            }
          }, 2000);
        }, 1000);
      }
    } catch(e){}
  }

  // ══════════════════════════════════════════════════════════════
  // EXECUTORES
  // ══════════════════════════════════════════════════════════════

  function executarCadastro(task){
    window._omegaAutomacaoAtiva = true;
    var d = task.transportador || {};
    var tipo = task.tipo || 'cpf';
    enviarStatus('running', 'Cadastro ' + tipo.toUpperCase(), {step:'cadastro'});

    if(window.location.href.indexOf('rntrcdigital.antt.gov.br') === -1) {
      enviarStatus('error', 'Nao esta no portal ANTT.');
      return;
    }

    if(tipo === 'cpf') {
      var ids = {identidade:'omega-cad-identidade',uf:'omega-cad-uf',cep:'omega-cad-cep',logradouro:'omega-cad-logradouro',numero:'omega-cad-numero',bairro:'omega-cad-bairro',complemento:'omega-cad-complemento'};
      for(var k in ids) { var el=document.getElementById(ids[k]); if(el && d[k]) el.value = k==='cep' ? d[k].replace(/\D/g,'') : (k==='uf' ? d[k].toUpperCase() : d[k]); }
      if(!d.identidade) { var el=document.getElementById('omega-cad-identidade'); if(el) el.value='000000'; }
      enviarStatus('running', 'Campos CPF preenchidos.', {step:'cadastro_cpf'});
      var btn = document.getElementById('omega-cad-iniciar-cpf');
      if(btn) window._setTimeoutNativo(function(){ btn.click(); }, 500);
      else enviarStatus('error', 'Botao iniciar CPF nao encontrado.');
    } else {
      var ids = {cep:'omega-cad-cnpj-cep',logradouro:'omega-cad-cnpj-logradouro',numero:'omega-cad-cnpj-numero',bairro:'omega-cad-cnpj-bairro',complemento:'omega-cad-cnpj-complemento',telefone:'omega-cad-cnpj-telefone',email:'omega-cad-cnpj-email'};
      for(var k in ids) { var el=document.getElementById(ids[k]); if(el && d[k]) el.value = k==='cep' ? d[k].replace(/\D/g,'') : d[k]; }
      var cnpjData = task.cnpj_data || {};
      if(cnpjData.cpf_socio) { var el=document.getElementById('omega-cad-cnpj-cpf-socio'); if(el) el.value=cnpjData.cpf_socio; }
      enviarStatus('running', 'Campos CNPJ preenchidos.', {step:'cadastro_cnpj'});
      var btn = document.getElementById('omega-cad-iniciar-cnpj');
      if(btn) window._setTimeoutNativo(function(){ btn.click(); }, 500);
      else enviarStatus('error', 'Botao iniciar CNPJ nao encontrado.');
    }

    if(task.veiculos && task.veiculos.length > 0) {
      gmSet('omega_bridge_veiculos', JSON.stringify(task.veiculos));
    }
  }

  function executarArrendamento(task){
    window._omegaAutomacaoAtiva = true;
    enviarStatus('running', 'Arrendamento avulso...', {step:'arrendamento'});
    if(window.location.href.indexOf('ContratoArrendamento/Criar') === -1) {
      navegar('https://rntrcdigital.antt.gov.br/ContratoArrendamento/Criar');
      return;
    }
    continuarArrendamento(task);
  }

  function continuarArrendamento(task){
    var arr = task.arrendamento || {};
    var campos = {
      'antt-cpf-input': (arr.cpf_cnpj_proprietario||'').replace(/\D/g,''),
      'antt-nome-input': (arr.nome_proprietario||'').toUpperCase(),
      'antt-placa-input': (arr.placa||'').toUpperCase(),
      'antt-renavam-input': arr.renavam||''
    };
    for(var id in campos) {
      var el = document.getElementById(id);
      if(el && campos[id]) { el.value = campos[id]; el.dispatchEvent(new Event('input',{bubbles:true})); }
    }

    enviarStatus('running', 'Substituindo CPF/Nome...', {step:'arrendamento_subst'});

    window._setTimeoutNativo(function(){
      var btnSubst = document.getElementById('antt-btn');
      if(btnSubst) btnSubst.click();

      window._setTimeoutNativo(function(){
        enviarStatus('running', 'Verificando veiculo...', {step:'arrendamento_verificar'});
        var btnV = document.getElementById('antt-veiculo-btn');
        if(btnV) btnV.click();

        U.poll(function(){
          var st = document.getElementById('antt-veiculo-status');
          if(!st) return null;
          var t = st.textContent||'';
          if(t.indexOf('Verificado')!==-1||t.indexOf('OK')!==-1) return 'ok';
          if(t.indexOf('Erro')!==-1||t.indexOf('nao encontrado')!==-1) return 'erro';
          return null;
        }, function(r){
          if(r==='erro') { enviarStatus('error','Verificacao falhou.'); return; }

          enviarStatus('running', 'Preenchendo datas...', {step:'arrendamento_data'});
          window._setTimeoutNativo(function(){
            var btnD = document.getElementById('antt-data-btn');
            if(btnD) btnD.click();
            window._setTimeoutNativo(function(){
              enviarStatus('running', 'Marcando declaracoes...', {step:'arrendamento_check'});
              var btnC = document.getElementById('antt-check-btn');
              if(btnC) btnC.click();

              if(arr.cpf_cnpj_arrendatario) {
                window._setTimeoutNativo(function(){
                  var af = document.getElementById('CPFCNPJArrendatario') || document.querySelector('input[name*="CpfCnpjArrendatario"]');
                  if(af) {
                    af.removeAttribute('disabled');
                    af.value = arr.cpf_cnpj_arrendatario.replace(/\D/g,'');
                    af.dispatchEvent(new Event('input',{bubbles:true}));
                    af.dispatchEvent(new Event('change',{bubbles:true}));
                    af.dispatchEvent(new Event('blur',{bubbles:true}));
                  }
                  enviarStatus('running', 'Pronto! Aguardando confirmacao...', {step:'arrendamento_pronto'});
                }, 1000);
              } else {
                enviarStatus('running', 'Preenchido (sem arrendatario).', {step:'arrendamento_pronto'});
              }
            }, 800);
          }, 800);
        }, {maxTentativas:60, intervalo:500, onTimeout:function(){
          enviarStatus('error', 'Timeout na verificacao.');
        }});
      }, 1000);
    }, 500);
  }

  function executarInclusao(task){
    window._omegaAutomacaoAtiva = true;
    var veiculos = task.veiculos || [];
    if(veiculos.length === 0) { enviarStatus('error', 'Sem veiculos.'); return; }
    enviarStatus('running', 'Inclusao: ' + veiculos.length + ' veiculo(s)', {step:'inclusao'});

    veiculos.forEach(function(v){
      if(v.placa && v.renavam) U.adicionarHistorico({placa:v.placa,renavam:v.renavam,cpf:v.cpf_cnpj||'',nome:v.nome||''});
    });

    enviarStatus('running', 'Inserindo 1/' + veiculos.length + ': ' + veiculos[0].placa, {step:'veiculo_1'});
    if(typeof unsafeWindow.OmegaInserirVeiculo === 'function') {
      unsafeWindow.OmegaInserirVeiculo(0);
    } else {
      enviarStatus('error', 'OmegaInserirVeiculo nao disponivel.');
    }
  }

  // ── Auto-connect se tiver URL salva ──
  if(VPS_URL && !intentionalDisconnect) {
    window._setTimeoutNativo(function(){ conectar(); }, 2000);
  }

  // ── Verificar pendentes após reload ──
  window._setTimeoutNativo(verificarPendente, 3000);

  // ── Restaurar aba salva ──
  window._setTimeoutNativo(function(){ if(U.restaurarAbaSalva) U.restaurarAbaSalva(); }, 500);

  console.log('[BRIDGE] v3.1 carregado — backoff exponencial + auth');
})();
