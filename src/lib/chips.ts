import { Agent } from './types';
import { saveAgent, loadAgent, loadAllAgents, deductChipsAtomic, addChipsAtomic, claimChipsAtomic } from './casino-db';

const CLAIM_AMOUNT = 50_000;         // chips per claim
const CLAIM_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between claims
const MAX_CLAIMS_PER_DAY = 12;       // max 12 claims/day = 600k/day

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getOrCreateAgent(id: string, name: string): Promise<Agent> {
  const existing = await loadAgent(id);
  if (existing) {
    // Reset daily claims if new day
    const today = todayStr();
    if (existing.lastClaimDate !== today) {
      existing.claimsToday = 0;
      existing.lastClaimDate = today;
    }
    return existing;
  }
  // Create new agent
  const agent: Agent = {
    id,
    name,
    chips: 0,
    claimsToday: 0,
    lastClaimAt: 0,
    lastClaimDate: '',
    createdAt: Date.now(),
  };
  await saveAgent(agent);
  return agent;
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  const agent = await loadAgent(id);
  if (!agent) return undefined;
  const today = todayStr();
  if (agent.lastClaimDate !== today) {
    agent.claimsToday = 0;
    agent.lastClaimDate = today;
  }
  return agent;
}

export interface ClaimResult {
  success: boolean;
  message: string;
  chips: number;
  claimsToday?: number;
  maxClaims?: number;
  nextClaimIn?: number; // seconds until next claim available
}

export async function claimChips(agentId: string): Promise<ClaimResult> {
  const agent = await loadAgent(agentId);
  if (!agent) {
    return { success: false, message: 'Agent not found. Register first.', chips: 0 };
  }

  const today = todayStr();
  if (agent.lastClaimDate !== today) {
    agent.claimsToday = 0;
    agent.lastClaimDate = today;
  }

  // Check daily limit
  if (agent.claimsToday >= MAX_CLAIMS_PER_DAY) {
    return {
      success: false,
      message: `Daily limit reached (${MAX_CLAIMS_PER_DAY}/${MAX_CLAIMS_PER_DAY}). Come back tomorrow!`,
      chips: agent.chips,
      claimsToday: agent.claimsToday,
      maxClaims: MAX_CLAIMS_PER_DAY,
    };
  }

  // Check cooldown
  const now = Date.now();
  const elapsed = now - agent.lastClaimAt;
  if (elapsed < CLAIM_COOLDOWN_MS) {
    const remainSec = Math.ceil((CLAIM_COOLDOWN_MS - elapsed) / 1000);
    const remainMin = Math.ceil(remainSec / 60);
    return {
      success: false,
      message: `Cooldown: ${remainMin} min remaining. Claims: ${agent.claimsToday}/${MAX_CLAIMS_PER_DAY} today.`,
      chips: agent.chips,
      claimsToday: agent.claimsToday,
      maxClaims: MAX_CLAIMS_PER_DAY,
      nextClaimIn: remainSec,
    };
  }

  // Atomic claim: CAS on last_claim_at to prevent concurrent double-claims
  const result = await claimChipsAtomic(
    agentId,
    CLAIM_AMOUNT,
    agent.lastClaimAt,           // optimistic lock value
    agent.claimsToday + 1,
    now,
    today,
  );

  if (result === null) {
    // CAS failed — another concurrent request already claimed
    return {
      success: false,
      message: 'Claim already in progress. Try again.',
      chips: agent.chips,
      claimsToday: agent.claimsToday,
      maxClaims: MAX_CLAIMS_PER_DAY,
    };
  }

  return {
    success: true,
    message: `+${CLAIM_AMOUNT.toLocaleString()} chips! (${agent.claimsToday + 1}/${MAX_CLAIMS_PER_DAY} today)`,
    chips: result,
    claimsToday: agent.claimsToday + 1,
    maxClaims: MAX_CLAIMS_PER_DAY,
  };
}

export async function getChipBalance(agentId: string): Promise<number> {
  const agent = await loadAgent(agentId);
  return agent?.chips ?? 0;
}

export async function deductChips(agentId: string, amount: number): Promise<boolean> {
  const result = await deductChipsAtomic(agentId, amount);
  return result !== null;
}

export async function addChips(agentId: string, amount: number): Promise<void> {
  await addChipsAtomic(agentId, amount);
}

export async function getAllAgents(): Promise<Agent[]> {
  return loadAllAgents();
}

export async function listAgents(): Promise<Agent[]> {
  return loadAllAgents();
}
