// src/whatsapp/bot.js — Final Omega v5.1: WhatsApp Maestro (Sunshine Edition)
// Templates Exatos, Regex Inteligente de Extração, Suporte a Novos Nomes
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

// ═══════════════════════════════════════════════════════════════
// TEMPLATES (Exatos conforme solicitação)
// ═══════════════════════════════════════════════════════════════

const TEMPLATE_CADCPF =
  '[OMEGA CADASTRO CPF]\n' +
  '*👤 Login:* \n' +
  '*🔑 Senha:* \n' +
  '*🆔 RG:* \n' +
  '*📍 UF:* \n' +
  '*📮 CEP:* \n' +
  '*🏠 Logradouro:* \n' +
  '*🔢 Numero:* \n' +
  '*🏢 Complemento:* \n' +
  '*🏘️ Bairro:* \n' +
  '-- VEICULO --\n' +
  '*⚙️ Tipo Veiculo (Proprio/Terceiro/Nao):* \n' +
  '*🔢 Placa:* \n' +
  '*📄 Renavam:* \n' +
  '*👤 CPF/CNPJ Arrendante:* \n' +
  '*📛 Nome Arrendante:* \n' +
  '\n_Preencha todos os campos. Sem valor = deixe vazio._\n' +
  '_Tipo Veiculo: Proprio, Terceiro ou Nao._\n' +
  '_Login = CPF da Conta-Gov._';

const TEMPLATE_CADCNPJ =
  '[OMEGA CADASTRO CNPJ]\n' +
  '*👤 Login (colaborador):* \n' +
  '*🔑 Senha:* \n' +
  '*🏢 CNPJ:* \n' +
  '*📮 CEP:* \n' +
  '*🏠 Logradouro:* \n' +
  '*🔢 Numero:* \n' +
  '*🏘️ Bairro:* \n' +
  '*📞 Telefone:* \n' +
  '*📧 Email:* \n' +
  '*👤 CPF Socio:* \n' +
  '-- VEICULO --\n' +
  '*⚙️ Tipo Veiculo (Proprio/Terceiro/Nao):* \n' +
  '*🔢 Placa:* \n' +
  '*📄 Renavam:* \n' +
  '*👤 CPF/CNPJ Arrendante:* \n' +
  '*📛 Nome Arrendante:* \n' +
  '\n_Login = CPF do colaborador (Conta-Gov)._\n' +
  '_CNPJ = empresa a cadastrar._';

const TEMPLATE_INCLUSAO =
  '[OMEGA INCLUSAO]\n' +
  '*👤 Login:* \n' +
  '*🔑 Senha:* \n' +
  '*🚛 Transportador (CPF/CNPJ):* \n' +
  '-- VEICULO --\n' +
  '*⚙️ Tipo Veiculo (Proprio/Terceiro):* \n' +
  '*🔢 Placa:* \n' +
  '*📄 Renavam:* \n' +
  '*👤 CPF/CNPJ Arrendante:* \n' +
  '*📛 Nome Arrendante:* \n' +
  '\n_Transportador = CPF ou CNPJ._\n' +
  '_Se Terceiro: arrendamento automatico antes da inclusao._';

const TEMPLATE_ARRENDAMENTO =
  '[OMEGA ARRENDAMENTO AVULSO]\n' +
  '*👤 Login:* \n' +
  '*🔑 Senha:* \n' +
  '*🔢 Placa:* \n' +
  '*📄 Renavam:* \n' +
  '*👤 CPF/CNPJ Arrendante:* \n' +
  '*📛 Nome Arrendante:* \n' +
  '*👤 CPF/CNPJ Arrendatario:* \n' +
  '*📛 Nome Arrendatario:* \n' +
  '\n_Arrendamento avulso (sem cadastro)._\n' +
  '_Login = CPF da Conta-Gov._';

const TEMPLATES_MAP = {
  '!cadcpf': TEMPLATE_CADCPF,
  '!cadcnpj': TEMPLATE_CADCNPJ,
  '!inclusao': TEMPLATE_INCLUSAO,
  '!arrendamento': TEMPLATE_ARRENDAMENTO
};

// ═══════════════════════════════════════════════════════════════
// PARSER INTELIGENTE (Regex focado no conteúdo após os dois-pontos)
// ═══════════════════════════════════════════════════════════════

function parseFilledTemplate(body) {
  const headerLine = body.split('\n')[0].trim().toUpperCase();
  let modo = null;
  if (headerLine.includes('CADASTRO CPF')) modo = 'cadcpf';
  else if (headerLine.includes('CADASTRO CNPJ')) modo = 'cadcnpj';
  else if (headerLine.includes('INCLUSAO')) modo = 'inclusao';
  else if (headerLine.includes('ARRENDAMENTO')) modo = 'arrendamento';
  if (!modo) return null;

  const parts = body.split(/--\s*VEICULO\s*--/i);
  const blocoTransp = parts[0] || '';
  const blocosVeiculos = parts.slice(1);

  // Extrator mestre: Busca o padrão Ex: "RG: 1234" e ignora emojis/asteriscos.
  const extract = (texto, regex) => {
    const match = texto.match(regex);
    return match && match[1] && match[1].trim() !== '' ? match[1].trim() : '';
  };

  const credenciais = {
      cpf: extract(blocoTransp, /Login.*?:?\s*([\d\.\-\/]+)/i),
      senha: extract(blocoTransp, /Senha.*?:?\s*([^\n]+)/i)
  };

  const veiculos = blocosVeiculos.map(bloco => {
    return {
      tipo_veiculo: extract(bloco, /Tipo Veiculo.*?:?\s*(Proprio|Terceiro|Nao)/i) || 'proprio',
      placa: extract(bloco, /Placa:\s*([A-Za-z0-9\-]+)/i),
      renavam: extract(bloco, /Renavam:\s*([\d]+)/i),
      cpf_arrendante: extract(bloco, /Arrendante.*?:?\s*([\d\.\-\/]+)/i),
      nome_arrendante: extract(bloco, /Nome Arrendante.*?:?\s*([^\n]+)/i)
    };
  }).filter(v => v.placa);

  switch(modo) {
    case 'cadcpf': return {
      modo: 'cadcpf',
      credenciais: credenciais,
      transportador: {
        identidade: extract(blocoTransp, /RG:\s*([^\n]+)/i),
        uf: extract(blocoTransp, /UF:\s*([A-Za-z]{2})/i),
        cep: extract(blocoTransp, /CEP:\s*([\d\.\-]+)/i),
        logradouro: extract(blocoTransp, /Logradouro:\s*([^\n]+)/i),
        numero: extract(blocoTransp, /Numero:\s*([^\n]+)/i),
        complemento: extract(blocoTransp, /Complemento:\s*([^\n]+)/i),
        bairro: extract(blocoTransp, /Bairro:\s*([^\n]+)/i)
      },
      veiculos: veiculos
    };
    case 'cadcnpj': return {
      modo: 'cadcnpj',
      credenciais: credenciais,
      cnpj_data: { 
          cnpj: extract(blocoTransp, /CNPJ:\s*([\d\.\-\/]+)/i), 
          cpf_socio: extract(blocoTransp, /CPF Socio:\s*([\d\.\-]+)/i) 
      },
      transportador: {
        cep: extract(blocoTransp, /CEP:\s*([\d\.\-]+)/i),
        logradouro: extract(blocoTransp, /Logradouro:\s*([^\n]+)/i),
        numero: extract(blocoTransp, /Numero:\s*([^\n]+)/i),
        complemento: extract(blocoTransp, /Complemento:\s*([^\n]+)/i),
        bairro: extract(blocoTransp, /Bairro:\s*([^\n]+)/i),
        telefone: extract(blocoTransp, /Telefone:\s*([^\n]+)/i),
        email: extract(blocoTransp, /Email:\s*([^\n]+)/i)
      },
      veiculos: veiculos
    };
    case 'inclusao': return {
      modo: 'inclusao',
      credenciais: credenciais,
      transportador: extract(blocoTransp, /Transportador.*?:?\s*([\d\.\-\/]+)/i),
      veiculos: veiculos
    };
    case 'arrendamento': return {
      modo: 'arrendamento',
      credenciais: credenciais,
      arrendamento: {
        placa: extract(blocoTransp, /Placa:\s*([A-Za-z0-9\-]+)/i),
        renavam: extract(blocoTransp, /Renavam:\s*([\d]+)/i),
        cpf_arrendante: extract(blocoTransp, /Arrendante.*?:?\s*([\d\.\-\/]+)/i),
        nome_arrendante: extract(blocoTransp, /Nome Arrendante.*?:?\s*([^\n]+)/i),
        cpf_arrendatario: extract(blocoTransp, /Arrendatario.*?:?\s*([\d\.\-\/]+)/i),
        nome_arrendatario: extract(blocoTransp, /Nome Arrendatario.*?:?\s*([^\n]+)/i)
      }
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// ENVIAR TAREFA PRO SERVER
// ═══════════════════════════════════════════════════════════════

async function enviarTarefa(task) {
  try {
    const r = await fetch(SERVER_URL + '/api/task/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session': AUTH_TOKEN },
      body: JSON.stringify({ task })
    });
    return await r.json();
  } catch(e) { return { success: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════
// EXTRAÇÃO DE DOCUMENTOS (Claude Haiku)
// ═══════════════════════════════════════════════════════════════

async function extractDocument(base64, mimetype) {
  if (!API_KEY) return null;
  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: mimetype === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mimetype, data: base64 } },
          { type: 'text', text: 'Extraia os dados deste documento brasileiro. Retorne no formato campo=valor|campo=valor. Campos possiveis: placa, renavam, cpf_cnpj, nome, identidade, uf, cep, logradouro, numero, bairro, complemento, telefone, email, cpf_socio. Apenas os encontrados.' }
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

// ═══════════════════════════════════════════════════════════════
// CLIENTE WHATSAPP
// ═══════════════════════════════════════════════════════════════

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }
});

let targetGroupId = null, botReady = false;
const pendingDocs = new Map();

client.on('qr', qr => { console.log('\n  ═══ ESCANEIE O QR CODE ═══'); qrcode.generate(qr, { small: true }); });
client.on('ready', async () => {
  console.log('  ✓ WhatsApp Bot v5.1 conectado!');
  const chats = await client.getChats();
  const group = chats.find(c => c.isGroup && c.name === GROUP_NAME);
  if (group) { targetGroupId = group.id._serialized; console.log('  ✓ Grupo: ' + GROUP_NAME); }
  else console.log('  ✗ Grupo "' + GROUP_NAME + '" nao encontrado');
  botReady = true;
});
client.on('auth_failure', msg => console.error('  ✗ Auth:', msg));
client.on('disconnected', reason => { console.log('  ✗ Desconectado:', reason); setTimeout(() => client.initialize(), 5000); });

// ═══════════════════════════════════════════════════════════════
// HANDLER DE MENSAGENS
// ═══════════════════════════════════════════════════════════════

client.on('message_create', async msg => {
  if (!botReady || !targetGroupId) return;
  const chatId = msg.fromMe ? msg.to : msg.from;
  if (chatId !== targetGroupId) return;

  // Anti-loop
  if (msg.fromMe) {
    const b = (msg.body || '').trim();
    if (b.startsWith('🔍') || b.startsWith('✅') || b.startsWith('❌') || b.startsWith('⚠️') ||
        b.startsWith('📊') || b.startsWith('📋') || b.startsWith('📄') || b.startsWith('[OMEGA') ||
        b.startsWith('*Omega') || b.startsWith('⏳')) return;
  }

  try {
    // ── Documento ──
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
      resumo += '\n📝 ' + state.docs.length + ' doc(s)\n_Digite um CODIGO pra salvar_';
      await msg.reply(resumo);
      return;
    }

    const text = (msg.body || '').trim();
    const textLow = text.toLowerCase();

    // ── Comandos de template ──
    if (TEMPLATES_MAP[textLow]) { await msg.reply(TEMPLATES_MAP[textLow]); return; }

    // ── Ajuda ──
    if (textLow === '/ajuda' || textLow === '/help') {
      await msg.reply(
        '*Omega Bot v5.1 (Sunshine)*\n\n' +
        '📋 *Comandos:*\n' +
        '!cadcpf — Cadastro CPF\n' +
        '!cadcnpj — Cadastro CNPJ\n' +
        '!inclusao — Inclusao avulsa\n' +
        '!arrendamento — Arrendamento\n' +
        '/status — Status\n\n' +
        '📄 Envie documentos e depois um CODIGO pra salvar.'
      );
      return;
    }

    // ── Status ──
    if (textLow === '/status') {
      try {
        const dr = await fetch(SERVER_URL + '/api/devices');
        const dd = await dr.json();
        const qr = await fetch(SERVER_URL + '/api/task/queue');
        const qd = await qr.json();
        const devs = dd.devices || [];
        let txt = '*[STATUS OMEGA]*\n\n';
        txt += '📱 *Celular:* ' + (devs.length > 0 ? devs.map(d => d.name + ' (' + d.status + ')').join(', ') : 'Nenhum') + '\n';
        txt += '⏳ *Fila:* ' + (qd.size || 0) + ' tarefa(s)\n';
        txt += '🤖 *Versao:* 5.1 (Sunshine Edition)';
        await msg.reply(txt);
      } catch(e) { await msg.reply('📊 Erro ao consultar.'); }
      return;
    }

    // ── Template preenchido ──
    if (text.toUpperCase().startsWith('[OMEGA')) {
      const task = parseFilledTemplate(text);
      if (!task) { await msg.reply('❌ Formato invalido. Use !cadcpf pra ver o modelo.'); return; }

      // Resumo antes de enviar
      let resumo = '📋 *Tarefa detectada:* ' + task.modo.toUpperCase() + '\n';
      if (task.veiculos && task.veiculos.length > 0) {
        resumo += '🚗 *Veiculos:* ' + task.veiculos.length + ' (' + task.veiculos.map(v => v.placa).join(', ') + ')\n';
      }
      resumo += '\n⏳ Enviando...';
      await msg.reply(resumo);

      const result = await enviarTarefa(task);
      if (result.success) {
        if (result.queued) {
          await msg.reply('📋 *Na fila!* Nenhum dispositivo disponivel.\nID: ' + result.taskId);
        } else {
          await msg.reply('✅ *Tarefa enviada!*\n📱 Dispositivo: ' + (result.deviceId || '?') + '\n🆔 ID: ' + result.taskId);
        }
      } else {
        await msg.reply('❌ Erro: ' + (result.error || 'Desconhecido'));
      }
      return;
    }

    // ── Código de salvamento ──
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
      await msg.reply(resumo);
      return;
    }

  } catch(err) {
    console.error('Erro:', err);
    try { await msg.reply('❌ Erro: ' + err.message); } catch(e){}
  }
});

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES EXPORTADAS
// ═══════════════════════════════════════════════════════════════

async function sendToGroup(text) {
  if (!botReady || !targetGroupId) return false;
  try { await client.sendMessage(targetGroupId, text); return true; } catch { return false; }
}
async function sendFileToGroup(filepath, caption) {
  if (!botReady || !targetGroupId || !fs.existsSync(filepath)) return false;
  try { const m = MessageMedia.fromFilePath(filepath); await client.sendMessage(targetGroupId, m, { caption }); return true; } catch { return false; }
}
async function sendError(message, step) { return sendToGroup('⚠️ *Erro*\nEtapa: ' + (step||'?') + '\n' + message); }

// ── Erro fatal formatado (pedido bloqueado) ──
async function sendBloqueio(detalhes) {
  const msg =
    '❌ *BLOQUEIO DE PEDIDO DETECTADO*\n' +
    'O cliente esta com pedido aberto em outro ponto.\n\n' +
    '📋 *DETALHES:*\n' +
    '🗓️ *Data/Hora:* ' + (detalhes.dataHora || '?') + '\n' +
    '🔄 *Situacao:* ' + (detalhes.situacao || '?') + '\n' +
    '👤 *Usuario:* ' + (detalhes.usuario || '?') + '\n' +
    '📛 *Nome:* ' + (detalhes.nome || '?') + '\n' +
    '🏢 *Entidade:* ' + (detalhes.entidade || '?') + '\n\n' +
    '⚠️ *ACAO NECESSARIA:* Solicite o fechamento do pedido.';
  return sendToGroup(msg);
}

async function sendDocuments() {
  const c = path.join(DOWNLOAD_DIR, 'Carteirinha.pdf');
  const e = path.join(DOWNLOAD_DIR, 'Extrato.pdf');
  if (fs.existsSync(c)) await sendFileToGroup(c, '✅ Carteirinha RNTRC');
  if (fs.existsSync(e)) await sendFileToGroup(e, '✅ Extrato RNTRC');
}

function startBot() {
  console.log('\n  Omega WhatsApp Bot v5.1 (Sunshine)');
  console.log('  Grupo: ' + GROUP_NAME);
  client.initialize();
}

module.exports = { startBot, sendToGroup, sendFileToGroup, sendError, sendBloqueio, sendDocuments };
