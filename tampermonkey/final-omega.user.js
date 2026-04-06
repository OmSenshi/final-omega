// ==UserScript==
// @name         Final Omega — Painel ANTT + Bridge
// @namespace    https://github.com/OmSenshi/final-omega
// @version      3.0
// @description  Automacao ANTT com ponte WebSocket para VPS
// @author       Omega
// @match        https://rntrcdigital.antt.gov.br/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-end
//
// @require      https://raw.githubusercontent.com/OmSenshi/final-omega/main/tampermonkey/core.js
// @require      https://raw.githubusercontent.com/OmSenshi/final-omega/main/tampermonkey/extractor.js
// @require      https://raw.githubusercontent.com/OmSenshi/final-omega/main/tampermonkey/pages/arrendamento.js
// @require      https://raw.githubusercontent.com/OmSenshi/final-omega/main/tampermonkey/pages/cadastro.js
// @require      https://raw.githubusercontent.com/OmSenshi/final-omega/main/tampermonkey/pages/consulta.js
// @require      https://raw.githubusercontent.com/OmSenshi/final-omega/main/tampermonkey/bridge.js
// ==/UserScript==

// Todos os modulos carregam via @require na ordem:
// 1. core.js      — UI, utils, aguardarElemento
// 2. extractor.js — OCR via Claude API
// 3. arrendamento.js — aba CRLV + Contrato + Historico
// 4. cadastro.js  — aba Cadastro CPF/CNPJ
// 5. consulta.js  — aba Emissao
// 6. bridge.js    — aba Bridge (WebSocket → VPS)
