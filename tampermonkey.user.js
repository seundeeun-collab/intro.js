// ==UserScript==
// @name         Bot Input Forwarder
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Forward basic page info or selected values to your automation bot backend via POST
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      localhost
// ==/UserScript==

(function() {
  'use strict';

  // Configure your bot endpoint (example: http://localhost:3000/api/instructions)
  const BOT_ENDPOINT = 'http://localhost:3000/api/instructions';

  function send(payload) {
    try {
      GM_xmlhttpRequest({
        method: 'POST',
        url: BOT_ENDPOINT,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(payload),
        onload: function(resp) {
          console.log('Bot forwarder response', resp.status, resp.responseText);
        },
        onerror: function(err) {
          console.error('Bot forwarder error', err);
        }
      });
    } catch (e) {
      console.error('GM_xmlhttpRequest failed:', e);
    }
  }

  function collectPageSummary() {
    return {
      url: location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      selections: window.getSelection ? window.getSelection().toString().slice(0,1000) : '',
      snippet: document.body && document.body.innerText ? document.body.innerText.slice(0,1000) : ''
    };
  }

  GM_registerMenuCommand('Send page summary to bot', () => {
    const payload = { type: 'pageSummary', data: collectPageSummary() };
    send(payload);
    alert('Sent page summary to bot endpoint.');
  });

  // Optional: auto-send when user selects text and presses Ctrl+Shift+Y
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyY') {
      const payload = { type: 'selection', data: collectPageSummary() };
      send(payload);
      console.log('Sent selection to bot');
    }
  });

})();
