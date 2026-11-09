# Raidbreaker

A provably fair dungeon-raid slot prototype. Play money only. No dependencies: it needs Node 18 or newer.

```
npm start      # http://localhost:3000
npm run dev    # same, plus the Dev panel (exposes the active server seed)
npm test
```

## Accounts

`npm start` keeps a separate save for each player in `data/` (not committed). Sign in from the window on the page. A restart keeps that player's balance, gear, history and seed pair. The active server seed is encrypted with a key that only the password can unwrap, and the server does not log the seed or the password. Login and account creation are rate limited. `DATA_DIR` picks a different folder. `--dev` still shows the active seed to the signed-in player.

The static build has no accounts. It keeps one save in that browser, and the seed lives in the page.

## Sharing it (static build)

`node build-static.js` writes a server-free copy to `dist/`: the game runs in the browser and saves each player's balance in their own browser, so it can go on any static host.

- **GitHub Pages**: `.github/workflows/pages.yml` publishes `dist/` on every push to `main` once Pages is on (Settings → Pages → Source: GitHub Actions). The link is `https://<user>.github.io/raidbreaker/`. Free accounts need the repo to be public.
- **Netlify / itch.io**: run the build and upload the `dist/` folder (itch.io: zip it and mark it "played in the browser").

In the static build the server seed lives in the player's browser, so it's a play-money demo, not a provably fair one. The Node server keeps the seed secret.

## The game

- 5 reels × 4 rows, ways pays from the left. Raid Banner wilds land on reels 2–4, and Boss Gate scatters can land on any reel.
- **Volatility modes**: Steady (constant small wins, 1,000x cap), Standard (5,000x cap) and Mega (runes need 4+ to pay, x100 final boss, x500 secret boss, 100,000x cap). Each mode is tuned to 98.5–99% RTP.
- **Raids**: every wild that lands in the bonus damages the current boss. Killing a boss raises the multiplier for the rest of the raid and adds spins. Boss HP is tuned per tier so every tier clears only about 1–20% of the time.
- **Sticky wilds**: in Super, Hidden and Super Hidden raids, a wild stays on the reels for 1, 2 or 3 more spins and hits the boss again each spin.
- **Classes**: the player picks a class on their first visit, before spinning or buying. It is kept as their profile and can be changed between rounds from the class bar. Warrior (+4 spins), Rogue (crits), Mage (1.5x kill multipliers, charged spins), Hunter (middle-reel wilds hit for 2) and Priest (resurrection, +1 spin per kill). Raid pays are scaled per class and tier (`heroScale`), so every class has the same average win and gamble odds and buy prices don't depend on the pick. Clear rates differ, so Glory or Wipe is priced for the current class. A round always plays with the class it started with.
- **Bonus tiers**: Normal (3 scatters), Super (4), Hidden (5) and Super Hidden. Higher tiers start deeper into the raid. Super Hidden adds a secret boss and can't be bought.
- **Ascension**: any bonus that starts (spun or bought) can climb tiers. Normal to Super Hidden is about 1 in 222,000.
- **Gamble**: before a raid, you can gamble for the next tier. A loss forfeits the bonus. The odds equal the ratio of the tiers' values, so gambling doesn't change your expected return. This is deliberate: making the Hidden → Super Hidden step rarer would need a house edge on the gamble, which would lower the real RTP. Super Hidden stays rare through ascension instead.
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
| `shared/house.js` | Game state and request handlers, shared by the server and the static build |
| `server.js` | HTTP server around `shared/house.js` (single player, in memory) |
| `public/local.js`, `build-static.js` | The static build: runs `shared/house.js` in the page and saves to localStorage |
| `public/` | The browser client |
| `rtp.js` | Parallel RTP check: `node rtp.js 100000000 mega` |
| `calibrate.js` | Balances classes: prints each mode's `heroScale` (so every class averages the tier's `calibration` target) and per-class `clearRate`. Paste into the mode and re-run until on target |
| `test.js` | Hash correctness, replay determinism, and stepwise-vs-replay checks |

After changing a mode's raid math, run `calibrate.js`, paste in `heroScale` and `clearRate`, run it again until every class sits on the target, then confirm with `rtp.js`. Changing `calibration` itself (the tier values) changes the RTP, so re-check `rtp.js` and the base `scale` too.

## Not production

Accounts and an encrypted seed store are in place for the Node server, and login is rate limited. The other routes are not. A public deployment still needs that, and real money needs a gambling license wherever it is offered. This build is play money.
