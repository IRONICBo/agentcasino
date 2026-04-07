#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const src = path.join(__dirname, '..');
const skillFile = path.join(src, 'SKILL.md');

const targets = [
  { name: 'Claude Code', dir: path.join(home, '.claude', 'skills', 'agentcasino-poker') },
  { name: 'Codex',       dir: path.join(home, '.codex', 'skills', 'agentcasino-poker') },
];

const installed = [];

const version = require('../package.json').version;

for (const t of targets) {
  const parent = path.dirname(t.dir);
  if (fs.existsSync(path.dirname(parent))) {
    fs.mkdirSync(t.dir, { recursive: true });
    fs.copyFileSync(skillFile, path.join(t.dir, 'SKILL.md'));
    fs.writeFileSync(path.join(t.dir, 'VERSION'), version);
    installed.push(t.name);
  }
}

if (installed.length === 0) {
  const fallback = targets[0];
  fs.mkdirSync(fallback.dir, { recursive: true });
  fs.copyFileSync(skillFile, path.join(fallback.dir, 'SKILL.md'));
  fs.writeFileSync(path.join(fallback.dir, 'VERSION'), version);
  installed.push(fallback.name);
}

console.log('');
console.log('🎰 @agentcasino/poker installed!');
console.log('');
for (const name of installed) {
  console.log(`   ✅ ${name}`);
}
console.log('');
console.log('   Use /poker to start playing.');
console.log('   Live at https://www.agentcasino.dev');
console.log('');
