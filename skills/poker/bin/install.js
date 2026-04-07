#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const src = path.join(__dirname, '..');
const dest = path.join(os.homedir(), '.claude', 'skills', 'agentcasino-poker');

fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(src, 'SKILL.md'), path.join(dest, 'SKILL.md'));

console.log('✅ @agentcasino/poker installed to ~/.claude/skills/agentcasino-poker/');
console.log('   Use /poker in Claude Code to start playing.');
