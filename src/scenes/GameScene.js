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

    // Net back layer (rows 0-2) — behind ball (depth 6)
    this.netGraphics = this.add.graphics().setDepth(6);
    // Net front layer (rows 3+) — in front of ball (depth 8) for "ball inside net" look
    this.netFrontGraphics = this.add.graphics().setDepth(8);


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
    bg.fillStyle(0x000000, 1);
    bg.fillRect(0, 0, W, H);
    bg.setDepth(-10);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SPRING NET SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Create a static-geometry net for a basket.
   * Nodes are computed purely from rest geometry — no spring physics drift.
   * A shake offset is animated on score for visual feedback.
   */
  _createNet(basket) {
    const hs        = this.hoopScale;
    const rimR      = RIM_RADIUS * hs;
    const rimWidth  = rimR * 2;
    const netHeight = 56 * hs;

    basket.net = {
      rimR, rimWidth, netHeight,
      shakeAmt: 0,
      shakeDecay: 0,
      dragOffsetX: 0,  // lateral pull from ball drag
      dragOffsetY: 0
    };
  }

  /**
   * Compute the node position for row r, col c from pure geometry.
   * Top row = full rim width; bottom row = 38% width; all centred on basket.x
   * shakeAmt adds a small lateral wobble for score feedback.
   */
  _netNode(basket, r, c) {
    const net    = basket.net;
    const rows   = NET_ROWS;
    const cols   = NET_COLS;
    const taper  = r / rows;                                  // 0 top -> 1 bottom
    const halfW  = (net.rimWidth / 2) * (1 - taper * 0.62);
    const t      = c / cols;
    // Local (untilted) position relative to basket centre
    const lx     = -halfW + t * halfW * 2;
    const ly     = taper * net.netHeight;

    // Apply basket tilt: rotate local coords by tiltDeg around origin
    const rad    = (basket.tiltDeg || 0) * (Math.PI / 180);
    const cosA   = Math.cos(rad);
    const sinA   = Math.sin(rad);
    const rx     = lx * cosA - ly * sinA;
    const ry     = lx * sinA + ly * cosA;

    const x      = basket.x + rx;
    const y      = basket.y + ry;
    // Drag pull: top row stays pinned, bottom follows ball fully
    const drag   = taper * taper; // quadratic - feels more elastic
    const shake  = net.shakeAmt * taper * Math.sin(c * 1.1 + r * 0.7);
    return {
      x: x + shake + net.dragOffsetX * drag,
      y: y        + net.dragOffsetY * drag
    };
  }

  /** Tick net — update drag offset and shake decay */
  _stepNet(basket, dt) {
    const net = basket.net;
    if (!net) return;

    // Drag pull: only apply to the current (shooting) basket while dragging
    if (this.dragStart && !this.ballInFlight && basket === this.currentBasket) {
      const dx = this.ballX - this._ballRestX;
      const dy = this.ballY - this._ballRestY;
      net.dragOffsetX = dx;
      net.dragOffsetY = dy;
    } else {
      // Smoothly spring back to rest when not dragging
      net.dragOffsetX *= 0.75;
      net.dragOffsetY *= 0.75;
    }

    // Shake decay
    if (net.shakeAmt > 0) {
      net.shakeAmt -= net.shakeDecay * dt;
      if (net.shakeAmt < 0) net.shakeAmt = 0;
    }
  }

  /**
   * Draw net using static geometry.
   * Rows 0..NET_FRONT_ROW drawn on netGraphics (depth 6, behind ball).
   * Rows NET_FRONT_ROW..NET_ROWS drawn on netFrontGraphics (depth 8, in front of ball).
   * This makes the ball look like it's sitting INSIDE the net.
   */
 _drawNet(basket, tintColor, alpha = 1) {
  const net  = basket.net;
  if (!net) return;
  const rows = NET_ROWS;
  const cols = NET_COLS;
  const splitRow = 2;

  // ── Derive a bright accent and a dim shadow colour from tintColor ──────
  // tintColor is a hex number like 0x00e8c0 or 0xff7a20
  const tr = (tintColor >> 16) & 0xff;
  const tg = (tintColor >>  8) & 0xff;
  const tb =  tintColor        & 0xff;
  // Bright: mix tint 60% with white 40%
  const br = Math.min(255, tr + 102) & 0xff;
  const bg = Math.min(255, tg + 102) & 0xff;
  const bb = Math.min(255, tb + 102) & 0xff;
  const brightColor = (br << 16) | (bg << 8) | bb;
  // Shadow: tint × 0.35
  const sr = Math.round(tr * 0.35) & 0xff;
  const sg = Math.round(tg * 0.35) & 0xff;
  const sb = Math.round(tb * 0.35) & 0xff;
  const shadowColor = (sr << 16) | (sg << 8) | sb;

  const drawSegment = (g, fromRow, toRow) => {

    // ── SHADOW PASS — offset lines give the cord a 3-D rope look ──────────
    for (let c = 0; c <= cols; c++) {
      for (let r = fromRow; r < toRow; r++) {
        const n1 = this._netNode(basket, r,     c);
        const n2 = this._netNode(basket, r + 1, c);
        const t  = r / rows;
        g.lineStyle(3.2 - t * 0.8, shadowColor, (0.55 - t * 0.28) * alpha);
        g.lineBetween(n1.x + 1.2, n1.y + 1.2, n2.x + 1.2, n2.y + 1.2);
      }
    }
    for (let r = Math.max(fromRow, 1); r <= toRow; r++) {
      for (let c = 0; c < cols; c++) {
        const n1 = this._netNode(basket, r, c);
        const n2 = this._netNode(basket, r, c + 1);
        const t  = r / rows;
        g.lineStyle(2.2 - t * 0.5, shadowColor, (0.45 - t * 0.22) * alpha);
        g.lineBetween(n1.x + 1.0, n1.y + 1.0, n2.x + 1.0, n2.y + 1.0);
      }
    }

    // ── MAIN CORD PASS — tinted, fading top-to-bottom ─────────────────────
    for (let c = 0; c <= cols; c++) {
      for (let r = fromRow; r < toRow; r++) {
        const n1    = this._netNode(basket, r,     c);
        const n2    = this._netNode(basket, r + 1, c);
        const t     = r / rows;
        // Vertical strands: start with bright tint at top, fade to dim tint
        const color = t < 0.35 ? brightColor : tintColor;
        const fade  = (0.98 - t * 0.55) * alpha;
        const thick = 2.4 - t * 0.75;
        g.lineStyle(thick, color, fade);
        g.lineBetween(n1.x, n1.y, n2.x, n2.y);
      }
    }

    // Horizontal rings — slightly dimmer, use tintColor throughout
    for (let r = Math.max(fromRow, 1); r <= toRow; r++) {
      for (let c = 0; c < cols; c++) {
        const n1   = this._netNode(basket, r, c);
        const n2   = this._netNode(basket, r, c + 1);
        const t    = r / rows;
        const fade = (0.75 - t * 0.42) * alpha;
        const thick = 1.8 - t * 0.55;
        g.lineStyle(thick, tintColor, fade);
        g.lineBetween(n1.x, n1.y, n2.x, n2.y);
      }
    }

    // ── HIGHLIGHT PASS — thin bright centre line on top vertical strands ──
    for (let c = 0; c <= cols; c++) {
      for (let r = fromRow; r < Math.min(toRow, 2); r++) {
        const n1 = this._netNode(basket, r,     c);
        const n2 = this._netNode(basket, r + 1, c);
        g.lineStyle(0.8, 0xffffff, 0.55 * alpha);
        g.lineBetween(n1.x - 0.5, n1.y, n2.x - 0.5, n2.y);
      }
    }
  };

  // Back half (behind ball)
  drawSegment(this.netGraphics, 0, splitRow);
  // Front half (in front of ball)
  drawSegment(this.netFrontGraphics, splitRow, rows);

  // ── RIM ATTACHMENT KNOTS — glowing dots where net meets the rim ─────────
  for (let c = 0; c <= cols; c++) {
    const n = this._netNode(basket, 0, c);

    // Outer glow ring
    this.netGraphics.fillStyle(tintColor, 0.25 * alpha);
    this.netGraphics.fillCircle(n.x, n.y, 4.5);

    // Main bright knot
    this.netGraphics.fillStyle(brightColor, 0.90 * alpha);
    this.netGraphics.fillCircle(n.x, n.y, 2.2);

    // Tiny specular highlight
    this.netGraphics.fillStyle(0xffffff, 0.70 * alpha);
    this.netGraphics.fillCircle(n.x - 0.6, n.y - 0.6, 0.9);
  }

  // ── BOTTOM OPEN-END CORD TIPS — small accent dots at the net mouth ──────
  for (let c = 0; c <= cols; c++) {
    const n = this._netNode(basket, rows, c);
    this.netFrontGraphics.fillStyle(tintColor, 0.35 * alpha);
    this.netFrontGraphics.fillCircle(n.x, n.y, 1.8);
  }
}

  /** Trigger a net shake animation on score — replaces spring impulse */
  _impulseNet(basket, impactX, impactY, force = 280) {
    const net = basket.net;
    if (!net) return;
    net.shakeAmt   = Math.min(force * 0.04, 10);
    net.shakeDecay = net.shakeAmt * 4.5;
  }

  /** Reset net shake state */
  _resetNet(basket) {
    const net = basket.net;
    if (!net) return;
    net.shakeAmt   = 0;
    net.shakeDecay = 0;
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
    this.currentBasket = this._makeBasket(curX, curY, 0x00f5d4, 0);

    // First target: left side, same screen height above current basket
    const gap  = Phaser.Math.Between(BASKET_GAP_MIN, BASKET_GAP_MAX);
    const tgtY = curY - gap;
    const tgtX = this._nextBasketX();
    this.targetBasket = this._makeBasket(tgtX, tgtY, 0xff6b35, 0);

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

  _makeBasket(x, y, rimColor, tiltDeg = 0) {
    const img = this.add.image(x, y, 'hoop')
      .setScale(this.hoopScale)
      .setDepth(4);
    img.setTint(rimColor);
    img.setAngle(tiltDeg);

    const basket = {
      img,
      x, y,
      rimColor,
      tiltDeg,                                                   // degrees, + = right, - = left
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
      // Static net recomputes from basket.y each frame — no nodes to shift
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

    // Tilt: after 3 baskets, tilt the target toward the side it is on
    // relative to the current basket so the rim faces the incoming ball.
    // Max tilt grows slowly with difficulty, capped at 18 degrees.
    let tiltDeg = 0;
    if (this.totalBaskets >= 3) {
      const maxTilt = Math.min(6 + Math.floor((this.totalBaskets - 3) / 3) * 2, 18);
      const dir     = newX > this.currentBasket.x ? 1 : -1;
      tiltDeg       = dir * Phaser.Math.FloatBetween(maxTilt * 0.5, maxTilt);
    }

    this.targetBasket = this._makeBasket(newX, newY, 0xff6b35, tiltDeg);
    this._pulseBasket(this.targetBasket);

    // Randomly attach funnel guide-bars after basket 5 (~40% chance)
    // Moving basket: after basket 5, add horizontal oscillation
    if (this.totalBaskets >= 5) {
      this._startBasketMovement(this.targetBasket);
    }

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

    // Mark ball as inside net — drop depth so net cords render over ball
    this.ballInsideNet = true;
    this.netBallBasket = targetBasket;
    this.ball.setDepth(3); // behind netGraphics so cords visually wrap over ball

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
            this.ball.setDepth(7); // restore above net for next throw
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
    const ballDisplayPx = Phaser.Math.Clamp(shortSide / 420 * 48, 36, 105);
    const ballTexW = this.textures.get('ball')?.source?.[0]?.width || 52;
    this.ballScale = ballDisplayPx / ballTexW;
    // Ball sits inside net: push down ~30% of net height so it's visually cradled
    const netHeight = 56 * this.hoopScale;
    this.ballX = this.currentBasket.x;
    this.ballY = this.currentBasket.y + netHeight * 0.30;
    this.ball = this.add.image(this.ballX, this.ballY, 'ball')
      .setScale(this.ballScale)
      .setDepth(7);  // above netGraphics back (depth 6), below netFrontGraphics (depth 8)
    this.dragLine       = this.add.graphics().setDepth(9);
    this.powerIndicator = this.add.graphics().setDepth(9);
  }

  _resetBall() {
    const netHeight = 56 * this.hoopScale;
    this.ballX = this.currentBasket.x;
    this.ballY = this.currentBasket.y + netHeight * 0.30;
    this.ballVX = this.ballVY = 0;
    this.ballRotation = 0;
    this.ballInFlight = false;
    this.ballInsideNet = false;
    this.netBallBasket = null;
    this.ball.setPosition(this.ballX, this.ballY).setAlpha(1).setScale(this.ballScale).setDepth(7);
    this.tweens.add({ targets: this.ball, scaleX: this.ballScale * 1.22, scaleY: this.ballScale * 0.80, duration: 110, yoyo: true, ease: 'Power2' });
    soundManager.playBounce();
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
    const S  = Math.min(W, H);
    const fs = this._fs.bind(this);

    // ── TOP BAR — glass pill HUD ──────────────────────────────────────────
    const barH    = Math.min(H * 0.065, 50);
    const barY    = barH * 0.52 + 4;
    const barPad  = 6;

    // Full-width frosted top bar
    const topBarG = this.add.graphics().setDepth(D - 2).setScrollFactor(0);
    topBarG.fillStyle(0x000000, 0.55);
    topBarG.fillRect(0, 0, W, barH + barPad * 2);
    // Bottom border line
    topBarG.lineStyle(1, 0xff6b35, 0.25);
    topBarG.lineBetween(0, barH + barPad * 2, W, barH + barPad * 2);
    // Top shine
    topBarG.fillGradientStyle(0xffffff, 0xffffff, 0x000000, 0x000000, 0.04, 0.04, 0, 0);
    topBarG.fillRect(0, 0, W, 2);

    // ── SCORE — center pill ────────────────────────────────────────────────
    const scorePillW = Math.min(W * 0.3, 120);
    const scorePillG = this.add.graphics().setDepth(D - 1).setScrollFactor(0);
    scorePillG.fillStyle(0xff6b35, 0.15);
    scorePillG.fillRoundedRect(W / 2 - scorePillW / 2, barPad, scorePillW, barH, barH / 2);
    scorePillG.lineStyle(1.5, 0xff6b35, 0.5);
    scorePillG.strokeRoundedRect(W / 2 - scorePillW / 2, barPad, scorePillW, barH, barH / 2);

    this.scoreText = this.add.text(W / 2, barY, '0', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${fs(0.07, 30)}px`,
      color: '#ffffff',
      shadow: { color: '#ff6b35', blur: 10, fill: true }
    }).setOrigin(0.5).setDepth(D).setScrollFactor(0);

    // ── LIVES — left side with label ──────────────────────────────────────
    const livesX = Math.min(W * 0.06, 28);
    this.livesContainer = this.add.container(livesX, barY).setDepth(D).setScrollFactor(0);
    this.heartIcons = [];
    this._refreshHearts();

    // ── COMBO TEXT ────────────────────────────────────────────────────────
    this.comboText = this.add.text(W / 2, barH + barPad * 2 + 6, '', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${fs(0.052, 22)}px`,
      color: '#ffd700',
      stroke: '#cc8800',
      strokeThickness: 2,
      shadow: { color: '#ffaa00', blur: 12, fill: true }
    }).setOrigin(0.5).setDepth(D).setAlpha(0).setScrollFactor(0);

    // ── POWERUP INDICATOR — bottom center glass pill ───────────────────────
    const puPillW = Math.min(W * 0.55, 200);
    const puPillH = Math.min(H * 0.038, 28);
    const puY = H - puPillH - 8;

    this.puPillG = this.add.graphics().setDepth(D - 1).setScrollFactor(0).setAlpha(0);
    this.puPillG.fillStyle(0x000000, 0.6);
    this.puPillG.fillRoundedRect(W / 2 - puPillW / 2, puY, puPillW, puPillH, puPillH / 2);
    this.puPillG.lineStyle(1, 0x4895ef, 0.5);
    this.puPillG.strokeRoundedRect(W / 2 - puPillW / 2, puY, puPillW, puPillH, puPillH / 2);

    this.powerupText = this.add.text(W / 2, puY + puPillH / 2, '', {
      fontFamily: '"Arial", sans-serif',
      fontSize: `${fs(0.038, 14)}px`,
      color: '#aaffff',
    }).setOrigin(0.5).setDepth(D).setAlpha(0).setScrollFactor(0);

    // ── AIM ARROW ─────────────────────────────────────────────────────────
    this.aimArrow = this.add.image(0, 0, 'arrow').setAlpha(0).setScale(0.65).setDepth(D - 1);

    // Pause handled by YouTube — no pause button in game

    // ── SIDE ACCENT LINES ─────────────────────────────────────────────────
    const sideG = this.add.graphics().setDepth(-7).setScrollFactor(0);
    sideG.lineStyle(2, 0xff6b35, 0.12);
    for (let y = 0; y < H; y += 50) {
      sideG.lineBetween(0, y, W * 0.04, y);
      sideG.lineBetween(W * 0.96, y, W, y);
    }
  }

  _refreshHearts() {
    this.heartIcons.forEach(h => h.destroy());
    this.heartIcons = [];
    this.livesContainer.removeAll(true);
    const heartSize = this._fs(0.048, 20);
    const spacing   = heartSize * 1.3;
    for (let i = 0; i < 3; i++) {
      const h = this.add.text(i * spacing, 0, i < this.lives ? '❤️' : '🖤', { fontSize: `${heartSize}px` }).setOrigin(0, 0.5);
      this.livesContainer.add(h);
      this.heartIcons.push(h);
    }
  }

  _updateScoreUI() {
    this.scoreText.setText(this.score.toString());
    this.tweens.add({ targets: this.scoreText, scaleX: 1.3, scaleY: 1.3, duration: 100, yoyo: true });
  }

  _updatePowerupUI() {
    if (this.shieldActive) {
      this.powerupText.setText(`🛡️ Shield: ${Math.ceil(this.shieldTimer)}s`).setAlpha(1);
      if (this.puPillG) this.puPillG.setAlpha(1);
    } else if (this.slowActive) {
      this.powerupText.setText(`⏱️ Slow: ${Math.ceil(this.slowTimer)}s`).setAlpha(1);
      if (this.puPillG) this.puPillG.setAlpha(1);
    } else {
      this.powerupText.setAlpha(0);
      if (this.puPillG) this.puPillG.setAlpha(0);
    }
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
    // No manual pause — YouTube controls pause/resume
  }

  _onPointerDown(ptr) {
    if (this.isPaused || this.isGameOver || this.ballInFlight) return;
    this.dragStart = { x: ptr.x, y: ptr.y };
    // Store the ball's rest position so we can snap back if drag is too small
    this._ballRestX = this.ballX;
    this._ballRestY = this.ballY;
    soundManager.resume();
  }

  _onPointerMove(ptr) {
    if (!this.dragStart || this.isPaused || this.isGameOver || this.ballInFlight) return;

    // Pull ball with the finger — offset from drag start, clamped to max pull distance
    const rawDX  = ptr.x - this.dragStart.x;
    const rawDY  = ptr.y - this.dragStart.y;
    const dist   = Math.hypot(rawDX, rawDY);
    const maxPull = 80; // px — how far ball can be pulled from rest
    const clamp  = dist > maxPull ? maxPull / dist : 1;

    this.ballX = this._ballRestX + rawDX * clamp;
    this.ballY = this._ballRestY + rawDY * clamp;
    this.ball.setPosition(this.ballX, this.ballY);

    this._drawAimGuide(ptr);
  }

  _onPointerUp(ptr) {
    if (!this.dragStart || this.isPaused || this.isGameOver || this.ballInFlight) return;

    const dx   = this.dragStart.x - ptr.x;
    const dy   = this.dragStart.y - ptr.y;
    const dist = Math.hypot(dx, dy);

    this.dragLine.clear();
    this.powerIndicator.clear();

    if (dist < 8) {
      // Snap ball back to rest
      this.ballX = this._ballRestX;
      this.ballY = this._ballRestY;
      this.ball.setPosition(this.ballX, this.ballY);
      this.dragStart = null;
      return;
    }

    const power = Math.min(dist * DRAG_SCALE, MAX_POWER);
    const angle = Math.atan2(dy, dx);

    this.ballVX       = Math.cos(angle) * power * 880;
    this.ballVY       = Math.sin(angle) * power * 880;
    this.ballInFlight = true;
    this.dragStart    = null;

    // Raise ball above nets while in flight
    this.ball.setDepth(10);

    // Net shake on release
    this._impulseNet(this.currentBasket, this.ballX, this.ballY, 80);

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
    const step = 0.035;
    let px = this.ballX, py = this.ballY, pvx = vx, pvy = vy;

    // Premium glowing trajectory dots
    for (let i = 0; i < 24; i++) {
      pvy += GRAVITY * step;
      px  += pvx * step;
      py  += pvy * step;
      if (i % 2 === 0) {
        const t = i / 24;
        const alpha = (0.85 - t * 0.75);
        const radius = 4 - t * 1.5;
        // Outer glow
        this.dragLine.fillStyle(0xff6b35, alpha * 0.25);
        this.dragLine.fillCircle(px, py, radius * 2);
        // Core dot
        this.dragLine.fillStyle(0xffffff, alpha);
        this.dragLine.fillCircle(px, py, Math.max(radius, 1.2));
      }
    }

    // Power meter — premium glass bar
    const barW = Math.min(W * 0.32, 120);
    const barH = 6;
    const barX = this.ballX - barW / 2;
    const barY2 = this.ballY + 40;
    const barR = 3;

    // Track
    this.powerIndicator.fillStyle(0x000000, 0.6);
    this.powerIndicator.fillRoundedRect(barX - 1, barY2 - 1, barW + 2, barH + 2, barR);
    // Fill — color-coded
    const col = power < 0.4 ? 0x00e8a0 : power < 0.72 ? 0xffc400 : 0xff3355;
    this.powerIndicator.fillStyle(col, 0.95);
    this.powerIndicator.fillRoundedRect(barX, barY2, barW * power, barH, barR);
    // Shine
    this.powerIndicator.fillStyle(0xffffff, 0.25);
    this.powerIndicator.fillRoundedRect(barX, barY2, barW * power, barH * 0.45, { tl: barR, tr: barR, bl: 0, br: 0 });
    // End cap glow
    if (power > 0.05) {
      this.powerIndicator.fillStyle(col, 0.6);
      this.powerIndicator.fillCircle(barX + barW * power, barY2 + barH / 2, 5);
    }

    // Direction line from ball
    this.dragLine.lineStyle(2.5, 0xff6b35, 0.6);
    this.dragLine.lineBetween(this.ballX, this.ballY, this.ballX + Math.cos(angle) * 40, this.ballY + Math.sin(angle) * 40);
  }

  // ── YT CALLBACKS ──────────────────────────────────────────────────────────
  _setupYTCallbacks() {
    YTPlayables.onPause(() => { this.isPaused = true; this._saveProgress(); });
    YTPlayables.onResume(() => { this.isPaused = false; soundManager.resume(); });
    YTPlayables.onAudioEnabledChange(en => soundManager.setEnabled(en));
    soundManager.setEnabled(YTPlayables.isAudioEnabled());
  }

  // Pause/resume handled entirely by YouTube Playables SDK

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
      // soundManager.playHit();
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
      // soundManager.playHit();
      this._scoreTextPop(this.ballX, this.ballY - 30, '🛡️ BLOCKED!', '#4895ef');
      this._burst(this.ballX, this.ballY, 0x4895ef, 8);
      this.ballVX *= -0.5; this.ballVY *= -0.5;
      return;
    }
    // soundManager.playHit();
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

  // ======================================================================
  //  MOVING BASKET
  // ======================================================================

  /**
   * Start gentle horizontal oscillation on a basket.
   * Speed and range grow slowly with totalBaskets but stay playable.
   * baseX is the spawn X — basket oscillates around it.
   */
  _startBasketMovement(basket) {
    const stage        = this.totalBaskets - 5;           // 0 at basket 5
    const range        = Math.min(18 + Math.floor(stage / 4) * 6, 70);   // px, grows slowly
    const period       = Math.max(2800 - stage * 80, 1400);               // ms, speeds up slowly
    basket.moveRange   = range;
    basket.movePeriod  = period;
    basket.movePhase   = Math.random() * Math.PI * 2;     // random starting angle
    basket.baseX       = basket.x;
    basket.moveTime    = 0;
  }

  /**
   * Called every frame — updates basket.x, img.x, scoreZone.x along sine wave.
   */
  _stepBasketMovement(basket, dt) {
    if (!basket || !basket.moveRange) return;
    basket.moveTime += dt * 1000;
    const newX = basket.baseX + Math.sin(
      (basket.moveTime / basket.movePeriod) * Math.PI * 2 + basket.movePhase
    ) * basket.moveRange;
    basket.x           = newX;
    basket.img.x       = newX;
    basket.scoreZone.x = newX;
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
    const halfW = zone.halfW * 1.1;

    const hs      = this.hoopScale;
    const rimR    = RIM_RADIUS * hs;
    // Adjust cap and score-zone positions for basket tilt
    const tiltRad  = (tb.tiltDeg || 0) * (Math.PI / 180);
    const leftCap  = { x: tb.x - rimR * Math.cos(tiltRad), y: rimY - rimR * Math.sin(tiltRad) };
    const rightCap = { x: tb.x + rimR * Math.cos(tiltRad), y: rimY + rimR * Math.sin(tiltRad) };
    const ballR    = 22 * this.ballScale;
    const capR     = 5 * hs; // tighter — only fires when ball truly touches rim tube

    // Dandi collision — gated by cooldown so it only fires ONCE per contact
    if (this.ballVY > -100) {
      [leftCap, rightCap].forEach(cap => {
        const dx = this.ballX - cap.x;
        const dy = this.ballY - cap.y;
        const d  = Math.hypot(dx, dy);
        if (d < ballR + capR) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          const dot = this.ballVX * nx + this.ballVY * ny;
          this.ballVX = (this.ballVX - 2 * dot * nx) * 0.55;
          this.ballVY = (this.ballVY - 2 * dot * ny) * 0.55;
          this.ballX = cap.x + nx * (ballR + capR + 1);
          this.ballY = cap.y + ny * (ballR + capR + 1);
          this._impulseNet(tb, this.ballX, this.ballY, 120);
          // Only play sound once per rim contact (cooldown = 180ms)
          const now = Date.now();
        
            soundManager.playBounce();
        
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

    // ── Moving basket update
    this._stepBasketMovement(this.targetBasket, dt * slowFactor);

    // ── Draw nets ──────────────────────────────────────────────────────────
    this.netGraphics.clear();
    this.netFrontGraphics.clear();

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
        // soundManager.playHit();
        this._scoreTextPop(cur.x, cur.y - 30, '↩ SAFE', '#00f5d4');
        return;
      }

      this._checkScoreZone();

    } else if (!this.ballInsideNet) {
      // Ball resting or waiting — just update aim arrow
      this._updateAimArrow();
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