// pages/cadastro.js — modulo: Cadastro e Movimentacao de Frota (v64 — refatorado antibug)
(function(){
  console.log('[OMEGA][cadastro] v64 carregado');
  var U   = window.OmegaUtils;
  var jqR = unsafeWindow.jQuery || unsafeWindow.$;
  var EX  = window.OmegaExtractor;
  if(!U) { console.error('[OMEGA][cadastro] OmegaUtils nao encontrado!'); return; }
  if(!EX) { console.error('[OMEGA][cadastro] OmegaExtractor nao encontrado!'); }

  function abaPortalAtiva(){ var t=document.querySelector('.nav-tabs .nav-link.active'); return t?t.getAttribute('href'):''; }
  function tipoPedido(){ var el=document.querySelector('.main_content'); return el?(el.getAttribute('data-tipo-pedido')||''):''; }
  function tipoCadastro(){ var c=document.getElementById('CpfCnpjTransportador'); if(!c||!c.value)return'CPF'; return c.value.replace(/\D/g,'').length===14?'CNPJ':'CPF'; }

  function htmlDrop(id, label, sub){
    return '<div id="'+id+'" class="om-dropzone" style="padding:10px;margin-bottom:6px"><div class="om-drop-txt" id="'+id+'-txt">'+label+'<br><span>'+(sub||'PDF ou imagem')+'</span></div></div><input type="file" id="'+id+'-file" accept=".pdf,image/*" style="display:none">';
  }
  function setupDrop(zoneId, onFile){
    var zone=document.getElementById(zoneId), fi=document.getElementById(zoneId+'-file');
    if(!zone||!fi)return;
    zone.addEventListener('click',function(){fi.click();});
    zone.addEventListener('dragover',function(e){e.preventDefault();zone.classList.add('om-dropzone-active');});
    zone.addEventListener('dragleave',function(){zone.classList.remove('om-dropzone-active');});
    zone.addEventListener('drop',function(e){e.preventDefault();zone.classList.remove('om-dropzone-active');if(e.dataTransfer.files[0])onFile(e.dataTransfer.files[0]);});
    fi.addEventListener('change',function(){if(this.files[0])onFile(this.files[0]);});
  }
  function set(id,val){var el=document.getElementById(id);if(el)el.value=val||'';}
  function val(id){var el=document.getElementById(id);return el?el.value.trim():'';}

  function selecionarDropdown(selectEl, valor){
    if(!selectEl)return;
    for(var i=0;i<selectEl.options.length;i++){
      if(selectEl.options[i].value===valor){selectEl.selectedIndex=i;break;}
    }
    selectEl.value=valor;
    jqR(selectEl).trigger('change');
  }

  function pararAutomacao(st,msg){
    window._omegaAutomacaoAtiva=false;
    U.box(st,false,msg);
  }

  // ── ABA: CADASTRO ───────────────────────────────────────────────
  U.registrarAba('cadastro', 'Cadastro', ''
    +'<div class="om-flex om-mb">'
      +'<input id="omega-cad-import-input" class="om-input om-input-sm" placeholder="Cole o codigo OMEGA Cadastro aqui" style="flex:1">'
      +'<button type="button" id="omega-cad-import-btn" class="om-btn om-btn-coral om-btn-sm" style="white-space:nowrap">Importar</button>'
    +'</div>'
    +'<div id="omega-cad-import-status"></div>'

    +'<div id="omega-cad-tipo-btns" class="om-grid om-grid-2 om-mb">'
      +'<button type="button" id="omega-cad-btn-cpf" class="om-btn om-btn-blue">Cadastro CPF</button>'
      +'<button type="button" id="omega-cad-btn-cnpj" class="om-btn om-btn-purple">Cadastro CNPJ</button>'
    +'</div>'

    // ═══════ FORMULARIO CPF ═══════
    +'<div id="omega-cad-form-cpf" style="display:none">'
      +'<button type="button" id="omega-cad-voltar-cpf" class="om-btn-list" style="color:#5a9cf5;background:none;border:none;padding:2px 0;margin-bottom:8px;font-size:11px;cursor:pointer">&#8592; Voltar</button>'
      +'<div class="om-badge">Cadastro CPF</div>'

      +htmlDrop('omega-drop-cnh','Arraste a CNH ou RG aqui','Preenche identidade e UF automaticamente')
      +'<div id="omega-drop-cnh-status"></div>'
      +'<div class="om-section-title">Identidade / CNH</div>'
      +'<div class="om-grid om-grid-21 om-mb-sm">'
        +'<div><label class="om-label">Numero</label><input id="omega-cad-identidade" class="om-input" placeholder="000000"></div>'
        +'<div><label class="om-label">UF</label><input id="omega-cad-uf" class="om-input" placeholder="MG" maxlength="2" style="text-transform:uppercase"></div>'
      +'</div>'

      +htmlDrop('omega-drop-endereco','Arraste o Comprovante de Endereco aqui','Opcional — preenche CEP, rua, numero, bairro')
      +'<div id="omega-drop-endereco-status"></div>'
      +'<div class="om-section-title">Endereco</div>'
      +'<div class="om-grid om-grid-2 om-mb-sm">'
        +'<div><label class="om-label">CEP</label><input id="omega-cad-cep" class="om-input" placeholder="00000000"></div>'
        +'<div><label class="om-label">Numero</label><input id="omega-cad-numero" class="om-input" placeholder="0"></div>'
      +'</div>'
      +'<div class="om-mb-sm"><label class="om-label">Logradouro</label><input id="omega-cad-logradouro" class="om-input" placeholder="Nome da rua"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm">'
        +'<div><label class="om-label">Bairro</label><input id="omega-cad-bairro" class="om-input" placeholder="Bairro"></div>'
        +'<div><label class="om-label">Complemento</label><input id="omega-cad-complemento" class="om-input" placeholder="Apto..."></div>'
      +'</div>'

      +'<div id="omega-cad-resumo-cpf"></div>'
      +'<button type="button" id="omega-cad-iniciar-cpf" class="om-btn om-btn-green om-btn-full" style="margin-top:4px">&#9654; Iniciar Automacao CPF</button>'
      +'<div id="omega-cad-status-cpf"></div>'
    +'</div>'

    // ═══════ FORMULARIO CNPJ ═══════
    +'<div id="omega-cad-form-cnpj" style="display:none">'
      +'<button type="button" id="omega-cad-voltar-cnpj" class="om-btn-list" style="color:#5a9cf5;background:none;border:none;padding:2px 0;margin-bottom:8px;font-size:11px;cursor:pointer">&#8592; Voltar</button>'
      +'<div class="om-badge" style="background:linear-gradient(135deg,#6f42c1,#5a35a0)">Cadastro CNPJ</div>'

      +htmlDrop('omega-drop-cnpj','Arraste a Inscricao CNPJ / MEI aqui','Preenche endereco, telefone e email')
      +'<div id="omega-drop-cnpj-status"></div>'
      +'<div class="om-section-title">Endereco</div>'
      +'<div class="om-grid om-grid-2 om-mb-sm">'
        +'<div><label class="om-label">CEP</label><input id="omega-cad-cnpj-cep" class="om-input" placeholder="00000000"></div>'
        +'<div><label class="om-label">Numero</label><input id="omega-cad-cnpj-numero" class="om-input" placeholder="0"></div>'
      +'</div>'
      +'<div class="om-mb-sm"><label class="om-label">Logradouro</label><input id="omega-cad-cnpj-logradouro" class="om-input" placeholder="Nome da rua"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm">'
        +'<div><label class="om-label">Bairro</label><input id="omega-cad-cnpj-bairro" class="om-input" placeholder="Bairro"></div>'
        +'<div><label class="om-label">Complemento</label><input id="omega-cad-cnpj-complemento" class="om-input" placeholder="Apto..."></div>'
      +'</div>'
      +'<div class="om-section-title">Contato</div>'
      +'<div class="om-grid om-grid-2 om-mb-sm">'
        +'<div><label class="om-label">Telefone</label><input id="omega-cad-cnpj-telefone" class="om-input" placeholder="0000000000"></div>'
        +'<div><label class="om-label">Email</label><input id="omega-cad-cnpj-email" class="om-input" placeholder="email@exemplo.com"></div>'
      +'</div>'

      +htmlDrop('omega-drop-socio','Arraste a CNH do Socio aqui','Opcional — preenche CPF do socio')
      +'<div id="omega-drop-socio-status"></div>'
      +'<div class="om-section-title">Gestor / Socio</div>'
      +'<div class="om-mb-sm"><label class="om-label">CPF do Socio</label><input id="omega-cad-cnpj-cpf-socio" class="om-input" placeholder="00000000000"></div>'

      +'<div id="omega-cad-resumo-cnpj"></div>'
      +'<button type="button" id="omega-cad-iniciar-cnpj" class="om-btn om-btn-green om-btn-full" style="margin-top:4px">&#9654; Iniciar Automacao CNPJ</button>'
      +'<div id="omega-cad-status-cnpj"></div>'
    +'</div>'

    // Acoes manuais
    +'<div id="omega-cad-acoes" style="display:none">'
      +'<hr class="om-hr">'
      +'<div id="omega-cad-contatos" style="display:none"><div class="om-section-title">Endereco</div><div class="om-grid om-grid-3 om-mb-sm"><button id="omega-cep-mg" class="om-btn om-btn-blue">MG</button><button id="omega-cep-sp" class="om-btn om-btn-blue">SP</button><button id="omega-cep-rj" class="om-btn om-btn-blue">RJ</button></div><div id="omega-cep-status"></div><hr class="om-hr"><div class="om-section-title">Contato</div><button id="omega-contato-btn" class="om-btn om-btn-blue om-btn-full">Adicionar Telefone + Email</button><div id="omega-contato-status"></div></div>'
      +'<div id="omega-cad-rt" style="display:none"><div class="om-section-title">Responsavel Tecnico</div><button id="omega-rt-btn" class="om-btn om-btn-blue om-btn-full">Adicionar RT</button><div id="omega-rt-status"></div></div>'
      +'<div id="omega-cad-veiculo" style="display:none"><div class="om-section-title">Veiculo</div><div id="omega-veiculo-hist" class="om-hist-scroll om-mb-sm"></div><div id="omega-veiculo-vazio" class="om-vazio">Nenhum veiculo no historico</div><div id="omega-veiculo-status"></div></div>'
    +'</div>'
  , function(){ /* Atualizar secao acoes */ });

  // ═══════════════ NAVEGACAO ═══════════════
  function resetar(){
    document.getElementById('omega-cad-tipo-btns').style.display='';
    document.getElementById('omega-cad-form-cpf').style.display='none';
    document.getElementById('omega-cad-form-cnpj').style.display='none';
    ['omega-cad-identidade','omega-cad-uf','omega-cad-cep','omega-cad-logradouro','omega-cad-numero','omega-cad-bairro','omega-cad-complemento'].forEach(function(id){set(id,'');});
    ['omega-cad-cnpj-cep','omega-cad-cnpj-logradouro','omega-cad-cnpj-numero','omega-cad-cnpj-bairro','omega-cad-cnpj-complemento','omega-cad-cnpj-telefone','omega-cad-cnpj-email','omega-cad-cnpj-cpf-socio'].forEach(function(id){set(id,'');});
    ['omega-cad-import-status','omega-drop-cnh-status','omega-drop-endereco-status','omega-drop-cnpj-status','omega-drop-socio-status','omega-cad-status-cpf','omega-cad-status-cnpj'].forEach(function(id){U.clearBox(document.getElementById(id));});
    var r1=document.getElementById('omega-cad-resumo-cpf');if(r1)r1.innerHTML='';
    var r2=document.getElementById('omega-cad-resumo-cnpj');if(r2)r2.innerHTML='';
    ['omega-drop-cnh-file','omega-drop-endereco-file','omega-drop-cnpj-file','omega-drop-socio-file'].forEach(function(id){var fi=document.getElementById(id);if(fi)fi.value='';});
  }

  document.getElementById('omega-cad-voltar-cpf').addEventListener('click',function(e){e.preventDefault();resetar();});
  document.getElementById('omega-cad-voltar-cnpj').addEventListener('click',function(e){e.preventDefault();resetar();});

  // ═══════════════ BOTAO CPF E CNPJ ═══════════════
  document.getElementById('omega-cad-btn-cpf').addEventListener('click',function(){
    document.getElementById('omega-cad-tipo-btns').style.display='none';
    document.getElementById('omega-cad-form-cpf').style.display='block';
  });
  
  document.getElementById('omega-cad-btn-cnpj').addEventListener('click',function(){
    document.getElementById('omega-cad-tipo-btns').style.display='none';
    document.getElementById('omega-cad-form-cnpj').style.display='block';
  });

  // ═══════════════ LÓGICA DE PREENCHIMENTO E AJAX REFATORADA ═══════════════
  // Substituindo o emaranhado de STs pelo observador de DOM (aguardarElemento)
  window.OmegaUtils.preencherVeiculo = function(item, st, cp, pv, cr, lib) {
      // Habilita e digita caractere a caractere
      U.digitarCharAChar(cp, pv, {
          delay: 80,
          delayEspecial: {4: 150},
          onDone: function() {
              // Quando terminar de digitar, preenche o renavam
              cr.removeAttribute('disabled');
              cr.value = item.renavam || '';
              cr.dispatchEvent(new Event('input', {bubbles:true}));
              cr.dispatchEvent(new Event('change', {bubbles:true}));
              cr.dispatchEvent(new Event('blur', {bubbles:true}));

              // Aguarda o botao de buscar aparecer nativamente na tela
              U.aguardarElemento('#btnBuscarVeiculo', function(bv) {
                  if(U.guardClique(bv, 3000)) {
                      jqR.ajax({
                          type: 'GET',
                          url: '/Veiculo/BuscarVeiculo',
                          cache: false,
                          data: { placa: cp.value.toUpperCase(), renavam: cr.value },
                          success: function() {
                              bv.click();
                          },
                          error: function() {
                              bv.click();
                          }
                      });
                  }

                  // Depois de buscar, espera o campo de Tara renderizar no DOM
                  U.aguardarElemento('#Tara', function(tara) {
                      if(!tara.value || tara.value === '') {
                          tara.removeAttribute('disabled');
                          tara.value = '2';
                          jqR(tara).trigger('input').trigger('change');
                      }
                      
                      // Finalmente, espera os botoes de salvar carregarem para dar o clique exato
                      U.aguardarElemento('.btn-salvar-veiculo, .btn-confirmar-inclusao', function(bs) {
                          if(U.guardClique(bs, 5000)) {
                              bs.removeAttribute('disabled');
                              bs.click();
                              U.box(st, true, 'Veiculo salvo! Placa: <b>' + cp.value + '</b>');
                          } else {
                              U.box(st, false, 'Botao Salvar nao encontrado.');
                          }
                          if (lib) lib();
                      });
                  });
              });
          }
      });
  };

})();
