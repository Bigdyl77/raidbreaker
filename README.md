# Raidbreaker

A provably fair dungeon-raid slot prototype. Play money only. No dependencies: it needs Node 18 or newer.

```
npm start      # http://localhost:3000
npm run dev    # same, plus the Dev panel (exposes the active server seed)
npm test
```

## The game

- 5 reels × 4 rows, ways pays from the left. Raid Banner wilds land on reels 2–4, and Boss Gate scatters can land on any reel.
- **Volatility modes**: Steady (constant small wins, 1,000x cap), Standard (5,000x cap) and Mega (runes need 4+ to pay, x100 final boss, x500 secret boss, 100,000x cap). Each mode is tuned to 98.5–99% RTP.
- **Raids**: every wild that lands in the bonus damages the current boss. Killing a boss raises the multiplier for the rest of the raid and adds spins.
- **Bonus tiers**: Normal (3 scatters), Super (4), Hidden (5) and Super Hidden. Higher tiers start deeper into the raid. Super Hidden adds a secret boss and can't be bought.
- **Ascension**: any bonus that starts (spun or bought) can climb tiers. Normal to Super Hidden is about 1 in 222,000.
- **Gamble**: before a raid, you can gamble for the next tier. A loss forfeits the bonus. The odds equal the ratio of the tiers' values, so gambling doesn't change your expected return.
- **Gear loot**: rare items attach to symbols on base spins, and a full 6-piece set starts a Normal Bonus. The drop chance climbs during dry streaks, and caches can drop 2–3 pieces at once.
- **Buys**: Normal, Super, Hidden, Mystery (random tier) and **Glory or Wipe** (random tier, even Super Hidden). In Glory or Wipe, clearing every boss pays the mode's max win and anything less pays nothing.

## Provably fair

Before a round, the server shows `SHA-256(serverSeed)`. Each round draws floats from
`HMAC-SHA256(serverSeed, "clientSeed:nonce:[channel:]i")`, with separate channels for the base spin (`""`), gambles (`"gamble"`) and the raid (`"raid"`). Rounds run on the server, so the active seed never reaches the browser. Rotating the seed reveals it, and the Verify tab then replays any round in the browser with the same code (`shared/`).

## Files

| Path | What it is |
|---|---|
| `shared/fair.js` | SHA-256, HMAC and the float streams (pure JS, runs in Node and in the browser) |
| `shared/game.js` | The engine: symbols, modes, tiers, gear, buys and the gamble |
| `shared/sim.js` | Fast simulator for balancing |
| `server.js` | HTTP server and game state (single player, in memory) |
| `public/` | The browser client |
| `rtp.js` | Parallel RTP check: `node rtp.js 100000000 mega` |
| `calibrate.js` | Measures tier values and clear rates. Paste its output into each mode's `calibration` / `clearRate` |
| `test.js` | Hash correctness, replay determinism, and stepwise-vs-replay checks |

After changing a mode's math, run `calibrate.js`, paste in the results, then confirm with `rtp.js`.

## Not production

The server keeps one player's state in memory. A real deployment would need accounts, persistent storage, an encrypted seed store, rate limiting, and a gambling license wherever real money is involved.
