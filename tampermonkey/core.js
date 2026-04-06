// core.js — Omega Painel: estrutura base (v62 — Omega Premium Theme)
(function(){
  if(document.getElementById('antt-helper'))return;

  window.OmegaJQ  = unsafeWindow.jQuery || unsafeWindow.$;
  window.OmegaMom = unsafeWindow.moment;

  window._setTimeoutNativo = unsafeWindow.setTimeout.bind(unsafeWindow);
  window._omegaAutomacaoAtiva = false;

  window.ST = function(fn, ms){
    return window._setTimeoutNativo ? window._setTimeoutNativo(fn, ms) : setTimeout(fn, ms);
  };

  // ── Outfit font inject ──────────────────────────────────────────
  var fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;500;700;900&display=swap';
  document.head.appendChild(fontLink);

  // ── CSS global — Omega Premium Theme ─────────────────────────────
  var css = document.createElement('style');
  css.id = 'omega-theme';
  css.textContent = ''
    +'#antt-helper{'
      +'position:fixed;top:20px;right:20px;z-index:999999;'
      +'background:rgba(14,18,32,0.92);'
      +'border:1px solid rgba(255,255,255,0.06);'
      +'border-radius:20px;padding:18px;'
      +'box-shadow:0 24px 80px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.03) inset;'
      +'font-family:"Outfit","Segoe UI",Arial,sans-serif;'
      +'width:440px;color:#e0e4ef;'
      +'backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);'
    +'}'
    // Header (drag handle)
    +'.om-header{text-align:center;margin-bottom:12px;cursor:grab;user-select:none}'
    +'.om-header:active{cursor:grabbing}'
    +'.om-logo{'
      +'font-size:22px;font-weight:900;letter-spacing:6px;'
      +'background:linear-gradient(135deg,#5a9cf5 0%,#a78bfa 50%,#5a9cf5 100%);'
      +'background-size:200% 200%;'
      +'-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;'
      +'animation:omShimmer 4s ease-in-out infinite;'
    +'}'
    +'@keyframes omShimmer{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}'
    +'.om-sub{font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:3px;text-transform:uppercase;font-weight:300}'
    +'.om-close,.om-min{'
      +'position:absolute;top:16px;cursor:pointer;font-size:14px;color:rgba(255,255,255,0.25);'
      +'transition:color 0.25s;user-select:none;'
    +'}'
    +'.om-close:hover,.om-min:hover{color:#e0e4ef}'
    +'.om-close{right:18px}'
    +'.om-min{right:42px}'
    // Abas
    +'#omega-tabs{display:grid;gap:4px;margin-bottom:12px}'
    +'#omega-tabs button{'
      +'padding:9px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;'
      +'font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.5px;'
      +'transition:all 0.25s;background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.35);'
      +'font-family:"Outfit","Segoe UI",sans-serif;'
    +'}'
    +'#omega-tabs button:hover{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)}'
    +'#omega-tabs button.om-aba-ativa{'
      +'background:linear-gradient(135deg,#1a5fd4,#534ab7);'
      +'color:#fff;border-color:transparent;'
      +'box-shadow:0 4px 20px rgba(26,95,212,0.3);'
      +'text-shadow:0 1px 3px rgba(0,0,0,0.2);'
    +'}'
    // Rodape
    +'.om-hr{border:none;border-top:1px solid rgba(255,255,255,0.05);margin:12px 0}'
    +'.om-rodape{display:flex;align-items:center;gap:6px}'
    +'.om-api-status{font-size:10px;color:rgba(255,255,255,0.2);flex:1;letter-spacing:0.5px}'
    +'.om-btn-api{'
      +'padding:5px 12px;background:rgba(255,255,255,0.04);'
      +'border:1px solid rgba(255,255,255,0.06);border-radius:8px;'
      +'font-size:10px;color:rgba(255,255,255,0.3);cursor:pointer;transition:all 0.25s;'
      +'font-family:"Outfit","Segoe UI",sans-serif;letter-spacing:0.3px;'
    +'}'
    +'.om-btn-api:hover{background:rgba(255,255,255,0.08);color:#e0e4ef;border-color:rgba(255,255,255,0.1)}'
    // Botoes
    +'.om-btn{'
      +'padding:9px 16px;border:none;border-radius:10px;'
      +'font-size:12px;font-weight:700;cursor:pointer;'
      +'transition:all 0.25s;letter-spacing:0.3px;'
      +'font-family:"Outfit","Segoe UI",sans-serif;'
    +'}'
    +'.om-btn:active{transform:scale(0.97)}'
    +'.om-btn-blue{background:linear-gradient(135deg,#1a5fd4,#534ab7);color:#fff;box-shadow:0 4px 20px rgba(26,95,212,0.3)}'
    +'.om-btn-blue:hover{box-shadow:0 6px 28px rgba(26,95,212,0.4);transform:translateY(-1px)}'
    +'.om-btn-green{background:linear-gradient(135deg,#34a853,#2d8f47);color:#fff;box-shadow:0 4px 20px rgba(52,168,83,0.25)}'
    +'.om-btn-green:hover{box-shadow:0 6px 28px rgba(52,168,83,0.35);transform:translateY(-1px)}'
    +'.om-btn-purple{background:linear-gradient(135deg,#a78bfa,#534ab7);color:#fff;box-shadow:0 4px 20px rgba(167,139,250,0.25)}'
    +'.om-btn-purple:hover{box-shadow:0 6px 28px rgba(167,139,250,0.35);transform:translateY(-1px)}'
    +'.om-btn-coral{background:linear-gradient(135deg,#e07065,#c0392b);color:#fff;box-shadow:0 4px 20px rgba(224,112,101,0.25)}'
    +'.om-btn-coral:hover{box-shadow:0 6px 28px rgba(224,112,101,0.35);transform:translateY(-1px)}'
    +'.om-btn-sm{padding:5px 12px;font-size:11px;border-radius:8px}'
    +'.om-btn-full{width:100%}'
    +'.om-btn-list{padding:5px 10px;border:none;border-radius:8px;font-size:11px;cursor:pointer;transition:all 0.2s;font-weight:600;font-family:"Outfit",sans-serif}'
    +'.om-btn-list:active{transform:scale(0.95)}'
    +'.om-btn-del{background:rgba(192,57,43,0.1);color:#e07065;border:1px solid rgba(192,57,43,0.15)}'
    +'.om-btn-del:hover{background:rgba(192,57,43,0.18)}'
    // Inputs
    +'.om-input{'
      +'width:100%;padding:10px 12px;'
      +'background:rgba(255,255,255,0.04);'
      +'border:1px solid rgba(255,255,255,0.08);'
      +'border-radius:10px;font-size:12px;color:#e0e4ef;'
      +'outline:none;transition:all 0.3s;box-sizing:border-box;'
      +'font-family:"Outfit","Segoe UI",sans-serif;'
    +'}'
    +'.om-input:focus{border-color:rgba(90,156,245,0.4);background:rgba(255,255,255,0.06);box-shadow:0 0 0 3px rgba(90,156,245,0.08)}'
    +'.om-input::placeholder{color:rgba(255,255,255,0.15)}'
    +'.om-input-sm{padding:7px 9px;font-size:11px}'
    +'.om-select{width:100%;padding:9px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;font-size:11px;color:#e0e4ef;outline:none;box-sizing:border-box;cursor:pointer;font-family:"Outfit",sans-serif;transition:all 0.3s}'
    +'.om-select:focus{border-color:rgba(90,156,245,0.4);background:rgba(255,255,255,0.06)}'
    +'.om-select option{background:#0e121e;color:#e0e4ef}'
    // Labels
    +'.om-label{font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:1px;display:block;margin-bottom:4px;text-transform:uppercase;font-weight:500}'
    +'.om-section-title{font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}'
    // Status
    +'.om-box{margin-top:6px;font-size:11px;border-radius:10px;padding:10px 14px;line-height:1.5}'
    +'.om-box-ok{background:rgba(52,168,83,0.08);color:#5ddb7a;border:1px solid rgba(52,168,83,0.15)}'
    +'.om-box-err{background:rgba(192,57,43,0.08);color:#e07065;border:1px solid rgba(192,57,43,0.15)}'
    // Previews
    +'.om-preview{font-size:10px;color:rgba(255,255,255,0.2);min-height:14px;margin-top:3px}'
    +'.om-preview .ok{color:#5ddb7a}'
    +'.om-preview .warn{color:#f0ad4e}'
    // Badge
    +'.om-badge{'
      +'font-size:11px;font-weight:700;color:#fff;'
      +'background:linear-gradient(135deg,#1a5fd4,#534ab7);'
      +'border-radius:8px;padding:4px 12px;display:inline-block;margin-bottom:8px;'
      +'box-shadow:0 2px 12px rgba(26,95,212,0.25);letter-spacing:0.3px;'
    +'}'
    // Layout
    +'.om-grid{display:grid;gap:6px}'
    +'.om-grid-2{grid-template-columns:1fr 1fr}'
    +'.om-grid-3{grid-template-columns:1fr 1fr 1fr}'
    +'.om-grid-21{grid-template-columns:2fr 1fr}'
    +'.om-flex{display:flex;gap:6px}'
    +'.om-mb-sm{margin-bottom:6px}'
    +'.om-mb{margin-bottom:8px}'
    // Dropzone
    +'.om-dropzone{border:2px dashed rgba(90,156,245,0.2);border-radius:12px;padding:16px;text-align:center;cursor:pointer;margin-bottom:8px;transition:all 0.25s}'
    +'.om-dropzone:hover{border-color:rgba(90,156,245,0.4);background:rgba(90,156,245,0.04)}'
    +'.om-dropzone-active{border-color:rgba(90,156,245,0.5);background:rgba(90,156,245,0.06)}'
    +'.om-drop-txt{font-size:11px;color:rgba(255,255,255,0.25)}'
    +'.om-drop-txt span{font-size:10px}'
    // Historico
    +'.om-hist-item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)}'
    +'.om-hist-item:last-child{border-bottom:none}'
    +'.om-hist-placa{font-size:12px;font-weight:700;color:#e0e4ef}'
    +'.om-hist-tempo{font-size:10px;color:rgba(255,255,255,0.2)}'
    +'.om-hist-scroll{max-height:220px;overflow-y:auto}'
    +'.om-vazio{font-size:11px;color:rgba(255,255,255,0.15);text-align:center;padding:20px 0}'
    // Resumo pre-automacao
    +'.om-resumo{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;margin-bottom:8px;font-size:11px;line-height:1.7}'
    +'.om-resumo-label{color:rgba(255,255,255,0.25);font-size:10px}'
    +'.om-resumo-valor{color:#e0e4ef;font-weight:600}'
    +'.om-resumo-aleatorio{color:#f0ad4e;font-style:italic;font-weight:400}'
  ;
  document.head.appendChild(css);

  // ── Painel principal ────────────────────────────────────────────
  var s = document.createElement('div');
  s.id = 'antt-helper';
  s.innerHTML = ''
    +'<div class="om-header" id="omega-drag-handle">'
      +'<div class="om-logo">OMEGA</div>'
      +'<div class="om-sub">Painel</div>'
    +'</div>'
    +'<span class="om-close" onclick="document.getElementById(\'antt-helper\').remove()">✕</span>'
    +'<span class="om-min" id="omega-minimizar" onclick="OmegaMinimizar()">—</span>'
    +'<div id="omega-tabs"></div>'
    +'<div id="omega-content"></div>'
    +'<hr class="om-hr">'
    +'<div class="om-rodape">'
      +'<span class="om-api-status" id="omega-api-status"></span>'
      +'<button class="om-btn-api" onclick="OmegaConfigAPI()">Chave API</button>'
    +'</div>';
  document.body.appendChild(s);

  // ── Drag para mover o painel ────────────────────────────────────
  (function(){
    var handle = document.getElementById('omega-drag-handle');
    var painel = document.getElementById('antt-helper');
    var dragging = false, offX = 0, offY = 0;

    handle.addEventListener('mousedown', function(e){
      if(e.target.classList.contains('om-close') || e.target.classList.contains('om-min')) return;
      dragging = true;
      var rect = painel.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function(e){
      if(!dragging) return;
      var newX = e.clientX - offX;
      var newY = e.clientY - offY;
      newX = Math.max(0, Math.min(newX, window.innerWidth - painel.offsetWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 40));
      painel.style.left = newX + 'px';
      painel.style.top = newY + 'px';
      painel.style.right = 'auto';
    });

    document.addEventListener('mouseup', function(){
      if(dragging){
        dragging = false;
        try{
          var rect = painel.getBoundingClientRect();
          if(typeof GM_setValue !== 'undefined') GM_setValue('omega_pos', JSON.stringify({left:rect.left, top:rect.top}));
        }catch(e){}
      }
    });

    // Restaurar posição salva
    try{
      var posRaw = (typeof GM_getValue !== 'undefined') ? GM_getValue('omega_pos','') : '';
      if(posRaw){
        var pos = JSON.parse(posRaw);
        if(pos.left >= 0 && pos.top >= 0 && pos.left < window.innerWidth && pos.top < window.innerHeight){
          painel.style.left = pos.left + 'px';
          painel.style.top = pos.top + 'px';
          painel.style.right = 'auto';
        }
      }
    }catch(e){}
  })();

  // ── Sistema de abas (com memoria) ──────────────────────────────
  window._OmegaAbas = [];

  unsafeWindow.OmegaAba = function(abaId) {
    document.querySelectorAll('#omega-tabs button').forEach(function(btn){
      if(btn.getAttribute('data-aba') === abaId) btn.classList.add('om-aba-ativa');
      else btn.classList.remove('om-aba-ativa');
    });
    document.querySelectorAll('#omega-content > [data-aba-content]').forEach(function(el){
      el.style.display = el.getAttribute('data-aba-content') === abaId ? 'block' : 'none';
    });
    if(window._OmegaAbaCallbacks && window._OmegaAbaCallbacks[abaId]){
      window._OmegaAbaCallbacks[abaId]();
    }
    try{ if(typeof GM_setValue !== 'undefined') GM_setValue('omega_aba_ativa', abaId); }catch(e){}
  };

  // ── Utilitários globais ─────────────────────────────────────────
  window.OmegaUtils = {

    box: function(el,ok,msg){
      if(!el)return;
      el.className = 'om-box ' + (ok ? 'om-box-ok' : 'om-box-err');
      el.innerHTML = msg;
    },
    clearBox: function(el){ if(el){ el.className=''; el.innerHTML=''; } },

    fCPF:  function(n){ return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'); },
    fCNPJ: function(n){ return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'); },
    fAuto: function(n){ return n.length===11 ? this.fCPF(n) : this.fCNPJ(n); },

    validarPlaca: function(raw){
      var p = raw.replace(/[^A-Z0-9]/g,'').toUpperCase();
      if(p.length !== 7) return null;
      if(/^[A-Z]{3}[0-9]{4}$/.test(p)) return p;
      if(/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p)) return p;
      return null;
    },
    formatarPlaca: function(p){
      if(!p) return '';
      return /^[A-Z]{3}[0-9]{4}$/.test(p) ? p.substring(0,3)+'-'+p.substring(3) : p;
    },

    getDoc: function(){
      var sel=document.getElementById('CPFCNPJArrendanteTransportador');
      if(sel&&sel.value) return sel.value.replace(/\D/g,'');
      var hid=document.getElementById('CPFCNPJArrendante');
      if(hid&&hid.value) return hid.value.replace(/\D/g,'');
      var m=document.body.innerHTML.match(/value="(\d{11,14})"/);
      return m?m[1]:null;
    },
    getNome: function(){
      var h=document.getElementById('NomeArrendante');
      if(h&&h.value) return h.value.trim();
      var n=document.getElementById('NomesTransportador');
      if(n&&n.value){try{var a=JSON.parse(n.value);if(a&&a[0]&&a[0].Nome) return a[0].Nome.trim();}catch(e){}}
      var m=document.body.innerHTML.match(/Bem-vindo\(a\),\s*<i>([^<]+)<\/i>/);
      return m?m[1].trim():null;
    },

    substituirTudo: function(antigo,novo){
      if(!antigo||!novo) return {total:0};
      function tr(t){ return (!t||typeof t!=='string') ? t : t.replaceAll(antigo,novo); }
      var ta=0,tv=0,tt=0;
      document.querySelectorAll('*').forEach(function(el){
        for(var i=0;i<el.attributes.length;i++){var a=el.attributes[i];if(a.value.includes(antigo)){var b=a.value;a.value=tr(a.value);if(a.value!==b)ta++;}}
        if(typeof el.value==='string'&&el.value.includes(antigo)){var b=el.value;el.value=tr(el.value);if(el.value!==b)tv++;}
      });
      var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      var nd;while(nd=w.nextNode()){if(nd.nodeValue.includes(antigo)){var b=nd.nodeValue;nd.nodeValue=tr(nd.nodeValue);if(nd.nodeValue!==b)tt++;}}
      return {atributos:ta,values:tv,textos:tt,total:ta+tv+tt};
    },

    injetarData: function(divId,valor){
      var jq=window.OmegaJQ, mom=window.OmegaMom;
      if(!jq||!mom) return false;
      var divWrapper=jq('#'+divId), inputEl=divWrapper.find('input').first();
      if(!inputEl.length) return false;
      inputEl.removeAttr('disabled').removeAttr('readonly');
      try{var dp=divWrapper.data('DateTimePicker');if(dp){dp.date(mom(valor,'DD/MM/YYYY'));return true;}}catch(e){}
      try{divWrapper.datetimepicker({format:'DD/MM/YYYY'});divWrapper.data('DateTimePicker').date(mom(valor,'DD/MM/YYYY'));return true;}catch(e){}
      inputEl.val(valor);inputEl.trigger('input').trigger('change').trigger('blur').trigger('dp.change');
      divWrapper.trigger('dp.change').trigger('change');
      return inputEl.val()===valor;
    },

    registrarAba: function(id, label, html, onShow){
      var tabsDiv=document.getElementById('omega-tabs'), contentDiv=document.getElementById('omega-content');
      var btn=document.createElement('button');
      btn.setAttribute('data-aba',id); btn.textContent=label;
      btn.onclick=function(){OmegaAba(id);};
      tabsDiv.appendChild(btn);
      var total=tabsDiv.children.length;
      tabsDiv.style.gridTemplateColumns='repeat('+total+', 1fr)';
      var div=document.createElement('div');
      div.setAttribute('data-aba-content',id); div.style.display='none'; div.innerHTML=html;
      contentDiv.appendChild(div);
      if(onShow){if(!window._OmegaAbaCallbacks) window._OmegaAbaCallbacks={}; window._OmegaAbaCallbacks[id]=onShow;}
      if(total===1){
        var salva='';
        try{ salva = (typeof GM_getValue !== 'undefined') ? GM_getValue('omega_aba_ativa','') : ''; }catch(e){}
        if(!salva) OmegaAba(id);
      }
    },

    restaurarAbaSalva: function(){
      try{
        var salva = (typeof GM_getValue !== 'undefined') ? GM_getValue('omega_aba_ativa','') : '';
        if(salva){
          var existe = document.querySelector('#omega-tabs button[data-aba="'+salva+'"]');
          if(existe) OmegaAba(salva);
          else OmegaAba(document.querySelector('#omega-tabs button').getAttribute('data-aba'));
        }
      }catch(e){}
    },

    addSecao: function(html){ document.getElementById('omega-content').insertAdjacentHTML('beforeend', html); },

    getApiKey: function(){ return (typeof GM_getValue!=='undefined') ? GM_getValue('omega_api_key','') : localStorage.getItem('omega_api_key')||''; },
    setApiKey: function(key){ if(typeof GM_setValue!=='undefined') GM_setValue('omega_api_key',key); else localStorage.setItem('omega_api_key',key); },

    // ── Helpers de automacao ──────────────────────────────────────
    matarTimers: function(){
      try{var idRef=unsafeWindow.setTimeout(function(){},1);unsafeWindow.clearTimeout(idRef);for(var i=idRef;i>Math.max(0,idRef-500);i--){unsafeWindow.clearInterval(i);unsafeWindow.clearTimeout(i);}}catch(e){}
      document.querySelectorAll('.toast-close-button').forEach(function(btn){try{btn.click();}catch(e){}});
    },
    poll: function(condicaoFn, acaoFn, opts){
      opts=opts||{}; var max=opts.maxTentativas||40, ms=opts.intervalo||200, tent=0;
      function check(){tent++;var r=condicaoFn();if(r)acaoFn(r);else if(tent<max)ST(check,ms);else if(opts.onTimeout)opts.onTimeout();}
      check();
    },
    digitarCharAChar: function(campo, texto, opts){
      opts=opts||{}; var delay=opts.delay||80, de=opts.delayEspecial||{};
      campo.value=''; campo.focus(); campo.dispatchEvent(new Event('focus',{bubbles:true}));
      var i=0;
      function prox(){
        if(i>=texto.length){campo.dispatchEvent(new Event('change',{bubbles:true}));campo.dispatchEvent(new Event('blur',{bubbles:true}));if(opts.onDone)ST(opts.onDone,200);return;}
        var ch=texto[i]; campo.value=texto.substring(0,i+1);
        campo.dispatchEvent(new Event('input',{bubbles:true}));campo.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key:ch}));
        i++; ST(prox,de[i]||delay);
      }
      prox();
    },
    marcarICheck: function(cb){
      if(!cb)return; var jqR=unsafeWindow.jQuery||unsafeWindow.$;
      try{jqR(cb).iCheck('check');}catch(e){} cb.checked=true; jqR(cb).trigger('ifChecked').trigger('change');
    },
    fecharModal: function(){
      var btn=document.querySelector('.modal.show .close, .modal.show [data-dismiss="modal"]');
      if(btn) btn.click();
      ST(function(){document.querySelectorAll('.modal-backdrop').forEach(function(el){el.remove();});document.body.classList.remove('modal-open');},300);
    },
    guardClique: function(el, tempoMs){
      if(!el||el._omegaClicado) return false;
      el._omegaClicado=true; ST(function(){el._omegaClicado=false;},tempoMs||10000); return true;
    },

    HIST_KEY:'omega_historico', HIST_TTL:86400000,
    carregarHistorico: function(){try{var raw=(typeof GM_getValue!=='undefined')?GM_getValue(this.HIST_KEY,'[]'):localStorage.getItem(this.HIST_KEY)||'[]';var self=this;return JSON.parse(raw).filter(function(i){return(Date.now()-i.ts)<self.HIST_TTL;});}catch(e){return[];}},
    salvarHistorico: function(lista){var raw=JSON.stringify(lista);if(typeof GM_setValue!=='undefined')GM_setValue(this.HIST_KEY,raw);else localStorage.setItem(this.HIST_KEY,raw);},
    adicionarHistorico: function(dados){var lista=this.carregarHistorico().filter(function(i){return i.placa!==dados.placa;});lista.unshift({placa:dados.placa,renavam:dados.renavam,cpf:dados.cpf,nome:dados.nome,ts:Date.now()});this.salvarHistorico(lista);},
    tempoRelativo: function(ts){var d=Date.now()-ts,min=Math.floor(d/60000),hrs=Math.floor(d/3600000);return min<1?'agora':min<60?'ha '+min+'min':'ha '+hrs+'h';},
    parseCodigo: function(codigo){var dados={};codigo.split('|').forEach(function(par){var idx=par.indexOf('=');if(idx!==-1)dados[par.substring(0,idx).trim()]=par.substring(idx+1).trim();});return dados;},
    gerarEmail: function(){var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<12;i++)s+=c[Math.floor(Math.random()*c.length)];return s+'@yahoo.com';},
    CEPS:{MG:['32220-390','32017-900','32280-370'],SP:['04805-140','01002-900','08062-700'],RJ:['23032-486','20211-110','22793-620']},
    cepAleatorio: function(estado){var l=this.CEPS[estado]||this.CEPS.MG;return l[Math.floor(Math.random()*l.length)];}
  };

  window.OmegaMatarTimers = function(){ window.OmegaUtils.matarTimers(); };

  unsafeWindow.addEventListener('beforeunload', function(e){
    if(window._omegaAutomacaoAtiva){e.preventDefault();e.returnValue='';return'';}
  }, true);

  unsafeWindow.OmegaMinimizar = function(){
    var p=document.getElementById('antt-helper');
    var tabs=document.getElementById('omega-tabs'), cnt=document.getElementById('omega-content');
    var hr=p.querySelector('.om-hr'), rod=p.querySelector('.om-rodape');
    var btn=document.getElementById('omega-minimizar');
    var min=p.getAttribute('data-minimizado')==='1';
    var els=[tabs,cnt,hr,rod];
    if(min){els.forEach(function(el){if(el)el.style.display='';});p.style.width='440px';p.setAttribute('data-minimizado','0');if(btn)btn.textContent='—';}
    else{els.forEach(function(el){if(el)el.style.display='none';});p.style.width='160px';p.setAttribute('data-minimizado','1');if(btn)btn.textContent='▢';}
  };

  unsafeWindow.OmegaConfigAPI = function(){
    var atual=window.OmegaUtils.getApiKey();
    var nova=prompt('Cole sua chave da API Anthropic (sk-ant-...):',atual?'********':'');
    if(nova&&nova!=='********'){window.OmegaUtils.setApiKey(nova.trim());_atualizarStatusAPI();}
  };

  function _atualizarStatusAPI(){
    var el=document.getElementById('omega-api-status'), key=window.OmegaUtils.getApiKey();
    if(el) el.textContent=key?'API configurada':'API nao configurada';
  }
  _atualizarStatusAPI();
})();
