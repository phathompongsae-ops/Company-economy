#!/usr/bin/env node
// Headless simulation runner. No Three.js, no DOM — the proof the core is renderer-free.
//   npm run simulate -- --a balanced --b premium --seed 7 --verbose
//   npm run simulate -- --matches 20 --a sales_rush --b marketing_heavy
//   npm run simulate -- --league --matches 4        (round-robin all scenarios)
import { createInitialState } from '../core/state.js';
import { playRound } from '../core/round.js';
import { SCENARIOS, withPlotFallback } from './scenarios.js';
import { computeCapabilities } from '../core/capabilities.js';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith('--')) args[k.slice(2)] = (process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) ? process.argv[++i] : true;
}

export function runMatch(scenarioA, scenarioB, seed, { verbose = false } = {}) {
  const state = createInitialState(seed, [scenarioA, scenarioB]);
  const policies = [SCENARIOS[scenarioA], SCENARIOS[scenarioB]];
  while (!state.finished) {
    const plans = {};
    state.companies.forEach((co, i) => {
      co._capsPreview = computeCapabilities(co);
      plans[co.id] = withPlotFallback(state, co, policies[i](state, co, state.round + 1));
    });
    playRound(state, plans);
    if (verbose) {
      for (const co of state.companies) {
        console.log(`r${String(state.round).padStart(2)} ${co.name.padEnd(16)} cash=${String(Math.round(co.cash)).padStart(5)} rev=${String(Math.round(co.cumulativeRevenue)).padStart(5)} emp=${co.employees.length} shelves=${state.stores.reduce((n, s) => n + s.shelf.filter((x) => x.companyId === co.id).length, 0)}`);
      }
    }
  }
  const [a, b] = state.companies;
  return { seed, rounds: state.round, winner: state.winnerId === a.id ? scenarioA : scenarioB,
    revA: Math.round(a.cumulativeRevenue), revB: Math.round(b.cumulativeRevenue),
    cashA: Math.round(a.cash), cashB: Math.round(b.cash), state };
}

function main() {
  const seed = parseInt(args.seed ?? '1', 10);
  const matches = parseInt(args.matches ?? '1', 10);
  if (args.league) {
    const names = Object.keys(SCENARIOS).filter((n) => n !== 'location_far');
    const wins = Object.fromEntries(names.map((n) => [n, 0]));
    const games = Object.fromEntries(names.map((n) => [n, 0]));
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      for (let m = 0; m < matches; m++) {
        const r = runMatch(names[i], names[j], seed + m * 101 + i * 7 + j);
        wins[r.winner]++; games[names[i]]++; games[names[j]]++;
      }
    }
    console.log('\n=== LEAGUE (round-robin, ' + matches + ' seeds per pairing) ===');
    for (const n of names.sort((x, y) => wins[y] / games[y] - wins[x] / games[x])) {
      console.log(`${n.padEnd(18)} winrate ${(100 * wins[n] / games[n]).toFixed(0).padStart(3)}%  (${wins[n]}/${games[n]})`);
    }
    return;
  }
  const a = args.a ?? 'balanced', b = args.b ?? 'sales_rush';
  const summary = [];
  for (let m = 0; m < matches; m++) {
    const r = runMatch(a, b, seed + m, { verbose: !!args.verbose && matches === 1 });
    summary.push(r);
    console.log(`match seed=${r.seed} rounds=${r.rounds} winner=${r.winner}  ${a}=${r.revA} vs ${b}=${r.revB}`);
  }
  if (matches > 1) {
    const aw = summary.filter((r) => r.winner === a).length;
    console.log(`\n${a} wins ${aw}/${matches}, ${b} wins ${matches - aw}/${matches}`);
  }
  if (args.dump) {
    const last = summary[summary.length - 1].state;
    console.log(JSON.stringify({ debugTail: last.debugLog.slice(-8), eventsTail: last.eventLog.slice(-12) }, null, 1));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
