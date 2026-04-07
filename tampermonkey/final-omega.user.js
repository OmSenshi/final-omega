// ==UserScript==
// @name         Final Omega v5.4 Sunshine
// @namespace    https://github.com/OmSenshi/final-omega
// @version      5.4
// @description  Automacao ANTT autonoma com ponte WebSocket — Sunshine Edition
// @author       Omega
// @match        https://rntrcdigital.antt.gov.br/*
// @match        https://sso.acesso.gov.br/*
// @match        https://sso.staging.acesso.gov.br/*
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
// 1. core.js         — UI, FAB, toasts, aguardarElemento (so ANTT)
// 2. extractor.js    — OCR via Claude Haiku (so ANTT)
// 3. arrendamento.js — aba CRLV + Contrato + Historico (so ANTT)
// 4. cadastro.js     — aba Cadastro CPF/CNPJ (so ANTT)
// 5. consulta.js     — aba Emissao (so ANTT)
// 6. bridge.js       — WebSocket, login Gov.br, 4 fluxos, resgate, mini-bridge (ANTT + Gov.br)
