# Roadmap

Next steps for Raidbreaker, roughly in order. After any change to the game math, re-run `node calibrate.js` and `node rtp.js` (see README).

## Done
- Symbol art, the raid hall, and layered sound. Mute is saved in the browser, and Super Turbo stays short.
- Big-win ceremonies (20x / 100x / 1000x), plus ascension, raid clear, and wipe.
- History replays a finished round's animation after the seed is rotated. The replay does not change the balance.
- Autoplay: 10 / 25 / 50 / 100 / ∞. A bonus stops it and waits for gamble-or-play, unless "always play the raid" is on. It also stops when the balance drops by a set amount, or when one round wins more than a set amount.

## Next: accounts and saved progress
The server keeps one player's state in memory, so a restart resets balance, gear and history. Add player accounts and persistent storage (balance, per-mode gear, seed pairs, history), with the active server seed encrypted at rest and never logged.

## Later
- Rate limiting and input hardening before anything is exposed beyond localhost.
- Real money needs a gambling license wherever it's offered. Keep it play money until then.
