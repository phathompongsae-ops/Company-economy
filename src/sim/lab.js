#!/usr/bin/env node
// Balance Lab — headless bot-vs-bot match runner + telemetry, for 2-4 companies.
// Uses the EXACT interactive pipeline the UI uses (beginPlanningPhase + per-company
// bot turns via applyAction + resolveRound), so lab results describe the real game.
//
//   node src/sim/lab.js --matrix --seeds 25            2-company archetype round-robin
//   node src/sim/lab.js --three --seeds 15             3-company combos
//   node src/sim/lab.js --four --seeds 15              4-company mixed + mirrors
//   node src/sim/lab.js --match balanced_operator,price_leader --seed 7 --verbose
//   node src/sim/lab.js --all --seeds 20 --json out.json
import { writeFileSync } from 'node:fs';
import { createInitialState } from '../core/state.js';
import { beginPlanningPhase, resolveRound } from '../core/round.js';
import { runBotTurn } from '../bots/bot.js';
import { ARCHETYPES, ARCHETYPE_IDS } from '../bots/archetypes.js';
import { TUNING } from '../core/data/roles-v1.js';

export function runBotMatch(archetypeIds, seed, { rules = {}, verbose = false } = {}) {
  const names = archetypeIds.map((a, i) => `${ARCHETYPES[a].label} ${i + 1}`);
  const state = createInitialState(seed, names, rules);
  const perRound = [];
  let guard = 0;
  while (!state.finished && guard++ < 40) {
    beginPlanningPhase(state);
    // bots plan in initiative order — same rotation the UI applies to seats
    const order = state.companies.map((_, i) => state.companies[(state.initiativeIndex + i) % state.companies.length]);
    for (const co of order) runBotTurn(state, co, archetypeIds[state.companies.indexOf(co)]);
    resolveRound(state);
    perRound.push({
      round: state.round,
      cash: state.companies.map((c) => Math.round(c.cash)),
      rev: state.companies.map((c) => Math.round(c.cumulativeRevenue)),
      profit: state.companies.map((c) => {
        const f = c._finance || {};
        return Math.round((f.revenue || 0) - (f.cogs || 0) - (f.logistics || 0) - (f.salaries || 0) - (f.rent || 0) - (f.marketing || 0) - (f.other || 0));
      }),
    });
    if (verbose) {
      for (const c of state.companies) {
        console.log(`r${String(state.round).padStart(2)} ${c.name.padEnd(20)} cash=${String(Math.round(c.cash)).padStart(5)} rev=${String(Math.round(c.cumulativeRevenue)).padStart(5)} emp=${c.employees.length}`);
      }
    }
  }
  const winnerIdx = state.companies.findIndex((c) => c.id === state.winnerId);
  const totalUnits = state.companies.reduce((s, c) => s + c.unitsSoldTotal, 0) || 1;
  const shares = state.companies.map((c) => c.unitsSoldTotal / totalUnits);
  const hhi = shares.reduce((s, x) => s + x * x, 0);           // market concentration
  const half = Math.floor(perRound.length / 2);
  const midLeader = perRound[half] ? perRound[half].rev.indexOf(Math.max(...perRound[half].rev)) : winnerIdx;
  const rejections = state.debugLog.filter((d) => d.t === 'BotDecision')
    .reduce((s, d) => s + d.decisions.filter((x) => !x.ok).length, 0);
  const decisions = state.debugLog.filter((d) => d.t === 'BotDecision')
    .reduce((s, d) => s + d.decisions.length, 0);
  return {
    seed, archetypes: archetypeIds, rounds: state.round,
    winnerIdx, winnerArchetype: archetypeIds[winnerIdx],
    rev: state.companies.map((c) => Math.round(c.cumulativeRevenue)),
    cash: state.companies.map((c) => Math.round(c.cash)),
    endEmployees: state.companies.map((c) => c.employees.length),
    hhi: +hhi.toFixed(3),
    comeback: midLeader !== winnerIdx,
    noPurchaseRate: +(state.debugLog.filter((d) => d.t === 'NoPurchase').length /
      Math.max(1, state.debugLog.filter((d) => d.t === 'NoPurchase' || d.t === 'ConsumerChoice').length)).toFixed(3),
    botRejectionRate: +(rejections / Math.max(1, decisions)).toFixed(3),
    perRound,
  };
}

// -------- aggregation --------
export function aggregate(results) {
  const byArch = {};
  for (const r of results) {
    r.archetypes.forEach((a, i) => {
      const s = (byArch[a] ??= { games: 0, wins: 0, rev: 0, cash: 0 });
      s.games++; s.rev += r.rev[i]; s.cash += r.cash[i];
      if (i === r.winnerIdx) s.wins++;
    });
  }
  const inflation = analyzeInflation(results);
  return {
    matches: results.length,
    avgRounds: +(results.reduce((s, r) => s + r.rounds, 0) / results.length).toFixed(1),
    comebackRate: +(results.filter((r) => r.comeback).length / results.length).toFixed(2),
    avgHhi: +(results.reduce((s, r) => s + r.hhi, 0) / results.length).toFixed(3),
    avgNoPurchase: +(results.reduce((s, r) => s + r.noPurchaseRate, 0) / results.length).toFixed(3),
    avgBotRejection: +(results.reduce((s, r) => s + r.botRejectionRate, 0) / results.length).toFixed(3),
    archetypes: Object.fromEntries(Object.entries(byArch).map(([a, s]) => [a, {
      winRate: +(s.wins / s.games).toFixed(2), games: s.games,
      avgRev: Math.round(s.rev / s.games), avgEndCash: Math.round(s.cash / s.games),
    }])),
    inflation,
  };
}

// Anti-inflation metrics: does money pile up until tradeoffs stop mattering?
export function analyzeInflation(results) {
  const endCash = results.flatMap((r) => r.cash);
  const sorted = [...endCash].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = Math.max(...endCash);
  // late-game cash growth: average of (cash r_last - cash r_last-3) per company
  let lateGrowth = 0, n = 0;
  for (const r of results) {
    const pr = r.perRound;
    if (pr.length < 4) continue;
    const a = pr[pr.length - 4], b = pr[pr.length - 1];
    for (let i = 0; i < b.cash.length; i++) { lateGrowth += (b.cash[i] - a.cash[i]) / 3; n++; }
  }
  const warnings = [];
  if (median > TUNING.startingCash * 2.5) warnings.push(`median end cash ${median} > 2.5x starting cash — spending pressure too weak`);
  if (max > TUNING.startingCash * 6) warnings.push(`max end cash ${max} > 6x starting cash — runaway accumulation`);
  if (n && lateGrowth / n > 220) warnings.push(`late-game cash growth ${Math.round(lateGrowth / n)}/round — costs no longer bind`);
  return {
    medianEndCash: median, maxEndCash: max,
    avgLateCashGrowthPerRound: n ? Math.round(lateGrowth / n) : 0,
    startingCash: TUNING.startingCash,
    warnings,
  };
}

// -------- matchup suites --------
export function suiteTwo(seeds) {
  const out = [];
  for (let i = 0; i < ARCHETYPE_IDS.length; i++) {
    for (let j = 0; j < ARCHETYPE_IDS.length; j++) {
      if (i === j) continue; // both orders — position/initiative fairness is part of the test
      for (let s = 0; s < seeds; s++) out.push(runBotMatch([ARCHETYPE_IDS[i], ARCHETYPE_IDS[j]], 1000 + s * 17 + i * 3 + j));
    }
  }
  return out;
}
export function suiteMirror(seeds) {
  const out = [];
  for (const a of ARCHETYPE_IDS) for (let s = 0; s < seeds; s++) out.push(runBotMatch([a, a], 5000 + s * 13));
  return out;
}
export function suiteThree(seeds) {
  const combos = [
    ['balanced_operator', 'price_leader', 'brand_builder'],
    ['balanced_operator', 'price_leader', 'retail_expansion'],
    ['balanced_operator', 'brand_builder', 'retail_expansion'],
    ['price_leader', 'brand_builder', 'retail_expansion'],
  ];
  const out = [];
  combos.forEach((c, ci) => { for (let s = 0; s < seeds; s++) out.push(runBotMatch(c, 7000 + s * 11 + ci)); });
  return out;
}
export function suiteFour(seeds) {
  const combos = [
    ['balanced_operator', 'price_leader', 'brand_builder', 'retail_expansion'],
    ['price_leader', 'brand_builder', 'retail_expansion', 'balanced_operator'], // rotated seats
    ['price_leader', 'price_leader', 'brand_builder', 'retail_expansion'],
    ['balanced_operator', 'balanced_operator', 'price_leader', 'brand_builder'],
  ];
  const out = [];
  combos.forEach((c, ci) => { for (let s = 0; s < seeds; s++) out.push(runBotMatch(c, 9000 + s * 7 + ci * 3)); });
  return out;
}

function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k.startsWith('--')) args[k.slice(2)] = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true;
  }
  const seeds = parseInt(args.seeds ?? '10', 10);
  if (args.match) {
    const r = runBotMatch(String(args.match).split(','), parseInt(args.seed ?? '1', 10), { verbose: !!args.verbose });
    console.log(JSON.stringify({ ...r, perRound: args.verbose ? r.perRound : undefined }, null, 1));
    return;
  }
  const suites = [];
  if (args.matrix || args.all) suites.push(['2-company matrix', suiteTwo(seeds)]);
  if (args.mirror || args.all) suites.push(['mirrors', suiteMirror(Math.max(4, Math.floor(seeds / 2)))]);
  if (args.three || args.all) suites.push(['3-company', suiteThree(seeds)]);
  if (args.four || args.all) suites.push(['4-company', suiteFour(seeds)]);
  const everything = [];
  for (const [name, results] of suites) {
    everything.push(...results);
    const agg = aggregate(results);
    console.log(`\n=== ${name} (${results.length} matches) ===`);
    console.log(JSON.stringify(agg, null, 1));
  }
  if (suites.length > 1) {
    console.log('\n=== OVERALL ===');
    console.log(JSON.stringify(aggregate(everything), null, 1));
  }
  if (args.json) writeFileSync(String(args.json), JSON.stringify(everything, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
