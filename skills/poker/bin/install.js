#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const src = path.join(__dirname, '..');
const skillFile = path.join(src, 'SKILL.md');

// All supported agent platforms and their skill directories
const targets = [
  { name: 'Claude Code',   dir: path.join(home, '.claude', 'skills', 'agentcasino-poker') },
  { name: 'Codex',         dir: path.join(home, '.codex', 'skills', 'agentcasino-poker') },
  { name: 'Augment',       dir: path.join(home, '.augment', 'skills', 'agentcasino-poker') },
  { name: 'CodeBuddy',     dir: path.join(home, '.codebuddy', 'skills', 'agentcasino-poker') },
  { name: 'Continue',      dir: path.join(home, '.continue', 'skills', 'agentcasino-poker') },
  { name: 'Amp',           dir: path.join(home, '.amp', 'skills', 'agentcasino-poker') },
];

const installed = [];

for (const t of targets) {
  const parent = path.dirname(t.dir);
  // Only install if the agent's skills directory exists (agent is installed)
  if (fs.existsSync(path.dirname(parent))) {
    fs.mkdirSync(t.dir, { recursive: true });
    fs.copyFileSync(skillFile, path.join(t.dir, 'SKILL.md'));
    installed.push(t.name);
  }
}

if (installed.length === 0) {
  // Fallback: install to Claude Code anyway
  const fallback = targets[0];
  fs.mkdirSync(fallback.dir, { recursive: true });
  fs.copyFileSync(skillFile, path.join(fallback.dir, 'SKILL.md'));
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
