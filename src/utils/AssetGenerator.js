/**
 * AssetGenerator - Creates all game textures via canvas
 * Zero external file dependencies, keeps bundle tiny
 * NOTE: Net is NOT baked into hoop texture — GameScene draws it live with spring physics
 */
export function generateAssets(scene) {
  // ── BALL — realistic basketball ───────────────────────────────────────────
  const ballGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  // Base orange fill
  ballGfx.fillStyle(0xe85d04, 1);
  ballGfx.fillCircle(24, 24, 23);
  // Lighter highlight top-left
  ballGfx.fillStyle(0xff8c42, 0.55);
  ballGfx.fillCircle(17, 15, 10);
  // Darker shading bottom-right
  ballGfx.fillStyle(0xb34a00, 0.35);
  ballGfx.fillCircle(31, 32, 10);
  // Outer edge
  ballGfx.lineStyle(1.5, 0x7a2d00, 1);
  ballGfx.strokeCircle(24, 24, 23);
  // Black seam lines — basketball style
  ballGfx.lineStyle(2, 0x111111, 0.95);
  // Horizontal equator line
  ballGfx.lineBetween(1, 24, 47, 24);
  // Vertical curved seam (center vertical)
  ballGfx.beginPath();
  ballGfx.moveTo(24, 1);
  ballGfx.lineTo(24, 47);
  ballGfx.strokePath();
  // Left arc seam
  ballGfx.lineStyle(2, 0x111111, 0.85);
  ballGfx.beginPath();
  ballGfx.arc(24, 24, 13, -Math.PI * 0.55, Math.PI * 0.55);
  ballGfx.strokePath();
  // Right arc seam
  ballGfx.beginPath();
  ballGfx.arc(24, 24, 13, Math.PI - Math.PI * 0.55, Math.PI + Math.PI * 0.55);
  ballGfx.strokePath();
  ballGfx.generateTexture('ball', 48, 48);
  ballGfx.destroy();

  // ── HOOP RIM ONLY — net drawn live in GameScene ───────────────────────────
  // Texture is just the rim arc. Height 22px to encompass just the rim.
  const hoopGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  // Outer glow
  hoopGfx.lineStyle(8, 0xff4500, 0.28);
  hoopGfx.beginPath(); hoopGfx.arc(50, 16, 46, 0, Math.PI); hoopGfx.strokePath();
  // Main rim
  hoopGfx.lineStyle(6, 0xe85d04, 1);
  hoopGfx.beginPath(); hoopGfx.arc(50, 16, 44, 0, Math.PI); hoopGfx.strokePath();
  // Highlight
  hoopGfx.lineStyle(2, 0xffa055, 0.85);
  hoopGfx.beginPath(); hoopGfx.arc(50, 14, 44, Math.PI + 0.08, Math.PI * 2 - 0.08); hoopGfx.strokePath();
  // End caps (dandi tips)
  hoopGfx.fillStyle(0xd05000, 1);
  hoopGfx.fillCircle(6, 16, 5.5);
  hoopGfx.fillCircle(94, 16, 5.5);
  hoopGfx.fillStyle(0xff8844, 0.7);
  hoopGfx.fillCircle(6, 14, 3);
  hoopGfx.fillCircle(94, 14, 3);
  hoopGfx.generateTexture('hoop', 100, 32);
  hoopGfx.destroy();

  // ── PARTICLE ──────────────────────────────────────────────────────────────
  const partGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  partGfx.fillStyle(0xffcc00, 1);
  partGfx.fillCircle(6, 6, 6);
  partGfx.generateTexture('particle', 12, 12);
  partGfx.destroy();

  const starGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  starGfx.fillStyle(0xffd700, 1);
  const starPts = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 8 : 4;
    starPts.push({ x: 8 + Math.cos(angle) * r, y: 8 + Math.sin(angle) * r });
  }
  starGfx.fillPoints(starPts, true);
  starGfx.generateTexture('star', 16, 16);
  starGfx.destroy();

  // ── OBSTACLES ─────────────────────────────────────────────────────────────
  const bladeGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  bladeGfx.fillStyle(0x888888, 1);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const cx = 20 + Math.cos(angle) * 10;
    const cy = 20 + Math.sin(angle) * 10;
    bladeGfx.fillTriangle(20, 20,
      cx + Math.cos(angle + 1.2) * 16, cy + Math.sin(angle + 1.2) * 16,
      cx + Math.cos(angle - 1.2) * 16, cy + Math.sin(angle - 1.2) * 16);
  }
  bladeGfx.fillStyle(0xaaaaaa, 1); bladeGfx.fillCircle(20, 20, 6);
  bladeGfx.lineStyle(1, 0x555555, 1); bladeGfx.strokeCircle(20, 20, 6);
  bladeGfx.generateTexture('blade', 40, 40);
  bladeGfx.destroy();

  const wallGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  wallGfx.fillStyle(0x4a4a6a, 1); wallGfx.fillRect(0, 0, 30, 80);
  wallGfx.lineStyle(2, 0x6a6a9a, 1); wallGfx.strokeRect(0, 0, 30, 80);
  for (let y2 = 0; y2 < 80; y2 += 20) { wallGfx.lineStyle(1, 0x3a3a5a, 0.8); wallGfx.lineBetween(0, y2, 30, y2); }
  wallGfx.generateTexture('wall', 30, 80);
  wallGfx.destroy();

  const bumperGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  bumperGfx.fillStyle(0xd62828, 1); bumperGfx.fillRect(0, 0, 80, 20);
  bumperGfx.fillStyle(0xf77f00, 0.5); bumperGfx.fillRect(4, 4, 72, 12);
  bumperGfx.lineStyle(2, 0xff4444, 1); bumperGfx.strokeRect(0, 0, 80, 20);
  bumperGfx.generateTexture('bumper', 80, 20);
  bumperGfx.destroy();

  // ── BACKGROUND ELEMENTS ───────────────────────────────────────────────────
  const trailGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  trailGfx.fillStyle(0xffffff, 0.8); trailGfx.fillCircle(4, 4, 4);
  trailGfx.generateTexture('trail', 8, 8);
  trailGfx.destroy();

  const gemGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  gemGfx.fillStyle(0x00f5d4, 1);
  gemGfx.fillPoints([{ x: 12, y: 0 }, { x: 24, y: 10 }, { x: 12, y: 24 }, { x: 0, y: 10 }], true);
  gemGfx.fillStyle(0x80ffe8, 0.7);
  gemGfx.fillPoints([{ x: 12, y: 2 }, { x: 20, y: 10 }, { x: 12, y: 4 }], true);
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
  arrowGfx.fillStyle(0xffff00, 0.9);
  arrowGfx.fillPoints([{ x: 16, y: 0 }, { x: 32, y: 28 }, { x: 0, y: 28 }], true);
  arrowGfx.lineStyle(2, 0xffa500, 1);
  arrowGfx.strokePoints([{ x: 16, y: 0 }, { x: 32, y: 28 }, { x: 0, y: 28 }], true);
  arrowGfx.generateTexture('arrow', 32, 28);
  arrowGfx.destroy();
}