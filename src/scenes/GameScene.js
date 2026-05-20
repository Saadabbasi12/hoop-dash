import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';

/**
 * HOOP DASH – GameScene
 *
 * Core upgrades:
 *   • Spring-physics net — each node simulated every frame, net visually deforms
 *   • Rim collision — ball bounces off left/right dandi, can still score through centre
 *   • Ball-inside-net — ball rendered behind net nodes when passing through
 *   • Drag pull — when player drags before shoot, net droops toward drag direction
 *   • All original gameplay preserved (obstacles, gems, powerups, combos)
 */

const GRAVITY        = 500;
const DRAG_SCALE     = 0.016;
const MAX_POWER      = 1.0;
const BASKET_GAP_MIN = 130;
const BASKET_GAP_MAX = 180;
const SCORE_HALF_W   = 48;

// ── Net physics constants ─────────────────────────────────────────────────────
const NET_COLS       = 8;   // vertical strands
const NET_ROWS       = 5;   // horizontal divisions
const NET_SPRING_K   = 320; // spring stiffness
const NET_DAMPING    = 0.82; // velocity damping per frame
const NET_GRAVITY    = 180; // net node gravity (lighter than ball)
const RIM_RADIUS     = 44;  // matches hoop texture arc radius

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─────────────────────────────────────────────────────────────────────────
  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this._fs = (frac, max = 999) => Math.min(Math.min(this.W, this.H) * frac, max);

    // State
    this.score        = 0;
    this.bestScore    = 0;
    this.lives        = 3;
    this.combo        = 0;
    this.comboTimer   = 0;
    this.isPaused     = false;
    this._manualPause = false;
    this.isGameOver   = false;
    this.ballInFlight = false;
    this.dragStart    = null;
    this.ballVX = this.ballVY = 0;
    this.ballRotation = 0;
    this.difficulty   = 1;
    this.frameCount   = 0;
    this.totalBaskets = 0;
    this.shieldActive = false; this.shieldTimer = 0;
    this.slowActive   = false; this.slowTimer   = 0;
    this.obstacles    = [];
    this.gems         = [];
    this.powerups     = [];
    this.obstacleTimer = 0;
    this.gemTimer      = 0;
    this.powerupTimer  = 0;
    this.trailDots     = [];
    this.trailTimer    = 0;
    this.scrollY       = 0;

    // Ball-inside-net state
    this.ballInsideNet   = false;  // true while ball is visually passing through net
    this.netBallBasket   = null;   // which basket's net the ball is inside

    YTPlayables.loadData().then(d => {
      if (d?.bestScore) this.bestScore = d.bestScore;
    }).catch(() => {});

    this._buildBackground();

    // Graphics layer for ALL nets (drawn every frame)
    this.netGraphics = this.add.graphics().setDepth(6);

    this._initBaskets();
    this._initBall();
    this._createUI();
    this._setupInput();
    this._setupYTCallbacks();

    this.cameras.main.fadeIn(300);

    this.ambientInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) soundManager.playAmbientTick();
    }, 2400);

    this.scale.on('resize', this._onResize, this);
  }

  // ── RESIZE ────────────────────────────────────────────────────────────────
  _onResize(gameSize) {
    this.W = gameSize.width;
    this.H = gameSize.height;
  }

  // ── BACKGROUND ────────────────────────────────────────────────────────────
  _buildBackground() {
    const { W, H } = this;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050510, 0x050510, 0x0d1b2a, 0x0d1b2a, 1);
    bg.fillRect(0, 0, W, H);
    bg.setDepth(-10);
    for (let i = 0; i < 50; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
        Phaser.Math.FloatBetween(0.5, 2), 0xffffff, Phaser.Math.FloatBetween(0.1, 0.5)
      ).setDepth(-9);
      this.tweens.add({ targets: star, alpha: 0.05, duration: Phaser.Math.Between(800, 2200), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1500) });
    }
    const acc = this.add.graphics().setDepth(-8);
    acc.lineStyle(2, 0xff6b35, 0.12);
    for (let y = 0; y < H; y += 50) {
      acc.lineBetween(0, y, W * 0.05, y);
      acc.lineBetween(W * 0.95, y, W, y);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SPRING NET SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a spring-physics net for a basket.
   * Net nodes: grid of (NET_COLS+1) × (NET_ROWS+1) points.
   * Top row is anchored (pinned) to the rim positions.
   * Bottom row is free (net opening).
   */
  _createNet(basket) {
    const hs    = this.hoopScale;
    const rimR  = RIM_RADIUS * hs;   // radius of the rim arc in screen px
    const rimY  = basket.y;           // rim centre Y (where hoop image sits)

    // Rim opening: left end = basket.x - rimR, right end = basket.x + rimR
    const rimLeft  = basket.x - rimR;
    const rimRight = basket.x + rimR;
    const rimWidth = rimRight - rimLeft;

    // Net hangs down from rim; net height
    const netHeight = 52 * hs;

    const cols = NET_COLS;
    const rows = NET_ROWS;

    // Build node grid
    const nodes = [];
    for (let r = 0; r <= rows; r++) {
      const row = [];
      const taper = r / rows; // 0 at top, 1 at bottom → net narrows
      const halfW = (rimWidth / 2) * (1 - taper * 0.55); // bottom is ~45% narrower
      for (let c = 0; c <= cols; c++) {
        const t  = c / cols;
        const cx = basket.x + (-halfW + t * halfW * 2);
        const cy = rimY + (r / rows) * netHeight;
        row.push({
          x: cx, y: cy,
          vx: 0, vy: 0,
          pinned: r === 0, // top row pinned
          restX: cx,       // rest position (anchors drift with basket)
          restY: cy,
          row: r, col: c
        });
      }
      nodes.push(row);
    }

    // Structural springs: horizontal + vertical connections
    const springs = [];
    const restLen = (n1, n2) => Math.hypot(n2.restX - n1.restX, n2.restY - n1.restY);

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const n = nodes[r][c];
        if (c < cols) springs.push({ a: n, b: nodes[r][c + 1], len: restLen(n, nodes[r][c + 1]), k: NET_SPRING_K });
        if (r < rows) springs.push({ a: n, b: nodes[r + 1][c], len: restLen(n, nodes[r + 1][c]), k: NET_SPRING_K * 0.9 });
        // Diagonal for shear stability
        if (r < rows && c < cols) springs.push({ a: n, b: nodes[r + 1][c + 1], len: restLen(n, nodes[r + 1][c + 1]), k: NET_SPRING_K * 0.55 });
        if (r < rows && c > 0)    springs.push({ a: n, b: nodes[r + 1][c - 1], len: restLen(n, nodes[r + 1][c - 1]), k: NET_SPRING_K * 0.55 });
      }
    }

    basket.net = { nodes, springs, rimLeft, rimRight, rimWidth, netHeight, rimY };
  }

  /** Simulate one physics step for a basket's net */
  _stepNet(basket, dt) {
    const net = basket.net;
    if (!net) return;
    const hs = this.hoopScale;

    // Recompute rest positions for top row if basket moved
    const taper0    = 0;
    const rimR      = RIM_RADIUS * hs;
    const rimLeft   = basket.x - rimR;
    const rimRight  = basket.x + rimR;
    const rimWidth  = rimRight - rimLeft;

    for (let c = 0; c <= NET_COLS; c++) {
      const t     = c / NET_COLS;
      const n     = net.nodes[0][c];
      n.restX     = basket.x + (-rimWidth / 2 + t * rimWidth);
      n.restY     = basket.y;
      n.x         = n.restX;  // pinned: snap to rest
      n.y         = n.restY;
    }

    // Apply springs
    for (const sp of net.springs) {
      const dx   = sp.b.x - sp.a.x;
      const dy   = sp.b.y - sp.a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const f    = (dist - sp.len) * sp.k;
      const fx   = (dx / dist) * f;
      const fy   = (dy / dist) * f;
      if (!sp.a.pinned) { sp.a.vx += fx * dt; sp.a.vy += fy * dt; }
      if (!sp.b.pinned) { sp.b.vx -= fx * dt; sp.b.vy -= fy * dt; }
    }

    // Integrate + gravity + damping
    for (let r = 1; r <= NET_ROWS; r++) {
      for (let c = 0; c <= NET_COLS; c++) {
        const n = net.nodes[r][c];
        n.vy  += NET_GRAVITY * dt;
        n.vx  *= NET_DAMPING;
        n.vy  *= NET_DAMPING;
        n.x   += n.vx * dt;
        n.y   += n.vy * dt;
      }
    }

    // Ball-inside-net interaction: push nodes away from ball if ball is inside
    if (this.ballInsideNet && this.netBallBasket === basket) {
      const ballR = 22 * this.ballScale;
      for (let r = 1; r <= NET_ROWS; r++) {
        for (let c = 0; c <= NET_COLS; c++) {
          const n  = net.nodes[r][c];
          const dx = n.x - this.ballX;
          const dy = n.y - this.ballY;
          const d  = Math.hypot(dx, dy);
          if (d < ballR + 6) {
            const push = (ballR + 6 - d) / (ballR + 6);
            n.vx += (dx / (d || 1)) * push * 180;
            n.vy += (dy / (d || 1)) * push * 180;
          }
        }
      }
    }

    // Drag-pull: net bottom stretches toward where player is dragging (slingshot feel)
    if (this.dragStart && !this.ballInFlight && basket === this.currentBasket) {
      const ptr   = this.input.activePointer;
      const rawDX = ptr.x - this.dragStart.x;
      const rawDY = ptr.y - this.dragStart.y;
      const dragLen = Math.hypot(rawDX, rawDY);
      if (dragLen > 5) {
        const ndx     = rawDX / dragLen;
        const ndy     = rawDY / dragLen;
        const pullStr = Math.min(dragLen * 0.22, 28);
        for (let r = 1; r <= NET_ROWS; r++) {
          const strength = r / NET_ROWS;
          for (let c = 0; c <= NET_COLS; c++) {
            const n = net.nodes[r][c];
            n.vx += ndx * pullStr * strength * dt * 55;
            n.vy += ndy * pullStr * strength * dt * 55;
          }
        }
      }
    }
  }

  /** Draw a basket's net using Graphics */
  _drawNet(basket, tintColor, alpha = 1) {
    const net = basket.net;
    if (!net) return;
    const g   = this.netGraphics;
    const rows = NET_ROWS;
    const cols = NET_COLS;

    // Vertical strands
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r < rows; r++) {
        const n1 = net.nodes[r][c];
        const n2 = net.nodes[r + 1][c];
        const fade = 0.9 - (r / rows) * 0.5; // fade toward bottom
        g.lineStyle(1.5, tintColor, fade * alpha);
        g.lineBetween(n1.x, n1.y, n2.x, n2.y);
      }
    }
    // Horizontal strands
    for (let r = 1; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n1 = net.nodes[r][c];
        const n2 = net.nodes[r][c + 1];
        const fade = 0.75 - (r / rows) * 0.45;
        g.lineStyle(1.2, tintColor, fade * alpha);
        g.lineBetween(n1.x, n1.y, n2.x, n2.y);
      }
    }
  }

  /**
   * Impulse: push net nodes downward from impact point — used on score
   * Creates the dramatic "ball went through" net deformation
   */
  _impulseNet(basket, impactX, impactY, force = 280) {
    const net = basket.net;
    if (!net) return;
    for (let r = 0; r <= NET_ROWS; r++) {
      for (let c = 0; c <= NET_COLS; c++) {
        const n  = net.nodes[r][c];
        if (n.pinned) continue;
        const dx   = n.x - impactX;
        const dy   = n.y - impactY;
        const dist = Math.hypot(dx, dy) + 1;
        const str  = force / (1 + dist * 0.08);
        // Push mainly downward + slight radial
        n.vy += str * (0.7 + Math.random() * 0.4);
        n.vx += (dx / dist) * str * 0.35;
      }
    }
  }

  /** Quickly restore net to rest (called when basket changes) */
  _resetNet(basket) {
    const net = basket.net;
    if (!net) return;
    for (let r = 0; r <= NET_ROWS; r++) {
      for (let c = 0; c <= NET_COLS; c++) {
        const n = net.nodes[r][c];
        n.x = n.restX; n.y = n.restY;
        n.vx = 0; n.vy = 0;
      }
    }
  }

  // ── BASKETS ───────────────────────────────────────────────────────────────
  _initBaskets() {
    const { W, H } = this;
    // Scale based on the smaller of the two axes so hoops feel right on any device
    const shortSide = Math.min(W, H);
    this.hoopScale  = Phaser.Math.Clamp(shortSide / 420, 0.75, 2.2);

    // Alternating sides: 0 = left zone, 1 = right zone
    this.nextBasketSide = 0; // next target will be LEFT

    const curX = W / 2;
    const curY = H * 0.75;
    this.currentBasket = this._makeBasket(curX, curY, 0x00f5d4);

    // First target: left side, same screen height above current basket
    const gap  = Phaser.Math.Between(BASKET_GAP_MIN, BASKET_GAP_MAX);
    const tgtY = curY - gap;
    const tgtX = this._nextBasketX();
    this.targetBasket = this._makeBasket(tgtX, tgtY, 0xff6b35);

    this._pulseBasket(this.targetBasket);
  }

  /** Returns X for the next basket, strictly alternating left/right with screen-adaptive spacing */
  _nextBasketX() {
    const { W } = this;
    // Cap playfield width — grows with hoopScale so big screens feel natural
    const playW  = Math.min(W, 480 * this.hoopScale);
    const startX = (W - playW) / 2;
    const margin = playW * 0.12;
    const side   = this.nextBasketSide === 0 ? -1 : 1;
    this.nextBasketSide = 1 - this.nextBasketSide;
    if (side === -1) {
      // Left zone: 12%–38% of playfield
      return startX + Phaser.Math.Between(margin, playW * 0.38);
    } else {
      // Right zone: 62%–88% of playfield
      return startX + Phaser.Math.Between(playW * 0.62, playW - margin);
    }
  }

  _makeBasket(x, y, rimColor) {
    const img = this.add.image(x, y, 'hoop')
      .setScale(this.hoopScale)
      .setDepth(4);
    img.setTint(rimColor);

    const basket = {
      img,
      x, y,
      rimColor,
      scoreZone: { x, y: y, halfW: SCORE_HALF_W * this.hoopScale },
      net: null
    };
    this._createNet(basket);
    return basket;
  }

  _pulseBasket(basket) {
    this.tweens.add({
      targets: basket.img,
      scaleX: this.hoopScale * 1.06,
      scaleY: this.hoopScale * 1.06,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _scrollWorldDown(dy) {
    [this.currentBasket, this.targetBasket].forEach(b => {
      b.y += dy;
      b.img.y += dy;
      b.scoreZone.y += dy;
      // Shift all net nodes
      if (b.net) {
        for (let r = 0; r <= NET_ROWS; r++) {
          for (let c = 0; c <= NET_COLS; c++) {
            const n = b.net.nodes[r][c];
            n.y += dy; n.restY += dy;
          }
        }
      }
    });
    if (!this.ballInFlight) { this.ballY += dy; this.ball.y = this.ballY; }
    [...this.obstacles, ...this.gems, ...this.powerups].forEach(o => { if (o.active) o.y += dy; });
    this.scrollY += dy;
  }

  _advanceBaskets() {
    // Fade out old current basket
    this.tweens.killTweensOf(this.currentBasket.img);
    const oldImg = this.currentBasket.img;
    this.tweens.add({ targets: oldImg, alpha: 0, y: oldImg.y + 30, duration: 350, onComplete: () => oldImg.destroy() });

    // Promote target → current
    this.currentBasket = this.targetBasket;
    this.currentBasket.img.setTint(0x00f5d4);
    this.tweens.killTweensOf(this.currentBasket.img);
    this.currentBasket.img.setScale(this.hoopScale);

    // Spawn new target — strictly alternating left/right
    const gap  = Phaser.Math.Between(BASKET_GAP_MIN, BASKET_GAP_MAX);
    const newY = this.currentBasket.y - gap;
    const newX = this._nextBasketX();

    this.targetBasket = this._makeBasket(newX, newY, 0xff6b35);
    this._pulseBasket(this.targetBasket);

    const headroom = this.H * 0.18;
    if (newY < headroom) {
      const shift = headroom - newY;
      this._scrollWorldDown(shift);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SCORE ANIMATION — ball passes through net with physics
  // ══════════════════════════════════════════════════════════════════════════
  _animateBallThroughBasket(targetBasket, onDone) {
    const img      = targetBasket.img;
    const rimY     = targetBasket.y;
    const exitY    = rimY + 55 * this.hoopScale;

    // Mark ball as inside net (for net rendering to put it above ball)
    this.ballInsideNet = true;
    this.netBallBasket = targetBasket;

    // Big downward impulse on net nodes
    this._impulseNet(targetBasket, targetBasket.x, rimY + 10, 360);

    // Rim image squash
    this.tweens.add({
      targets: img,
      scaleY: this.hoopScale * 1.28,
      scaleX: this.hoopScale * 0.90,
      duration: 80, ease: 'Power2', yoyo: true,
      onComplete: () => {
        this.tweens.add({
          targets: img,
          scaleX: this.hoopScale * 1.06,
          scaleY: this.hoopScale * 0.94,
          duration: 70, yoyo: true, ease: 'Power1',
          onComplete: () => { img.setScale(this.hoopScale); if (onDone) onDone(); }
        });
      }
    });

    // Ball descends through net visually
    this.tweens.add({
      targets: this.ball,
      y: exitY,
      x: targetBasket.x + (this.ballVX > 0 ? 6 : -6), // slight drift
      scaleX: this.ballScale * 0.78,
      scaleY: this.ballScale * 1.12,
      alpha: 0.75,
      duration: 180,
      ease: 'Power2',
      onComplete: () => {
        // Second half: ball shrinks/fades as it exits net bottom
        this.tweens.add({
          targets: this.ball,
          y: exitY + 20,
          scaleX: this.ballScale * 0.4,
          scaleY: this.ballScale * 0.4,
          alpha: 0,
          duration: 90,
          ease: 'Power2',
          onComplete: () => {
            this.ball.setAlpha(0);
            this.ballInsideNet = false;
            this.netBallBasket = null;
          }
        });
      }
    });
  }

  // ── BALL ──────────────────────────────────────────────────────────────────
  _initBall() {
    const { W, H } = this;
    const shortSide = Math.min(W, H);
    this.ballScale  = Phaser.Math.Clamp(shortSide / 420, 0.75, 2.2);
    this.ballX = this.currentBasket.x;
    this.ballY = this.currentBasket.y - 20;
    this.ball = this.add.image(this.ballX, this.ballY, 'ball')
      .setScale(this.ballScale)
      .setDepth(10); // high depth; nets are depth 6 so ball is above by default
    this.dragLine       = this.add.graphics().setDepth(9);
    this.powerIndicator = this.add.graphics().setDepth(9);
  }

  _resetBall() {
    this.ballX = this.currentBasket.x;
    this.ballY = this.currentBasket.y - 20;
    this.ballVX = this.ballVY = 0;
    this.ballRotation = 0;
    this.ballInFlight = false;
    this.ballInsideNet = false;
    this.netBallBasket = null;
    this.ball.setPosition(this.ballX, this.ballY).setAlpha(1).setScale(this.ballScale);
    this.tweens.add({ targets: this.ball, scaleX: this.ballScale * 1.18, scaleY: this.ballScale * 0.84, duration: 120, yoyo: true, ease: 'Power2' });
  }

  // ── OBSTACLES ─────────────────────────────────────────────────────────────
  _spawnObstacle() {
    const { W, H } = this;
    const topY    = this.targetBasket.y + 30;
    const bottomY = this.currentBasket.y - 30;
    if (bottomY - topY < 60) return;

    const type = Phaser.Math.Between(0, 1);
    if (type === 0) {
      const x = Phaser.Math.Between(W * 0.1, W * 0.9);
      const y = Phaser.Math.Between(topY, bottomY);
      const blade = this.add.image(x, y, 'blade').setDepth(5);
      const spd = Math.max(900, 1500 - this.difficulty * 60);
      this.tweens.add({ targets: blade, angle: 360, duration: spd, repeat: -1, ease: 'Linear' });
      const dir = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
      this.tweens.add({ targets: blade, x: x + dir * Phaser.Math.Between(50, 100), duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      blade._radius = 16; blade._type = 'blade';
      this.obstacles.push(blade);
    } else {
      const fromX  = W * 0.05;
      const toX    = W * 0.95 - 80;
      const y      = Phaser.Math.Between(topY, bottomY);
      const bumper = this.add.image(fromX + 40, y, 'bumper').setDepth(5);
      const spd    = Math.max(600, 1400 - this.difficulty * 50);
      this.tweens.add({ targets: bumper, x: toX + 40, duration: spd, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      bumper._halfW = 40; bumper._halfH = 10; bumper._type = 'bumper';
      this.obstacles.push(bumper);
    }
    while (this.obstacles.length > Math.min(3 + Math.floor(this.difficulty / 4), 6)) {
      const old = this.obstacles.shift();
      this.tweens.add({ targets: old, alpha: 0, duration: 250, onComplete: () => old.destroy() });
    }
  }

  _spawnGem() {
    const { W } = this;
    const topY    = this.targetBasket.y + 20;
    const bottomY = this.currentBasket.y - 40;
    if (bottomY - topY < 40) return;
    const x = Phaser.Math.Between(W * 0.15, W * 0.85);
    const y = Phaser.Math.Between(topY, bottomY);
    const gem = this.add.image(x, y, 'gem').setDepth(6);
    this.tweens.add({ targets: gem, y: y - 10, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: gem, angle: 360, duration: 2200, repeat: -1, ease: 'Linear' });
    gem._radius = 10;
    this.gems.push(gem);
    while (this.gems.length > 3) { const old = this.gems.shift(); old.destroy(); }
  }

  _spawnPowerup() {
    const { W } = this;
    const topY    = this.targetBasket.y + 30;
    const bottomY = this.currentBasket.y - 50;
    if (bottomY - topY < 60) return;
    const x    = Phaser.Math.Between(W * 0.2, W * 0.8);
    const y    = Phaser.Math.Between(topY, bottomY);
    const type = Phaser.Math.Between(0, 1) === 0 ? 'shield' : 'slow';
    const pu   = this.add.image(x, y, type).setDepth(6).setScale(1.2);
    this.tweens.add({ targets: pu, scaleX: 1.4, scaleY: 1.4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    pu._radius = 14; pu._puType = type;
    this.powerups.push(pu);
  }

  // ── PARTICLES / EFFECTS ───────────────────────────────────────────────────
  _burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const speed = Phaser.Math.FloatBetween(60, 200);
      const p = this.add.circle(x, y, Phaser.Math.FloatBetween(3, 8), color, 1).setDepth(20);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed, y: y + Math.sin(angle) * speed + 20,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(400, 700), ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }
  }

  _scoreTextPop(x, y, text, color = '#ffff00') {
    const size = this._fs(0.07, 34);
    const t = this.add.text(x, y, text, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${size}px`, color,
      stroke: '#000', strokeThickness: 4,
      shadow: { color, blur: 10, fill: true }
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 900, ease: 'Power2', onComplete: () => t.destroy() });
  }

  _addTrailDot(x, y) {
    if (!this.ballInFlight) return;
    const dot = this.add.circle(x, y, 3, 0xff6b35, 0.7).setDepth(8);
    this.trailDots.push(dot);
    this.tweens.add({
      targets: dot, alpha: 0, scaleX: 0.1, scaleY: 0.1, duration: 350,
      onComplete: () => {
        dot.destroy();
        const idx = this.trailDots.indexOf(dot);
        if (idx > -1) this.trailDots.splice(idx, 1);
      }
    });
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  _createUI() {
    const { W, H } = this;
    const D  = 50;
    const fs = this._fs.bind(this);

    const scoreH    = Math.min(H * 0.06, 48);
    const scorePadY = scoreH / 2 + 6;

    this.scoreBg   = this.add.rectangle(W / 2, scorePadY, Math.min(W * 0.35, 140), scoreH, 0x000000, 0.55)
      .setStrokeStyle(2, 0xff6b35, 0.6).setDepth(D).setScrollFactor(0);
    this.scoreText = this.add.text(W / 2, scorePadY, '0', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${fs(0.07, 32)}px`, color: '#ffffff',
      shadow: { color: '#ff6b35', blur: 8, fill: true }
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    const heartX = Math.min(W * 0.08, 36);
    this.livesContainer = this.add.container(heartX, scorePadY).setDepth(D).setScrollFactor(0);
    this.heartIcons = [];
    this._refreshHearts();

    this.comboText = this.add.text(W / 2, scorePadY + scoreH + 4, '', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${fs(0.05, 22)}px`, color: '#ffcc00',
      stroke: '#cc8800', strokeThickness: 2
    }).setOrigin(0.5).setDepth(D).setAlpha(0).setScrollFactor(0);

    this.powerupText = this.add.text(W / 2, H - Math.min(H * 0.03, 22), '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${fs(0.038, 16)}px`, color: '#aaffff',
      stroke: '#0044aa', strokeThickness: 2
    }).setOrigin(0.5).setDepth(D).setAlpha(0).setScrollFactor(0);

    this.aimArrow = this.add.image(0, 0, 'arrow').setAlpha(0).setScale(0.7).setDepth(D - 1);

    const pauseSize = Math.min(W * 0.09, 44);
    this.pauseBtn = this.add.text(W - pauseSize * 0.7, pauseSize * 0.7, '⏸', {
      fontSize: `${pauseSize * 0.7}px`
    }).setOrigin(0.5).setDepth(D).setInteractive({ useHandCursor: true }).setScrollFactor(0);
    this.pauseBtn.on('pointerdown', () => this._togglePause());
  }

  _refreshHearts() {
    this.heartIcons.forEach(h => h.destroy());
    this.heartIcons = [];
    this.livesContainer.removeAll(true);
    const heartSize = this._fs(0.045, 20);
    const spacing   = heartSize * 1.4;
    for (let i = 0; i < 3; i++) {
      const h = this.add.text(i * spacing, 0, i < this.lives ? '❤️' : '🖤', { fontSize: `${heartSize}px` }).setOrigin(0.5);
      this.livesContainer.add(h);
      this.heartIcons.push(h);
    }
  }

  _updateScoreUI() {
    this.scoreText.setText(this.score.toString());
    this.tweens.add({ targets: this.scoreText, scaleX: 1.3, scaleY: 1.3, duration: 100, yoyo: true });
  }

  _updatePowerupUI() {
    if (this.shieldActive)    this.powerupText.setText(`🛡️ Shield: ${Math.ceil(this.shieldTimer)}s`).setAlpha(1);
    else if (this.slowActive) this.powerupText.setText(`⏱️ Slow: ${Math.ceil(this.slowTimer)}s`).setAlpha(1);
    else                      this.powerupText.setAlpha(0);
  }

  _updateAimArrow() {
    if (this.ballInFlight) { this.aimArrow.setAlpha(0); return; }
    const tb    = this.targetBasket;
    const angle = Math.atan2(tb.y - this.ballY, tb.x - this.ballX);
    const dist  = Math.min(55, Math.hypot(tb.x - this.ballX, tb.y - this.ballY) * 0.35);
    this.aimArrow.setPosition(this.ballX + Math.cos(angle) * dist, this.ballY + Math.sin(angle) * dist);
    this.aimArrow.setRotation(angle + Math.PI / 2);
    this.aimArrow.setAlpha(0.45 + Math.sin(this.frameCount * 0.09) * 0.2);
  }

  // ── INPUT ─────────────────────────────────────────────────────────────────
  _setupInput() {
    this.input.on('pointerdown', this._onPointerDown, this);
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup',   this._onPointerUp,   this);
    this.input.keyboard?.on('keydown-P', () => this._togglePause());
  }

  _onPointerDown(ptr) {
    if (this.isPaused || this.isGameOver || this.ballInFlight) return;
    this.dragStart = { x: ptr.x, y: ptr.y };
    soundManager.resume();
  }

  _onPointerMove(ptr) {
    if (!this.dragStart || this.isPaused || this.isGameOver || this.ballInFlight) return;
    this._drawAimGuide(ptr);
  }

  _onPointerUp(ptr) {
    if (!this.dragStart || this.isPaused || this.isGameOver || this.ballInFlight) return;

    const dx   = this.dragStart.x - ptr.x;
    const dy   = this.dragStart.y - ptr.y;
    const dist = Math.hypot(dx, dy);

    this.dragLine.clear();
    this.powerIndicator.clear();

    if (dist < 8) { this.dragStart = null; return; }

    const power = Math.min(dist * DRAG_SCALE, MAX_POWER);
    const angle = Math.atan2(dy, dx);

    this.ballVX       = Math.cos(angle) * power * 880;
    this.ballVY       = Math.sin(angle) * power * 880;
    this.ballInFlight = true;
    this.dragStart    = null;

    // Release snap: give current basket net a gentle upward flick
    this._impulseNet(this.currentBasket, this.ballX, this.ballY, -40);

    soundManager.playThrow();
  }

  _drawAimGuide(ptr) {
    if (!this.dragStart) return;
    const { W } = this;
    const dx    = this.dragStart.x - ptr.x;
    const dy    = this.dragStart.y - ptr.y;
    const dist  = Math.hypot(dx, dy);
    const power = Math.min(dist * DRAG_SCALE, MAX_POWER);
    const angle = Math.atan2(dy, dx);

    this.dragLine.clear();
    this.powerIndicator.clear();

    const vx = Math.cos(angle) * power * 880;
    const vy = Math.sin(angle) * power * 880;
    const step = 0.04;
    let px = this.ballX, py = this.ballY, pvx = vx, pvy = vy;
    for (let i = 0; i < 22; i++) {
      pvy += GRAVITY * step;
      px  += pvx * step;
      py  += pvy * step;
      if (i % 2 === 0) {
        const alpha = 0.7 - i * 0.028;
        this.dragLine.fillStyle(0xffffff, Math.max(alpha, 0.05));
        this.dragLine.fillCircle(px, py, 4);
      }
    }

    const barW = Math.min(W * 0.35, 130);
    const barH = 8;
    const barX = this.ballX - barW / 2;
    const barY = this.ballY + 34;
    this.powerIndicator.fillStyle(0x000000, 0.5);
    this.powerIndicator.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    const col = power < 0.4 ? 0x00ff88 : power < 0.75 ? 0xffcc00 : 0xff4444;
    this.powerIndicator.fillStyle(col, 1);
    this.powerIndicator.fillRect(barX, barY, barW * power, barH);

    this.dragLine.lineStyle(3, 0xff6b35, 0.7);
    this.dragLine.lineBetween(this.ballX, this.ballY, this.ballX + Math.cos(angle) * 45, this.ballY + Math.sin(angle) * 45);
  }

  // ── YT CALLBACKS ──────────────────────────────────────────────────────────
  _setupYTCallbacks() {
    YTPlayables.onPause(() => { this.isPaused = true; this._saveProgress(); });
    YTPlayables.onResume(() => { if (this.isPaused && !this._manualPause) this.isPaused = false; });
    YTPlayables.onAudioEnabledChange(en => soundManager.setEnabled(en));
    soundManager.setEnabled(YTPlayables.isAudioEnabled());
  }

  _togglePause() {
    if (this.isGameOver) return;
    this._manualPause = !this._manualPause;
    this.isPaused     = this._manualPause;
    if (this.isPaused) {
      soundManager.playClick();
      this.pauseBtn.setText('▶️');
      this._showPauseOverlay();
      this._saveProgress();
    } else {
      soundManager.playClick();
      soundManager.resume();
      this.pauseBtn.setText('⏸');
      this._hidePauseOverlay();
    }
  }

  _showPauseOverlay() {
    if (this._pauseOverlay) return;
    const { W, H } = this;
    this._pauseOverlay = this.add.container(0, 0).setDepth(100).setScrollFactor(0);
    const bg  = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7);
    const txt = this.add.text(W / 2, H / 2 - 30, 'PAUSED', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${this._fs(0.11, 52)}px`, color: '#ffffff'
    }).setOrigin(0.5);
    const sub = this.add.text(W / 2, H / 2 + 30, 'Tap ▶️ to continue', {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${this._fs(0.042, 18)}px`, color: '#aaaacc'
    }).setOrigin(0.5);
    this._pauseOverlay.add([bg, txt, sub]);
  }

  _hidePauseOverlay() {
    if (this._pauseOverlay) { this._pauseOverlay.destroy(); this._pauseOverlay = null; }
  }

  // ── SCORING & GAME FLOW ───────────────────────────────────────────────────
  _onScore() {
    this.totalBaskets++;
    this.combo++;
    this.comboTimer = 3.5;

    const multiplier = Math.min(this.combo, 8);
    const points     = 1 * multiplier;
    this.score      += points;
    this.difficulty  = 1 + Math.floor(this.score / 5);

    this._updateScoreUI();
    soundManager.playScore();

    if (this.combo > 1) {
      this.comboText.setText(`x${this.combo} COMBO!`);
      this.tweens.killTweensOf(this.comboText);
      this.comboText.setAlpha(1).setScale(1.2);
      this.tweens.add({ targets: this.comboText, scaleX: 1, scaleY: 1, duration: 200 });
      soundManager.playCombo(Math.min(this.combo, 5));
    } else {
      this.comboText.setAlpha(0);
    }

    const label = this.combo > 1 ? `+${points} 🔥` : `+${points}`;
    this._scoreTextPop(this.targetBasket.x, this.targetBasket.y - 20, label, this.combo > 2 ? '#ff4444' : '#ffff00');
    this._burst(this.targetBasket.x, this.targetBasket.y + 20, 0xff6b35, 14);

    if (this.score > this.bestScore) this.bestScore = this.score;
    YTPlayables.sendScore(this.score);

    this._clearAllObstacles();

    // Net physics animation first, then advance
    this._animateBallThroughBasket(this.targetBasket, () => {
      if (!this.isGameOver) {
        this._advanceBaskets();
        this.time.delayedCall(120, () => { if (!this.isGameOver) this._resetBall(); });
      }
    });
  }

  _clearAllObstacles() {
    [...this.obstacles, ...this.gems, ...this.powerups].forEach(o => {
      this.tweens.add({ targets: o, alpha: 0, duration: 200, onComplete: () => o.destroy() });
    });
    this.obstacles = []; this.gems = []; this.powerups = [];
    this.obstacleTimer = 0; this.gemTimer = 0; this.powerupTimer = 0;
  }

  _onMiss() {
    if (this.shieldActive) {
      this.shieldActive = false; this.shieldTimer = 0;
      soundManager.playHit();
      this._scoreTextPop(this.ballX, this.ballY - 30, '🛡️ BLOCKED!', '#4895ef');
      this._burst(this.ballX, this.ballY, 0x4895ef, 10);
      this.time.delayedCall(200, () => { if (!this.isGameOver) this._resetBall(); });
      return;
    }
    this.combo = 0; this.comboTimer = 0;
    this.comboText.setAlpha(0);
    this.lives--;
    this._refreshHearts();
    soundManager.playMiss();
    this.cameras.main.shake(120, 0.012);
    if (this.lives <= 0) this._gameOver();
    else this.time.delayedCall(350, () => { if (!this.isGameOver) this._resetBall(); });
  }

  _onHitObstacle() {
    if (this.shieldActive) {
      this.shieldActive = false; this.shieldTimer = 0;
      soundManager.playHit();
      this._scoreTextPop(this.ballX, this.ballY - 30, '🛡️ BLOCKED!', '#4895ef');
      this._burst(this.ballX, this.ballY, 0x4895ef, 8);
      this.ballVX *= -0.5; this.ballVY *= -0.5;
      return;
    }
    soundManager.playHit();
    this._burst(this.ballX, this.ballY, 0xff0000, 8);
    this.cameras.main.shake(150, 0.015);
    this.combo = 0; this.comboTimer = 0;
    this.comboText.setAlpha(0);
    this.lives--;
    this._refreshHearts();
    if (this.lives <= 0) this._gameOver();
    else {
      this.ballInFlight = false;
      this.tweens.add({ targets: this.ball, alpha: 0.2, duration: 120, yoyo: true, repeat: 3 });
      this.time.delayedCall(450, () => { if (!this.isGameOver) this._resetBall(); });
    }
  }

  _gameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    clearInterval(this.ambientInterval);
    soundManager.playGameOver();
    this.cameras.main.shake(200, 0.02);
    this._saveProgress();
    this.time.delayedCall(550, () => {
      this.scene.start('GameOverScene', { score: this.score, bestScore: this.bestScore, baskets: this.totalBaskets });
    });
  }

  async _saveProgress() {
    try { await YTPlayables.saveData({ bestScore: this.bestScore, lastScore: this.score }); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  COLLISION CHECKS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Score zone: ball must pass DOWNWARD through the rim opening.
   * Rim collision: if ball hits the dandi (left/right end caps), it bounces.
   */
  _checkScoreZone() {
    const tb    = this.targetBasket;
    const zone  = tb.scoreZone;
    const rimY  = zone.y;
    const halfW = zone.halfW * 1.1; // generous scoring window

    // Rim dandi positions (left end cap and right end cap)
    const hs      = this.hoopScale;
    const rimR    = RIM_RADIUS * hs;
    const leftCap  = { x: tb.x - rimR, y: rimY };
    const rightCap = { x: tb.x + rimR, y: rimY };
    const ballR    = 22 * this.ballScale;
    const capR     = 8 * hs; // dandi radius for collision

    // Check dandi collisions first (bounce off rim)
    if (this.ballVY > -100) { // only when ball is falling or nearly level
      [leftCap, rightCap].forEach(cap => {
        const dx = this.ballX - cap.x;
        const dy = this.ballY - cap.y;
        const d  = Math.hypot(dx, dy);
        if (d < ballR + capR) {
          // Bounce: reflect velocity component along collision normal
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          const dot = this.ballVX * nx + this.ballVY * ny;
          this.ballVX = (this.ballVX - 2 * dot * nx) * 0.55;
          this.ballVY = (this.ballVY - 2 * dot * ny) * 0.55;
          // Separate ball from dandi
          this.ballX = cap.x + nx * (ballR + capR + 1);
          this.ballY = cap.y + ny * (ballR + capR + 1);
          // Give net a jolt at impact
          this._impulseNet(tb, this.ballX, this.ballY, 120);
          soundManager.playHit();
          // just let it bounce — don't force instant miss
        }
      });
    }

    // Score: ball falling through centre opening
    if (this.ballVY > 0 &&
        Math.abs(this.ballX - zone.x) < halfW &&
        this.ballY > rimY - 18 &&
        this.ballY < rimY + 36) {
      this.ballInFlight = false;
      this._onScore();
    }
  }

  _checkObstacleCollisions() {
    const r = 20 * this.ballScale;
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      let hit = false;
      if (obs._type === 'blade') {
        const dx = this.ballX - obs.x, dy = this.ballY - obs.y;
        if (Math.hypot(dx, dy) < r + obs._radius) hit = true;
      } else {
        if (Math.abs(this.ballX - obs.x) < r + obs._halfW && Math.abs(this.ballY - obs.y) < r + obs._halfH) hit = true;
      }
      if (hit) { this.ballInFlight = false; this._onHitObstacle(); return; }
    }
  }

  _checkGemCollisions() {
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const gem = this.gems[i];
      if (Math.hypot(this.ballX - gem.x, this.ballY - gem.y) < 22 + gem._radius) {
        this.gems.splice(i, 1);
        this.score += 2;
        this._updateScoreUI();
        this._scoreTextPop(gem.x, gem.y, '+2 💎', '#00f5d4');
        this._burst(gem.x, gem.y, 0x00f5d4, 8);
        this.tweens.add({ targets: gem, alpha: 0, scaleX: 2, scaleY: 2, duration: 200, onComplete: () => gem.destroy() });
        soundManager.playScore();
      }
    }
  }

  _checkPowerupCollisions() {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      if (Math.hypot(this.ballX - pu.x, this.ballY - pu.y) < 22 + pu._radius) {
        this.powerups.splice(i, 1);
        if (pu._puType === 'shield') { this.shieldActive = true; this.shieldTimer = 8; this._scoreTextPop(pu.x, pu.y, '🛡️ SHIELD!', '#4895ef'); }
        else                         { this.slowActive   = true; this.slowTimer   = 5; this._scoreTextPop(pu.x, pu.y, '⏱️ SLOW!',   '#ffd60a'); }
        this._burst(pu.x, pu.y, 0xffffff, 10);
        this.tweens.add({ targets: pu, alpha: 0, scaleX: 2, scaleY: 2, duration: 200, onComplete: () => pu.destroy() });
        soundManager.playCombo(1);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UPDATE LOOP
  // ══════════════════════════════════════════════════════════════════════════
  update(time, delta) {
    if (this.isPaused || this.isGameOver) return;

    const dt         = Math.min(delta / 1000, 0.05);
    const slowFactor = this.slowActive ? 0.4 : 1.0;
    this.frameCount++;

    // Timers
    if (this.shieldActive) { this.shieldTimer -= dt; if (this.shieldTimer <= 0) this.shieldActive = false; }
    if (this.slowActive)   { this.slowTimer   -= dt; if (this.slowTimer   <= 0) this.slowActive   = false; }
    this._updatePowerupUI();

    // Combo decay
    if (this.combo > 0 && this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.tweens.add({ targets: this.comboText, alpha: 0, duration: 300 }); }
    }

    // Obstacles/gems/powerups removed — clean run

    // ── Net physics step (both baskets every frame) ─────────────────────────
    this._stepNet(this.currentBasket, dt * slowFactor);
    this._stepNet(this.targetBasket,  dt * slowFactor);

    // ── Draw nets ──────────────────────────────────────────────────────────
    this.netGraphics.clear();

    // Current basket net (cyan)
    this._drawNet(this.currentBasket, 0x00e8c0, 0.75);

    // Target basket net (orange) — drawn after current so it's on top
    this._drawNet(this.targetBasket,  0xff7a20, 0.92);

    // ── Ball physics ───────────────────────────────────────────────────────
    if (this.ballInFlight) {
      this.ballVY       += GRAVITY * dt * slowFactor;
      this.ballX        += this.ballVX * dt * slowFactor;
      this.ballY        += this.ballVY * dt * slowFactor;
      this.ballRotation += this.ballVX * 0.005 * slowFactor;
      this.ball.setPosition(this.ballX, this.ballY).setRotation(this.ballRotation);

      // Trail
      this.trailTimer += dt;
      if (this.trailTimer >= 0.04) { this.trailTimer = 0; this._addTrailDot(this.ballX, this.ballY); }

      // Ceiling bounce — ball never exits top
      if (this.ballY < 30) {
        this.ballY = 30;
        this.ballVY = Math.abs(this.ballVY) * 0.65;
      }

      // Wall bounce
      const r = 24 * this.ballScale;
      if (this.ballX - r < 0)      { this.ballX = r;          this.ballVX =  Math.abs(this.ballVX) * 0.7; }
      if (this.ballX + r > this.W) { this.ballX = this.W - r; this.ballVX = -Math.abs(this.ballVX) * 0.7; }

      // Miss if ball falls way below
      if (this.ballY > this.currentBasket.y + this.H * 0.35) {
        this.ballInFlight = false;
        this._onMiss();
        return;
      }

      // ── Safe zone: ball returns to current basket = safe, just reset ──────
      const cur  = this.currentBasket;
      const curZ = cur.scoreZone;
      if (this.ballVY > 0 &&
          Math.abs(this.ballX - curZ.x) < curZ.halfW * 0.9 &&
          this.ballY > cur.y - 18 &&
          this.ballY < cur.y + 36) {
        // Ball came back home — safe! Give net a gentle bounce, reset
        this.ballInFlight = false;
        this._impulseNet(cur, this.ballX, cur.y + 10, 120);
        this.tweens.add({ targets: this.ball, y: cur.y - 20, scaleX: this.ballScale * 1.1, scaleY: this.ballScale * 0.9, duration: 80, yoyo: true, ease: 'Power2', onComplete: () => {
          if (!this.isGameOver) this._resetBall();
        }});
        soundManager.playHit();
        this._scoreTextPop(cur.x, cur.y - 30, '↩ SAFE', '#00f5d4');
        return;
      }

      this._checkScoreZone();

    } else if (!this.ballInsideNet) {
      // Ball resting or waiting — just update aim arrow
      this._updateAimArrow();
      // Idle net gentle sway for current basket
      if (!this.dragStart) {
        const sway = Math.sin(this.frameCount * 0.04) * 0.8;
        for (let r = 2; r <= NET_ROWS; r++) {
          const strength = (r - 1) / NET_ROWS;
          for (let c = 0; c <= NET_COLS; c++) {
            this.currentBasket.net?.nodes[r][c] && (this.currentBasket.net.nodes[r][c].vx += sway * strength * dt * 10);
          }
        }
      }
    }
  }

  // ── SHUTDOWN ──────────────────────────────────────────────────────────────
  shutdown() {
    clearInterval(this.ambientInterval);
    this.scale.off('resize', this._onResize, this);
    this.input.off('pointerdown', this._onPointerDown, this);
    this.input.off('pointermove', this._onPointerMove, this);
    this.input.off('pointerup',   this._onPointerUp,   this);
  }
}