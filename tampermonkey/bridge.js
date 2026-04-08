// bridge.js — Final Omega v11.0 (Sunshine Edition)
// Ultimate Timer Killer, Stubborn Address, Sequential Modals, Emergency Stop
(function(){
  var isANTT = location.hostname.indexOf('rntrcdigital.antt.gov.br') !== -1;
  var isGovBr = location.hostname.indexOf('acesso.gov.br') !== -1;
  var U = window.OmegaUtils || null;

  // ISOLAMENTO DO SETTIMEOUT NATIVO PARA NÃO MATAR NOSSA AUTOMAÇÃO
  var nativeSetTimeout = window.setTimeout;
  var nativeClearTimeout = window.clearTimeout;
  var nativeClearInterval = window.clearInterval;
  if (typeof unsafeWindow !== 'undefined' && unsafeWindow.setTimeout) {
      nativeSetTimeout = unsafeWindow.setTimeout.bind(unsafeWindow);
      nativeClearTimeout = unsafeWindow.clearTimeout.bind(unsafeWindow);
      nativeClearInterval = unsafeWindow.clearInterval.bind(unsafeWindow);
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
              nativeSetTimeout(check, 300);
          }
          check();
      });
  }

  // O EXTERMINADOR DE TOASTS E TIMERS DO GOVERNO
  function limparToasts() {
      var w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      try {
          // Desarma options do Toastr se existir
          if (w.toastr) { w.toastr.options.onHidden = null; w.toastr.options.onCloseClick = null; }
          // Pega o maior ID atual e varre para trás matando tudo
          var idMax = w.setTimeout(function(){}, 1);
          nativeClearTimeout(idMax);
          for(var i = idMax; i > Math.max(0, idMax - 500); i--){
              w.clearTimeout(i); w.clearInterval(i);
          }
      } catch(e){}
      
      // Fecha e arranca do HTML
      document.querySelectorAll('.toast-close-button').forEach(function(b){ try{b.click();}catch(e){} });
      document.querySelectorAll('#toast-container, .toast').forEach(function(t){ t.remove(); });
  }

  function typeSlowly(el, text, ms) {
    ms = ms || 80;
    return new Promise(function(resolve) {
      el.value = ''; el.focus(); var i = 0;
      function next() {
        if (i >= text.length) { el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return resolve(); }
        el.value = text.substring(0, i + 1); el.dispatchEvent(new Event('input',{bubbles:true}));
        i++; nativeSetTimeout(next, ms);
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
              try { await waitForVisible(seletorPainel, 8000); } catch(e) {}
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
          if (task.arrendamento && task.arrendamento.cpf_arrendatario) return String(task.arrendamento.cpf_arrendatario).replace(/\D/g, '');
      }
      if (task.modo === 'cadcnpj') {
          if (task.cnpj_data && task.cnpj_data.cnpj) return String(task.cnpj_data.cnpj).replace(/\D/g, '');
      }
      if (task.modo === 'cadcpf') {
          if (task.credenciais && task.credenciais.cpf) return String(task.credenciais.cpf).replace(/\D/g, '');
      }
      if (task.modo === 'inclusao') {
          if (task.transportador) return String(task.transportador).replace(/\D/g, '');
      }
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
  function renderLogs(){if(!isANTT)return;var el=document.getElementById('omega-bridge-log');if(!el)return;el.innerHTML=logs.map(function(l){var c=l.tipo==='err'?'om-log-err':l.tipo==='warn'?'om-log-warn':'om-log-ok';return'<span style="color:#555e70">'+l.ts+'</span> <span class="'+c+'">'+l.msg+'</span>';}).join('<br>');el.scrollTop=el.scrollHeight;}

  async function requestWakeLock(){try{if('wakeLock' in navigator){wakeLockSentinel=await navigator.wakeLock.request('screen');}}catch(e){}}
  function releaseWakeLock(){if(wakeLockSentinel){try{wakeLockSentinel.release();}catch(e){}wakeLockSentinel=null;}}

  // BOTÃO E COMANDO DE PARADA DE EMERGÊNCIA
  function paradaDeEmergencia() {
      paused = true; currentTask = null;
      limparEstado();
      limparToasts();
      log('SISTEMA ABORTADO PELO USUARIO', 'err');
      if(U) U.box(document.getElementById('omega-bridge-status'), false, '🛑 PARADA DE EMERGENCIA');
      if(U) U.toast('Automacao Parada!', false);
  }
  if (typeof unsafeWindow !== 'undefined') unsafeWindow.OmegaParar = paradaDeEmergencia;

  if(isANTT&&U){
    U.registrarAba('bridge','Bridge',''
      +'<div class="om-section-title">Conexao VPS</div>'
      +'<div class="om-mb-sm"><label class="om-label">URL</label><input id="omega-bridge-url" class="om-input" placeholder="https://omhk.com.br"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Token</label><input id="omega-bridge-token" class="om-input" type="password" placeholder="Senha"></div><div><label class="om-label">Nome</label><input id="omega-bridge-name" class="om-input" placeholder="Celular"></div></div>'
      +'<div class="om-grid om-grid-3 om-mb">'
        +'<button type="button" id="omega-bridge-connect" class="om-btn om-btn-green om-btn-sm">Conectar</button>'
        +'<button type="button" id="omega-bridge-pause" class="om-btn om-btn-amber om-btn-sm" style="display:none">Pausar</button>'
        +'<button type="button" id="omega-bridge-stop" class="om-btn om-btn-coral om-btn-sm">Parar Tudo</button>'
      +'</div>'
      +'<div id="omega-bridge-status"></div><div id="omega-bridge-task" style="margin-top:6px"></div>'
      +'<div class="om-section-title" style="margin-top:10px">Log</div><div id="omega-bridge-log" class="om-log"></div>'
    ,function(){
      var u=document.getElementById('omega-bridge-url'),t=document.getElementById('omega-bridge-token'),n=document.getElementById('omega-bridge-name');
      if(u&&VPS_URL)u.value=VPS_URL;if(t&&VPS_TOKEN)t.value=VPS_TOKEN;if(n&&DEVICE_NAME)n.value=DEVICE_NAME;
      atualizarUI();renderLogs();
    });

    document.getElementById('omega-bridge-connect').addEventListener('click',function(e){e.preventDefault();VPS_URL=document.getElementById('omega-bridge-url').value.trim();VPS_TOKEN=document.getElementById('omega-bridge-token').value.trim();DEVICE_NAME=document.getElementById('omega-bridge-name').value.trim()||'Dispositivo';if(!VPS_URL)return U.box(document.getElementById('omega-bridge-status'),false,'URL vazia.');gmSet('omega_vps_url',VPS_URL);gmSet('omega_vps_token',VPS_TOKEN);gmSet('omega_device_name',DEVICE_NAME);paused=false;errorCount=0;resetBackoff();conectar();});
    document.getElementById('omega-bridge-pause').addEventListener('click',function(e){e.preventDefault();if(paused){paused=false;errorCount=0;resetBackoff();conectar();}else pausarConexao('Pausado');});
    document.getElementById('omega-bridge-stop').addEventListener('click',function(e){e.preventDefault();paradaDeEmergencia();});
  }

  function pausarConexao(m){paused=true;if(reconnectTimer){nativeClearTimeout(reconnectTimer);reconnectTimer=null;}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();log(m||'Pausado','warn');if(U){U.box(document.getElementById('omega-bridge-status'),false,'⏸ '+(m||'Pausado'));}}
  function registrarErro(m){var a=Date.now();errorCount=(a-lastErrorTime<ERROR_WINDOW)?errorCount+1:1;lastErrorTime=a;log(m,'err');if(errorCount>=ERROR_THRESHOLD){pausarConexao('Auto-pause: flood');errorCount=0;}}

  function conectar(){
    if(paused||!VPS_URL)return;if(ws){try{ws.close();}catch(e){}ws=null;}log('Conectando...','ok');
    var wsUrl = VPS_URL.toLowerCase().trim(); if(wsUrl.indexOf('http')===0) wsUrl = wsUrl.replace(/^http/i, 'ws'); if(wsUrl.indexOf('/ws')===-1) wsUrl = wsUrl.replace(/\/$/, '') + '/ws';
    var url=wsUrl+(VPS_TOKEN?((wsUrl.indexOf('?')===-1?'?':'&')+'token='+encodeURIComponent(VPS_TOKEN)):'');
    try{ws=new WebSocket(url);}catch(e){log('URL invalida','err');return;}
    ws.onopen=function(){connected=true;resetBackoff();errorCount=0;if(!DEVICE_ID){DEVICE_ID='dev_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);gmSet('omega_device_id',DEVICE_ID);}ws.send(JSON.stringify({type:'register',deviceId:DEVICE_ID,name:DEVICE_NAME}));log('Conectado','ok');atualizarUI();if(U){U.box(document.getElementById('omega-bridge-status'),true,'Conectado!');}var fab=document.getElementById('omega-fab');if(fab)fab.classList.add('om-fab-connected');};
    ws.onmessage=function(evt){var msg;try{msg=JSON.parse(evt.data);}catch{return;}if(msg.type==='registered'){DEVICE_ID=msg.deviceId;gmSet('omega_device_id',DEVICE_ID);}if(msg.type==='stop'){paradaDeEmergencia();}if(msg.type==='task')receberTarefa(msg);};
    ws.onclose=function(evt){connected=false;atualizarUI();var fab=document.getElementById('omega-fab');if(fab)fab.classList.remove('om-fab-connected');if(evt.code===4001){log('Token incorreto','err');return;}if(!paused&&VPS_URL){var s=Math.round(reconnectDelay/1000);log('Retry '+s+'s','warn');reconnectTimer=nativeSetTimeout(function(){nextBackoff();conectar();},reconnectDelay);}};
    ws.onerror=function(){log('Erro WS','err');};
  }

  function desconectar(i){paused=false;if(reconnectTimer){nativeClearTimeout(reconnectTimer);reconnectTimer=null;}if(i){VPS_URL='';gmSet('omega_vps_url','');}if(ws){try{ws.close();}catch(e){}ws=null;}connected=false;releaseWakeLock();atualizarUI();if(U)U.clearBox(document.getElementById('omega-bridge-status'));log('Desconectado','warn');}

  function enviarStatus(status,message,extra){if(!ws||ws.readyState!==1)return;var p={type:'status',status:status,message:message||''};if(extra)for(var k in extra)p[k]=extra[k];try{ws.send(JSON.stringify(p));}catch(e){}if(U){var pn=document.getElementById('antt-helper');if(pn&&pn.classList.contains('om-hidden'))U.toast(message||status,status!=='error'&&status!=='error_critical');}if(status==='error'||status==='error_critical')registrarErro(message||'Erro');else errorCount=0;log(message||status,(status==='error'||status==='error_critical')?'err':'ok');}

  function atualizarUI(){if(!isANTT)return;var c=document.getElementById('omega-bridge-connect'),p=document.getElementById('omega-bridge-pause'),s=document.getElementById('omega-bridge-stop');if(!c)return;if(connected){c.style.display='none';p.style.display='block';p.textContent='Pausar';p.className='om-btn om-btn-amber om-btn-sm';s.style.display='block';}else if(paused){c.style.display='none';p.style.display='block';p.textContent='Continuar';p.className='om-btn om-btn-green om-btn-sm';s.style.display='block';}else{c.style.display='block';p.style.display='none';s.style.display=VPS_URL?'block':'none';}}

  function receberTarefa(msg){
    currentTask=msg;requestWakeLock();enviarStatus('running','Tarefa: '+msg.modo);
    if(U)U.box(document.getElementById('omega-bridge-task'),true,'Tarefa: <b>'+(msg.modo||'?')+'</b>');
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
              var btns = document.querySelectorAll('button');
              for(var b=0; b<btns.length; b++) { if(btns[b].textContent.indexOf('Criar Pedido') !== -1) { btnCriar = btns[b]; break; } }
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
  // PREENCHIMENTO DE DADOS (CPF, CNPJ, Endereço, Contato, Gestor)
  // ══════════════════════════════════════════════════════════════

  async function injetarDadosHumanizadosEndereco(d) {
      var f = getVisible('#Logradouro'); 
      if(f){ f.removeAttribute('disabled'); f.focus(); let val = d.logradouro || '0'; await typeSlowly(f, val, 30); f.dispatchEvent(new Event('blur',{bubbles:true})); }

      var nf = getVisible('#Numero'); 
      if(nf){ nf.removeAttribute('disabled'); nf.focus(); let val = d.numero || '0'; await typeSlowly(nf, val, 30); nf.dispatchEvent(new Event('blur',{bubbles:true})); }
      
      if(d.complemento) { 
          var cf2 = getVisible('#Complemento'); 
          if(cf2) { cf2.removeAttribute('disabled'); cf2.focus(); await typeSlowly(cf2, d.complemento, 30); cf2.dispatchEvent(new Event('blur',{bubbles:true})); } 
      }

      var bf = getVisible('#Bairro'); 
      if(bf){ bf.removeAttribute('disabled'); bf.focus(); let val = d.bairro || '0'; await typeSlowly(bf, val, 30); bf.dispatchEvent(new Event('blur',{bubbles:true})); }
  }

  async function checarSeGovApagouEndereco() {
      var f = getVisible('#Logradouro'); var nf = getVisible('#Numero');
      if (f && f.value.trim() === '') return true;
      if (nf && nf.value.trim() === '') return true;
      return false;
  }

  async function preencherEndereco(d, tipoDefault){
    var cep=(d.cep||'').replace(/\D/g,''); 
    await abrirAba('a.contatos, a[href="#contatos"]', '#EnderecoPedidoPanel, [data-action*="Endereco/Novo"]');
    
    var btn = getVisible('[data-action*="Endereco/Novo"], [data-action*="EnderecoPedido"]');
    if(btn) btn.click();

    var cf = await waitForVisible('#Cep, input[name*="Cep"]', 10000);
    await delay(1500); 

    async function injetarCepEValidar(cepParaDigitar) {
        if(cf){ 
            cf.removeAttribute('disabled'); cf.focus();
            cf.value = ''; cf.dispatchEvent(new Event('input',{bubbles:true})); await delay(300);
            await typeSlowly(cf, cepParaDigitar, 60);
            
            // Força a saída para o ViaCEP trabalhar
            cf.dispatchEvent(new Event('blur',{bubbles:true}));
            var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
            
            await delay(1000);
            await waitBlockUI(15000); 
            await delay(1000); 
        }
    }

    if(cep) await injetarCepEValidar(cep);

    // Validador de Cidade
    var municipioEl = document.getElementById('DescricaoCidade');
    if (!municipioEl || municipioEl.innerText.trim() === '') {
        log('ViaCEP falhou ou CEP vazio. Acionando Fallback...', 'warn');
        var ufDoc = document.getElementById('UfSigla_Descricao');
        var ufTxt = ufDoc ? ufDoc.innerText.trim().toUpperCase() : '';
        var cepsFallback = { 'RJ': ['23032486', '20211110'], 'SP': ['04805140', '01002900'], 'MG': ['32220390', '32017900'] };
        var cepEmergencia = (cepsFallback[ufTxt]) ? cepsFallback[ufTxt][0] : cepsFallback['MG'][0];
        await injetarCepEValidar(cepEmergencia);
    }

    // Seleciona Tipo (COM/RES)
    var selTipo = getVisible('#CodigoTipoEndereco');
    if(selTipo) {
        var valToSelect = '';
        for(var i=0; i<selTipo.options.length; i++) if(selTipo.options[i].value === tipoDefault) valToSelect = tipoDefault;
        if(!valToSelect && selTipo.options.length>0) valToSelect = selTipo.options[1].value || selTipo.options[0].value;
        selTipo.value = valToSelect; selTipo.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(selTipo).trigger('change');
    }
    await delay(500);

    // A FUNÇÃO TEIMOSA DE ENDEREÇO
    await injetarDadosHumanizadosEndereco(d);
    await delay(1000);

    if (await checarSeGovApagouEndereco()) {
        log('Site apagou os dados do ViaCEP. Re-injetando...', 'warn');
        await injetarDadosHumanizadosEndereco(d);
    }

    var me = getVisible('#MesmoEndereco, #mesmoEndereco');
    if(me){ 
        if(!me.checked) me.click();
        me.checked = true; me.dispatchEvent(new Event('change',{bubbles:true})); 
        var jq = unsafeWindow.jQuery; if(jq) { jq(me).trigger('change'); jq('.icheckbox_flat-blue input').iCheck('check'); }
        await delay(1000);
        if (await checarSeGovApagouEndereco()) {
            log('Checkbox apagou os dados! Re-injetando...', 'warn');
            await injetarDadosHumanizadosEndereco(d);
        }
    }

    var bs = getVisible('.modal .btn-salvar, .modal .btn-primary, [data-action*="Salvar"]');
    if(bs){ 
        bs.removeAttribute('disabled'); bs.click(); 
        await waitBlockUI(10000); 
        var waitLimit = 0; while(getVisible('.modal.show, .modal.in') && waitLimit < 10) { await delay(1000); waitLimit++; }
        limparToasts(); // MATA OS TOASTS ANTES DE IR PRO CONTATO
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
        var jq = unsafeWindow.jQuery; if(jq) jq(selTipo).trigger('change');
    }
    await delay(500);

    if(cf) {
        cf.removeAttribute('disabled'); cf.focus();
        await typeSlowly(cf, valor, 60);
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
    }
    await delay(500);

    var bs = getVisible('.modal .btn-salvar-contato, .modal .btn-primary');
    if(bs){ 
        bs.removeAttribute('disabled'); bs.click(); 
        await waitBlockUI(10000); 
        var waitLimit = 0; while(getVisible('.modal.show, .modal.in') && waitLimit < 10) { await delay(1000); waitLimit++; }
        limparToasts();
    }
    return true;
  }

  async function forcarCheckboxesModal() {
      var checkboxes = document.querySelectorAll('.modal input[type="checkbox"]');
      checkboxes.forEach(function(cb) {
          if(!cb.checked) {
              cb.click();
              cb.checked = true;
              cb.dispatchEvent(new Event('change', {bubbles:true}));
              var jq = unsafeWindow.jQuery; 
              if(jq) { jq(cb).iCheck('check'); jq(cb).trigger('change'); }
          }
      });
      document.querySelectorAll('.modal .icheckbox_square-blue:not(.checked), .modal .icheckbox_flat-blue:not(.checked)').forEach(function(d){ d.click(); });
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
                var jq = unsafeWindow.jQuery; if(jq) jq(sel).trigger('change'); break;
            }
        }
    }
    await delay(500);

    var cf = getVisible('.modal #Cpf, .modal input[name="Cpf"], .modal input[name="CpfCnpj"]');
    if(cf){
        cf.removeAttribute('disabled'); cf.focus();
        await typeSlowly(cf, cpf, 70);
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
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
        var waitLimit = 0; while(getVisible('.modal.show, .modal.in') && waitLimit < 15) { await delay(1000); waitLimit++; }
        limparToasts();
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
        cf.removeAttribute('disabled'); cf.focus();
        await typeSlowly(cf, cpfRT, 70);
        cf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(cf).trigger('blur');
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
        var waitLimit = 0; while(getVisible('.modal.show, .modal.in') && waitLimit < 15) { await delay(1000); waitLimit++; }
        limparToasts();
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

    cp.removeAttribute('disabled'); cp.focus();
    var pLimpa = placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    await typeSlowly(cp, pLimpa, 80);
    cp.dispatchEvent(new Event('blur',{bubbles:true}));

    var cr=getVisible('#Renavam');
    if(cr) {
        cr.removeAttribute('disabled'); cr.value=renavam;
        cr.dispatchEvent(new Event('input',{bubbles:true})); 
        cr.dispatchEvent(new Event('change',{bubbles:true})); 
        cr.dispatchEvent(new Event('blur',{bubbles:true})); 
    }
    await delay(500);
    
    var bv = getVisible('#verificar, #btnBuscarVeiculo');
    if(bv) bv.click();
    
    enviarStatus('running','Aguardando ANTT (Dados)...',{step:'veiculo_wait'});
    await delay(1000); 
    
    // CAÇADOR DE MODAIS MÚLTIPLOS (Atropelo)
    var waitLimit = 0;
    while(waitLimit < 30) {
        var bbs = document.querySelectorAll('.bootbox-confirm button[data-bb-handler="confirm"], .btn-confirmar-exclusao');
        var clicouAlgum = false;
        for (var idx=0; idx<bbs.length; idx++) {
            if (bbs[idx].offsetParent !== null) {
                bbs[idx].click();
                clicouAlgum = true;
                await delay(1500);
            }
        }
        
        var tara = getVisible('#Tara');
        var eixos = getVisible('#Eixos');
        var uiBlock = document.querySelector('.blockUI');
        if (!clicouAlgum && tara && !tara.hasAttribute('disabled') && eixos && !eixos.hasAttribute('disabled') && (!uiBlock || uiBlock.style.display === 'none')) {
            break;
        }
        await delay(1000);
        waitLimit++;
    }

    var taraEl = getVisible('#Tara');
    if(taraEl && (!taraEl.value || taraEl.value.trim() === '')) {
        taraEl.removeAttribute('disabled'); taraEl.value = '2';
        taraEl.dispatchEvent(new Event('input',{bubbles:true})); taraEl.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(taraEl).trigger('change');
    }

    var eixosEl = getVisible('#Eixos');
    if(eixosEl && (!eixosEl.value || eixosEl.value.trim() === '' || eixosEl.value === '0')) {
        eixosEl.removeAttribute('disabled'); eixosEl.value = '2';
        eixosEl.dispatchEvent(new Event('change',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(eixosEl).trigger('change');
    }
    await delay(500);

    var bs = getVisible('.btn-salvar-veiculo, .btn-confirmar-inclusao');
    if(bs){ bs.removeAttribute('disabled'); bs.click(); log('Salvo: '+placa,'ok'); } 
    else { throw new Error('Botao salvar nao encontrado'); }

    await delay(1000);
    var bbFinal = getVisible('.bootbox-confirm button[data-bb-handler="confirm"], .btn-confirmar-exclusao');
    if(bbFinal) { bbFinal.click(); await delay(1500); }

    await waitBlockUI(10000); await delay(1000);
    limparToasts();
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
        btnCriar = getVisible('#btnCriarPedido, button[type="submit"]');
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

  // ══════════════════════════════════════════════════════════════
  // OS FLUXOS PRINCIPAIS
  // ══════════════════════════════════════════════════════════════
  async function fluxoCadastroCPF(task){
    enviarStatus('running','Dados CPF...',{step:'dados_cpf'}); var d=task.transportador||task;
    
    var tabTransp = getVisible('a[href="#transportador"], a.transportador');
    if(tabTransp && tabTransp.getAttribute('aria-selected') !== 'true') { tabTransp.click(); await delay(1000); }

    var idf= await waitForVisible('#Identidade, #TransportadorTac_Identidade, input[name*="Identidade"]', 10000);
    await delay(1500); 

    if(idf){
        idf.removeAttribute('disabled'); idf.focus();
        var num = (d.identidade||d.cnh||'000000').replace(/[^0-9a-zA-Z]/g,'');
        if(!num) num = '000000';
        await typeSlowly(idf, num, 60);
        idf.dispatchEvent(new Event('blur',{bubbles:true}));
        var jq = unsafeWindow.jQuery; if(jq) jq(idf).trigger('blur');
        await delay(1500);
    }

    var oe = getVisible('#OrgaoEmissor, #TransportadorTac_OrgaoEmissor, input[name*="OrgaoEmissor"], select[name*="OrgaoEmissor"]');
    if(oe){ oe.value='SSP'; oe.dispatchEvent(new Event('change',{bubbles:true})); var jq = unsafeWindow.jQuery; if(jq) jq(oe).trigger('change'); }
    await delay(500);

    if(d.uf){
        var uf = getVisible('#UfIdentidade, #TransportadorTac_Uf, select[name*="Uf"]');
        if(uf){
            var targetUf = d.uf.replace(/[^A-Za-z]/g, '').toUpperCase();
            for(var i=0; i<uf.options.length; i++){
                if(uf.options[i].value.toUpperCase() === targetUf){
                    uf.selectedIndex = i; uf.value = uf.options[i].value; uf.dispatchEvent(new Event('change',{bubbles:true}));
                    if(unsafeWindow.jQuery) unsafeWindow.jQuery(uf).trigger('change'); break;
                }
            }
        }
    }
    await delay(1000);

    await preencherEndereco(d, 'RES'); 
    if (paused) return;

    var tel=d.telefone||'0000000000'; await adicionarContato('2',tel);
    if (paused) return;
    var email=d.email||gerarEmailAleatorio(); await adicionarContato('4',email);
    if (paused) return;

    await processarVeiculos(task);
  }

  async function fluxoCadastroCNPJ(task){
    enviarStatus('running','Dados CNPJ...',{step:'dados_cnpj'}); var d=task.transportador||task;
    
    var tabTransp = getVisible('a[href="#transportador"], a.transportador');
    if(tabTransp && tabTransp.getAttribute('aria-selected') !== 'true') { tabTransp.click(); await delay(1000); }

    var cap = document.getElementById('TransportadorEtc_SituacaoCapacidadeFinanceira');
    if(cap){
        var jq = unsafeWindow.jQuery; 
        if(jq) { jq(cap).iCheck('check'); jq(cap).prop('checked', true).trigger('change'); } 
        else { cap.checked = true; cap.dispatchEvent(new Event('change',{bubbles:true})); cap.dispatchEvent(new Event('click',{bubbles:true})); }
    }
    
    await preencherEndereco(d, 'COM');
    if (paused) return;
    
    var tel=d.telefone||'0000000000'; await adicionarContato('2',tel);
    if (paused) return;
    var email=d.email||gerarEmailAleatorio(); await adicionarContato('4',email);
    if (paused) return;
    
    var cpfSocio=d.cpf_socio||(task.cnpj_data&&task.cnpj_data.cpf_socio)||''; 
    if(cpfSocio) await preencherGestor(cpfSocio.replace(/\D/g,''));
    if (paused) return;
    
    await preencherRT(); 
    if (paused) return;

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
        enviarStatus('running','Substituindo HTML...', {step: 'arrendamento_subst'});
        var ap = null; var nt = document.getElementById('NomesTransportador');
        if(nt && nt.value) { try { var jArr=JSON.parse(nt.value); if(jArr&&jArr[0]&&jArr[0].CpfCnpj) ap=jArr[0].CpfCnpj.replace(/\D/g,''); } catch(e){} }
        if(!ap && U) ap = U.getDoc();

        if(cpfArrendanteOriginal && ap && U){ U.substituirTudo(U.fAuto(ap), U.fAuto(cpfArrendanteOriginal)); U.substituirTudo(ap, cpfArrendanteOriginal); }
        if(nomeArrendante && U){
            var an = U.getNome(); if(an) U.substituirTudo(an, nomeArrendante);
            var cv = document.getElementById('NomeArrendanteInput') || document.getElementById('NomeArrendante');
            if(cv) { cv.removeAttribute('disabled'); cv.value = nomeArrendante; cv.setAttribute('disabled','disabled'); }
        }
        var novoJson = JSON.stringify([{"CpfCnpj":cpfArrendanteOriginal, "Nome":nomeArrendante}]);
        if(nt) { nt.value = novoJson; nt.setAttribute('value', novoJson); }
        ['Placa','Renavam','DataInicio','DataFim'].forEach(function(id){
            var el = document.getElementById(id); if(el && el.getAttribute('cpfcnpjs')) el.setAttribute('cpfcnpjs',novoJson);
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
        cp.removeAttribute('disabled'); cp.focus();
        var pLimpa = (arr.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
        await typeSlowly(cp, pLimpa, 80);
        cp.dispatchEvent(new Event('blur',{bubbles:true}));
    }
    await delay(300);

    var cr = document.getElementById('Renavam');
    if(cr){
        cr.removeAttribute('disabled'); cr.value = arr.renavam||'';
        cr.dispatchEvent(new Event('input',{bubbles:true})); cr.dispatchEvent(new Event('change',{bubbles:true})); cr.dispatchEvent(new Event('blur',{bubbles:true}));
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
            await delay(1000); waitLimit++;
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
            af.removeAttribute('disabled'); af.focus();
            await typeSlowly(af, cpfArrendatario, 60);
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
      if (returnUrl) { gmSet('omega_return_url',''); salvarEstado('tarefa_pendente_navegacao', task); window.location.href = returnUrl; }
    }catch(e){enviarStatus('error','Arrendamento falhou.');}
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
  if(isANTT&&U&&U.restaurarAbaSalva)nativeSetTimeout(function(){U.restaurarAbaSalva();},500);
})();
