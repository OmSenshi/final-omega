# Final Omega

Automação ANTT com arquitetura **Cérebro + Braço**.

## Arquitetura

```
┌─────────────────────────────┐         WebSocket          ┌──────────────────────────┐
│        VPS (Cérebro)        │◄──────────────────────────►│   Celular/Tablet (Braço) │
│                             │                            │                          │
│  Node.js + Express          │   Envia tarefas ──────►    │  Kiwi Browser            │
│  Frontend (formulário)      │   ◄────── Status/resultado │  + Tampermonkey           │
│  Extração Claude API        │                            │  + Final Omega userscript │
│  WhatsApp Bot               │                            │  (rede 4G/5G/Wi-Fi)      │
│  Histórico + Fila           │                            │                          │
└─────────────────────────────┘                            └──────────────────────────┘
```

**Por que?** O Gov.br bloqueia IPs de datacenter/VPS (hCaptcha impossível). O celular na rede residencial é confiável.

## Estrutura

```
final-omega/
├── server/                    ← VPS (Node.js)
│   ├── src/
│   │   ├── server.js          ← Express + WebSocket + SSE
│   │   ├── routes/
│   │   │   └── extraction.js  ← Extração via Claude API
│   │   └── whatsapp/
│   │       └── bot.js         ← Bot WhatsApp
│   ├── public/
│   │   └── index.html         ← Frontend PWA
│   ├── package.json
│   └── .env.example
│
└── tampermonkey/              ← Celular (Kiwi Browser)
    ├── final-omega.user.js    ← Header do userscript
    ├── core.js                ← UI + utils + aguardarElemento
    ├── extractor.js           ← OCR via Claude Haiku
    ├── bridge.js              ← WebSocket → VPS
    └── pages/
        ├── arrendamento.js    ← CRLV + Contrato
        ├── cadastro.js        ← Cadastro CPF/CNPJ
        └── consulta.js        ← Emissão de docs
```

## Setup — VPS

```bash
# 1. Clone
git clone https://github.com/OmSenshi/final-omega.git
cd final-omega/server

# 2. Instale
npm install

# 3. Configure
cp .env.example .env
nano .env   # preencha CLAUDE_API_KEY, etc

# 4. Rode
node src/server.js

# 5. PM2 (24h)
pm2 start src/server.js --name final-omega
pm2 save && pm2 startup
```

## Setup — Celular/Tablet

1. Instale o **Kiwi Browser** (Android) — suporta extensões Chrome
2. Instale o **Tampermonkey** pela Chrome Web Store dentro do Kiwi
3. Crie um novo script e cole o conteúdo de `final-omega.user.js`
4. Acesse `https://rntrcdigital.antt.gov.br` e faça login normalmente
5. No painel Omega, vá na aba **Bridge**, cole a URL do VPS (`ws://SEU_IP:3000/ws`) e clique **Conectar**

## Fluxo

1. Abra `http://SEU_IP:3000` no navegador (PC ou celular)
2. Preencha os dados (cadastro, arrendamento ou inclusão)
3. Verifique se o badge mostra "1 disp. (1 livre)"
4. Clique **Iniciar**
5. O VPS envia a tarefa via WebSocket → Tampermonkey recebe → executa no portal ANTT
6. Status em tempo real aparece no frontend

## Regras do Tampermonkey

- Modais: polling com `aguardarElemento` (existência + visibilidade)
- Callbacks: sempre via `window._setTimeoutNativo` (sobrevive ao `matarTimers()`)
- Botões: flag `_omegaClicado` contra duplo-disparo
- `CodigoTipoVinculo`: setado por value apenas, sem `trigger('change')`
- Digitação: `digitarCharAChar` com delay humanizado
