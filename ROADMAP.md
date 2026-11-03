# Roadmap

Next steps for Raidbreaker, roughly in order. After any change to the game math, re-run `node calibrate.js` and `node rtp.js` (see README).

## 1. Symbol art
The symbols are emoji placeholders. Replace them with original art (no Blizzard IP): 6 runes, 4 hero classes (Warrior, Mage, Rogue, Priest), the Raid Banner wild, the Boss Gate scatter, the 6 gear pieces, and portraits for the 5 bosses. Each symbol's `icon` field in `shared/game.js` is the only place to swap.

## 2. Sound
Reel spin and stop, wins scaled by size, loot drop, boss hit and kill, gamble win and loss, ascension, max win. Needs a mute toggle (saved per player) and should respect the speed setting: shorter or no sounds on Super Turbo.

## 3. Autoplay
A number of spins (10 / 25 / 50 / 100 / ∞) with stop conditions: on any bonus, if balance drops by X, or on a single win over X. Bonuses should stop autoplay and wait for the gamble-or-play choice unless the player opts into "always play bonus".

## 4. Accounts and saved progress
The server keeps one player's state in memory, so a restart resets balance, gear and history. Add player accounts and persistent storage (balance, per-mode gear, seed pairs, history), with the active server seed encrypted at rest and never logged.

## Later
- Big-win celebrations (tiers at 20x / 100x / 1000x) and a raid-clear animation.
- A history view that replays any finished round's animation.
- Rate limiting and input hardening before anything is exposed beyond localhost.
- Real money needs a gambling license wherever it's offered. Keep it play money until then.
