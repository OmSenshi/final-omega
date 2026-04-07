// core.js — Omega Painel v3.2: UI responsiva + FAB Esquerdo
(function(){
  if(document.getElementById('antt-helper'))return;

  window.OmegaJQ  = unsafeWindow.jQuery || unsafeWindow.$;
  window.OmegaMom = unsafeWindow.moment;
  window._setTimeoutNativo = unsafeWindow.setTimeout.bind(unsafeWindow);
  window._omegaAutomacaoAtiva = false;
  window.ST = function(fn, ms){ return window._setTimeoutNativo ? window._setTimeoutNativo(fn, ms) : setTimeout(fn, ms); };

  var isMobile = window.innerWidth <= 768 || 'ontouchstart' in window;

  var css = document.createElement('style');
  css.id = 'omega-theme';
  css.textContent = ''
    +'#antt-helper{'
      +'position:fixed;top:20px;right:20px;z-index:999999;'
      +'background:rgba(14,18,30,0.97);'
      +'border:1px solid rgba(255,255,255,0.06);'
      +'border-radius:16px;padding:16px;'
      +'box-shadow:0 8px 40px rgba(0,0,0,0.5);'
      +'font-family:"Segoe UI",Arial,sans-serif;'
      +'width:440px;color:#c8cdd8;'
      +'backdrop-filter:blur(20px);'
      +'transition:all 0.3s ease;'
    +'}'
    +'.om-hidden{opacity:0!important;pointer-events:none!important;transform:scale(0.95)}'
    +'@media(max-width:768px){'
      +'#antt-helper{'
        +'position:fixed!important;bottom:0!important;left:0!important;right:auto!important;top:auto!important;'
        +'width:100%!important;max-height:85vh;overflow-y:auto;'
        +'border-radius:20px 20px 0 0;padding:12px 14px;'
        +'box-shadow:0 -8px 40px rgba(0,0,0,0.6);'
      +'}'
      +'#antt-helper.om-hidden{transform:translateY(100%)!important;pointer-events:none;opacity:0}'
      +'#omega-tabs{grid-template-columns:repeat(auto-fit,minmax(60px,1fr))!important}'
      +'#omega-tabs button{padding:6px 4px!important;font-size:10px!important}'
      +'.om-grid-2{grid-template-columns:1fr 1fr}'
      +'.om-input{font-size:14px!important;padding:10px!important}'
      +'.om-btn{padding:12px 16px!important;font-size:13px!important}'
      +'.om-header{padding:4px 0 8px;margin-bottom:6px}'
    +'}'
    +'#omega-fab{'
      +'display:none;position:fixed;z-index:999998;'
      +'width:56px;height:56px;border-radius:50%;'
      +'background:linear-gradient(135deg,#1a73e8,#1557b0);'
      +'color:#fff;font-size:16px;font-weight:900;letter-spacing:1px;'
      +'border:none;cursor:pointer;'
      +'box-shadow:0 4px 20px rgba(26,115,232,0.4);'
      +'display:flex;align-items:center;justify-content:center;'
      +'transition:transform 0.2s;user-select:none;touch-action:none;'
    +'}'
    +'#omega-fab:active{transform:scale(0.92)}'
    +'#omega-fab.om-fab-connected{background:linear-gradient(135deg,#34a853,#2d8f47);box-shadow:0 4px 20px rgba(52,168,83,0.4)}'
    +'#omega-toasts{'
      +'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);'
      +'z-index:999997;display:flex;flex-direction:column-reverse;gap:8px;'
      +'pointer-events:none;max-width:90vw;'
    +'}'
    +'.om-toast{'
      +'background:rgba(14,18,30,0.95);border:1px solid rgba(255,255,255,0.1);'
      +'border-radius:10px;padding:10px 16px;font-size:12px;color:#c8cdd8;'
      +'backdrop-filter:blur(20px);box-shadow:0 4px 20px rgba(0,0,0,0.4);'
      +'animation:toastIn 0.3s ease,toastOut 0.3s ease 2.7s forwards;'
      +'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;'
      +'font-family:"Segoe UI",Arial,sans-serif;'
    +'}'
    +'.om-toast-ok{border-left:3px solid #34a853}'
    +'.om-toast-err{border-left:3px solid #e07065}'
    +'@keyframes toastIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}'
    +'@keyframes toastOut{to{opacity:0;transform:translateY(-10px)}}'
    +'.om-swipe-handle{width:40px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;margin:0 auto 8px;display:none}'
    +'@media(max-width:768px){.om-swipe-handle{display:block}}'
    +'.om-header{text-align:center;margin-bottom:10px;cursor:grab;user-select:none}'
    +'.om-header:active{cursor:grabbing}'
    +'.om-logo{font-size:22px;font-weight:800;color:#1a73e8;letter-spacing:4px}'
    +'.om-sub{font-size:10px;color:#555e70;letter-spacing:2px;text-transform:uppercase}'
    +'.om-close,.om-min{position:absolute;top:14px;cursor:pointer;font-size:15px;color:#555e70;transition:color 0.2s;user-select:none}'
    +'.om-close:hover,.om-min:hover{color:#c8cdd8}'
    +'.om-close{right:16px}.om-min{right:40px}'
    +'#omega-tabs{display:grid;gap:4px;margin-bottom:12px}'
    +'#omega-tabs button{padding:8px;border:1px solid rgba(26,115,232,0.2);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.5px;transition:all 0.2s;background:rgba(26,115,232,0.06);color:#5a9cf5}'
    +'#omega-tabs button:hover{background:rgba(26,115,232,0.12);border-color:rgba(26,115,232,0.3)}'
    +'#omega-tabs button.om-aba-ativa{background:linear-gradient(135deg,#1a73e8,#1557b0);color:#fff;border-color:transparent;box-shadow:0 2px 12px rgba(26,115,232,0.3)}'
    +'.om-hr{border:none;border-top:1px solid rgba(255,255,255,0.05);margin:12px 0}'
    +'.om-rodape{display:flex;align-items:center;gap:6px}'
    +'.om-api-status{font-size:10px;color:#555e70;flex:1}'
    +'.om-btn-api{padding:5px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:6px;font-size:10px;color:#8a92a6;cursor:pointer;transition:all 0.2s}'
    +'.om-btn-api:hover{background:rgba(255,255,255,0.08);color:#c8cdd8}'
    +'.om-btn{padding:9px 16px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;letter-spacing:0.3px}'
    +'.om-btn:active{transform:scale(0.97)}'
    +'.om-btn-blue{background:linear-gradient(135deg,#1a73e8,#1557b0);color:#fff;box-shadow:0 2px 12px rgba(26,115,232,0.25)}'
    +'.om-btn-green{background:linear-gradient(135deg,#34a853,#2d8f47);color:#fff;box-shadow:0 2px 12px rgba(52,168,83,0.25)}'
    +'.om-btn-purple{background:linear-gradient(135deg,#6f42c1,#5a35a0);color:#fff;box-shadow:0 2px 12px rgba(111,66,193,0.25)}'
    +'.om-btn-coral{background:linear-gradient(135deg,#e07065,#c0392b);color:#fff;box-shadow:0 2px 12px rgba(224,112,101,0.25)}'
    +'.om-btn-amber{background:linear-gradient(135deg,#f0ad4e,#d4941f);color:#fff;box-shadow:0 2px 12px rgba(240,173,78,0.25)}'
    +'.om-btn-sm{padding:5px 12px;font-size:11px;border-radius:6px}'
    +'.om-btn-full{width:100%}'
    +'.om-btn-list{padding:5px 10px;border:none;border-radius:6px;font-size:11px;cursor:pointer;transition:all 0.2s;font-weight:500}'
    +'.om-btn-del{background:rgba(192,57,43,0.12);color:#e07065;border:1px solid rgba(192,57,43,0.15)}'
    +'.om-input{width:100%;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;font-size:12px;color:#c8cdd8;outline:none;transition:border-color 0.2s;box-sizing:border-box}'
    +'.om-input:focus{border-color:rgba(26,115,232,0.4);background:rgba(255,255,255,0.06)}'
    +'.om-input::placeholder{color:#3a3f4e}'
    +'.om-input-sm{padding:6px 8px;font-size:11px}'
    +'.om-select{width:100%;padding:7px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;font-size:11px;color:#c8cdd8;outline:none;box-sizing:border-box;cursor:pointer}'
    +'.om-select option{background:#0e121e;color:#c8cdd8}'
    +'.om-label{font-size:10px;color:#555e70;letter-spacing:0.5px;display:block;margin-bottom:3px}'
    +'.om-section-title{font-size:10px;font-weight:600;color:#8a92a6;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}'
    +'.om-box{margin-top:6px;font-size:11px;border-radius:8px;padding:8px 12px;line-height:1.5}'
    +'.om-box-ok{background:rgba(52,168,83,0.08);color:#5ddb7a;border:1px solid rgba(52,168,83,0.15)}'
    +'.om-box-err{background:rgba(192,57,43,0.08);color:#e07065;border:1px solid rgba(192,57,43,0.15)}'
    +'.om-preview{font-size:10px;color:#555e70;min-height:14px;margin-top:3px}'
    +'.om-preview .ok{color:#5ddb7a}.om-preview .warn{color:#f0ad4e}'
    +'.om-badge{font-size:11px;font-weight:600;color:#fff;background:linear-gradient(135deg,#1a73e8,#1557b0);border-radius:6px;padding:3px 10px;display:inline-block;margin-bottom:8px}'
    +'.om-grid{display:grid;gap:6px}.om-grid-2{grid-template-columns:1fr 1fr}.om-grid-3{grid-template-columns:1fr 1fr 1fr}.om-grid-21{grid-template-columns:2fr 1fr}'
    +'.om-flex{display:flex;gap:6px}.om-mb-sm{margin-bottom:6px}.om-mb{margin-bottom:8px}'
    +'.om-dropzone{border:2px dashed rgba(26,115,232,0.25);border-radius:10px;padding:16px;text-align:center;cursor:pointer;margin-bottom:8px;transition:all 0.2s}'
    +'.om-dropzone:hover{border-color:rgba(26,115,232,0.45);background:rgba(26,115,232,0.04)}'
    +'.om-dropzone-active{border-color:rgba(26,115,232,0.5);background:rgba(26,115,232,0.06)}'
    +'.om-drop-txt{font-size:11px;color:#555e70}.om-drop-txt span{font-size:10px}'
    +'.om-hist-item{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04)}'
    +'.om-hist-item:last-child{border-bottom:none}'
    +'.om-hist-placa{font-size:12px;font-weight:700;color:#c8cdd8}'
    +'.om-hist-tempo{font-size:10px;color:#555e70}'
    +'.om-hist-scroll{max-height:220px;overflow-y:auto}'
    +'.om-vazio{font-size:11px;color:#3a3f4e;text-align:center;padding:20px 0}'
    +'.om-resumo{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:11px;line-height:1.7}'
    +'.om-resumo-label{color:#555e70;font-size:10px}.om-resumo-valor{color:#c8cdd8;font-weight:600}.om-resumo-aleatorio{color:#f0ad4e;font-style:italic}'
    +'.om-log{background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:6px 8px;max-height:140px;overflow-y:auto;font-family:monospace;font-size:10px;color:#8a92a6;line-height:1.6;margin-top:6px}'
    +'.om-log-ok{color:#5ddb7a}.om-log-err{color:#e07065}.om-log-warn{color:#f0ad4e}'
  ;
  document.head.appendChild(css);

  var toastContainer = document.createElement('div');
  toastContainer.id = 'omega-toasts';
  document.body.appendChild(toastContainer);

  // FAB posicionado à esquerda!
  var fab = document.createElement('button');
  fab.id = 'omega-fab';
  fab.textContent = 'Ω';
  fab.style.display = 'none';
  fab.style.bottom = '20px';
  fab.style.left = '20px'; 
  document.body.appendChild(fab);

  (function(){
    var dragging=false, startX=0, startY=0, fabX=0, fabY=0, moved=false;
    fab.addEventListener('touchstart',function(e){
      dragging=true; moved=false;
      var t=e.touches[0]; startX=t.clientX; startY=t.clientY;
      var r=fab.getBoundingClientRect(); fabX=r.left; fabY=r.top;
      e.preventDefault();
    },{passive:false});
    document.addEventListener('touchmove',function(e){
      if(!dragging)return;
      var t=e.touches[0], dx=t.clientX-startX, dy=t.clientY-startY;
      if(Math.abs(dx)>5||Math.abs(dy)>5) moved=true;
      var nx=fabX+dx, ny=fabY+dy;
      nx=Math.max(0,Math.min(nx,window.innerWidth-60));
      ny=Math.max(0,Math.min(ny,window.innerHeight-60));
      fab.style.left=nx+'px'; fab.style.top=ny+'px';
      fab.style.right='auto'; fab.style.bottom='auto';
    });
    document.addEventListener('touchend',function(){
      if(dragging && !moved) { unsafeWindow.OmegaExpandir(); }
      dragging=false;
    });
    // Drag no mouse para desktop
    fab.addEventListener('mousedown',function(e){
      dragging=true; moved=false;
      startX=e.clientX; startY=e.clientY;
      var r=fab.getBoundingClientRect(); fabX=r.left; fabY=r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove',function(e){
      if(!dragging)return;
      var dx=e.clientX-startX, dy=e.clientY-startY;
      if(Math.abs(dx)>5||Math.abs(dy)>5) moved=true;
      var nx=fabX+dx, ny=fabY+dy;
      nx=Math.max(0,Math.min(nx,window.innerWidth-60));
      ny=Math.max(0,Math.min(ny,window.innerHeight-60));
      fab.style.left=nx+'px'; fab.style.top=ny+'px';
      fab.style.right='auto'; fab.style.bottom='auto';
    });
    document.addEventListener('mouseup',function(){
      if(dragging && !moved) { unsafeWindow.OmegaExpandir(); }
      dragging=false;
    });
  })();

  var s = document.createElement('div');
  s.id = 'antt-helper';
  s.innerHTML = ''
    +'<div class="om-swipe-handle"></div>'
    +'<div class="om-header" id="omega-drag-handle">'
      +'<div class="om-logo">OMEGA</div>'
      +'<div class="om-sub">Painel v3.2</div>'
    +'</div>'
    +'<span class="om-close" onclick="document.getElementById(\'antt-helper\').remove();document.getElementById(\'omega-fab\').style.display=\'none\'">✕</span>'
    +'<span class="om-min" id="omega-minimizar" onclick="OmegaMinimizar()">—</span>'
    +'<div id="omega-tabs"></div>'
    +'<div id="omega-content"></div>'
    +'<hr class="om-hr">'
    +'<div class="om-rodape">'
      +'<span class="om-api-status" id="omega-api-status"></span>'
      +'<button class="om-btn-api" onclick="OmegaConfigAPI()">Chave API</button>'
    +'</div>';
  document.body.appendChild(s);

  (function(){
    var handle=document.getElementById('omega-drag-handle'),painel=document.getElementById('antt-helper');
    var dragging=false,offX=0,offY=0;
    handle.addEventListener('mousedown',function(e){
      if(e.target.classList.contains('om-close')||e.target.classList.contains('om-min'))return;
      if(isMobile)return;
      dragging=true;var rect=painel.getBoundingClientRect();offX=e.clientX-rect.left;offY=e.clientY-rect.top;e.preventDefault();
    });
    document.addEventListener('mousemove',function(e){
      if(!dragging)return;
      var nx=e.clientX-offX,ny=e.clientY-offY;
      nx=Math.max(0,Math.min(nx,window.innerWidth-painel.offsetWidth));
      ny=Math.max(0,Math.min(ny,window.innerHeight-40));
      painel.style.left=nx+'px';painel.style.top=ny+'px';painel.style.right='auto';
    });
    document.addEventListener('mouseup',function(){
      if(dragging){dragging=false;try{var r=painel.getBoundingClientRect();if(typeof GM_setValue!=='undefined')GM_setValue('omega_pos',JSON.stringify({left:r.left,top:r.top}));}catch(e){}}
    });
    if(!isMobile){
      try{var pr=(typeof GM_getValue!=='undefined')?GM_getValue('omega_pos',''):'';if(pr){var p=JSON.parse(pr);if(p.left>=0&&p.top>=0&&p.left<window.innerWidth&&p.top<window.innerHeight){painel.style.left=p.left+'px';painel.style.top=p.top+'px';painel.style.right='auto';}}}catch(e){}
    }
  })();

  window._OmegaAbas = [];
  unsafeWindow.OmegaAba = function(abaId){
    document.querySelectorAll('#omega-tabs button').forEach(function(btn){
      btn.classList.toggle('om-aba-ativa',btn.getAttribute('data-aba')===abaId);
    });
    document.querySelectorAll('#omega-content > [data-aba-content]').forEach(function(el){
      el.style.display=el.getAttribute('data-aba-content')===abaId?'block':'none';
    });
    if(window._OmegaAbaCallbacks&&window._OmegaAbaCallbacks[abaId]) window._OmegaAbaCallbacks[abaId]();
    try{if(typeof GM_setValue!=='undefined')GM_setValue('omega_aba_ativa',abaId);}catch(e){}
  };

  // Agora minimizar funciona igual no mobile e no PC (some a tela e mostra a bolinha)
  unsafeWindow.OmegaMinimizar = function(){
    var p=document.getElementById('antt-helper');
    p.classList.add('om-hidden');
    fab.style.display='flex';
  };

  unsafeWindow.OmegaExpandir = function(){
    var p=document.getElementById('antt-helper');
    p.classList.remove('om-hidden');
    fab.style.display='none';
  };

  if(isMobile){
    ST(function(){
      var p=document.getElementById('antt-helper');
      p.classList.add('om-hidden');
      fab.style.display='flex';
    }, 500);
  }

  window.OmegaUtils = {
    box: function(el,ok,msg){if(!el)return;el.className='om-box '+(ok?'om-box-ok':'om-box-err');el.innerHTML=msg;},
    clearBox: function(el){if(el){el.className='';el.innerHTML='';}},
    fCPF: function(n){return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');},
    fCNPJ: function(n){return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');},
    fAuto: function(n){return n.length===11?this.fCPF(n):this.fCNPJ(n);},
    validarPlaca: function(raw){var p=raw.replace(/[^A-Z0-9]/g,'').toUpperCase();if(p.length!==7)return null;if(/^[A-Z]{3}[0-9]{4}$/.test(p))return p;if(/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p))return p;return null;},
    formatarPlaca: function(p){if(!p)return'';return/^[A-Z]{3}[0-9]{4}$/.test(p)?p.substring(0,3)+'-'+p.substring(3):p;},
    getDoc: function(){var sel=document.getElementById('CPFCNPJArrendanteTransportador');if(sel&&sel.value)return sel.value.replace(/\D/g,'');var hid=document.getElementById('CPFCNPJArrendante');if(hid&&hid.value)return hid.value.replace(/\D/g,'');var m=document.body.innerHTML.match(/value="(\d{11,14})"/);return m?m[1]:null;},
    getNome: function(){var h=document.getElementById('NomeArrendante');if(h&&h.value)return h.value.trim();var n=document.getElementById('NomesTransportador');if(n&&n.value){try{var a=JSON.parse(n.value);if(a&&a[0]&&a[0].Nome)return a[0].Nome.trim();}catch(e){}}var m=document.body.innerHTML.match(/Bem-vindo\(a\),\s*<i>([^<]+)<\/i>/);return m?m[1].trim():null;},
    substituirTudo: function(antigo,novo){if(!antigo||!novo)return{total:0};function tr(t){return(!t||typeof t!=='string')?t:t.replaceAll(antigo,novo);}var ta=0,tv=0,tt=0;document.querySelectorAll('*').forEach(function(el){for(var i=0;i<el.attributes.length;i++){var a=el.attributes[i];if(a.value.includes(antigo)){var b=a.value;a.value=tr(a.value);if(a.value!==b)ta++;}}if(typeof el.value==='string'&&el.value.includes(antigo)){var b=el.value;el.value=tr(el.value);if(el.value!==b)tv++;}});var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);var nd;while(nd=w.nextNode()){if(nd.nodeValue.includes(antigo)){var b=nd.nodeValue;nd.nodeValue=tr(nd.nodeValue);if(nd.nodeValue!==b)tt++;}}return{atributos:ta,values:tv,textos:tt,total:ta+tv+tt};},
    injetarData: function(divId,valor){var jq=window.OmegaJQ,mom=window.OmegaMom;if(!jq||!mom)return false;var dw=jq('#'+divId),inp=dw.find('input').first();if(!inp.length)return false;inp.removeAttr('disabled').removeAttr('readonly');try{var dp=dw.data('DateTimePicker');if(dp){dp.date(mom(valor,'DD/MM/YYYY'));return true;}}catch(e){}try{dw.datetimepicker({format:'DD/MM/YYYY'});dw.data('DateTimePicker').date(mom(valor,'DD/MM/YYYY'));return true;}catch(e){}inp.val(valor);inp.trigger('input').trigger('change').trigger('blur').trigger('dp.change');dw.trigger('dp.change').trigger('change');return inp.val()===valor;},
    registrarAba: function(id,label,html,onShow){var tabsDiv=document.getElementById('omega-tabs'),contentDiv=document.getElementById('omega-content');var btn=document.createElement('button');btn.setAttribute('data-aba',id);btn.textContent=label;btn.onclick=function(){OmegaAba(id);};tabsDiv.appendChild(btn);var total=tabsDiv.children.length;tabsDiv.style.gridTemplateColumns='repeat('+total+', 1fr)';var div=document.createElement('div');div.setAttribute('data-aba-content',id);div.style.display='none';div.innerHTML=html;contentDiv.appendChild(div);if(onShow){if(!window._OmegaAbaCallbacks)window._OmegaAbaCallbacks={};window._OmegaAbaCallbacks[id]=onShow;}if(total===1){var salva='';try{salva=(typeof GM_getValue!=='undefined')?GM_getValue('omega_aba_ativa',''):'';}catch(e){}if(!salva)OmegaAba(id);}},
    restaurarAbaSalva: function(){try{var salva=(typeof GM_getValue!=='undefined')?GM_getValue('omega_aba_ativa',''):'';if(salva){var existe=document.querySelector('#omega-tabs button[data-aba="'+salva+'"]');if(existe)OmegaAba(salva);else OmegaAba(document.querySelector('#omega-tabs button').getAttribute('data-aba'));}}catch(e){}},
    addSecao: function(html){document.getElementById('omega-content').insertAdjacentHTML('beforeend',html);},
    getApiKey: function(){return(typeof GM_getValue!=='undefined')?GM_getValue('omega_api_key',''):localStorage.getItem('omega_api_key')||'';},
    setApiKey: function(key){if(typeof GM_setValue!=='undefined')GM_setValue('omega_api_key',key);else localStorage.setItem('omega_api_key',key);},
    matarTimers: function(){try{var id=unsafeWindow.setTimeout(function(){},1);unsafeWindow.clearTimeout(id);for(var i=id;i>Math.max(0,id-500);i--){unsafeWindow.clearInterval(i);unsafeWindow.clearTimeout(i);}}catch(e){}document.querySelectorAll('.toast-close-button').forEach(function(b){try{b.click();}catch(e){}});},
    poll: function(fn,cb,opts){opts=opts||{};var max=opts.maxTentativas||40,ms=opts.intervalo||200,t=0;function ck(){t++;var r=fn();if(r)cb(r);else if(t<max)ST(ck,ms);else if(opts.onTimeout)opts.onTimeout();}ck();},
    digitarCharAChar: function(campo,texto,opts){opts=opts||{};var delay=opts.delay||80,de=opts.delayEspecial||{};campo.value='';campo.focus();campo.dispatchEvent(new Event('focus',{bubbles:true}));var i=0;function prox(){if(i>=texto.length){campo.dispatchEvent(new Event('change',{bubbles:true}));campo.dispatchEvent(new Event('blur',{bubbles:true}));if(opts.onDone)ST(opts.onDone,200);return;}campo.value=texto.substring(0,i+1);campo.dispatchEvent(new Event('input',{bubbles:true}));campo.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key:texto[i]}));i++;ST(prox,de[i]||delay);}prox();},
    marcarICheck: function(cb){if(!cb)return;var jqR=unsafeWindow.jQuery||unsafeWindow.$;try{jqR(cb).iCheck('check');}catch(e){}cb.checked=true;jqR(cb).trigger('ifChecked').trigger('change');},
    fecharModal: function(){var btn=document.querySelector('.modal.show .close, .modal.show [data-dismiss="modal"]');if(btn)btn.click();ST(function(){document.querySelectorAll('.modal-backdrop').forEach(function(el){el.remove();});document.body.classList.remove('modal-open');},300);},
    guardClique: function(el,ms){if(!el||el._omegaClicado)return false;el._omegaClicado=true;ST(function(){el._omegaClicado=false;},ms||10000);return true;},
    HIST_KEY:'omega_historico',HIST_TTL:86400000,
    carregarHistorico: function(){try{var raw=(typeof GM_getValue!=='undefined')?GM_getValue(this.HIST_KEY,'[]'):localStorage.getItem(this.HIST_KEY)||'[]';var self=this;return JSON.parse(raw).filter(function(i){return(Date.now()-i.ts)<self.HIST_TTL;});}catch(e){return[];}},
    salvarHistorico: function(lista){var raw=JSON.stringify(lista);if(typeof GM_setValue!=='undefined')GM_setValue(this.HIST_KEY,raw);else localStorage.setItem(this.HIST_KEY,raw);},
    adicionarHistorico: function(dados){var lista=this.carregarHistorico().filter(function(i){return i.placa!==dados.placa;});lista.unshift({placa:dados.placa,renavam:dados.renavam,cpf:dados.cpf,nome:dados.nome,ts:Date.now()});this.salvarHistorico(lista);},
    tempoRelativo: function(ts){var d=Date.now()-ts,min=Math.floor(d/60000),hrs=Math.floor(d/3600000);return min<1?'agora':min<60?'ha '+min+'min':'ha '+hrs+'h';},
    parseCodigo: function(codigo){var dados={};codigo.split('|').forEach(function(par){var idx=par.indexOf('=');if(idx!==-1)dados[par.substring(0,idx).trim()]=par.substring(idx+1).trim();});return dados;},
    gerarEmail: function(){var c='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<12;i++)s+=c[Math.floor(Math.random()*c.length)];return s+'@yahoo.com';},
    CEPS:{MG:['32220-390','32017-900','32280-370'],SP:['04805-140','01002-900','08062-700'],RJ:['23032-486','20211-110','22793-620']},
    cepAleatorio: function(estado){var l=this.CEPS[estado]||this.CEPS.MG;return l[Math.floor(Math.random()*l.length)];},
    aguardarElemento: function(seletor,callback,opts){opts=opts||{};var max=opts.maxTentativas||60,ms=opts.intervalo||500,t=0;function ck(){t++;var r=null;if(typeof seletor==='function')r=seletor();else{var el=document.querySelector(seletor);if(el&&el.offsetParent!==null)r=el;}if(r)callback(r);else if(t<max)ST(ck,ms);else if(opts.onTimeout)opts.onTimeout();}ck();},

    toast: function(msg, ok){
      var t=document.createElement('div');
      t.className='om-toast '+(ok!==false?'om-toast-ok':'om-toast-err');
      t.textContent=msg;
      var c=document.getElementById('omega-toasts');
      if(c){c.appendChild(t);ST(function(){try{t.remove();}catch(e){}},3000);}
      while(c&&c.children.length>5) c.removeChild(c.firstChild);
    }
  };

  window.OmegaMatarTimers = function(){ window.OmegaUtils.matarTimers(); };
  unsafeWindow.addEventListener('beforeunload',function(e){if(window._omegaAutomacaoAtiva){e.preventDefault();e.returnValue='';return'';}},true);

  unsafeWindow.OmegaConfigAPI = function(){
    var atual=window.OmegaUtils.getApiKey();
    var nova=prompt('Cole sua chave API (sk-ant-...):',atual?'********':'');
    if(nova&&nova!=='********'){window.OmegaUtils.setApiKey(nova.trim());_atualizarStatusAPI();}
  };
  function _atualizarStatusAPI(){var el=document.getElementById('omega-api-status'),key=window.OmegaUtils.getApiKey();if(el)el.textContent=key?'API configurada':'API nao configurada';}
  _atualizarStatusAPI();
})();
