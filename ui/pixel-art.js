// Company Economy — original procedural pixel-art placeholder set.
// Every sprite here is drawn from scratch in code (no external assets, no traced art):
// a warm "miniature business city" look — compact toy-like buildings, chibi workers
// with big heads and readable role/segment colors. This module is the asset pipeline:
// swapping any drawing for hand-made art later only means returning a different canvas.
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const px = (g, x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

// ---------------------------------------------------------------------------------------
// Buildings — silhouettes first: house=small+gable, condo=tall slab, hotel=tower+sign,
// store=wide awning, HQ=office tower with company-colored banner.
// ---------------------------------------------------------------------------------------
export function houseTexture() {
  const [c, g] = makeCanvas(18, 16);
  px(g, 2, 7, 14, 8, '#a8794f');            // walls
  px(g, 3, 8, 12, 1, '#b98a5f');
  px(g, 1, 3, 16, 4, '#c85f4a');            // gable roof
  px(g, 3, 1, 12, 2, '#d97057');
  px(g, 0, 6, 18, 1, '#8a4a3a');            // eave
  px(g, 5, 9, 3, 3, '#ffe9a8');             // window
  px(g, 11, 9, 3, 3, '#ffe9a8');
  px(g, 8, 11, 2, 4, '#5c3a26');            // door
  return tex(c);
}
export function condoTexture() {
  const [c, g] = makeCanvas(18, 28);
  px(g, 2, 2, 14, 25, '#7e8ca6');           // slab
  px(g, 2, 2, 14, 2, '#98a6c0');            // roofline
  px(g, 1, 0, 16, 2, '#5d6a82');            // parapet
  for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) {
    px(g, 4 + col * 4, 6 + r * 4, 2, 2, (r + col) % 3 ? '#ffe9a8' : '#394358'); // lit/dark windows
  }
  px(g, 7, 23, 4, 4, '#39445c');            // entrance
  return tex(c);
}
export function hotelTexture(premium) {
  const [c, g] = makeCanvas(20, 30);
  const wall = premium ? '#c9b8dc' : '#d8b48a';
  const trim = premium ? '#8a6ab0' : '#a87848';
  px(g, 3, 4, 14, 25, wall);
  px(g, 2, 2, 16, 3, trim);
  for (let r = 0; r < 5; r++) for (let col = 0; col < 3; col++) {
    px(g, 5 + col * 4, 7 + r * 4, 2, 2, '#fff3c8');
  }
  px(g, 8, 25, 4, 4, '#4a3a58');            // lobby door
  px(g, 0, 8, 3, 8, trim);                  // vertical sign board
  px(g, 1, 9, 1, 6, premium ? '#ffe066' : '#fff');
  if (premium) { px(g, 6, 0, 8, 2, '#ffe066'); } // gold crown strip
  return tex(c);
}
export function storeTexture(type) {
  if (type === 'supermarket') {
    const [c, g] = makeCanvas(28, 18);
    px(g, 1, 6, 26, 11, '#d8d2be');
    px(g, 0, 3, 28, 4, '#4a9e6a');          // big awning
    px(g, 0, 3, 28, 1, '#63bd83');
    px(g, 3, 9, 8, 5, '#bfe3ff');           // glass front
    px(g, 13, 9, 8, 5, '#bfe3ff');
    px(g, 23, 9, 3, 7, '#6a5f4a');
    px(g, 4, 0, 20, 3, '#3a7a52');          // roof sign
    return tex(c);
  }
  if (type === 'mall') {
    const [c, g] = makeCanvas(26, 24);
    px(g, 1, 6, 24, 17, '#cbb8a0');
    px(g, 0, 4, 26, 3, '#b08ac0');          // arcade band
    px(g, 2, 0, 22, 4, '#8a5fa8');          // grand sign
    px(g, 4, 10, 5, 8, '#ffe9c8');          // arch windows
    px(g, 11, 10, 5, 8, '#ffe9c8');
    px(g, 18, 10, 5, 8, '#ffe9c8');
    px(g, 11, 18, 5, 5, '#5c4a6a');         // entrance
    return tex(c);
  }
  const [c, g] = makeCanvas(20, 16);        // convenience
  px(g, 1, 5, 18, 10, '#e3d8c0');
  px(g, 0, 2, 20, 4, '#d8895f');            // striped awning
  for (let i = 0; i < 5; i++) px(g, i * 4, 2, 2, 4, '#f0a878');
  px(g, 3, 8, 6, 5, '#bfe3ff');
  px(g, 12, 8, 4, 7, '#6a5f4a');
  return tex(c);
}
export function hqTexture(colorCss) {
  const [c, g] = makeCanvas(16, 26);
  px(g, 3, 4, 10, 21, '#9aa8b8');           // office tower
  px(g, 3, 4, 10, 1, '#c0ccd8');
  for (let r = 0; r < 4; r++) { px(g, 5, 7 + r * 4, 2, 2, '#dff0ff'); px(g, 9, 7 + r * 4, 2, 2, '#dff0ff'); }
  px(g, 6, 21, 4, 4, '#44506a');
  px(g, 2, 0, 2, 8, '#5d6a82');             // flag pole
  px(g, 4, 0, 9, 4, colorCss);              // company banner
  px(g, 4, 0, 9, 1, 'rgba(255,255,255,.35)');
  return tex(c);
}
export function plotSignTexture() {
  const [c, g] = makeCanvas(14, 14);
  px(g, 6, 6, 2, 8, '#8a6a4a');             // post
  px(g, 1, 1, 12, 6, '#e8d8a0');            // sign board
  px(g, 2, 2, 10, 1, '#6a5a3a');
  px(g, 2, 4, 7, 1, '#6a5a3a');
  return tex(c);
}

// ---------------------------------------------------------------------------------------
// Chibi walkers — 10x14, oversized head, tiny body, 2-frame walk. Outfit color reads the
// consumer segment; every walker on screen IS a real PurchaseEvent agent.
// ---------------------------------------------------------------------------------------
const OUTFITS = {
  budget_resident:    { shirt: '#6a9e5f', pants: '#5c4a36', hat: null,       skin: '#f0c8a0', hair: '#4a3626' },
  mainstream_resident:{ shirt: '#4f7fd0', pants: '#3a4358', hat: null,       skin: '#f0c8a0', hair: '#2c2620' },
  premium_resident:   { shirt: '#8a5fa8', pants: '#2e2a3a', hat: null,       skin: '#f0c8a0', hair: '#d8c8a8' },
  tourist_budget:     { shirt: '#e8945f', pants: '#d8d2be', hat: '#f0e0a8',  skin: '#e8b890', hair: '#4a3626' },
  tourist_premium:    { shirt: '#f0f0f0', pants: '#c9b8dc', hat: '#ffe066',  skin: '#f0c8a0', hair: '#6a4a2c' },
};
function drawWalker(g, o, step) {
  // head (big — chibi identity)
  px(g, 2, 0, 6, 5, o.skin);
  px(g, 2, 0, 6, 2, o.hair);
  if (o.hat) { px(g, 1, 0, 8, 2, o.hat); px(g, 2, -0 + 0, 6, 1, o.hat); }
  px(g, 3, 3, 1, 1, '#2c2620'); px(g, 6, 3, 1, 1, '#2c2620'); // eyes
  // body
  px(g, 3, 5, 4, 5, o.shirt);
  px(g, 2, 6, 1, 3, o.shirt); px(g, 7, 6, 1, 3, o.shirt);     // arms
  // legs — alternate per frame
  if (step === 0) { px(g, 3, 10, 2, 4, o.pants); px(g, 6, 10, 2, 3, o.pants); }
  else { px(g, 3, 10, 2, 3, o.pants); px(g, 6, 10, 2, 4, o.pants); }
}
export function walkerFrames(profileId) {
  const o = OUTFITS[profileId] || OUTFITS.mainstream_resident;
  return [0, 1].map((step) => {
    const [c, g] = makeCanvas(10, 14);
    drawWalker(g, o, step);
    return tex(c);
  });
}

export function vanTexture(colorCss) {
  const [c, g] = makeCanvas(16, 10);
  px(g, 1, 2, 12, 6, colorCss);             // box body
  px(g, 12, 4, 3, 4, '#d8dde8');            // cab
  px(g, 13, 4, 2, 2, '#9fc8e8');            // windshield
  px(g, 3, 8, 2, 2, '#2c2c34');             // wheels
  px(g, 10, 8, 2, 2, '#2c2c34');
  px(g, 2, 3, 10, 2, 'rgba(255,255,255,.3)'); // side stripe
  return tex(c);
}
export function billboardTexture(colorCss) {
  const [c, g] = makeCanvas(12, 16);
  px(g, 5, 8, 2, 8, '#6a5a4a');             // post
  px(g, 1, 1, 10, 7, colorCss);             // ad panel
  px(g, 2, 2, 8, 1, 'rgba(255,255,255,.7)');
  px(g, 2, 4, 5, 1, 'rgba(255,255,255,.5)');
  return tex(c);
}

// convenience: sprite factory with pixel-true scaling (worldHeight in tiles)
export function makeSprite(texture, worldHeight) {
  const img = texture.image;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(worldHeight * (img.width / img.height), worldHeight, 1);
  return s;
}
