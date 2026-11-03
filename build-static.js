// Builds a server-free copy of the game into dist/ for static hosting
// (GitHub Pages, Netlify, itch.io). The game runs in the browser and saves
// each player's state to localStorage. Usage: node build-static.js
'use strict';
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'shared'), { recursive: true });

for (const f of ['app.js', 'style.css', 'local.js']) fs.copyFileSync(path.join(__dirname, 'public', f), path.join(out, f));
for (const f of ['fair.js', 'game.js', 'house.js']) fs.copyFileSync(path.join(__dirname, 'shared', f), path.join(out, 'shared', f));

const appTag = '<script src="app.js"></script>';
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
if (!html.includes(appTag)) throw new Error('index.html: app.js script tag not found');
fs.writeFileSync(path.join(out, 'index.html'), html.replace(appTag,
  '<script src="shared/house.js"></script>\n  <script src="local.js"></script>\n  ' + appTag));
fs.writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`Static build written to ${path.relative(process.cwd(), out) || '.'}/`);
