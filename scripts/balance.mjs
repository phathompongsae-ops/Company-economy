import { PARTY_PRESETS } from '../src/data.js';
import { runToEnd } from '../src/core.js';

const seeds = Array.from({ length: Number(process.argv[2] || 40) }, (_, index) => 1000 + index);
const modes = [true, false];
console.log(`God Brave deterministic balance lab — ${seeds.length} seeds per composition/mode`);
console.log('mode\tparty\twins\tavg floor\tavg seconds\tavg breaks\tavg Brave');
for (const tacticalAuto of modes) {
  for (const preset of PARTY_PRESETS) {
    const games = seeds.map(seed => runToEnd({ seed, classes: preset.classes, tacticalAuto }));
    const avg = field => games.reduce((sum, game) => sum + field(game), 0) / games.length;
    console.log([
      tacticalAuto ? 'tactical' : 'full-auto', preset.name,
      `${games.filter(game => game.status === 'victory').length}/${games.length}`,
      avg(game => game.highestFloor).toFixed(2), avg(game => game.stats.time).toFixed(1),
      avg(game => game.stats.breaks).toFixed(1), avg(game => game.stats.braveArts).toFixed(1)
    ].join('\t'));
  }
}
