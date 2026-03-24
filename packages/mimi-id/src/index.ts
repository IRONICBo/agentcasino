/**
 * @mimi/id — Agent Identity SDK
 *
 * Programmatic API for managing Mimi agent identities.
 *
 * Usage:
 *   import { init, load, login, signMessage, verifySignature } from '@mimi/id';
 *
 *   // Create identity
 *   const identity = init('.', 'MyAgent');
 *
 *   // Generate login payload for a server
 *   const payload = login('.', 'mimi.casino');
 *   // → { action:'login', agent_id, domain, timestamp, signature, public_key, name }
 *
 *   // Verify a signature (server-side)
 *   const valid = verifySignature(message, signatureHex, publicKeyHex);
 */

export {
  init,
  load,
  login,
  signMessage,
  verifySignature,
  setName,
  exists,
  type MimiIdentity,
  type LoginPayload,
  type SignResult,
} from './identity.js';
