export const HERO_SPRITE_STANDARD = Object.freeze({
  logicalWidth: 64,
  logicalHeight: 76,
  anchor: Object.freeze({ x: 32, y: 70 }),
  feetBaseline: 70,
  facing: 'right',
  contactShadow: Object.freeze({ width: 38, height: 6 }),
  weaponBounds: Object.freeze({ left: -25, right: 29, top: -67, bottom: 4 }),
  mobileMinimumCssHeight: 58,
  combatScale: 1.08,
  selectionCardScale: 1.08,
  outline: '#171525',
  highlightRule: 'one light cluster on the upper-left plane; no gradients inside the sprite'
});

export const HERO_ANIMATION_STATES = Object.freeze([
  'idle', 'attack', 'hurt', 'ko', 'skill', 'brave', 'victory'
]);

export const HERO_FORMATION_ANCHORS = Object.freeze({
  front: Object.freeze([[345, 322], [415, 380], [350, 430], [420, 275]].map(Object.freeze)),
  back: Object.freeze([[195, 290], [245, 370], [170, 420], [265, 245]].map(Object.freeze))
});

export const PROJECTILE_HERO_CLASSES = Object.freeze(['ranger', 'mage', 'priest']);

export const HERO_VISUALS = Object.freeze({
  guardian: Object.freeze({
    id: 'guardian', color: '#55b8d9', light: '#92e2ee', dark: '#24566f', accent: '#d5f7f5',
    skin: '#efbd96', hair: '#493d50', weapon: 'tower shield', identity: 'โล่หนัก คุมแนวหน้า'
  }),
  warrior: Object.freeze({
    id: 'warrior', color: '#e56d55', light: '#ffad67', dark: '#7c2e38', accent: '#f4c36b',
    skin: '#d99a72', hair: '#452934', weapon: 'greatsword', identity: 'ดาบใหญ่ เร่งทำลายเบรก'
  }),
  ranger: Object.freeze({
    id: 'ranger', color: '#78c66a', light: '#b8e982', dark: '#315c42', accent: '#dfbd6b',
    skin: '#efc29e', hair: '#a86f3e', weapon: 'longbow', identity: 'ธนูยาว โจมตีจากแนวหลัง'
  }),
  rogue: Object.freeze({
    id: 'rogue', color: '#b58ce6', light: '#dfb9ff', dark: '#523b78', accent: '#78d5d0',
    skin: '#dca17d', hair: '#2c263b', weapon: 'twin daggers', identity: 'มีดคู่ ว่องไวและลอบโจมตี'
  }),
  mage: Object.freeze({
    id: 'mage', color: '#7f8ff4', light: '#b9c5ff', dark: '#363e91', accent: '#70e2e4',
    skin: '#efbf9b', hair: '#ece1ff', weapon: 'arcane staff', identity: 'คทาอาคม เวทหมู่ทรงพลัง'
  }),
  priest: Object.freeze({
    id: 'priest', color: '#f2c85b', light: '#fff2b2', dark: '#8f6a2f', accent: '#fff8df',
    skin: '#edb991', hair: '#8d5e3f', weapon: 'sun focus', identity: 'คทาแสง ฟื้นฟูและสนับสนุน'
  })
});

const OUTLINE = HERO_SPRITE_STANDARD.outline;
const BOOT = '#26263b';
const METAL = '#bdc9d8';
const METAL_LIGHT = '#ecf4f5';

function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function poly(c, points, color) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], index) => index ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
  c.closePath();
  c.fill();
}

function pixelLine(c, points, color, size = 3) {
  for (let index = 0; index < points.length - 1; index++) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step += size) {
      const t = steps ? step / steps : 0;
      rect(c, x1 + (x2 - x1) * t - size / 2, y1 + (y2 - y1) * t - size / 2, size, size, color);
    }
  }
}

function legs(c, visual, spread = 0) {
  rect(c, -11 - spread, -20, 9, 17, OUTLINE);
  rect(c, 2 + spread, -20, 9, 17, OUTLINE);
  rect(c, -9 - spread, -19, 6, 12, visual.dark);
  rect(c, 3 + spread, -19, 6, 12, visual.dark);
  rect(c, -13 - spread, -7, 12, 7, BOOT);
  rect(c, 1 + spread, -7, 13, 7, BOOT);
  rect(c, -11 - spread, -7, 8, 2, '#4c4c64');
  rect(c, 3 + spread, -7, 8, 2, '#4c4c64');
}

function face(c, visual, options = {}) {
  const { hood = false, fringe = true, ornament = null } = options;
  rect(c, -9, -64, 18, 3, OUTLINE);
  rect(c, -12, -61, 24, 17, OUTLINE);
  rect(c, -9, -44, 18, 5, OUTLINE);
  rect(c, -9, -61, 19, 18, visual.skin);
  rect(c, -7, -59, 15, 4, '#ffd2a8');
  rect(c, 2, -50, 4, 3, '#282337');
  rect(c, 6, -47, 3, 2, '#cf806f');
  if (hood) {
    rect(c, -11, -67, 20, 3, OUTLINE);
    rect(c, -14, -64, 26, 8, OUTLINE);
    rect(c, -11, -65, 20, 7, visual.dark);
    rect(c, -15, -58, 5, 17, visual.color);
    rect(c, 9, -59, 5, 15, visual.color);
  } else {
    rect(c, -9, -66, 18, 3, visual.hair);
    rect(c, -12, -63, 24, 7, visual.hair);
    rect(c, -13, -59, 5, 13, visual.hair);
    if (fringe) rect(c, 3, -58, 8, 5, visual.hair);
  }
  if (ornament) ornament(c, visual);
}

function arm(c, x, y, color, skin, forward = false) {
  rect(c, x - 2, y - 2, 9, 22, OUTLINE);
  rect(c, x, y, 5, 14, color);
  rect(c, x + (forward ? 2 : 0), y + 14, 5, 5, skin);
}

function guardian(c, v, pose) {
  legs(c, v, 1);
  poly(c, [[-16, -42], [-10, -49], [10, -49], [17, -39], [14, -18], [-14, -18]], OUTLINE);
  poly(c, [[-13, -41], [-8, -46], [9, -46], [14, -38], [11, -21], [-11, -21]], v.color);
  rect(c, -8, -43, 6, 20, v.light);
  rect(c, -14, -42, 28, 5, METAL);
  face(c, v, { fringe: false, ornament: (ctx, visual) => {
    rect(ctx, -13, -65, 26, 5, METAL);
    rect(ctx, -2, -69, 7, 6, visual.light);
  }});
  arm(c, -18, -40, METAL, v.skin);
  rect(c, 12, -42, 8, 22, OUTLINE);
  rect(c, 14, -40, 4, 15, METAL);
  rect(c, 17, -28, 4, 19, '#7c8b9d');
  rect(c, 15, -11, 9, 4, METAL_LIGHT);
  c.save();
  c.translate(10 + pose.guard, -30);
  poly(c, [[0, -14], [18, -10], [20, 11], [10, 23], [0, 15]], OUTLINE);
  poly(c, [[3, -11], [15, -8], [17, 9], [10, 18], [3, 13]], v.dark);
  rect(c, 6, -6, 7, 17, v.color);
  rect(c, 8, -3, 3, 9, v.light);
  c.restore();
}

function warrior(c, v, pose) {
  legs(c, v, 3);
  poly(c, [[-15, -44], [-7, -50], [10, -47], [16, -34], [11, -19], [-12, -19]], OUTLINE);
  poly(c, [[-12, -42], [-6, -47], [8, -44], [13, -34], [8, -22], [-9, -22]], v.color);
  rect(c, -10, -39, 20, 5, v.light);
  rect(c, -3, -43, 7, 20, v.dark);
  face(c, v, { ornament: (ctx, visual) => {
    rect(ctx, -10, -65, 23, 4, visual.dark);
    rect(ctx, -5, -68, 4, 5, visual.light);
  }});
  arm(c, -18, -41, v.dark, v.skin);
  arm(c, 12, -41, v.color, v.skin, true);
  c.save();
  c.translate(19 + pose.weaponX, -24 + pose.weaponY);
  c.rotate(pose.weaponRotation);
  rect(c, -3, -29, 6, 37, OUTLINE);
  rect(c, -1, -28, 3, 33, METAL_LIGHT);
  poly(c, [[-4, -28], [0, -39], [5, -28]], OUTLINE);
  poly(c, [[-2, -28], [0, -35], [3, -28]], '#fff3d1');
  rect(c, -8, 5, 16, 5, v.accent);
  rect(c, -2, 9, 5, 14, '#70452e');
  c.restore();
}

function ranger(c, v, pose) {
  legs(c, v);
  poly(c, [[-14, -43], [-7, -49], [9, -48], [14, -38], [10, -18], [-11, -18]], OUTLINE);
  poly(c, [[-11, -42], [-6, -46], [8, -45], [11, -37], [7, -21], [-8, -21]], v.dark);
  rect(c, -8, -40, 16, 5, v.color);
  poly(c, [[-12, -36], [-21, -20], [-12, -21]], v.color);
  face(c, v, { hood: true });
  rect(c, -19, -47, 6, 31, '#765036');
  rect(c, -18, -54, 3, 11, v.accent);
  rect(c, -22, -53, 3, 34, METAL_LIGHT);
  arm(c, 10, -40, v.color, v.skin, true);
  arm(c, -17, -39, v.dark, v.skin);
  c.save();
  c.translate(12 + pose.bowPull, -31);
  pixelLine(c, [[6, -25], [14, -17], [17, -3], [13, 12], [5, 20]], OUTLINE, 4);
  pixelLine(c, [[7, -23], [12, -15], [14, -3], [11, 10], [6, 18]], v.accent, 3);
  pixelLine(c, [[7, -23], [7 + pose.stringPull, -3], [6, 18]], '#dce8dd', 2);
  rect(c, 4 + pose.stringPull, -5, 22, 3, METAL_LIGHT);
  poly(c, [[27, -4], [22, -8], [22, 0]], v.light);
  c.restore();
}

function rogue(c, v, pose) {
  legs(c, v, 2);
  poly(c, [[-14, -43], [-7, -49], [9, -47], [14, -36], [8, -18], [-11, -18]], OUTLINE);
  poly(c, [[-11, -41], [-5, -46], [8, -44], [11, -35], [6, -21], [-8, -21]], v.dark);
  rect(c, -8, -38, 16, 4, v.color);
  face(c, v, { hood: false, ornament: (ctx, visual) => {
    rect(ctx, -13, -64, 25, 5, visual.dark);
    poly(ctx, [[-12, -59], [-25, -55 - pose.scarf], [-15, -50]], visual.color);
  }});
  arm(c, -18, -40, v.color, v.skin);
  arm(c, 12, -40, v.dark, v.skin, true);
  c.save();
  c.translate(pose.bladeSpread, 0);
  rect(c, 18, -28, 4, 20, '#705047');
  poly(c, [[18, -27], [22, -44], [25, -25]], METAL_LIGHT);
  rect(c, -22, -27, 4, 19, '#705047');
  poly(c, [[-25, -26], [-22, -43], [-18, -25]], METAL_LIGHT);
  c.restore();
}

function mage(c, v, pose) {
  poly(c, [[-15, -39], [-8, -49], [9, -48], [15, -38], [12, -7], [2, -14], [-2, -4], [-14, -8]], OUTLINE);
  poly(c, [[-12, -38], [-6, -46], [7, -45], [12, -36], [9, -12], [1, -18], [-3, -9], [-11, -12]], v.dark);
  rect(c, -7, -41, 14, 21, v.color);
  rect(c, -4, -39, 5, 18, v.light);
  rect(c, -11, -10, 8, 10, BOOT);
  rect(c, 3, -12, 9, 12, BOOT);
  face(c, v, { ornament: (ctx, visual) => {
    rect(ctx, -4, -69, 7, 7, visual.dark);
    rect(ctx, -1, -72, 4, 5, visual.accent);
  }});
  arm(c, -17, -41, v.dark, v.skin);
  arm(c, 11, -42 - pose.castLift, v.color, v.skin, true);
  rect(c, 22, -50, 5, 51, OUTLINE);
  rect(c, 23, -48, 3, 47, '#725544');
  poly(c, [[17, -53], [24, -63 - pose.castLift], [31, -53], [25, -47]], OUTLINE);
  poly(c, [[20, -53], [24, -59 - pose.castLift], [28, -53], [25, -49]], v.accent);
  if (pose.castLift) {
    rect(c, 21, -67 - pose.castLift, 7, 7, '#d8ffff');
    rect(c, 23, -71 - pose.castLift, 3, 3, v.accent);
  }
}

function priest(c, v, pose) {
  legs(c, v);
  poly(c, [[-15, -42], [-8, -49], [9, -48], [15, -38], [12, -17], [-12, -17]], OUTLINE);
  poly(c, [[-12, -40], [-6, -46], [8, -45], [12, -36], [9, -20], [-9, -20]], v.accent);
  rect(c, -8, -39, 16, 6, v.light);
  rect(c, -4, -36, 7, 16, v.color);
  poly(c, [[-12, -43], [0, -32], [12, -43], [7, -48], [-7, -48]], v.light);
  face(c, v, { fringe: true, ornament: (ctx, visual) => {
    rect(ctx, -9, -66, 19, 4, visual.accent);
    rect(ctx, -2, -69, 5, 4, visual.color);
  }});
  arm(c, -18, -41, v.light, v.skin);
  arm(c, 12, -42 - pose.castLift, v.accent, v.skin, true);
  rect(c, 22, -49, 5, 50, OUTLINE);
  rect(c, 23, -47, 3, 47, '#8b623e');
  rect(c, 18, -58 - pose.castLift, 13, 13, OUTLINE);
  rect(c, 20, -56 - pose.castLift, 9, 9, v.color);
  rect(c, 23, -60 - pose.castLift, 3, 17, v.light);
  rect(c, 17, -53 - pose.castLift, 19, 3, v.light);
}

const DRAWERS = { guardian, warrior, ranger, rogue, mage, priest };

export function animationPose(classId, state = 'idle', progress = 0, time = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const pulse = Math.sin(Math.PI * p);
  const pose = {
    x: 0, y: Math.round(Math.sin(time * 5 + classId.length) * 1.5), rotation: 0,
    guard: 0, weaponX: 0, weaponY: 0, weaponRotation: -0.3,
    bowPull: 0, stringPull: 0, bladeSpread: 0, scarf: 0, castLift: 0
  };
  if (state === 'attack') {
    pose.x = Math.round(pulse * ({ guardian: 5, warrior: 13, ranger: 1, rogue: 19, mage: 2, priest: 2 }[classId] || 4));
    pose.y = -Math.round(pulse * 2);
    pose.guard = Math.round(pulse * 7);
    pose.weaponRotation = -0.45 + pulse * 1.15;
    pose.bowPull = -Math.round(pulse * 2);
    pose.stringPull = -Math.round(pulse * 8);
    pose.bladeSpread = Math.round(pulse * 5);
    pose.castLift = Math.round(pulse * 4);
  } else if (state === 'hurt') {
    pose.x = -Math.round((1 - p) * 6);
    pose.rotation = (1 - p) * -0.07;
  } else if (state === 'skill') {
    pose.y = -Math.round(pulse * 4);
    pose.castLift = Math.round(pulse * 8);
    pose.guard = Math.round(pulse * 9);
    pose.stringPull = -Math.round(pulse * 9);
    pose.bladeSpread = Math.round(pulse * 7);
    pose.weaponRotation = -0.4 + pulse * 1.3;
  } else if (state === 'brave') {
    pose.y = -Math.round(pulse * 7);
    pose.castLift = Math.round(pulse * 11);
    pose.guard = Math.round(pulse * 10);
    pose.stringPull = -Math.round(pulse * 11);
    pose.bladeSpread = Math.round(pulse * 9);
    pose.weaponRotation = -0.55 + pulse * 1.55;
  } else if (state === 'victory') {
    pose.y = -Math.round(Math.abs(Math.sin(time * 6)) * 5);
    pose.castLift = 7;
    pose.guard = 5;
    pose.weaponRotation = 0.7;
  }
  pose.scarf = Math.round(Math.sin(time * 6) * 2 + (state === 'attack' ? pulse * 4 : 0));
  return pose;
}

export function drawHero(c, options) {
  const {
    classId, x = 0, y = 0, scale = 1, facing = 1, state = 'idle', progress = 0,
    time = 0, alpha = 1, shadow = true
  } = options;
  const visual = HERO_VISUALS[classId];
  if (!visual || !DRAWERS[classId]) return false;
  const pose = animationPose(classId, state, progress, time);
  c.save();
  c.translate(Math.round(x), Math.round(y));
  if (shadow) {
    c.globalAlpha = alpha * (state === 'ko' ? 0.16 : 0.28);
    rect(c, -19 * scale, -3, 38 * scale, 6, '#05050b');
    rect(c, -14 * scale, -5, 28 * scale, 2, '#05050b');
  }
  c.globalAlpha = alpha;
  if (state === 'ko') {
    c.translate(-8 * facing, 0);
    c.rotate(-Math.PI / 2 * facing);
    c.translate(29 * facing, 18);
  } else {
    c.translate(pose.x * facing, pose.y);
    c.rotate(pose.rotation * facing);
  }
  c.scale((facing < 0 ? -1 : 1) * scale, scale);
  DRAWERS[classId](c, visual, pose);
  if (state === 'hurt' && Math.floor(progress * 8) % 2 === 0) {
    c.globalAlpha = 0.82;
    rect(c, 20, -55, 5, 5, '#ff7b72');
    rect(c, 25, -47, 8, 3, '#ffd0b8');
    rect(c, 18, -39, 4, 7, '#ff9a7b');
    rect(c, -22, -34, 5, 4, '#ff7b72');
  }
  c.restore();
  return true;
}

export function drawHeroPortrait(canvas, classId, options = {}) {
  const c = canvas?.getContext?.('2d');
  if (!c || !HERO_VISUALS[classId]) return false;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, canvas.width, canvas.height);
  const scale = options.scale || Math.min(canvas.width / 64, canvas.height / 82);
  drawHero(c, {
    classId,
    x: canvas.width / 2,
    y: canvas.height - Math.max(5, 5 * scale),
    scale,
    state: options.state || 'idle',
    progress: options.progress || 0,
    time: options.time || 0,
    shadow: true
  });
  return true;
}
