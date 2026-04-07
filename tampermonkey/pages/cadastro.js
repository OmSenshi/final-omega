// pages/cadastro.js — modulo: Cadastro e Movimentacao de Frota (Execução Local Liberada)
(function(){
  console.log('[OMEGA][cadastro] v65 carregado');
  var U   = window.OmegaUtils;
  var jqR = unsafeWindow.jQuery || unsafeWindow.$;
  var EX  = window.OmegaExtractor;
  if(!U) { console.error('[OMEGA][cadastro] OmegaUtils nao encontrado!'); return; }

  function htmlDrop(id, label, sub){ return '<div id="'+id+'" class="om-dropzone" style="padding:10px;margin-bottom:6px"><div class="om-drop-txt" id="'+id+'-txt">'+label+'<br><span>'+(sub||'PDF ou imagem')+'</span></div></div><input type="file" id="'+id+'-file" accept=".pdf,image/*" style="display:none">'; }
  function val(id){var el=document.getElementById(id);return el?el.value.trim():'';}
  function set(id,val){var el=document.getElementById(id);if(el)el.value=val||'';}

  U.registrarAba('cadastro', 'Cadastro', ''
    +'<div id="omega-cad-tipo-btns" class="om-grid om-grid-2 om-mb">'
      +'<button type="button" id="omega-cad-btn-cpf" class="om-btn om-btn-blue">Cadastro CPF</button>'
      +'<button type="button" id="omega-cad-btn-cnpj" class="om-btn om-btn-purple">Cadastro CNPJ</button>'
    +'</div>'

    +'<div id="omega-cad-form-cpf" style="display:none">'
      +'<button type="button" id="omega-cad-voltar-cpf" class="om-btn-list" style="color:#5a9cf5;background:none;border:none;padding:2px 0;margin-bottom:8px;font-size:11px;cursor:pointer">&#8592; Voltar</button>'
      +'<div class="om-badge">Cadastro CPF</div>'
      +htmlDrop('omega-drop-cnh','Arraste a CNH ou RG aqui','Preenche identidade e UF automaticamente')
      +'<div class="om-section-title">Identidade / CNH</div>'
      +'<div class="om-grid om-grid-21 om-mb-sm"><div><label class="om-label">Numero</label><input id="omega-cad-identidade" class="om-input" placeholder="000000"></div><div><label class="om-label">UF</label><input id="omega-cad-uf" class="om-input" placeholder="MG" maxlength="2" style="text-transform:uppercase"></div></div>'
      +htmlDrop('omega-drop-endereco','Arraste o Comprovante de Endereco aqui','Opcional — preenche CEP, rua, numero, bairro')
      +'<div class="om-section-title">Endereco</div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">CEP</label><input id="omega-cad-cep" class="om-input" placeholder="00000000"></div><div><label class="om-label">Numero</label><input id="omega-cad-numero" class="om-input" placeholder="0"></div></div>'
      +'<div class="om-mb-sm"><label class="om-label">Logradouro</label><input id="omega-cad-logradouro" class="om-input" placeholder="Nome da rua"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Bairro</label><input id="omega-cad-bairro" class="om-input" placeholder="Bairro"></div><div><label class="om-label">Complemento</label><input id="omega-cad-complemento" class="om-input" placeholder="Apto..."></div></div>'
      +'<button type="button" id="omega-cad-iniciar-cpf" class="om-btn om-btn-green om-btn-full" style="margin-top:4px">&#9654; Iniciar Automacao CPF</button>'
      +'<div id="omega-cad-status-cpf"></div>'
    +'</div>'

    +'<div id="omega-cad-form-cnpj" style="display:none">'
      +'<button type="button" id="omega-cad-voltar-cnpj" class="om-btn-list" style="color:#5a9cf5;background:none;border:none;padding:2px 0;margin-bottom:8px;font-size:11px;cursor:pointer">&#8592; Voltar</button>'
      +'<div class="om-badge" style="background:linear-gradient(135deg,#6f42c1,#5a35a0)">Cadastro CNPJ</div>'
      +htmlDrop('omega-drop-cnpj','Arraste a Inscricao CNPJ / MEI aqui','Preenche endereco, telefone e email')
      +'<div class="om-section-title">Endereco</div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">CEP</label><input id="omega-cad-cnpj-cep" class="om-input" placeholder="00000000"></div><div><label class="om-label">Numero</label><input id="omega-cad-cnpj-numero" class="om-input" placeholder="0"></div></div>'
      +'<div class="om-mb-sm"><label class="om-label">Logradouro</label><input id="omega-cad-cnpj-logradouro" class="om-input" placeholder="Nome da rua"></div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Bairro</label><input id="omega-cad-cnpj-bairro" class="om-input" placeholder="Bairro"></div><div><label class="om-label">Complemento</label><input id="omega-cad-cnpj-complemento" class="om-input" placeholder="Apto..."></div></div>'
      +'<div class="om-section-title">Contato</div>'
      +'<div class="om-grid om-grid-2 om-mb-sm"><div><label class="om-label">Telefone</label><input id="omega-cad-cnpj-telefone" class="om-input" placeholder="0000000000"></div><div><label class="om-label">Email</label><input id="omega-cad-cnpj-email" class="om-input" placeholder="email@exemplo.com"></div></div>'
      +htmlDrop('omega-drop-socio','Arraste a CNH do Socio aqui','Opcional — preenche CPF do socio')
      +'<div class="om-section-title">Gestor / Socio</div>'
      +'<div class="om-mb-sm"><label class="om-label">CPF do Socio</label><input id="omega-cad-cnpj-cpf-socio" class="om-input" placeholder="00000000000"></div>'
      +'<button type="button" id="omega-cad-iniciar-cnpj" class="om-btn om-btn-green om-btn-full" style="margin-top:4px">&#9654; Iniciar Automacao CNPJ</button>'
      +'<div id="omega-cad-status-cnpj"></div>'
    +'</div>'
  );

  function resetar(){
    document.getElementById('omega-cad-tipo-btns').style.display=''; document.getElementById('omega-cad-form-cpf').style.display='none'; document.getElementById('omega-cad-form-cnpj').style.display='none';
  }
  document.getElementById('omega-cad-voltar-cpf').addEventListener('click',function(e){e.preventDefault();resetar();});
  document.getElementById('omega-cad-voltar-cnpj').addEventListener('click',function(e){e.preventDefault();resetar();});
  document.getElementById('omega-cad-btn-cpf').addEventListener('click',function(){document.getElementById('omega-cad-tipo-btns').style.display='none';document.getElementById('omega-cad-form-cpf').style.display='block';});
  document.getElementById('omega-cad-btn-cnpj').addEventListener('click',function(){document.getElementById('omega-cad-tipo-btns').style.display='none';document.getElementById('omega-cad-form-cnpj').style.display='block';});

  // ── LÓGICA DE INTEGRAÇÃO LOCAL (Sem precisar de VPS) ──
  function dispararTarefaLocal(modo, transportador, st, btn) {
      if (typeof unsafeWindow.OmegaStartLocalTask === 'function') {
          btn.innerHTML = 'Executando...'; btn.disabled = true;
          // Dispara a tarefa simulando o formato que viria do servidor
          var taskData = { modo: modo, transportador: transportador };
          unsafeWindow.OmegaStartLocalTask(taskData);
          U.box(st, true, 'Automação local iniciada com sucesso!');
          setTimeout(function(){ btn.innerHTML = '▶ Iniciar Automacao'; btn.disabled = false; }, 3000);
      } else {
          U.box(st, false, 'O motor (Bridge) não está ativo na página. Recarregue a página.');
      }
  }

  document.getElementById('omega-cad-iniciar-cnpj').addEventListener('click', function(){
      var st = document.getElementById('omega-cad-status-cnpj');
      var t = { 
          cnpj: val('omega-cad-cnpj-cpf-socio'), // Caso nao tenha CNPJ, ele usa o getTargetDoc do bridge
          cep: val('omega-cad-cnpj-cep'),
          numero: val('omega-cad-cnpj-numero'),
          logradouro: val('omega-cad-cnpj-logradouro'),
          bairro: val('omega-cad-cnpj-bairro'),
          complemento: val('omega-cad-cnpj-complemento'),
          telefone: val('omega-cad-cnpj-telefone'),
          email: val('omega-cad-cnpj-email'),
          cpf_socio: val('omega-cad-cnpj-cpf-socio')
      };
      dispararTarefaLocal('cadcnpj', t, st, this);
  });

  document.getElementById('omega-cad-iniciar-cpf').addEventListener('click', function(){
      var st = document.getElementById('omega-cad-status-cpf');
      var t = { 
          identidade: val('omega-cad-identidade'),
          uf: val('omega-cad-uf'),
          cep: val('omega-cad-cep'),
          numero: val('omega-cad-numero'),
          logradouro: val('omega-cad-logradouro'),
          bairro: val('omega-cad-bairro'),
          complemento: val('omega-cad-complemento')
      };
      dispararTarefaLocal('cadcpf', t, st, this);
  });

})();
