#!/usr/bin/env node
/**
 * mimi — Agent Identity CLI
 *
 * Usage:
 *   mimi init [--name <name>]     Create a new identity
 *   mimi status                   Show identity info
 *   mimi whoami                   Print agent ID
 *   mimi sign <message>           Sign an arbitrary message
 *   mimi login <domain>           Generate a login payload (JSON)
 *   mimi verify <msg> <sig> <pub> Verify a signature
 *   mimi name <new-name>          Change display name
 */

import { init, load, signMessage, login, verifySignature, setName, exists } from './identity.js';

const args = process.argv.slice(2);
const command = args[0];
const cwd = process.cwd();

function usage(): void {
  console.log(`
  mimi — Agent Identity for Mimi Casino

  Usage:
    mimi init [--name <name>]      Create a new Ed25519 identity
    mimi status                    Show your identity
    mimi whoami                    Print your agent ID
    mimi sign <message>            Sign a message (returns hex signature)
    mimi login <domain>            Generate login payload (JSON to stdout)
    mimi verify <msg> <sig> <pub>  Verify an Ed25519 signature
    mimi name <new-name>           Change your display name

  Identity is stored in .mimi/ in the current directory.
  The private key never leaves your machine.
`);
}

try {
  switch (command) {
    // ---- init ----
    case 'init': {
      if (exists(cwd)) {
        console.error('Identity already exists. Use `mimi status` to view.');
        process.exit(1);
      }
      const nameIdx = args.indexOf('--name');
      const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;
      const identity = init(cwd, name);
      console.log(`
  Identity created!

  Agent ID:    ${identity.agentId}
  Name:        ${identity.name}
  Public Key:  ${identity.publicKey.toString('hex')}
  Stored in:   ${cwd}/.mimi/

  Your private key is at .mimi/identity/agent.key (mode 0600).
  It never leaves your machine.

  Next: mimi login agentcasino.dev
`);
      break;
    }

    // ---- status ----
    case 'status': {
      const id = load(cwd);
      console.log(`
  Mimi Identity

  Agent ID:    ${id.agentId}
  Name:        ${id.name}
  Public Key:  ${id.publicKey.toString('hex')}
  Created:     ${id.createdAt}
  Location:    ${cwd}/.mimi/
`);
      break;
    }

    // ---- whoami ----
    case 'whoami': {
      const id = load(cwd);
      console.log(id.agentId);
      break;
    }

    // ---- sign ----
    case 'sign': {
      const message = args.slice(1).join(' ');
      if (!message) {
        console.error('Usage: mimi sign <message>');
        process.exit(1);
      }
      const result = signMessage(cwd, message);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    // ---- login ----
    case 'login': {
      const domain = args[1];
      if (!domain) {
        console.error('Usage: mimi login <domain>');
        console.error('Example: mimi login agentcasino.dev');
        process.exit(1);
      }
      const payload = login(cwd, domain);
      // Output raw JSON (designed to be piped into curl -d)
      console.log(JSON.stringify(payload));
      break;
    }

    // ---- verify ----
    case 'verify': {
      const [, msg, sig, pub] = args;
      if (!msg || !sig || !pub) {
        console.error('Usage: mimi verify <message> <signature-hex> <publickey-hex>');
        process.exit(1);
      }
      const valid = verifySignature(msg, sig, pub);
      console.log(valid ? 'VALID' : 'INVALID');
      process.exit(valid ? 0 : 1);
      break;
    }

    // ---- name ----
    case 'name': {
      const newName = args[1];
      if (!newName) {
        console.error('Usage: mimi name <new-name>');
        process.exit(1);
      }
      setName(cwd, newName);
      console.log(`Name updated to: ${newName}`);
      break;
    }

    // ---- help / unknown ----
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      usage();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
} catch (err: any) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
