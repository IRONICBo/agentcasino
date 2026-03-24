/**
 * Mimi Identity — Ed25519 Agent Identity
 *
 * Zero external dependencies. Uses only Node.js crypto.
 *
 * Storage layout:
 *   .mimi/
 *     identity/
 *       agent.pub    — Ed25519 public key (32 bytes, raw)
 *       agent.key    — Ed25519 private key (32 bytes seed, mode 0600)
 *       agent-id     — UUID derived from public key
 *     config         — JSON config (name, created_at)
 */

import {
  generateKeyPairSync, createPrivateKey, createPublicKey,
  sign, verify, randomUUID, createHash,
} from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MimiIdentity {
  agentId: string;
  publicKey: Buffer;    // 32 bytes raw Ed25519 public key
  name: string;
  createdAt: string;
}

export interface LoginPayload {
  action: 'login';
  agent_id: string;
  domain: string;
  timestamp: number;
  signature: string;    // hex-encoded Ed25519 signature
  public_key: string;   // hex-encoded Ed25519 public key
  name?: string;
}

export interface SignResult {
  message: string;
  signature: string;    // hex
  public_key: string;   // hex
  agent_id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIMI_DIR = '.mimi';
const IDENTITY_DIR = 'identity';
const PUB_FILE = 'agent.pub';
const KEY_FILE = 'agent.key';
const ID_FILE = 'agent-id';
const CONFIG_FILE = 'config';

// Ed25519 DER prefixes (for Node.js crypto interop)
// PKCS8 private key prefix (48 bytes total header for 32-byte seed)
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
// SPKI public key prefix (12 bytes header for 32-byte key)
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function mimiDir(baseDir: string): string {
  return join(baseDir, MIMI_DIR);
}

function identityDir(baseDir: string): string {
  return join(mimiDir(baseDir), IDENTITY_DIR);
}

// ---------------------------------------------------------------------------
// Core: Init — generate new identity
// ---------------------------------------------------------------------------

export function init(baseDir: string, name?: string): MimiIdentity {
  const mDir = mimiDir(baseDir);
  const iDir = identityDir(baseDir);

  if (existsSync(join(iDir, KEY_FILE))) {
    throw new Error(`Identity already exists at ${iDir}. Use 'mimi status' to view.`);
  }

  // Create directories
  mkdirSync(iDir, { recursive: true });

  // Generate Ed25519 keypair
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  // Extract raw keys from DER format
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const pubRaw = pubDer.subarray(pubDer.length - 32);   // last 32 bytes
  const privRaw = privDer.subarray(privDer.length - 32); // last 32 bytes (seed)

  // Generate agent ID: UUID v5-style from public key hash
  const agentId = deriveAgentId(pubRaw);

  // Write files
  writeFileSync(join(iDir, PUB_FILE), pubRaw);
  writeFileSync(join(iDir, KEY_FILE), privRaw);
  chmodSync(join(iDir, KEY_FILE), 0o600); // private key readable only by owner
  writeFileSync(join(iDir, ID_FILE), agentId);

  // Write config
  const config = {
    name: name || agentId.slice(0, 8),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(mDir, CONFIG_FILE), JSON.stringify(config, null, 2));

  return {
    agentId,
    publicKey: pubRaw,
    name: config.name,
    createdAt: config.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Core: Load existing identity
// ---------------------------------------------------------------------------

export function load(baseDir: string): MimiIdentity {
  const mDir = mimiDir(baseDir);
  const iDir = identityDir(baseDir);

  if (!existsSync(join(iDir, KEY_FILE))) {
    throw new Error(`No identity found. Run 'mimi init' first.`);
  }

  const pubRaw = readFileSync(join(iDir, PUB_FILE));
  const agentId = readFileSync(join(iDir, ID_FILE), 'utf-8').trim();

  let config = { name: agentId.slice(0, 8), createdAt: 'unknown' };
  const configPath = join(mDir, CONFIG_FILE);
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  }

  return {
    agentId,
    publicKey: Buffer.from(pubRaw),
    name: config.name,
    createdAt: config.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Core: Sign arbitrary message
// ---------------------------------------------------------------------------

export function signMessage(baseDir: string, message: string): SignResult {
  const iDir = identityDir(baseDir);
  const privRaw = readFileSync(join(iDir, KEY_FILE));
  const pubRaw = readFileSync(join(iDir, PUB_FILE));
  const agentId = readFileSync(join(iDir, ID_FILE), 'utf-8').trim();

  // Reconstruct Node.js KeyObject from raw bytes
  const privKey = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, privRaw]),
    format: 'der',
    type: 'pkcs8',
  });

  const sig = sign(null, Buffer.from(message), privKey);

  return {
    message,
    signature: sig.toString('hex'),
    public_key: pubRaw.toString('hex'),
    agent_id: agentId,
  };
}

// ---------------------------------------------------------------------------
// Core: Generate login payload (domain-bound)
// ---------------------------------------------------------------------------

export function login(baseDir: string, domain: string): LoginPayload {
  const identity = load(baseDir);
  const timestamp = Date.now();

  // Signed message format: login:<domain>:<agent_id>:<timestamp>
  const message = `login:${domain}:${identity.agentId}:${timestamp}`;
  const result = signMessage(baseDir, message);

  let config = { name: undefined as string | undefined };
  const configPath = join(mimiDir(baseDir), CONFIG_FILE);
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  }

  return {
    action: 'login',
    agent_id: identity.agentId,
    domain,
    timestamp,
    signature: result.signature,
    public_key: result.public_key,
    name: config.name,
  };
}

// ---------------------------------------------------------------------------
// Core: Verify a signature (used server-side)
// ---------------------------------------------------------------------------

export function verifySignature(
  message: string,
  signature: string, // hex
  publicKey: string,  // hex
): boolean {
  try {
    const pubRaw = Buffer.from(publicKey, 'hex');
    if (pubRaw.length !== 32) return false;

    const pubKeyObj = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, pubRaw]),
      format: 'der',
      type: 'spki',
    });

    return verify(null, Buffer.from(message), pubKeyObj, Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core: Update name
// ---------------------------------------------------------------------------

export function setName(baseDir: string, name: string): void {
  const mDir = mimiDir(baseDir);
  const configPath = join(mDir, CONFIG_FILE);

  let config: any = {};
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  }
  config.name = name;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// Core: Check if identity exists
// ---------------------------------------------------------------------------

export function exists(baseDir: string): boolean {
  return existsSync(join(identityDir(baseDir), KEY_FILE));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a deterministic agent ID from public key using SHA-256 → UUID format */
function deriveAgentId(publicKey: Buffer): string {
  const hash = createHash('sha256').update(publicKey).digest();
  // Format as UUID v5-style (set version nibble to 5, variant to 10xx)
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant 10
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
