// ==UserScript==
// @name         Final Omega v4.0
// @namespace    https://github.com/OmSenshi/final-omega
// @version      4.0
// @description  Automacao ANTT autonoma com ponte WebSocket
// @author       Omega
// @match        https://rntrcdigital.antt.gov.br/*
// @match        https://sso.acesso.gov.br/*
// @match        https://acesso.gov.br/*
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

// Ordem de carregamento:
// 1. core.js      — UI, utils, aguardarElemento, toasts, FAB
// 2. extractor.js — OCR via Claude API
// 3. arrendamento.js — aba CRLV + Contrato + Historico (so carrega na ANTT)
// 4. cadastro.js  — aba Cadastro CPF/CNPJ (so carrega na ANTT)
// 5. consulta.js  — aba Emissao (so carrega na ANTT)
// 6. bridge.js    — WebSocket + login Gov.br + 4 fluxos autonomos
