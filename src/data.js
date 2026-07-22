export const CLASS_DEFS = {
  guardian: {
    id: 'guardian', name: 'ผู้พิทักษ์', role: 'แทงก์', row: 'front', color: '#55b8d9',
    hp: 390, attack: 34, defense: 18, speed: 0.82, breakPower: 15, crit: 0.05,
    skill: { name: 'กำแพงกล้า', cooldown: 7, kind: 'guard' },
    brave: { name: 'ป้อมปราการนิรันดร์', kind: 'aegis' },
    braveRule: 'รับความเสียหาย'
  },
  warrior: {
    id: 'warrior', name: 'นักรบ', role: 'เบรกเกอร์', row: 'front', color: '#e56d55',
    hp: 300, attack: 55, defense: 11, speed: 1.0, breakPower: 25, crit: 0.09,
    skill: { name: 'ผ่าศิลา', cooldown: 6, kind: 'heavy' },
    brave: { name: 'คำรามผ่าพสุธา', kind: 'earthsplit' },
    braveRule: 'โจมตีและทำลายเกจเบรก'
  },
  ranger: {
    id: 'ranger', name: 'เรนเจอร์', role: 'โจมตีไกล', row: 'back', color: '#78c66a',
    hp: 220, attack: 51, defense: 7, speed: 1.16, breakPower: 13, crit: 0.17,
    skill: { name: 'ฝนดาวตก', cooldown: 7.5, kind: 'volley' },
    brave: { name: 'ดาวหางเจ็ดสาย', kind: 'comet' },
    braveRule: 'โจมตีคริติคอล'
  },
  rogue: {
    id: 'rogue', name: 'จอมโจร', role: 'ลอบโจมตี', row: 'front', color: '#b58ce6',
    hp: 235, attack: 48, defense: 8, speed: 1.36, breakPower: 17, crit: 0.21,
    skill: { name: 'เงาซ้อน', cooldown: 6.5, kind: 'ambush' },
    brave: { name: 'ราตรีไร้ร่องรอย', kind: 'nightfall' },
    braveRule: 'หลบหลีกและคริติคอล'
  },
  mage: {
    id: 'mage', name: 'จอมเวท', role: 'เวทหมู่', row: 'back', color: '#7f8ff4',
    hp: 205, attack: 60, defense: 5, speed: 0.9, breakPower: 11, crit: 0.10,
    skill: { name: 'วงแหวนอัสนี', cooldown: 8, kind: 'nova' },
    brave: { name: 'ดาราถล่มโลก', kind: 'starfall' },
    braveRule: 'สร้างความเสียหายด้วยสกิล'
  },
  priest: {
    id: 'priest', name: 'นักบวช', role: 'สนับสนุน', row: 'back', color: '#f2c85b',
    hp: 235, attack: 29, defense: 8, speed: 0.92, breakPower: 9, crit: 0.06,
    skill: { name: 'แสงฟื้นชีพ', cooldown: 7, kind: 'heal' },
    brave: { name: 'รุ่งอรุณศักดิ์สิทธิ์', kind: 'dawn' },
    braveRule: 'ฟื้นฟูพลังชีวิต'
  }
};

export const PARTY_PRESETS = [
  { id: 'balanced', name: 'สมดุล', classes: ['guardian', 'warrior', 'ranger', 'priest'] },
  { id: 'break', name: 'จู่โจมเกจเบรก', classes: ['guardian', 'warrior', 'rogue', 'ranger'] },
  { id: 'arcane', name: 'เวทระเบิด', classes: ['guardian', 'mage', 'ranger', 'priest'] },
  { id: 'rush', name: 'บุกเร็ว', classes: ['warrior', 'rogue', 'ranger', 'mage'] },
  { id: 'fortress', name: 'แนวรับ', classes: ['guardian', 'warrior', 'mage', 'priest'] }
];

export const TACTICS = {
  balanced: { id: 'balanced', name: 'สมดุล', damage: 1, break: 1, healAt: 0.62, brave: 'smart' },
  break: { id: 'break', name: 'เร่งเบรก', damage: 0.92, break: 1.35, healAt: 0.55, brave: 'onBreak' },
  survival: { id: 'survival', name: 'ประคองทีม', damage: 0.9, break: 0.95, healAt: 0.78, brave: 'smart' },
  burst: { id: 'burst', name: 'ระเบิดพลัง', damage: 1.1, break: 0.9, healAt: 0.5, brave: 'onBreak' }
};

export const BLESSINGS = [
  { id: 'vital_oath', name: 'สัตย์แห่งชีวิต', description: 'HP สูงสุด +18%', stat: 'hp', value: 0.18 },
  { id: 'keen_edge', name: 'คมดาบตื่นรู้', description: 'พลังโจมตี +14%', stat: 'attack', value: 0.14 },
  { id: 'shatter_mark', name: 'ตราทลาย', description: 'พลังทำลายเกจเบรก +22%', stat: 'breakPower', value: 0.22 },
  { id: 'swift_chant', name: 'บทสวดว่องไว', description: 'ความเร็ว +15%', stat: 'speed', value: 0.15 },
  { id: 'brave_spring', name: 'ธารแห่งความกล้า', description: 'ได้รับ Brave +20%', stat: 'braveGain', value: 0.20 },
  { id: 'iron_prayer', name: 'คำภาวนาเหล็ก', description: 'เกราะ +20%', stat: 'defense', value: 0.20 }
];

export const EQUIPMENT_TEMPLATES = [
  { id: 'sunblade', name: 'ดาบอรุณ', slot: 'weapon', stat: 'attack', base: 10 },
  { id: 'breaker_axe', name: 'ขวานทลาย', slot: 'weapon', stat: 'breakPower', base: 7 },
  { id: 'moonbow', name: 'ธนูจันทรา', slot: 'weapon', stat: 'speed', base: 0.08 },
  { id: 'bastion', name: 'เกราะปราการ', slot: 'armor', stat: 'hp', base: 42 },
  { id: 'scale_mail', name: 'เกราะเกล็ด', slot: 'armor', stat: 'defense', base: 4 },
  { id: 'echo_rune', name: 'รูนสะท้อน', slot: 'rune', stat: 'skillPower', base: 0.10 },
  { id: 'valor_rune', name: 'รูนกล้าหาญ', slot: 'rune', stat: 'braveGain', base: 0.12 }
];

export const MINI_BOSSES = [
  { id: 'iron_tusk', name: 'เขี้ยวเหล็ก', color: '#a67c52', trait: 'armored' },
  { id: 'hex_sister', name: 'แม่มดตรวน', color: '#9d63b8', trait: 'caster' },
  { id: 'grave_knight', name: 'อัศวินสุสาน', color: '#64758d', trait: 'counter' }
];

export const FINAL_BOSSES = [
  { id: 'ember_dragon', name: 'มังกรเพลิงคราม', color: '#e85f4a', trait: 'fury' },
  { id: 'void_oracle', name: 'พยากรณ์แห่งสุญญะ', color: '#885bd4', trait: 'curse' },
  { id: 'world_golem', name: 'โกเลมแกนโลก', color: '#6d9b78', trait: 'fortify' }
];

export const SECRET_CONTENT = {
  classes: [
    { id: 'star_knight', name: 'อัศวินดารา', condition: 'ชนะโดยเกิด Break อย่างน้อย 12 ครั้ง' },
    { id: 'spirit_weaver', name: 'ผู้ถักวิญญาณ', condition: 'ผ่านด่าน 15 โดยไม่มีสมาชิกหมดสติ' }
  ],
  items: [
    { id: 'nameless_crown', name: 'มงกุฎไร้นาม', condition: 'ปราบบอสสุดท้ายครบทั้ง 3 แบบ' }
  ],
  encounters: [
    { id: 'door_between', name: 'ประตูระหว่างชั้น', condition: 'seed ลงท้ายด้วย 7 และถึงชั้น 12' }
  ]
};

export const TIER_NAMES = ['เก่า', 'ดี', 'หายาก', 'วีรชน'];

export function encounterForFloor(floor, rng) {
  if (floor === 20) {
    const boss = FINAL_BOSSES[Math.floor(rng() * FINAL_BOSSES.length)];
    return { ...boss, boss: true, final: true, count: 1 };
  }
  if (floor % 5 === 0) {
    const boss = MINI_BOSSES[(floor / 5 - 1) % MINI_BOSSES.length];
    return { ...boss, boss: true, final: false, count: 1 };
  }
  const names = ['สไลม์เงา', 'ก็อบลินลาดตระเวน', 'หมาป่าหิน', 'นักธนูโครงกระดูก', 'ภูตเพลิง'];
  return {
    id: `mob_${floor}`,
    name: names[Math.min(names.length - 1, Math.floor((floor - 1) / 4))],
    color: ['#78a85d', '#c88d48', '#7d8994', '#a79b72', '#d16c4c'][Math.min(4, Math.floor((floor - 1) / 4))],
    boss: false,
    final: false,
    count: 2 + Math.min(2, Math.floor(floor / 7))
  };
}
