/**
 * AssetGenerator — Premium basketball textures
 * Ball is designed to sit INSIDE the net opening
 * Net has realistic white cord appearance
 */
export function generateAssets(scene) {
  // ── BALL — generated fallback (overridden by basketball.png if it loads) ─
  const ballGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  const R = 24, CX = 26, CY = 26;
  ballGfx.fillStyle(0xcc4800, 1); ballGfx.fillCircle(CX, CY, R);
  ballGfx.fillStyle(0xe8621a, 1); ballGfx.fillCircle(CX - 1, CY - 1, R - 1);
  ballGfx.fillStyle(0xff9a50, 0.7); ballGfx.fillCircle(CX - 8, CY - 9, 12);
  ballGfx.fillStyle(0xffcca0, 0.5); ballGfx.fillCircle(CX - 11, CY - 13, 5);
  ballGfx.fillStyle(0x8a2c00, 0.5); ballGfx.fillCircle(CX + 9, CY + 10, 13);
  ballGfx.lineStyle(3, 0x7a2000, 0.85); ballGfx.strokeCircle(CX, CY, R);
  ballGfx.lineStyle(2.5, 0x0d0d0d, 1);
  ballGfx.lineBetween(2, CY, 50, CY); ballGfx.lineBetween(CX, 2, CX, 50);
  ballGfx.lineStyle(2, 0x0d0d0d, 0.9);
  ballGfx.beginPath(); ballGfx.arc(CX, CY, 14, -Math.PI * 0.65, Math.PI * 0.65); ballGfx.strokePath();
  ballGfx.beginPath(); ballGfx.arc(CX, CY, 14, Math.PI - Math.PI * 0.65, Math.PI + Math.PI * 0.65); ballGfx.strokePath();
  ballGfx.generateTexture('ball', 52, 52);
  ballGfx.destroy();

  // ── HOOP RIM — realistic round basketball rim (front view ellipse) ────────
  // Width=100, Height=40 — ellipse gives 3D perspective look
  const hoopGfx = scene.make.graphics({ x: 0, y: 0, add: false });

  // Center of ellipse
  const HX = 50, HY = 22, RX = 43, RY = 13;

  // Outer glow
  hoopGfx.lineStyle(11, 0xcc3300, 0.18);
  hoopGfx.strokeEllipse(HX, HY, (RX + 2) * 2, (RY + 2) * 2);

  // Dark outer ring (depth)
  hoopGfx.lineStyle(8, 0x9e2d00, 1);
  hoopGfx.strokeEllipse(HX, HY, RX * 2, RY * 2);

  // Main orange rim
  hoopGfx.lineStyle(5, 0xe85d04, 1);
  hoopGfx.strokeEllipse(HX, HY, RX * 2, RY * 2);

  // Top highlight arc (upper half only — sheen)
  hoopGfx.lineStyle(2, 0xff9955, 0.75);
  hoopGfx.beginPath();
  hoopGfx.arc(HX, HY, RX, Math.PI + 0.15, Math.PI * 2 - 0.15);
  hoopGfx.strokePath();

  // Inner rim edge (gives tube thickness)
  hoopGfx.lineStyle(2, 0xc04400, 0.5);
  hoopGfx.strokeEllipse(HX, HY + 3, (RX - 4) * 2, (RY - 3) * 2);

  // Backboard bracket (center top — small subtle tab)
  hoopGfx.fillStyle(0x666666, 0.55);
  hoopGfx.fillRect(44, 0, 12, 6);
  hoopGfx.lineStyle(1, 0x999999, 0.4);
  hoopGfx.strokeRect(44, 0, 12, 6);

  hoopGfx.generateTexture('hoop', 100, 40);
  hoopGfx.destroy();

  // ── BACKBOARD ─────────────────────────────────────────────────────────────
  const bbGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  bbGfx.fillStyle(0xffffff, 0.06);
  bbGfx.fillRect(0, 0, 160, 100);
  bbGfx.lineStyle(3, 0xff6b35, 0.3);
  bbGfx.strokeRect(0, 0, 160, 100);
  // Inner box target
  bbGfx.lineStyle(2, 0xff6b35, 0.45);
  bbGfx.strokeRect(52, 32, 56, 38);
  bbGfx.generateTexture('backboard', 160, 100);
  bbGfx.destroy();

  // ── PARTICLE — premium flare ──────────────────────────────────────────────
  const partGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  // Radial gradient circle
  partGfx.fillStyle(0xffffff, 1); partGfx.fillCircle(8, 8, 8);
  partGfx.fillStyle(0xffdd88, 0.6); partGfx.fillCircle(8, 8, 6);
  partGfx.fillStyle(0xff9900, 0.4); partGfx.fillCircle(8, 8, 4);
  partGfx.generateTexture('particle', 16, 16);
  partGfx.destroy();

  // ── STAR PARTICLE ─────────────────────────────────────────────────────────
  const starGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  starGfx.fillStyle(0xffd700, 1);
  const spts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 9 : 4;
    spts.push({ x: 9 + Math.cos(a) * r, y: 9 + Math.sin(a) * r });
  }
  starGfx.fillPoints(spts, true);
  starGfx.generateTexture('star', 18, 18);
  starGfx.destroy();

  // ── OBSTACLES ─────────────────────────────────────────────────────────────
  const bladeGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  bladeGfx.fillStyle(0xcccccc, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const cx = 20 + Math.cos(a) * 10, cy = 20 + Math.sin(a) * 10;
    bladeGfx.fillTriangle(20, 20,
      cx + Math.cos(a + 1.2) * 17, cy + Math.sin(a + 1.2) * 17,
      cx + Math.cos(a - 1.2) * 17, cy + Math.sin(a - 1.2) * 17);
  }
  bladeGfx.fillStyle(0xeeeeee, 1); bladeGfx.fillCircle(20, 20, 6);
  bladeGfx.lineStyle(1, 0x666666, 1); bladeGfx.strokeCircle(20, 20, 6);
  bladeGfx.generateTexture('blade', 40, 40);
  bladeGfx.destroy();

  const bumperGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  bumperGfx.fillStyle(0xcc2222, 1); bumperGfx.fillRect(0, 0, 80, 20);
  bumperGfx.fillStyle(0xff6666, 0.5); bumperGfx.fillRect(4, 3, 72, 7);
  bumperGfx.lineStyle(2, 0xff4444, 1); bumperGfx.strokeRect(0, 0, 80, 20);
  bumperGfx.generateTexture('bumper', 80, 20);
  bumperGfx.destroy();

  // ── POWERUP TEXTURES ──────────────────────────────────────────────────────
  const gemGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  gemGfx.fillStyle(0x00f5d4, 1);
  gemGfx.fillPoints([{ x: 12, y: 0 }, { x: 24, y: 10 }, { x: 12, y: 24 }, { x: 0, y: 10 }], true);
  gemGfx.fillStyle(0x80ffe8, 0.7);
  gemGfx.fillPoints([{ x: 12, y: 2 }, { x: 20, y: 10 }, { x: 12, y: 5 }], true);
  gemGfx.generateTexture('gem', 24, 24);
  gemGfx.destroy();

  const shieldGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  shieldGfx.fillStyle(0x4895ef, 1);
  shieldGfx.fillPoints([{ x: 16, y: 0 }, { x: 32, y: 8 }, { x: 32, y: 18 }, { x: 16, y: 32 }, { x: 0, y: 18 }, { x: 0, y: 8 }], true);
  shieldGfx.fillStyle(0x90e0ef, 0.6);
  shieldGfx.fillPoints([{ x: 16, y: 4 }, { x: 26, y: 10 }, { x: 16, y: 20 }], true);
  shieldGfx.generateTexture('shield', 32, 32);
  shieldGfx.destroy();

  const slowGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  slowGfx.fillStyle(0xffd60a, 1); slowGfx.fillCircle(16, 16, 16);
  slowGfx.fillStyle(0x1a1a00, 1); slowGfx.fillCircle(16, 16, 11);
  slowGfx.lineStyle(3, 0xffd60a, 1);
  slowGfx.lineBetween(16, 16, 16, 9); slowGfx.lineBetween(16, 16, 21, 19);
  slowGfx.generateTexture('slow', 32, 32);
  slowGfx.destroy();

  const arrowGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  arrowGfx.fillStyle(0xffffff, 0.85);
  arrowGfx.fillPoints([{ x: 16, y: 0 }, { x: 30, y: 26 }, { x: 2, y: 26 }], true);
  arrowGfx.lineStyle(1.5, 0xff9900, 0.9);
  arrowGfx.strokePoints([{ x: 16, y: 0 }, { x: 30, y: 26 }, { x: 2, y: 26 }], true);
  arrowGfx.generateTexture('arrow', 32, 28);
  arrowGfx.destroy();

  const trailGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  trailGfx.fillStyle(0xffffff, 0.9); trailGfx.fillCircle(4, 4, 4);
  trailGfx.generateTexture('trail', 8, 8);
  trailGfx.destroy();
}