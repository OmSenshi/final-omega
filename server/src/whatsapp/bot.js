// src/whatsapp/bot.js — Final Omega v4.0: WhatsApp Maestro
// 4 comandos de template + parser + envio pra fila
require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || 'Omega Bot';
const SESSION_DIR = path.join(__dirname, '..', '..', 'data', 'wpp-session');
const IMPORT_DIR = path.join(__dirname, '..', '..', 'data', 'imports');
const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads');
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const API_KEY = process.env.CLAUDE_API_KEY;
const SERVER_URL = 'http://localhost:' + (process.env.PORT || 3000);
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

[SESSION_DIR, IMPORT_DIR, DOWNLOAD_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ═══ TEMPLATES (negrito WhatsApp, anti-link preview) ═══
const TEMPLATES = {
  cadcpf: {
    header: '[OMEGA CADASTRO CPF]',
    fields: ['Login','Senha','CNH','UF','CEP','Logradouro','Numero','Complemento','Bairro','Tipo Veiculo (Proprio/Terceiro/Nao)','Placa','Renavam','CPF Arrendante','Nome Arrendante','CPF Arrendatario','Nome Arrendatario'],
    help: 'Preencha TODOS os campos. Sem valor = deixe vazio.\nTipo Veiculo: Proprio, Terceiro ou Nao.\nSe Nao = cadastro sem veiculo.\nSe Terceiro = arrendamento automatico.\nLogin = CPF da conta Gov-br.'
  },
  cadcnpj: {
    header: '[OMEGA CADASTRO CNPJ]',
    fields: ['Login','Senha','CNPJ','CEP','Logradouro','Numero','Complemento','Bairro','Telefone','Email','CPF Socio','Tipo Veiculo (Proprio/Terceiro/Nao)','Placa','Renavam','CPF Arrendante','Nome Arrendante','CPF Arrendatario','Nome Arrendatario'],
    help: 'Login = CPF do colaborador (conta Gov-br).\nSenha = senha da conta Gov-br.\nCNPJ = empresa a cadastrar.'
  },
  inclusao: {
    header: '[OMEGA INCLUSAO]',
    fields: ['Login','Senha','Transportador (CPF/CNPJ)','Tipo Veiculo (Proprio/Terceiro)','Placa','Renavam','CPF Arrendante','Nome Arrendante','CPF Arrendatario','Nome Arrendatario'],
    help: 'Transportador = CPF ou CNPJ do transportador.\nTipo Veiculo: Proprio ou Terceiro.\nSe Terceiro: o sistema fara o arrendamento automatico antes da inclusao.'
  },
  arrendamento: {
    header: '[OMEGA ARRENDAMENTO]',
    fields: ['Login','Senha','Placa','Renavam','CPF Arrendante','Nome Arrendante','CPF Arrendatario','Nome Arrendatario'],
    help: 'Arrendamento avulso (sem cadastro).\nLogin = CPF da conta Gov-br.'
  }
};

// ═══ GERAR TEMPLATE ═══
function gerarTemplate(tipo) {
  const t = TEMPLATES[tipo];
  if (!t) return null;
  let msg = t.header + '\n';
  t.fields.forEach(f => { msg += '*' + f + ':* \n'; });
  msg += '\n_' + t.help + '_';
  return msg;
}

// ═══ PARSER — lê template preenchido e monta task ═══
function parseTemplate(body) {
  const lines = body.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return null;

  const header = lines[0].toUpperCase();
  let tipo = null;
  for (const [k, v] of Object.entries(TEMPLATES)) {
    if (header.includes(v.header)) { tipo = k; break; }
  }
  if (!tipo) return null;

  // Extrai campos
  const data = {};
  lines.slice(1).forEach(line => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.substring(0, idx).trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, '').replace(/ /g, '_');
    const val = line.substring(idx + 1).trim();
    if (val) data[key] = val;
  });

  // Monta task conforme o tipo
  switch(tipo) {
    case 'cadcpf': return {
      modo: 'cadcpf',
      credenciais: { cpf: data.login || '', senha: data.senha || '' },
      transportador: {
        identidade: data.cnh || '', uf: data.uf || '',
        cep: data.cep || '', logradouro: data.logradouro || '',
        numero: data.numero || '', complemento: data.complemento || '',
        bairro: data.bairro || '',
        tipo_veiculo: data.tipo_veiculo_proprioterceiронao || data.tipo_veiculo || 'nao',
        placa: data.placa || '', renavam: data.renavam || ''
      },
      arrendamento: {
        cpf_arrendante: data.cpf_arrendante || '', nome_arrendante: data.nome_arrendante || '',
        cpf_arrendatario: data.cpf_arrendatario || '', nome_arrendatario: data.nome_arrendatario || ''
      }
    };

    case 'cadcnpj': return {
      modo: 'cadcnpj',
      credenciais: { cpf: data.login || '', senha: data.senha || '' },
      cnpj_data: { cnpj: data.cnpj || '', cpf_socio: data.cpf_socio || '' },
      transportador: {
        cep: data.cep || '', logradouro: data.logradouro || '',
        numero: data.numero || '', complemento: data.complemento || '',
        bairro: data.bairro || '', telefone: data.telefone || '',
        email: data.email || '',
        tipo_veiculo: data.tipo_veiculo_proprioterceiронao || data.tipo_veiculo || 'nao',
        placa: data.placa || '', renavam: data.renavam || ''
      },
      arrendamento: {
        cpf_arrendante: data.cpf_arrendante || '', nome_arrendante: data.nome_arrendante || '',
        cpf_arrendatario: data.cpf_arrendatario || '', nome_arrendatario: data.nome_arrendatario || ''
      }
    };

    case 'inclusao': return {
      modo: 'inclusao',
      credenciais: { cpf: data.login || '', senha: data.senha || '' },
      transportador: data.transportador_cpfcnpj || data.transportador || '',
      tipo_veiculo: data.tipo_veiculo_proprioterceiro || data.tipo_veiculo || 'proprio',
      placa: data.placa || '', renavam: data.renavam || '',
      arrendamento: {
        placa: data.placa || '', renavam: data.renavam || '',
        cpf_arrendante: data.cpf_arrendante || '', nome_arrendante: data.nome_arrendante || '',
        cpf_arrendatario: data.cpf_arrendatario || '', nome_arrendatario: data.nome_arrendatario || ''
      }
    };

    case 'arrendamento': return {
      modo: 'arrendamento',
      credenciais: { cpf: data.login || '', senha: data.senha || '' },
      arrendamento: {
        placa: data.placa || '', renavam: data.renavam || '',
        cpf_arrendante: data.cpf_arrendante || '', nome_arrendante: data.nome_arrendante || '',
        cpf_arrendatario: data.cpf_arrendatario || '', nome_arrendatario: data.nome_arrendatario || ''
      }
    };
  }
  return null;
}

// ═══ ENVIA TAREFA PRO SERVER ═══
async function enviarTarefa(task) {
  try {
    const r = await fetch(SERVER_URL + '/api/task/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session': AUTH_TOKEN // Usa o token direto como session pra simplificar
      },
      body: JSON.stringify({ task })
    });
    return await r.json();
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ═══ EXTRAÇÃO DE DOCUMENTOS (mantido do v3) ═══
const PROMPTS_DOC = {
  crlv: 'Extraia do CRLV: placa, renavam, cpf_cnpj, nome. Formato: campo=valor|campo=valor. Sem mais nada.',
  cnh: 'Extraia da CNH/RG: identidade, uf. Formato: campo=valor|campo=valor.',
  comprovante: 'Extraia do comprovante: cep, logradouro, numero, bairro, complemento. Formato: campo=valor|campo=valor.',
  cartao_cnpj: 'Extraia do CNPJ/MEI: cep, logradouro, numero, bairro, complemento, telefone, email. Formato: campo=valor|campo=valor.',
  cnh_socio: 'Extraia da CNH: cpf_socio. Formato: cpf_socio=VALOR.'
};

async function extractDocument(base64, mimetype) {
  if (!API_KEY) return null;
  const isDoc = mimetype === 'application/pdf';
  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: isDoc ? 'document' : 'image', source: { type: 'base64', media_type: mimetype, data: base64 } },
          { type: 'text', text: 'Identifique e extraia os dados deste documento brasileiro. Retorne no formato campo=valor|campo=valor. Campos: placa, renavam, cpf_cnpj, nome, identidade, uf, cep, logradouro, numero, bairro, complemento, telefone, email, cpf_socio. Apenas os que encontrar.' }
        ]}]
      })
    });
    const data = await res.json();
    const txt = data.content?.[0]?.text?.trim() || '';
    const result = {};
    txt.split('|').forEach(p => { const [k,...v] = p.split('='); if(k) result[k.trim()] = v.join('=').trim(); });
    return result;
  } catch(e) { return null; }
}

// ═══ CLIENTE WHATSAPP ═══
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }
});

let targetGroupId = null, botReady = false;
const pendingDocs = new Map();

client.on('qr', qr => {
  console.log('\n  ═══ ESCANEIE O QR CODE ═══');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('  ✓ WhatsApp Bot conectado!');
  const chats = await client.getChats();
  const group = chats.find(c => c.isGroup && c.name === GROUP_NAME);
  if (group) { targetGroupId = group.id._serialized; console.log('  ✓ Grupo: ' + GROUP_NAME); }
  else console.log('  ✗ Grupo "' + GROUP_NAME + '" nao encontrado');
  botReady = true;
  console.log('  ✓ Bot pronto!\n');
});

client.on('auth_failure', msg => console.error('  ✗ Auth:', msg));
client.on('disconnected', reason => { console.log('  ✗ Desconectado:', reason); setTimeout(() => client.initialize(), 5000); });

// ═══ HANDLER DE MENSAGENS ═══
client.on('message_create', async msg => {
  if (!botReady || !targetGroupId) return;
  const chatId = msg.fromMe ? msg.to : msg.from;
  if (chatId !== targetGroupId) return;

  // Anti-loop
  if (msg.fromMe) {
    const b = (msg.body || '').trim();
    if (b.startsWith('🔍') || b.startsWith('✅') || b.startsWith('❌') || b.startsWith('⚠️') ||
        b.startsWith('📊') || b.startsWith('📄') || b.startsWith('[OMEGA') || b.startsWith('*Omega')) return;
  }

  try {
    // ── Documento recebido ──
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (!media) { await msg.reply('❌ Nao consegui baixar.'); return; }
      if (!media.mimetype.startsWith('image/') && media.mimetype !== 'application/pdf') { await msg.reply('⚠️ Envie PDF ou imagem.'); return; }

      await msg.reply('🔍 Extraindo...');
      const result = await extractDocument(media.data, media.mimetype);
      if (!result) { await msg.reply('❌ Nao consegui extrair.'); return; }

      if (!pendingDocs.has(targetGroupId)) pendingDocs.set(targetGroupId, { docs: [], timer: null });
      const state = pendingDocs.get(targetGroupId);
      state.docs.push(result);
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => pendingDocs.delete(targetGroupId), 5 * 60 * 1000);

      let resumo = '📄 Extraido!\n\n';
      for (const [k, v] of Object.entries(result)) { if (v) resumo += '*' + k + ':* ' + v + '\n'; }
      resumo += '\n📝 ' + state.docs.length + ' doc(s) pendente(s)\n_Digite um CODIGO pra salvar (ex: JOAO123)_';
      await msg.reply(resumo);
      return;
    }

    const text = (msg.body || '').trim();

    // ── Comandos de template ──
    if (text.toLowerCase() === '!cadcpf') { await msg.reply(gerarTemplate('cadcpf')); return; }
    if (text.toLowerCase() === '!cadcnpj') { await msg.reply(gerarTemplate('cadcnpj')); return; }
    if (text.toLowerCase() === '!inclusao') { await msg.reply(gerarTemplate('inclusao')); return; }
    if (text.toLowerCase() === '!arrendamento') { await msg.reply(gerarTemplate('arrendamento')); return; }
    if (text.toLowerCase() === '/ajuda' || text.toLowerCase() === '/help') {
      await msg.reply('*Omega Bot v4.0*\n\n📋 Comandos:\n!cadcpf — Cadastro CPF\n!cadcnpj — Cadastro CNPJ\n!inclusao — Inclusao avulsa\n!arrendamento — Arrendamento avulso\n/status — Status da automacao\n\n📄 Envie documentos e depois um CODIGO pra salvar.');
      return;
    }
    if (text.toLowerCase() === '/status') {
      try {
        const r = await fetch(SERVER_URL + '/api/devices');
        const d = await r.json();
        const devs = d.devices || [];
        let txt = '📊 *Status*\n\nDispositivos: ' + devs.length + '\n';
        devs.forEach(dev => { txt += '• ' + dev.name + ' (' + dev.status + ')\n'; });
        const qr = await fetch(SERVER_URL + '/api/task/queue');
        const qd = await qr.json();
        txt += '\nFila: ' + (qd.size || 0) + ' tarefa(s)';
        await msg.reply(txt);
      } catch(e) { await msg.reply('📊 Erro ao consultar status.'); }
      return;
    }

    // ── Template preenchido (parser) ──
    if (text.toUpperCase().startsWith('[OMEGA')) {
      const task = parseTemplate(text);
      if (!task) { await msg.reply('❌ Formato invalido. Use !cadcpf pra ver o modelo.'); return; }

      await msg.reply('⏳ Enviando tarefa pro dispositivo...');
      const result = await enviarTarefa(task);

      if (result.success) {
        if (result.queued) {
          await msg.reply('📋 *Na fila!*\nNenhum dispositivo disponivel. A tarefa sera executada quando reconectar.\nID: ' + result.taskId);
        } else {
          await msg.reply('✅ *Tarefa enviada!*\nDispositivo: ' + (result.deviceId || '?') + '\nID: ' + result.taskId);
        }
      } else {
        await msg.reply('❌ Erro: ' + (result.error || 'Desconhecido'));
      }
      return;
    }

    // ── Código de salvamento de documentos ──
    if (text.match(/^[A-Z0-9]{3,30}$/i) && pendingDocs.has(targetGroupId)) {
      const code = text.toUpperCase();
      const state = pendingDocs.get(targetGroupId);
      if (!state || state.docs.length === 0) { await msg.reply('⚠️ Nenhum doc pendente.'); return; }

      const consolidated = {};
      state.docs.forEach(doc => { for (const [k,v] of Object.entries(doc)) { if(v) consolidated[k] = v; } });
      fs.writeFileSync(path.join(IMPORT_DIR, code + '.json'), JSON.stringify(consolidated, null, 2));
      if (state.timer) clearTimeout(state.timer);
      pendingDocs.delete(targetGroupId);

      let resumo = '✅ *Salvo: ' + code + '*\n\n';
      for (const [k,v] of Object.entries(consolidated)) { if(v) resumo += '*' + k + ':* ' + v + '\n'; }
      resumo += '\n_Use o codigo ' + code + ' no painel pra importar._';
      await msg.reply(resumo);
      return;
    }

  } catch(err) {
    console.error('Erro:', err);
    try { await msg.reply('❌ Erro: ' + err.message); } catch(e){}
  }
});

// ═══ FUNÇÕES EXPORTADAS ═══
async function sendToGroup(text) {
  if (!botReady || !targetGroupId) return false;
  try { await client.sendMessage(targetGroupId, text); return true; } catch { return false; }
}

async function sendFileToGroup(filepath, caption) {
  if (!botReady || !targetGroupId || !fs.existsSync(filepath)) return false;
  try { const media = MessageMedia.fromFilePath(filepath); await client.sendMessage(targetGroupId, media, { caption }); return true; } catch { return false; }
}

async function sendError(message, step) { return sendToGroup('⚠️ *Erro*\nEtapa: ' + (step||'?') + '\n' + message); }
async function sendDocuments() {
  const c = path.join(DOWNLOAD_DIR, 'Carteirinha.pdf');
  const e = path.join(DOWNLOAD_DIR, 'Extrato.pdf');
  if (fs.existsSync(c)) await sendFileToGroup(c, '✅ Carteirinha RNTRC');
  if (fs.existsSync(e)) await sendFileToGroup(e, '✅ Extrato RNTRC');
}

function startBot() {
  console.log('\n  Omega WhatsApp Bot v4.0');
  console.log('  Grupo: ' + GROUP_NAME);
  client.initialize();
}

module.exports = { startBot, sendToGroup, sendFileToGroup, sendError, sendDocuments };
