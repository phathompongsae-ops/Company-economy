// Round pipeline: simultaneous planning (actions collected per company) then deterministic
// phased resolution. Initiative rotates every round and is the only tie-breaker.
//
// Split into beginPlanningPhase / resolveRound so an interactive UI can drive planning with
// direct applyAction() calls (immediate validated feedback per player, same function the
// headless tests use — no second logic path) and then resolve once both players submit.
// playRound() is unchanged in signature/behavior and is kept as the thin headless wrapper the
// simulator and existing tests already call — same round++/resetBudgets/apply/resolve order.
import { resetBudgets, applyAction } from './actions.js';
import { resolveMarketing, resolveSellIn, resolveConsumers, resolveFinance } from './systems.js';
import { TUNING } from './data/roles-v1.js';

export function beginPlanningPhase(state) {
  state.round++;
  state.phase = 'PLAN';
  resetBudgets(state);
  for (const co of state.companies) { co._finance = { revenue: 0, cogs: 0, logistics: 0, salaries: 0, rent: 0, marketing: 0, other: 0 }; }
}

export function resolveRound(state) {
  state.phase = 'MARKET'; resolveMarketing(state);
  state.phase = 'SELL-IN'; resolveSellIn(state);
  state.phase = 'CONSUME'; resolveConsumers(state);
  state.phase = 'FINANCE'; resolveFinance(state);

  // victory: revenue target triggers a final full round for everyone (equal rounds).
  // Targets come from state.rules (falls back to TUNING for pre-rules saved states) so
  // test/balance configs can shorten matches without touching production balance.
  const rules = state.rules || TUNING;
  if (state.finalRound === null && state.companies.some((c) => c.cumulativeRevenue >= rules.revenueTarget)) {
    state.finalRound = state.round + 1;
    state.eventLog.push({ t: 'FinalRoundTriggered', round: state.round, finalRound: state.finalRound });
  }
  if ((state.finalRound !== null && state.round >= state.finalRound) || state.round >= rules.maxRounds) {
    state.finished = true;
    const initiativeRank = new Map(state.companies.map((co, i) => [co.id, (i - state.initiativeIndex + state.companies.length) % state.companies.length]));
    const ranked = [...state.companies].sort((a, b) =>
      b.cumulativeRevenue - a.cumulativeRevenue || b.cash - a.cash || b.unitsSoldTotal - a.unitsSoldTotal ||
      initiativeRank.get(a.id) - initiativeRank.get(b.id));
    state.winnerId = ranked[0].id;
    state.eventLog.push({ t: 'GameEnd', round: state.round, winnerId: state.winnerId, standings: ranked.map((c) => ({ id: c.id, rev: +c.cumulativeRevenue.toFixed(0), cash: +c.cash.toFixed(0) })) });
  }
  state.initiativeIndex = (state.initiativeIndex + 1) % state.companies.length;
}

// plans: { [companyId]: Action[] } — all companies' plans submitted together (no ordering
// advantage: PLAN application per company only touches that company's own budgets/org).
export function playRound(state, plans) {
  beginPlanningPhase(state);
  const results = [];
  for (const co of state.companies) {
    for (const action of plans[co.id] || []) {
      results.push({ companyId: co.id, action: action.type, ...applyAction(state, { ...action, companyId: co.id }) });
    }
  }
  resolveRound(state);
  return results;
}
