// Deterministic seeded RNG (mulberry32). The ONLY randomness source in the simulation.
// State keeps a single cursor so identical seed + identical actions => identical match.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
