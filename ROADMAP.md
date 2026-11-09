# Roadmap

Next steps for Raidbreaker, roughly in order. After any change to the game math, re-run `node calibrate.js` and `node rtp.js` (see README).

## 1. Symbol art
The symbols are emoji placeholders. Replace them with original art (no Blizzard IP): 6 runes, 4 hero classes (Warrior, Mage, Rogue, Priest), the Raid Banner wild, the Boss Gate scatter, the 6 gear pieces, and portraits for the 5 bosses. Each symbol's `icon` field in `shared/game.js` is the only place to swap.

## 2. Sound
Reel spin and stop, wins scaled by size, loot drop, boss hit and kill, gamble win and loss, ascension, max win. Needs a mute toggle (saved per player) and should respect the speed setting: shorter or no sounds on Super Turbo.

## 3. Autoplay
A counter for 10 / 25 / 50 / 100 spins is in, and a bonus stops it and waits for the gamble-or-play choice. Still to add: unlimited spins, an option to always play the bonus, and stops when the balance drops by X or one win is over X.

## 4. Accounts and saved progress
Done on the Node server. Each player signs in with a name and password. Balance, per-mode gear, seed pairs and history are stored under `data/` and survive a restart. The active server seed is encrypted with a key wrapped by the password, so a copy of the files does not reveal it, and the server never logs the seed or the password. Login and account creation are rate limited. The static build is still one save per browser, with the seed in the page.

## Later
- Big-win celebrations (tiers at 20x / 100x / 1000x) and a raid-clear animation.
- A history view that replays any finished round's animation.
- Rate limiting and input hardening before anything is exposed beyond localhost.
- Real money needs a gambling license wherever it's offered. Keep it play money until then.
