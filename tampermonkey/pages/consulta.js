// pages/consulta.js — modulo: Emissao de Certificado e Extrato (v58 — tema dark)
(function(){
  var U   = window.OmegaUtils;
  var jqR = unsafeWindow.jQuery || unsafeWindow.$;
  var naPaginaConsulta = !!document.getElementById('CpfCnpjTransportadorCertificado');

  U.registrarAba('emissao', 'Emissao', ''
    +'<div class="om-section-title">CPF / CNPJ</div>'
    +'<div id="omega-em-sel-wrapper"><div class="om-vazio">Carregando...</div></div>'
    +'<div id="omega-em-status"></div>'
    +'<div id="omega-em-botoes" style="display:none" class="om-grid om-grid-2">'
      +'<button type="button" id="omega-em-cert" class="om-btn om-btn-green">&#x1F4C4; Carteirinha</button>'
      +'<button type="button" id="omega-em-ext" class="om-btn om-btn-blue">&#x1F4C4; Extrato</button>'
    +'</div>'
  , function(){
    if(window._omegaEmissaoErroMsg){var w=document.getElementById('omega-em-sel-wrapper');if(w){w.innerHTML=window._omegaEmissaoErroMsg;window._omegaEmissaoErroMsg=null;}}
    else if(_opcoesCached!==null) _renderDropdown(_opcoesCached);
  });

  var _urlCert=null, _urlExt=null, _opcoesCached=null;

  function extrairOpcoes(sel){
    if(!sel)return[];
    return Array.from(sel.options).filter(function(o){return o.value!=='';}).map(function(o){return{valor:o.value,texto:o.text.trim(),rntrc:o.getAttribute('data-rntrc')||''};});
  }
  function popularDropdown(opcoes){_opcoesCached=opcoes;var w=document.getElementById('omega-em-sel-wrapper');if(!w)return;_renderDropdown(opcoes);}
  function _renderDropdown(opcoes){
    var w=document.getElementById('omega-em-sel-wrapper');if(!w)return;
    if(!opcoes||opcoes.length===0){w.innerHTML='<div class="om-vazio">Nenhum CPF/CNPJ disponivel.</div>';return;}
    var opts='<option value="">Selecione...</option>';
    opcoes.forEach(function(o){var label=o.texto+(o.rntrc?' — RNTRC: '+o.rntrc:'');opts+='<option value="'+o.valor+'" data-rntrc="'+(o.rntrc||'')+'">'+label+'</option>';});
    w.innerHTML='<select id="omega-em-sel" class="om-select om-mb">'+opts+'</select>';
    document.getElementById('omega-em-sel').addEventListener('change',onSelectChange);
  }

  if(naPaginaConsulta){popularDropdown(extrairOpcoes(document.getElementById('CpfCnpjTransportadorCertificado')));}
  else{
    unsafeWindow.fetch('/Transportador/Consultar').then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();}).then(function(html){
      var div=document.createElement('div');div.innerHTML=html;popularDropdown(extrairOpcoes(div.querySelector('#CpfCnpjTransportadorCertificado')));
    }).catch(function(e){
      console.log('[OMEGA] fetch erro:',e);_opcoesCached=[];
      var msg='<div style="font-size:11px;color:#e07065;text-align:center;padding:8px 0">Erro ao carregar. <a href="/Transportador/Consultar" style="color:#5a9cf5">Abrir pagina de emissao</a></div>';
      var w=document.getElementById('omega-em-sel-wrapper');if(w)w.innerHTML=msg;else window._omegaEmissaoErroMsg=msg;
    });
  }

  function onSelectChange(){
    var st=document.getElementById('omega-em-status'),valor=this.value,opt=this.options[this.selectedIndex],rntrc=opt?opt.getAttribute('data-rntrc'):'';
    document.getElementById('omega-em-botoes').style.display='none';_urlCert=null;_urlExt=null;U.clearBox(st);if(!valor)return;
    U.box(st,true,'Consultando...');
    var selP=document.getElementById('CpfCnpjTransportadorCertificado'),hidP=document.getElementById('CpfCnpjTransportador');
    if(selP)selP.value=valor;if(hidP)hidP.value=valor;
    var token='',ti=document.querySelector('input[name="__RequestVerificationToken"]');if(ti)token=ti.value;
    jqR.ajax({type:'POST',url:'/Transportador/TransportadorDetalhado',data:{CpfCnpjTransportador:valor,CpfCnpjTransportadorCertificado:valor,__RequestVerificationToken:token},
      success:function(html){
        var div=document.createElement('div');div.innerHTML=html;
        var bc=div.querySelector('button[data-pdf*="CertificadoTransportador"]'),be=div.querySelector('button[data-pdf*="ExtratoTransportador"]');
        if(!bc&&!be){var me=div.querySelector('.alert, .text-danger, .validation-summary-errors');return U.box(st,false,me?me.textContent.trim():'Nao foi possivel emitir para este CPF/CNPJ.');}
        if(bc)_urlCert=bc.getAttribute('data-pdf');if(be)_urlExt=be.getAttribute('data-pdf');
        var suf=rntrc?'_'+rntrc:'_'+valor;
        if(_urlCert)_urlCert=_urlCert.replace(/filename=[^&]+/,'filename=Carteirinha'+suf+'.pdf');
        if(_urlExt)_urlExt=_urlExt.replace(/filename=[^&]+/,'filename=Extrato'+suf+'.pdf');
        var re=document.getElementById('ConsutarTransportador');if(re)re.innerHTML=html;
        U.box(st,true,'Pronto! Clique para emitir.');
        var botoes=document.getElementById('omega-em-botoes');botoes.style.display='grid';
        document.getElementById('omega-em-cert').style.display=_urlCert?'block':'none';
        document.getElementById('omega-em-ext').style.display=_urlExt?'block':'none';
      },
      error:function(xhr){var msg=xhr.status===404?'CPF/CNPJ nao encontrado.':xhr.status===500?'Erro interno. Tente novamente.':'Erro ao consultar ('+xhr.status+').';U.box(st,false,msg);}
    });
  }

  function abrirPDF(url){if(!url)return;unsafeWindow.open('https://rntrcdigital.antt.gov.br'+url,'_blank');}
  document.getElementById('omega-em-cert').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();abrirPDF(_urlCert);});
  document.getElementById('omega-em-ext').addEventListener('click',function(e){e.preventDefault();e.stopPropagation();abrirPDF(_urlExt);});
})();
