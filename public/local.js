// Static-site mode (GitHub Pages and similar): no server, so the game state
// and handlers run in this tab and are saved to localStorage. Each player
// gets their own balance. The server seed lives in the browser here, so this
// mode is for play-money demos only; the Node server keeps the seed secret.
'use strict';
(function () {
  const KEY = 'raidbreaker.house';
  const newSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage unavailable */ }
  let house;
  try { house = House.createHouse({ newSeed, saved }); } catch { house = House.createHouse({ newSeed }); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(house.snapshot())); } catch { /* storage unavailable */ }
  }

  // Same contract as fetch-ing the server: resolves with plain JSON data or
  // throws an Error carrying the server's message.
  window.LocalApi = async function (path, body) {
    const url = new URL(path, 'http://local');
    const key = `${body === undefined ? 'GET' : 'POST'} ${url.pathname}`;
    const handler = house.handlerFor(key);
    if (!handler) throw new Error('Not found');
    try {
      const out = handler({ body: body || {}, query: url.searchParams });
      if (key !== 'GET /api/state') save();
      return JSON.parse(JSON.stringify(out));
    } catch (err) {
      throw new Error(err.status ? err.message : 'Something went wrong');
    }
  };
  save();
})();
