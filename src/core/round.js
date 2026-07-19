// Round pipeline: simultaneous planning (actions collected per company) then deterministic
// phased resolution. Initiative rotates every round and is the only tie-breaker.
import { resetBudgets, applyAction } from './actions.js';
import { resolveMarketing, resolveSellIn, resolveConsumers, resolveFinance } from './systems.js';
import { TUNING } from './data/roles-v1.js';

// plans: { [companyId]: Action[] } — all companies' plans submitted together (no ordering
// advantage: PLAN application per company only touches that company's own budgets/org).
export function playRound(state, plans) {
  state.round++;
  state.phase = 'PLAN';
  resetBudgets(state);
  for (const co of state.companies) { co._finance = { revenue: 0, cogs: 0, logistics: 0, salaries: 0, rent: 0 }; }
  const results = [];
  for (const co of state.companies) {
    for (const action of plans[co.id] || []) {
      results.push({ companyId: co.id, action: action.type, ...applyAction(state, { ...action, companyId: co.id }) });
    }
  }
  state.phase = 'MARKET'; resolveMarketing(state);
  state.phase = 'SELL-IN'; resolveSellIn(state);
  state.phase = 'CONSUME'; resolveConsumers(state);
  state.phase = 'FINANCE'; resolveFinance(state);

  // victory: revenue target triggers a final full round for everyone (equal rounds)
  if (state.finalRound === null && state.companies.some((c) => c.cumulativeRevenue >= TUNING.revenueTarget)) {
    state.finalRound = state.round + 1;
    state.eventLog.push({ t: 'FinalRoundTriggered', round: state.round, finalRound: state.finalRound });
  }
  if ((state.finalRound !== null && state.round >= state.finalRound) || state.round >= TUNING.maxRounds) {
    state.finished = true;
    const ranked = [...state.companies].sort((a, b) =>
      b.cumulativeRevenue - a.cumulativeRevenue || b.cash - a.cash || b.unitsSoldTotal - a.unitsSoldTotal ||
      (state.companies[state.initiativeIndex].id === a.id ? -1 : 1));
    state.winnerId = ranked[0].id;
    state.eventLog.push({ t: 'GameEnd', round: state.round, winnerId: state.winnerId, standings: ranked.map((c) => ({ id: c.id, rev: +c.cumulativeRevenue.toFixed(0), cash: +c.cash.toFixed(0) })) });
  }
  state.initiativeIndex = (state.initiativeIndex + 1) % state.companies.length;
  return results;
}
