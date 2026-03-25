/**
 * Game Plans — strategic composition system for agents.
 *
 * Agents declare a probability distribution over pure strategies before play.
 * The declaration is public so opponents can model your style.
 * It does not enforce gameplay; it's a commitment device for strategic identity.
 */

// ---------------------------------------------------------------------------
// Pure strategy catalog
// ---------------------------------------------------------------------------

export interface PureStrategy {
  id: string;
  name: string;
  description: string;
  vpip: string;      // typical VPIP range
  pfr: string;       // typical PFR range
  af: string;        // typical AF range
  notes: string;
}

export const STRATEGY_CATALOG: PureStrategy[] = [
  {
    id: 'tag',
    name: 'Tight-Aggressive',
    description: 'Narrow hand ranges, aggressive value betting. The gold standard.',
    vpip: '18-25%',
    pfr: '14-20%',
    af: '2.5-4.0',
    notes: 'Raise strong hands, fold marginal ones. Position-aware.',
  },
  {
    id: 'lag',
    name: 'Loose-Aggressive',
    description: 'Wide ranges, frequent pressure and bluffs. Hard to read.',
    vpip: '28-40%',
    pfr: '22-32%',
    af: '3.0-5.0',
    notes: 'Exploits tight players. High variance, high skill ceiling.',
  },
  {
    id: 'rock',
    name: 'Ultra-Tight',
    description: 'Premium hands only. Unbluffable but very predictable.',
    vpip: '8-15%',
    pfr: '7-13%',
    af: '2.0-3.5',
    notes: 'Best for short-stacked or high-rake environments.',
  },
  {
    id: 'shark',
    name: '3-Bet Predator',
    description: 'Wide 3-bet ranges vs loose openers. Steals blinds and pots.',
    vpip: '22-30%',
    pfr: '18-26%',
    af: '3.5-6.0',
    notes: 'Targets high-VPIP opponents. Requires reads.',
  },
  {
    id: 'trapper',
    name: 'Check-Raise Specialist',
    description: 'Slow-plays strong hands. Traps aggressive opponents.',
    vpip: '20-28%',
    pfr: '12-18%',
    af: '1.5-2.5',
    notes: 'Effective vs maniacs. Low c-bet frequency.',
  },
  {
    id: 'gto',
    name: 'GTO Approximation',
    description: 'Near-equilibrium balanced play. Unexploitable in theory.',
    vpip: '23-27%',
    pfr: '18-22%',
    af: '2.8-3.5',
    notes: 'Mixes strategies. Difficult to counter-exploit.',
  },
  {
    id: 'maniac',
    name: 'Hyper-Aggressive',
    description: 'Ultra-wide ranges, constant pressure. Chaos agent.',
    vpip: '50-80%',
    pfr: '40-65%',
    af: '5.0+',
    notes: 'Very high variance. Good early in session to build image.',
  },
];

// ---------------------------------------------------------------------------
// Agent game plan
// ---------------------------------------------------------------------------

export interface StrategyWeight {
  ref: string;   // strategy ID from catalog
  weight: number; // 0.0 - 1.0, must sum to 1.0 across all entries
}

export interface GamePlan {
  id: string;
  name: string;
  active: boolean;
  distribution: StrategyWeight[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

const g = globalThis as any;
if (!g.__casino_game_plans) {
  g.__casino_game_plans = new Map<string, GamePlan[]>(); // agentId → plans
}
const agentPlans: Map<string, GamePlan[]> = g.__casino_game_plans;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateDistribution(distribution: StrategyWeight[]): string | null {
  if (!Array.isArray(distribution) || distribution.length === 0) {
    return 'distribution must be a non-empty array';
  }
  for (const entry of distribution) {
    if (!entry.ref || typeof entry.ref !== 'string') return 'each entry needs a ref (strategy ID)';
    if (typeof entry.weight !== 'number' || entry.weight <= 0 || entry.weight > 1) {
      return `weight for "${entry.ref}" must be between 0 and 1`;
    }
    if (!STRATEGY_CATALOG.find(s => s.id === entry.ref)) {
      return `unknown strategy ref "${entry.ref}". See GET ?action=game_plan_catalog`;
    }
  }
  const total = distribution.reduce((s, e) => s + e.weight, 0);
  if (Math.abs(total - 1.0) > 0.01) {
    return `weights must sum to 1.0 (got ${total.toFixed(3)})`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getGamePlans(agentId: string): GamePlan[] {
  return agentPlans.get(agentId) ?? [];
}

export function getActiveGamePlan(agentId: string): GamePlan | null {
  return agentPlans.get(agentId)?.find(p => p.active) ?? null;
}

export interface SetGamePlanResult {
  success: boolean;
  plan?: GamePlan;
  error?: string;
}

export function setGamePlan(
  agentId: string,
  input: { id?: string; name: string; distribution: StrategyWeight[] },
): SetGamePlanResult {
  const error = validateDistribution(input.distribution);
  if (error) return { success: false, error };

  const plans = agentPlans.get(agentId) ?? [];
  const now = Date.now();
  const planId = input.id ?? `plan-${now}`;

  const existing = plans.find(p => p.id === planId);
  if (existing) {
    existing.name = input.name;
    existing.distribution = input.distribution;
    existing.updatedAt = now;
    // Mark as active, deactivate others
    for (const p of plans) p.active = p.id === planId;
    agentPlans.set(agentId, plans);
    return { success: true, plan: existing };
  }

  // Deactivate all existing plans
  for (const p of plans) p.active = false;

  const newPlan: GamePlan = {
    id: planId,
    name: input.name,
    active: true,
    distribution: input.distribution,
    createdAt: now,
    updatedAt: now,
  };
  plans.push(newPlan);
  agentPlans.set(agentId, plans);
  return { success: true, plan: newPlan };
}

export function getStrategyCatalog(): PureStrategy[] {
  return STRATEGY_CATALOG;
}
