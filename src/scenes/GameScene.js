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

// ── Player rank tiers — basket count thresholds ──────────────────────────────
const RANK_TIERS = [
  { baskets:   0, name: 'BALLER',    color: 0xFFCA4527, hex: '#ca4527', icon: '🏀' },
  { baskets:  5, name: 'ROOKIE',    color: 0x00c896, hex: '#00c896', icon: '⭐' },
  { baskets:  25, name: 'HOOPER',    color: 0x4895ef, hex: '#4895ef', icon: '🔥' },
  { baskets:  45, name: 'SHARPSHOOTER', color: 0xf4a261, hex: '#f4a261', icon: '🏹' },
  { baskets:  70, name: 'CLUTCH',    color: 0xe040fb, hex: '#e040fb', icon: '💜' },
  { baskets: 100, name: 'ALL-STAR',  color: 0xffd700, hex: '#ffd700', icon: '🌟' },
  { baskets: 150, name: 'MVP',       color: 0xff6b35, hex: '#ff6b35', icon: '👑' },
  { baskets: 200, name: 'LEGEND',    color: 0xff2255, hex: '#ff2255', icon: '🏆' },
];

export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─────────────────────────────────────────────────────────────────────────
  create() {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this._fs = (frac, max = 999) => Math.min(Math.min(this.W, this.H) * frac, max);

    // State
    this.score        = 0;
    this._ballTweenId = 0;
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
    this.totalBaskets   = 0;
    this.basketMoveAxis = 'h'; // 'h' = left/right, 'v' = up/down — flips every 3 baskets
    this.trailDots     = [];
    this.trailTimer    = 0;
    this.scrollY       = 0;

    // Ball-inside-net state
    this.ballInsideNet   = false;  // true while ball is visually passing through net
    this.netBallBasket   = null;   // which basket's net the ball is inside

    // Player rank state
    this.currentRankIdx = 0;

    // Laser obstacle state
    this.laserObstacle      = null;   // active laser object or null
    this.nextLaserIn        = Phaser.Math.Between(2, 3); // spawn after this many baskets
    this.laserBasketsCount  = 0;      // baskets scored since last laser cleared

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

    if (this.textures.exists('bg')) {
      this.add.image(W / 2, H / 2, 'bg').setDisplaySize(W, H).setDepth(-20);
    } else {
      const bg = this.add.graphics().setDepth(-20);
      bg.fillStyle(0x050a14, 1);
      bg.fillRect(0, 0, W, H);
    }

    // Wall boundaries span the full screen width
    this.leftWallX  = 0;
    this.rightWallX = W;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  SPRING NET SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  _createNet(basket) {
    const hs        = this.hoopScale;
    const rimR      = RIM_RADIUS * hs;
    const rimWidth  = rimR * 2;
    const netHeight = 56 * hs;

    basket.net = {
      rimR, rimWidth, netHeight,
      shakeAmt: 0,
      shakeDecay: 0,
      dragOffsetX: 0,
      dragOffsetY: 0
    };

    const texKey = 'basket_net';
    if (this.textures.exists(texKey)) {
      const src = this.textures.get(texKey).source[0];
      const targetNetH  = rimWidth * 0.85;
      const netZoneFrac = 0.36;
      const scale       = targetNetH / (src.height * netZoneFrac);

      const imgBack = this.add.image(basket.x, basket.y, texKey)
        .setOrigin(0.5, 0.18)
        .setScale(scale)
        .setDepth(5)
        .setAlpha(1.0)
        .setTint(0xffffff)
        .setAngle(basket.tiltDeg || 0);

      const imgFront = this.add.image(basket.x, basket.y, texKey)
        .setOrigin(0.5, 0.18)
        .setScale(scale)
        .setDepth(9)
        .setAlpha(0)
        .setTint(0xffffff)
        .setAngle(basket.tiltDeg || 0);

      basket.netImg      = imgBack;
      basket.netImgFront = imgFront;
      basket.netBaseScale = scale;
    } else {
      basket.netImg      = null;
      basket.netImgFront = null;
      basket.netBaseScale = this.hoopScale;
    }
  }

  _netNode(basket, r, c) {
    const net    = basket.net;
    const rows   = NET_ROWS;
    const cols   = NET_COLS;
    const taper  = r / rows;
    const halfW  = (net.rimWidth / 2) * (1 - taper * 0.62);
    const t      = c / cols;
    const lx     = -halfW + t * halfW * 2;
    const ly     = taper * net.netHeight;

    const rad    = (basket.tiltDeg || 0) * (Math.PI / 180);
    const cosA   = Math.cos(rad);
    const sinA   = Math.sin(rad);
    const rx     = lx * cosA - ly * sinA;
    const ry     = lx * sinA + ly * cosA;

    const x      = basket.x + rx;
    const y      = basket.y + ry;
    const drag   = taper * taper;
    const shake  = net.shakeAmt * taper * Math.sin(c * 1.1 + r * 0.7);
    return {
      x: x + shake + net.dragOffsetX * drag,
      y: y        + net.dragOffsetY * drag
    };
  }

 _stepNet(basket, dt) {
  const net = basket.net;
  if (!net) return;

  if (this.dragStart && !this.ballInFlight && basket === this.currentBasket) {
    const rawDX = this.ballX - this._ballRestX;
    const rawDY = this.ballY - this._ballRestY;

    // Clamp drag offset so net deformation never visually exceeds the rim opening
    const rimPx   = RIM_RADIUS * this.hoopScale;
    const maxOff  = rimPx * 0.85;
    const offDist = Math.hypot(rawDX, rawDY);
    const offClamp = offDist > maxOff ? maxOff / offDist : 1;

    net.dragOffsetX = rawDX * offClamp;
    net.dragOffsetY = rawDY * offClamp;
  } else {
    net.dragOffsetX *= 0.88;
    net.dragOffsetY *= 0.88;
  }

  if (net.shakeAmt > 0) {
    net.shakeAmt -= net.shakeDecay * dt;
    if (net.shakeAmt < 0) net.shakeAmt = 0;
  }

  if (basket.netImg) {
    const shakeX = net.shakeAmt * Math.sin(Date.now() * 0.025) * 0.6;

    const isDragging = this.dragStart && !this.ballInFlight && basket === this.currentBasket;
    const dragTilt   = isDragging ? -net.dragOffsetX * 0.45 : 0;
    const shakeTilt  = net.shakeAmt * 0.3 * Math.sin(Date.now() * 0.018);
    const angle      = (basket.tiltDeg || 0) + dragTilt + shakeTilt;

    const baseS = basket.netBaseScale || this.hoopScale;
    if (isDragging) {
      const nx       = basket.x + net.dragOffsetX * 0.35 + shakeX;
      const pullDown = Math.max(net.dragOffsetY, 0);
      const pullUp   = Math.min(net.dragOffsetY, 0);

      // Clamp stretch so net image never grows beyond 1.3× base scale
      const stretchY  = Math.min(1 + pullDown * 0.008, 1.3);
      const squishY   = 1 + pullUp * 0.004;
      const scaleY    = baseS * stretchY * squishY;
      const scaleX    = baseS / Math.max(stretchY, 1) * 0.96 + baseS * 0.04;
      const ny        = basket.y + pullDown * 0.12;

      basket.netImg.x = nx;
      basket.netImg.y = ny;
      basket.netImg.setAngle(angle);
      basket.netImg.setScale(scaleX, scaleY);
      if (basket.netImgFront) {
        basket.netImgFront.x = nx;
        basket.netImgFront.y = ny;
        basket.netImgFront.setAngle(angle);
        basket.netImgFront.setScale(scaleX, scaleY);
      }
    } else {
      const relaxStretch = Math.min(1 + Math.max(net.dragOffsetY, 0) * 0.008, 1.3);
      const relaxScaleY  = baseS * relaxStretch;
      const relaxScaleX  = baseS / Math.max(relaxStretch, 1) * 0.96 + baseS * 0.04;

      basket.netImg.x = basket.x + shakeX;
      basket.netImg.y = basket.y + Math.max(net.dragOffsetY, 0) * 0.12;
      basket.netImg.setAngle(angle);
      basket.netImg.setScale(relaxScaleX, relaxScaleY);
      if (basket.netImgFront) {
        basket.netImgFront.x = basket.netImg.x;
        basket.netImgFront.y = basket.netImg.y;
        basket.netImgFront.setAngle(angle);
        basket.netImgFront.setScale(relaxScaleX, relaxScaleY);
      }
    }
  }
}

  _drawNet(basket, tintColor, alpha = 1) {
    // Net is now rendered as basket.png image — graphics layers kept for depth management only.
  }

  _impulseNet(basket, impactX, impactY, force = 280) {
    const net = basket.net;
    if (!net) return;
    net.shakeAmt   = Math.min(force * 0.04, 10);
    net.shakeDecay = net.shakeAmt * 4.5;
  }

  _resetNet(basket) {
    const net = basket.net;
    if (!net) return;
    net.shakeAmt   = 0;
    net.shakeDecay = 0;
  }

  // ── BASKETS ───────────────────────────────────────────────────────────────
  _initBaskets() {
    const { W, H } = this;
    const shortSide = Math.min(W, H);
    this.hoopScale  = Phaser.Math.Clamp(shortSide / 420, 0.75, 2.2) * 0.80;

    this.nextBasketSide = 0;

    const curX = W / 2;
    const curY = H * 0.75;
    this.currentBasket = this._makeBasket(curX, curY, 0x00f5d4, 0);

    const gap  = Phaser.Math.Between(BASKET_GAP_MIN, BASKET_GAP_MAX);
    const tgtY = curY - gap;
    const tgtX = this._nextBasketX();
    this.targetBasket = this._makeBasket(tgtX, tgtY, 0xff6b35, 0);

    this._pulseBasket(this.targetBasket);
  }

  _nextBasketX() {
    const { W } = this;
    const playW  = Math.min(W, 480 * this.hoopScale);
    const startX = (W - playW) / 2;
    const margin = playW * 0.12;
    const side   = this.nextBasketSide === 0 ? -1 : 1;
    this.nextBasketSide = 1 - this.nextBasketSide;
    if (side === -1) {
      return startX + Phaser.Math.Between(margin, playW * 0.38);
    } else {
      return startX + Phaser.Math.Between(playW * 0.62, playW - margin);
    }
  }

  _makeBasket(x, y, rimColor, tiltDeg = 0) {
    const img = this.add.image(x, y, 'hoop')
      .setScale(this.hoopScale)
      .setDepth(4)
      .setAlpha(0);
    img.setTint(rimColor);
    img.setAngle(tiltDeg);

    const basket = {
      img,
      x, y,
      rimColor,
      tiltDeg,
      scoreZone: { x, y: y, halfW: SCORE_HALF_W * this.hoopScale },
      net: null
    };
    this._createNet(basket);
    return basket;
  }

  _pulseBasket(basket) {
    const target    = basket.netImg || basket.img;
    const baseScale = basket.netBaseScale || this.hoopScale;
    this.tweens.add({
      targets: target,
      scaleX: baseScale * 1.05,
      scaleY: baseScale * 1.05,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _scrollWorldDown(dy) {
    [this.currentBasket, this.targetBasket].forEach(b => {
      b.y += dy;
      b.img.y += dy;
      b.scoreZone.y += dy;
      if (b.netImg)      b.netImg.y      += dy;
      if (b.netImgFront) b.netImgFront.y += dy;
      if (b.baseY !== undefined) b.baseY += dy;
    });
    if (!this.ballInFlight) { this.ballY += dy; this.ball.y = this.ballY; }
   
    this.scrollY += dy;
    this._scrollLaser(dy);
  }

  _advanceBaskets() {
    this.tweens.killTweensOf(this.currentBasket.img);
    const oldImg         = this.currentBasket.img;
    const oldNetImg      = this.currentBasket.netImg;
    const oldNetImgFront = this.currentBasket.netImgFront;
    this.tweens.add({ targets: oldImg, alpha: 0, y: oldImg.y + 30, duration: 350, onComplete: () => oldImg.destroy() });
    if (oldNetImg)      this.tweens.add({ targets: oldNetImg,      alpha: 0, y: oldNetImg.y      + 30, duration: 350, onComplete: () => oldNetImg.destroy() });
    if (oldNetImgFront) this.tweens.add({ targets: oldNetImgFront, alpha: 0, y: oldNetImgFront.y + 30, duration: 350, onComplete: () => oldNetImgFront.destroy() });

    this.currentBasket = this.targetBasket;
    this.currentBasket.img.setTint(0x00f5d4);
    if (this.currentBasket.netImg) {
      this.tweens.killTweensOf(this.currentBasket.netImg);
    }
    this.tweens.killTweensOf(this.currentBasket.img);
    this.currentBasket.img.setScale(this.hoopScale);

    const gap  = Phaser.Math.Between(BASKET_GAP_MIN, BASKET_GAP_MAX);
    const newY = this.currentBasket.y - gap;
    const newX = this._nextBasketX();

    let tiltDeg = 0;
    if (this.totalBaskets >= 3) {
      const maxTilt = Math.min(6 + Math.floor((this.totalBaskets - 3) / 3) * 2, 18);
      const dir     = newX > this.currentBasket.x ? 1 : -1;
      tiltDeg       = dir * Phaser.Math.FloatBetween(maxTilt * 0.5, maxTilt);
    }

    this.targetBasket = this._makeBasket(newX, newY, 0xff6b35, tiltDeg);
    this._pulseBasket(this.targetBasket);

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
  const img   = targetBasket.img;
  const rimY  = targetBasket.y;
  const exitY = rimY + 55 * this.hoopScale;

  this.ballInsideNet = true;
  this.netBallBasket = targetBasket;
  this.ball.setDepth(4);

  this._impulseNet(targetBasket, targetBasket.x, rimY + 10, 360);

  const netImg    = targetBasket.netImg;
  const baseS     = targetBasket.netBaseScale || this.hoopScale;
  const squashTarget = netImg || img;
  this.tweens.add({
    targets: squashTarget,
    scaleY: baseS * 1.18,
    scaleX: baseS * 0.92,
    duration: 80, ease: 'Power2', yoyo: true,
    onComplete: () => {
      this.tweens.add({
        targets: squashTarget,
        scaleX: baseS * 1.04,
        scaleY: baseS * 0.96,
        duration: 70, yoyo: true, ease: 'Power1',
        onComplete: () => {
          if (netImg) netImg.setScale(baseS);
          else img.setScale(this.hoopScale);
          if (onDone) onDone();
        }
      });
    }
  });

  // Track whether the ball tween sequence is still "owned" by this scoring event
  const tweenId = ++this._ballTweenId;   // unique stamp per score

  this.tweens.add({
    targets: this.ball,
    y: exitY,
    x: targetBasket.x + (this.ballVX > 0 ? 6 : -6),
    scaleX: this.ballScale * 0.78,
    scaleY: this.ballScale * 1.12,
    alpha: 0.75,
    duration: 180,
    ease: 'Power2',
    onComplete: () => {
      // Bail out if _resetBall already reclaimed the ball for the next shot
      if (this._ballTweenId !== tweenId) return;
      this.tweens.add({
        targets: this.ball,
        y: exitY + 20,
        scaleX: this.ballScale * 0.4,
        scaleY: this.ballScale * 0.4,
        alpha: 0,
        duration: 90,
        ease: 'Power2',
        onComplete: () => {
          if (this._ballTweenId !== tweenId) return;
          this.ball.setAlpha(0);
          this.ball.setDepth(4);
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
    const netHeight = 56 * this.hoopScale;
    this.ballX = this.currentBasket.x;
    this.ballY = this.currentBasket.y + netHeight * 0.65;
    this.ball = this.add.image(this.ballX, this.ballY, 'ball')
      .setScale(this.ballScale)
      .setDepth(4);
    this.dragLine       = this.add.graphics().setDepth(9);
    this.powerIndicator = this.add.graphics().setDepth(9);
  }

_resetBall(basket) {
  // Use the explicitly passed basket, fall back to currentBasket only as last resort
  const targetBasket = basket || this.currentBasket;

  // Kill any in-progress ball tweens so stale alpha/scale never carry over
  this.tweens.killTweensOf(this.ball);

  const netHeight = 56 * this.hoopScale;
  this.ballX = targetBasket.x;
  this.ballY = targetBasket.y + netHeight * 0.65;

  // Guard: if the computed Y is offscreen, something went wrong — clamp it
  const hudBottom = this._totalBarH ?? 60;
  const ballR     = 24 * this.ballScale;
  this.ballX = Phaser.Math.Clamp(this.ballX, (this.leftWallX ?? 0) + ballR, (this.rightWallX ?? this.W) - ballR);
  this.ballY = Phaser.Math.Clamp(this.ballY, hudBottom + ballR, this.H - ballR);

  this.ballVX = this.ballVY = 0;
  this.ballRotation = 0;
  this.ballInFlight = false;
  this.ballInsideNet = false;
  this.netBallBasket = null;

  this.ball
    .setPosition(this.ballX, this.ballY)
    .setAlpha(1)
    .setScale(this.ballScale)
    .setDepth(4)
    .setRotation(0);

  this.tweens.add({
    targets: this.ball,
    scaleX: this.ballScale * 1.22,
    scaleY: this.ballScale * 0.80,
    duration: 110,
    yoyo: true,
    ease: 'Power2'
  });
  soundManager.playBounce();
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
     fontFamily: '"Bebas Neue", Impact, sans-serif',
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

  // Force all HUD dimensions to absolute, crisp integers
  const barH      = Math.round(Math.min(H * 0.072, 52));
  const totalBarH = Math.round(barH + 10);
  const barPad    = 5;

  const roundedW  = Math.round(W);

  // ── 1. METALLIC BASE (Perfect integer boundaries) ─────────────────
  const hudBase = this.add.graphics().setDepth(D - 3).setScrollFactor(0);
  hudBase.fillGradientStyle(0x242e42, 0x242e42, 0x161d29, 0x161d29, 1, 1, 1, 1);
  hudBase.fillRect(0, 0, roundedW, totalBarH);

  // ── 2. HIGH-END TOP SHINE OVERLAY ──────────────────────────────────
  const hudShine = this.add.graphics().setDepth(D - 2).setScrollFactor(0);
  hudShine.fillRect(0, 0, roundedW, totalBarH);

  // 1px flat fill rectangle replaces lineBetween to avoid sub-pixel line blurring
  hudShine.fillStyle(0xffffff, 0.25);
  hudShine.fillRect(0, 0, roundedW, 1);

  // ── 3. CHROME PINSTRIPE BOTTOM BORDERS ─────────────────────────────
  const hudBorder = this.add.graphics().setDepth(D - 2).setScrollFactor(0);
  
  // Upper 1px crisp glass edge accent
  hudBorder.fillStyle(0xe2ecfc, 0.6);
  hudBorder.fillRect(0, totalBarH - 2, roundedW, 1);
  
  // Lower 1px grounding shadow row
  hudBorder.fillStyle(0x0c111a, 0.7);
  hudBorder.fillRect(0, totalBarH - 1, roundedW, 1);

  // ── 4. SOFT DROP SHADOW ────────────────────────────────────────────
  const hudShadow = this.add.graphics().setDepth(D - 4).setScrollFactor(0);
  hudShadow.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.4, 0.4, 0.0, 0.0);
  hudShadow.fillRect(0, totalBarH, roundedW, 12);

  // ── 5. ULTRA-CRISP BLACK GLASS (OBSIDIAN) SCORE PILL ───────────────
  // All internal pill layout variables explicitly rounded to avoid float values
  const scorePillW  = Math.round(Math.min(W * 0.34, 140));
  const scorePillH  = Math.round(totalBarH * 0.80);
  const scorePillX  = Math.round(W / 2 - scorePillW / 2);
  const scorePillY  = Math.round((totalBarH - scorePillH) / 2);
  const scorePillCY = Math.round(scorePillY + scorePillH / 2);
  const scorePillR  = Math.round(scorePillH / 2);

  const scorePillG = this.add.graphics().setDepth(D - 1).setScrollFactor(0);
  
  // A. Deep Black Obsidian Glass Base
  scorePillG.fillGradientStyle(0x111116, 0x111116, 0x020204, 0x020204, 0.95, 0.95, 0.98, 0.98);
  scorePillG.fillRoundedRect(scorePillX, scorePillY, scorePillW, scorePillH, scorePillR);

  // B. Inner Silver-White Specular Edge (Snapped 1px inside outer bound)
  scorePillG.lineStyle(1, 0xffffff, 0.22);
  scorePillG.strokeRoundedRect(scorePillX + 1, scorePillY + 1, scorePillW - 2, scorePillH - 2, scorePillR - 1);

  // C. Upper Frosted High-Gloss Reflection
  scorePillG.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.16, 0.16, 0.0, 0.0);
  scorePillG.fillRoundedRect(scorePillX + 1, scorePillY + 1, scorePillW - 2, Math.round(scorePillH / 2), {
    tl: scorePillR - 1,
    tr: scorePillR - 1,
    bl: 0,
    br: 0
  });

  // D. Grounding Outer Shadow Ring
  scorePillG.lineStyle(1, 0x000000, 0.75);
  scorePillG.strokeRoundedRect(scorePillX, scorePillY, scorePillW, scorePillH, scorePillR);

  // ── 6. TEXT RENDERING AND CRISP PIXEL ALIGNMENT ────────────────────
  const labelSize = Math.round(Math.max(Math.min(S * 0.032, 10), 11));
  
  this.add.text(W / 2, Math.round(scorePillY + 3), 'SCORE', {
    fontFamily: '"Bebas Neue", Impact, sans-serif',
    fontSize: `${labelSize}px`,
    color: '#eaedf4',
    letterSpacing: 3,
  }).setOrigin(0.5, 0).setDepth(D).setScrollFactor(0);

  const numSize = Math.round(Math.min(fs(0.045, 17), scorePillH * 0.55));

  this.scoreText = this.add.text(W / 2, Math.round(scorePillCY + 6), '0', {
    fontFamily: '"Bebas Neue", Impact, sans-serif',
    fontSize: `${numSize}px`,
    color: '#ffffff',
  })
  .setOrigin(0.5, 0.5)
  .setDepth(D)
  .setScrollFactor(0);

  // ── 7. LIVES AND ASSET INITIALIZATION (Perfectly aligned centers) ──
  const hSize   = Math.round(Math.min(totalBarH * 0.52, 22));
  const hGap    = Math.round(hSize * 0.55);
  const hStartX = Math.round(Math.max(W * 0.022, 10));
  const hCY     = Math.round(totalBarH / 2);

  this._livesHSize   = hSize;
  this._livesHGap    = hGap;
  this._livesHStartX = hStartX;
  this._livesHCY     = hCY;
  this._livesD       = D;
  this.heartGraphics = [];

  this._refreshHearts();

  // Snapped combo text Y anchor position
  this.comboText = this.add.text(W / 2, Math.round(totalBarH + 8), '', {
    fontFamily: '"Bebas Neue", Impact, sans-serif',
    fontSize: `${Math.round(fs(0.052, 22))}px`,
    color: '#ffd700',
    stroke: '#7a4400', strokeThickness: 3,
    shadow: { color: '#ffaa00', blur: 18, fill: true }
  }).setOrigin(0.5).setDepth(D).setAlpha(0).setScrollFactor(0);

  this.aimArrow = this.add.image(0, 0, 'arrow').setAlpha(0).setScale(0.65).setDepth(D - 1);

  // ── RANK PILL ──────────────────────────────────────────────────────
  this._totalBarH = totalBarH;
  this._rankD     = D;
  this._buildRankPill();
}

  // ── RANK SYSTEM ──────────────────────────────────────────────────────────

  _getCurrentRank() {
    let rank = RANK_TIERS[0];
    for (const tier of RANK_TIERS) {
      if (this.totalBaskets >= tier.baskets) rank = tier;
      else break;
    }
    return rank;
  }

  _buildRankPill() {
    const { W }   = this;
    const barH    = this._totalBarH;
    const D       = this._rankD;
    const S       = Math.min(W, this.H);

    // ── Sizing — all clamped so nothing overflows on 320px portrait screens ─
    const pillH   = Phaser.Math.Clamp(barH * 0.64, 18, 38);
    const pillR   = pillH / 2;
    const marginR = Math.max(W * 0.022, 6);

    // Max width the rank pill is allowed to occupy (right side of HUD)
    // Hearts sit on the left (~30% of W), score pill in centre (~34%).
    // Give rank the remaining right slice, capped so it never touches centre.
    const scorePillHalfW = Math.min(W * 0.17, 70);
    const maxPillW = W / 2 - scorePillHalfW - marginR - 4;

    // Font sizes — responsive + hard floor so text is always readable
   const nameSize  = Phaser.Math.Clamp(S * 0.034, 10, 14);
    const iconSize  = Phaser.Math.Clamp(S * 0.028, 9, 13);

    const rank = RANK_TIERS[this.currentRankIdx];

    this._rankPillG = this.add.graphics().setDepth(D - 1).setScrollFactor(0);

    const pillCY = barH / 2;
    this._rankIcon = this.add.text(0, pillCY, rank.icon, {
      fontFamily: 'Arial, sans-serif',
      fontSize:   `${iconSize}px`,
    }).setOrigin(0, 0.5).setDepth(D).setScrollFactor(0);

    this._rankName = this.add.text(0, pillCY, rank.name, {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize:   `${nameSize}px`,
      color:      rank.hex,
    }).setOrigin(0, 0.5).setDepth(D).setScrollFactor(0);

    // Store all sizing constants for redraws
    this._rankPillH   = pillH;
    this._rankPillR   = pillR;
    this._rankMarginR = marginR;
    this._rankMaxW    = maxPillW;
    this._rankIconSz  = iconSize;
    this._rankNameSz  = nameSize;

    this._redrawRankPill(rank, false);
  }

  _redrawRankPill(rank, animate = true) {
    const { W }   = this;
    const barH    = this._totalBarH;
    const pillH   = this._rankPillH;
    const pillR   = this._rankPillR;
    const marginR = this._rankMarginR;
    const maxW    = this._rankMaxW;
    const D       = this._rankD;
    const pillCY  = barH / 2;

    this._rankName.setText(rank.name);
    this._rankIcon.setText(rank.icon);

    // Inner padding scales with pill height
    const padX  = pillH * 0.45;
    const gap   = pillH * 0.22;
    const iconW = this._rankIcon.width;
    const nameW = this._rankName.width;

    // If full pill (icon + name) fits inside maxW → show both
    // Otherwise icon-only pill (always fits)
    const fullW = padX * 2 + iconW + gap + nameW;
    const showName = fullW <= maxW;

    let pillW, contentX;
    if (showName) {
      pillW    = fullW;
      contentX = W - marginR - pillW + padX;
      this._rankName.setVisible(true);
      this._rankName.setStyle({ color: rank.hex });
    } else {
      // Icon-only mode — square-ish pill
      pillW    = padX * 2 + iconW;
      contentX = W - marginR - pillW + padX;
      this._rankName.setVisible(false);
    }

    const pillX = W - marginR - pillW;

    this._rankIcon.setPosition(contentX, pillCY);
    if (showName) {
      this._rankName.setPosition(contentX + iconW + gap, pillCY);
    }

    // ── Draw pill ──────────────────────────────────────────────────────────
    const g = this._rankPillG;
    g.clear();

    // Outer glow ring
    g.lineStyle(3, rank.color, 0.20);
    g.strokeRoundedRect(pillX - 2, pillCY - pillH / 2 - 2, pillW + 4, pillH + 4, pillR + 2);

    // Dark fill
    g.fillStyle(0x06080c, 0.94);
    g.fillRoundedRect(pillX, pillCY - pillH / 2, pillW, pillH, pillR);

    // Colored border
    g.lineStyle(1.5, rank.color, 0.90);
    g.strokeRoundedRect(pillX, pillCY - pillH / 2, pillW, pillH, pillR);

    // Top shine
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(pillX + 2, pillCY - pillH / 2 + 2, pillW - 4, pillH * 0.36,
      { tl: pillR, tr: pillR, bl: 0, br: 0 });

    if (animate) {
      [this._rankPillG, this._rankIcon, this._rankName].forEach(obj => {
        obj.setAlpha(0);
        this.tweens.add({
          targets: obj, alpha: 1,
          scaleX: { from: 1.2, to: 1 }, scaleY: { from: 1.2, to: 1 },
          duration: 300, ease: 'Back.easeOut'
        });
      });
    }
  }

  _updateRank() {
    const newIdx = RANK_TIERS.reduce((best, tier, i) =>
      this.totalBaskets >= tier.baskets ? i : best, 0);

    if (newIdx <= this.currentRankIdx) return;
    this.currentRankIdx = newIdx;
    const rank = RANK_TIERS[newIdx];

    this._redrawRankPill(rank, true);

    // Big rank-up announcement
    const S    = Math.min(this.W, this.H);
    const popY = this._totalBarH + S * 0.12;
    const line1 = this.add.text(this.W / 2, popY, `${rank.icon} RANK UP!`, {
     fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize:   `${Math.min(S * 0.075, 34)}px`,
      color:      rank.hex,
      stroke:     '#000000', strokeThickness: 5,
      shadow:     { color: rank.hex, blur: 20, fill: true },
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    const line2 = this.add.text(this.W / 2, popY + Math.min(S * 0.085, 38), rank.name, {
     fontFamily: '"Bebas Neue", Impact, sans-serif',
    fontSize: `${Math.min(S * 0.08, 42)}px`,
    color: '#ffffff',
    stroke: '#000000',
    strokeThickness: 4,
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    this.tweens.add({ targets: line1, alpha: 1, y: popY - 10, duration: 280, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line2, alpha: 1, duration: 280, delay: 80, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.time.delayedCall(1100, () => {
          this.tweens.add({ targets: [line1, line2], alpha: 0, y: `-=22`, duration: 380, ease: 'Power2',
            onComplete: () => { line1.destroy(); line2.destroy(); }
          });
        });
      }
    });

    // Burst particles in rank color
    this._burst(this.W / 2, popY, rank.color, 18);
  }

  // ── GLASS HEART DRAW HELPER ───────────────────────────────────────────────
 _drawGlassHeart(g, cx, cy, size, active) {
    const s = size * 0.5;

    const pts = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const hx = cx + s * 0.95 * (Math.pow(Math.sin(t), 3));
      const hy = cy + s * 0.90 * -(
        0.8125 * Math.cos(t) -
        0.3125 * Math.cos(2 * t) -
        0.125  * Math.cos(3 * t) -
        0.0625 * Math.cos(4 * t)
      ) + s * 0.08;
      pts.push({ x: hx, y: hy });
    }

    if (active) {
      // Shadow (Unchanged)
      g.fillStyle(0x000000, 0.45);
      const shadowPts = pts.map(p => ({ x: p.x + 1.5, y: p.y + 2 }));
      g.fillPoints(shadowPts, true);

      // --- NEW SHARP SHOOTER COLOR SCHEME (ca4527) ---
      
      // 1. Base Layer (Darker rust tone for depth)
      g.fillStyle(0x9E2A11, 1); 
      g.fillPoints(pts, true);

      // 2. Mid Layer (Aapka exact requested color: ca4527)
      g.fillStyle(0xCA4527, 1); 
      const midPts = pts.map(p => ({ x: cx + (p.x - cx) * 0.82, y: cy + (p.y - cy) * 0.82 }));
      g.fillPoints(midPts, true);

      // 3. Core Layer (Brighter orange highlight for the inner glow)
      g.fillStyle(0xFA6341, 1); 
      const corePts = pts.map(p => ({ x: cx + (p.x - cx) * 0.55, y: cy + (p.y - cy) * 0.55 }));
      g.fillPoints(corePts, true);

      // 4. Glass Reflections (White highlights kept for shiny effect)
      g.fillStyle(0xffffff, 0.70);
      g.fillEllipse(cx - s * 0.22, cy - s * 0.28, s * 0.50, s * 0.28);

      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(cx - s * 0.28, cy - s * 0.32, s * 0.10);

      // 5. Outer Outline/Stroke (Matching bright border)
      g.lineStyle(1.5, 0xFF7D5C, 0.55); 
      g.strokePoints(pts, true);

    } else {
      // Inactive State (Deactivated gray/dark heart remains unchanged)
      g.fillStyle(0x1e2430, 1);
      g.fillPoints(pts, true);

      g.fillStyle(0x141820, 1);
      const innerPts = pts.map(p => ({ x: cx + (p.x - cx) * 0.72, y: cy + (p.y - cy) * 0.72 }));
      g.fillPoints(innerPts, true);

      g.lineStyle(1, 0x2e3848, 0.85);
      g.strokePoints(pts, true);

      g.fillStyle(0xffffff, 0.08);
      g.fillEllipse(cx - s * 0.18, cy - s * 0.26, s * 0.42, s * 0.22);
    }
}

  _refreshHearts() {
    if (this.heartGraphics) {
      this.heartGraphics.forEach(g => g.destroy());
    }
    this.heartGraphics = [];

    if (this.livesContainer) {
      this.livesContainer.destroy();
      this.livesContainer = null;
    }
    this.heartIcons = [];

    const hSize  = this._livesHSize  ?? 22;
    const hGap   = this._livesHGap   ?? 12;
    const startX = this._livesHStartX ?? 10;
    const hCY    = this._livesHCY    ?? 30;
    const D      = this._livesD      ?? 50;

    for (let i = 0; i < 3; i++) {
      const cx = startX + hSize / 2 + i * (hSize + hGap);
      const g  = this.add.graphics().setDepth(D).setScrollFactor(0);
      this._drawGlassHeart(g, cx, hCY, hSize, i < this.lives);
      this.heartGraphics.push(g);
    }
  }

  _updateScoreUI() {
    this.scoreText.setText(this.score.toString());
    this.tweens.add({ targets: this.scoreText, scaleX: 1.3, scaleY: 1.3, duration: 100, yoyo: true });
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
  }

  _onPointerDown(ptr) {
    if (this.isPaused || this.isGameOver || this.ballInFlight) return;
    this.dragStart = { x: ptr.x, y: ptr.y };
    this._ballRestX = this.ballX;
    this._ballRestY = this.ballY;
    soundManager.resume();
  }

 _onPointerMove(ptr) {
  if (!this.dragStart || this.isPaused || this.isGameOver || this.ballInFlight) return;

  const rawDX = ptr.x - this.dragStart.x;
  const rawDY = ptr.y - this.dragStart.y;
  const dist  = Math.hypot(rawDX, rawDY);

  // Clamp pull distance to a max that keeps ball inside the rim visually
  // RIM_RADIUS * hoopScale gives the actual rim opening in screen pixels
  const rimPx  = RIM_RADIUS * this.hoopScale;        // ~half the hoop opening
  const maxPull = Math.min(80, rimPx * 0.85);         // never exceed 85% of rim radius
  const clamp  = dist > maxPull ? maxPull / dist : 1;

  const clampedDX = rawDX * clamp;
  const clampedDY = rawDY * clamp;

  // Ball position stays within rim circle centred on rest position
  this.ballX = this._ballRestX + clampedDX;
  this.ballY = this._ballRestY + clampedDY;

  // Additionally clamp to wall + HUD boundaries
  const ballR  = 24 * this.ballScale;
  const minX   = (this.leftWallX  ?? 0)       + ballR;
  const maxX   = (this.rightWallX ?? this.W)  - ballR;
  const minY   = (this._totalBarH ?? 60)      + ballR;
  const maxY   = this.H - ballR;
  this.ballX   = Phaser.Math.Clamp(this.ballX, minX, maxX);
  this.ballY   = Phaser.Math.Clamp(this.ballY, minY, maxY);

  this.ball.setPosition(this.ballX, this.ballY).setRotation(0);
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

    this.ball.setDepth(10);

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

    for (let i = 0; i < 24; i++) {
      pvy += GRAVITY * step;
      px  += pvx * step;
      py  += pvy * step;
      if (i % 2 === 0) {
        const t = i / 24;
        const alpha = (0.85 - t * 0.75);
        const radius = 4 - t * 1.5;
        this.dragLine.fillStyle(0xff6b35, alpha * 0.25);
        this.dragLine.fillCircle(px, py, radius * 2);
        this.dragLine.fillStyle(0xffffff, alpha);
        this.dragLine.fillCircle(px, py, Math.max(radius, 1.2));
      }
    }

    const barW = Math.min(W * 0.32, 120);
    const barH = 6;
    const barX = this.ballX - barW / 2;
    const barY2 = this.ballY + 40;
    const barR = 3;

    this.powerIndicator.fillStyle(0x000000, 0.6);
    this.powerIndicator.fillRoundedRect(barX - 1, barY2 - 1, barW + 2, barH + 2, barR);
    const col = power < 0.4 ? 0x00e8a0 : power < 0.72 ? 0xffc400 : 0xff3355;
    this.powerIndicator.fillStyle(col, 0.95);
    this.powerIndicator.fillRoundedRect(barX, barY2, barW * power, barH, barR);
    this.powerIndicator.fillStyle(0xffffff, 0.25);
    this.powerIndicator.fillRoundedRect(barX, barY2, barW * power, barH * 0.45, { tl: barR, tr: barR, bl: 0, br: 0 });
    if (power > 0.05) {
      this.powerIndicator.fillStyle(col, 0.6);
      this.powerIndicator.fillCircle(barX + barW * power, barY2 + barH / 2, 5);
    }

    this.dragLine.lineStyle(2.5, 0xff6b35, 0.6);
    this.dragLine.lineBetween(this.ballX, this.ballY, this.ballX + Math.cos(angle) * 40, this.ballY + Math.sin(angle) * 40);
  }

  // ── YT CALLBACKS ──────────────────────────────────────────────────────────
  _setupYTCallbacks() {
    YTPlayables.onPause(() => {
      this.isPaused = true;
      soundManager.setEnabled(false);
      this._saveProgress();
    });
    YTPlayables.onResume(() => {
      this.isPaused = false;
      soundManager.setEnabled(YTPlayables.isAudioEnabled());
      soundManager.resume();
    });
    YTPlayables.onAudioEnabledChange(en => soundManager.setEnabled(en));
    soundManager.setEnabled(YTPlayables.isAudioEnabled());
  }

  // ── SCORING & GAME FLOW ───────────────────────────────────────────────────
 _onScore() {
  this.totalBaskets++;
  this.combo++;

  if (this.totalBaskets % 3 === 0) {
    this.basketMoveAxis = this.basketMoveAxis === 'h' ? 'v' : 'h';
    if (this.targetBasket && this.targetBasket.moveRange) {
      this.targetBasket.moveAxis      = this.basketMoveAxis;
      this.targetBasket.moveCycleTime = 0;
      this.targetBasket.x             = this.targetBasket.baseX;
      this.targetBasket.img.x         = this.targetBasket.baseX;
      this.targetBasket.scoreZone.x   = this.targetBasket.baseX;
      this.targetBasket.y             = this.targetBasket.baseY;
      this.targetBasket.img.y         = this.targetBasket.baseY;
      this.targetBasket.scoreZone.y   = this.targetBasket.baseY;
    }
  }
  this.comboTimer = 3.5;

  const multiplier = Math.min(this.combo, 8);
  const points     = 1 * multiplier;
  this.score      += points;
  this.difficulty  = 1 + Math.floor(this.score / 5);

  this._updateScoreUI();
  this._updateRank();
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

  if (this.laserObstacle) {
    this._clearLaser(true);
  } else {
    this.laserBasketsCount++;
    if (this.laserBasketsCount >= this.nextLaserIn) {
      this._pendingLaserSpawn = true;
    }
  }

  this._animateBallThroughBasket(this.targetBasket, () => {
    if (!this.isGameOver) {
      this._advanceBaskets();
      if (this._pendingLaserSpawn) {
        this._pendingLaserSpawn = false;
        this.time.delayedCall(300, () => { if (!this.isGameOver) this._spawnLaser(); });
      }
      // ── Capture the CURRENT basket reference NOW, immediately after
      // _advanceBaskets(), before any async delay can change it again.
      const basketForReset = this.currentBasket;
      this.time.delayedCall(120, () => {
        if (!this.isGameOver) this._resetBall(basketForReset);
      });
    }
  });
}

  _onMiss() {
    this.combo = 0; this.comboTimer = 0;
    this.comboText.setAlpha(0);
    this.lives--;
    this._refreshHearts();
    soundManager.playMiss();
    this.cameras.main.shake(120, 0.012);
    this.ballInsideNet = false;
    this.netBallBasket = null;
    this.ball.setDepth(4).setAlpha(1);
    if (this.lives <= 0) this._gameOver();
    else this.time.delayedCall(350, () => { if (!this.isGameOver)  this._resetBall(this.currentBasket); });
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

  _startBasketMovement(basket) {
    const stage          = this.totalBaskets - 5;
    const range          = Math.min(18 + Math.floor(stage / 4) * 6, 70);
    const period         = Math.max(2800 - stage * 80, 1400);
    basket.moveRange     = range;
    basket.movePeriod    = period;
    basket.baseX         = basket.x;
    basket.baseY         = basket.y;
    basket.moveCycleTime = 0;
    basket.moveAxis      = this.basketMoveAxis;
  }

  _stepBasketMovement(basket, dt) {
    if (!basket || !basket.moveRange) return;

    basket.moveCycleTime += dt * 1000;
    const t = (basket.moveCycleTime / basket.movePeriod) * Math.PI * 2;

    basket.moveAxis = this.basketMoveAxis;

    if (basket.moveAxis === 'h') {
      basket.x           = basket.baseX + Math.sin(t) * basket.moveRange;
      basket.img.x       = basket.x;
      basket.scoreZone.x = basket.x;
      basket.y           = basket.baseY;
      basket.img.y       = basket.baseY;
      basket.scoreZone.y = basket.baseY;
    } else {
      const hudBottom = this.H * 0.09;
      const maxUp     = Math.max(basket.baseY - hudBottom - 30, 0);
      const vRange    = Math.min(basket.moveRange * 0.65, maxUp, 40);
      basket.y           = basket.baseY + Math.sin(t) * vRange;
      basket.img.y       = basket.y;
      basket.scoreZone.y = basket.y;
      basket.x           = basket.baseX;
      basket.img.x       = basket.baseX;
      basket.scoreZone.x = basket.baseX;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  COLLISION CHECKS
  // ══════════════════════════════════════════════════════════════════════════

  _checkScoreZone() {
    const tb    = this.targetBasket;
    const zone  = tb.scoreZone;
    const rimY  = zone.y;
    const hs    = this.hoopScale;
    const rimR  = RIM_RADIUS * hs;
    const ballR = 22 * this.ballScale;
    const capR  = 7 * hs;

    const checkRimCaps = (basket, applyImpulse) => {
      const tiltRad  = (basket.tiltDeg || 0) * (Math.PI / 180);
      const bRimY    = basket.scoreZone.y;
      const leftCap  = { x: basket.x - rimR * Math.cos(tiltRad), y: bRimY - rimR * Math.sin(tiltRad) };
      const rightCap = { x: basket.x + rimR * Math.cos(tiltRad), y: bRimY + rimR * Math.sin(tiltRad) };

      [leftCap, rightCap].forEach(cap => {
        const dx = this.ballX - cap.x;
        const dy = this.ballY - cap.y;
        const d  = Math.hypot(dx, dy);
        if (d < ballR + capR) {
          const nx  = dx / (d || 1);
          const ny  = dy / (d || 1);
          const dot = this.ballVX * nx + this.ballVY * ny;
          if (dot < 0) {
            this.ballVX = (this.ballVX - 2 * dot * nx) * 0.55;
            this.ballVY = (this.ballVY - 2 * dot * ny) * 0.55;
            this.ballX  = cap.x + nx * (ballR + capR + 1);
            this.ballY  = cap.y + ny * (ballR + capR + 1);
            if (applyImpulse) this._impulseNet(basket, this.ballX, this.ballY, 120);
            soundManager.playBounce();
          }
        }
      });
    };

    checkRimCaps(tb, true);
    checkRimCaps(this.currentBasket, false);

    const halfW = zone.halfW * 0.75;

    const tiltRad   = (tb.tiltDeg || 0) * (Math.PI / 180);
    const leftCapX  = tb.x - rimR * Math.cos(tiltRad);
    const leftCapY  = rimY  - rimR * Math.sin(tiltRad);
    const rightCapX = tb.x + rimR * Math.cos(tiltRad);
    const rightCapY = rimY  + rimR * Math.sin(tiltRad);
    const clearOfRims =
      Math.hypot(this.ballX - leftCapX,  this.ballY - leftCapY)  > ballR + capR + 2 &&
      Math.hypot(this.ballX - rightCapX, this.ballY - rightCapY) > ballR + capR + 2;

    if (this.ballVY > 0 &&
        clearOfRims &&
        Math.abs(this.ballX - zone.x) < halfW &&
        this.ballY > rimY - 14 &&
        this.ballY < rimY + 30) {
      this.ballInFlight = false;
      this._onScore();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  UPDATE LOOP
  // ══════════════════════════════════════════════════════════════════════════
  update(time, delta) {
    if (this.isPaused || this.isGameOver) return;

    const dt = Math.min(delta / 1000, 0.05);
    this.frameCount++;

    // Combo decay
    if (this.combo > 0 && this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.tweens.add({ targets: this.comboText, alpha: 0, duration: 300 }); }
    }

    // ── Net physics step (both baskets every frame) ─────────────────────────
    this._stepNet(this.currentBasket, dt);
    this._stepNet(this.targetBasket,  dt);

    // ── Moving basket update
    this._stepBasketMovement(this.targetBasket, dt);

    // ── Draw nets ──────────────────────────────────────────────────────────────────────
    const netNeedsRedraw =
      this.ballInFlight ||
      this.currentBasket.net.shakeAmt > 0.05 ||
      Math.abs(this.currentBasket.net.dragOffsetX) > 0.5 ||
      Math.abs(this.currentBasket.net.dragOffsetY) > 0.5 ||
      this.targetBasket.net.shakeAmt > 0.05 ||
      !!this.targetBasket.moveRange ||
      this.frameCount % 4 === 0;

    if (netNeedsRedraw) {
      this.netGraphics.clear();
      this.netFrontGraphics.clear();
      this._drawNet(this.currentBasket, 0x00e8c0, 0.75);
      this._drawNet(this.targetBasket,  0xff7a20, 0.92);
    }

    // ── Laser obstacle — draw + collision ──────────────────────────────────
    this._drawLaser();
    this._checkLaserHit();

    // ── Ball physics ───────────────────────────────────────────────────────
    if (this.ballInFlight) {
      this.ballVY += GRAVITY * dt;
      this.ballX  += this.ballVX * dt;
      this.ballY  += this.ballVY * dt;
      this.ball.setPosition(this.ballX, this.ballY);

      // Trail
      this.trailTimer += dt;
      if (this.trailTimer >= 0.04) { this.trailTimer = 0; this._addTrailDot(this.ballX, this.ballY); }

      // Ceiling bounce
      if (this.ballY < 30) {
        this.ballY = 30;
        this.ballVY = Math.abs(this.ballVY) * 0.65;
      }

      // Wall bounce
      const r = 24 * this.ballScale;
      const leftWall  = (this.leftWallX  ?? 0)      + r;
      const rightWall = (this.rightWallX ?? this.W) - r;
      if (this.ballX < leftWall) {
        this.ballX  = leftWall;
        this.ballVX = Math.abs(this.ballVX) * 0.72;
        this._wallImpactFlash('left');
      }
      if (this.ballX > rightWall) {
        this.ballX  = rightWall;
        this.ballVX = -Math.abs(this.ballVX) * 0.72;
        this._wallImpactFlash('right');
      }

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
        this.ballInFlight = false;
        this._impulseNet(cur, this.ballX, cur.y + 10, 120);
        this.tweens.add({ targets: this.ball, y: cur.y - 20, scaleX: this.ballScale * 1.1, scaleY: this.ballScale * 0.9, duration: 80, yoyo: true, ease: 'Power2', onComplete: () => {
          if (!this.isGameOver) this._resetBall();
        }});
        this._scoreTextPop(cur.x, cur.y - 30, '↩ SAFE', '#00f5d4');
        return;
      }

      this._checkScoreZone();

    } else if (!this.ballInsideNet) {
      this._updateAimArrow();
    }
  }

  _wallImpactFlash(side) {
    soundManager.playBounce();
    const flashX = side === 'left' ? this.leftWallX + 4 : this.rightWallX - 4;
    const flashY = this.ballY;

    for (let i = 0; i < 5; i++) {
      const angle = side === 'left'
        ? Phaser.Math.FloatBetween(-Math.PI * 0.5, Math.PI * 0.5)
        : Phaser.Math.FloatBetween(Math.PI * 0.5, Math.PI * 1.5);
      const spd = Phaser.Math.FloatBetween(25, 70);
      const col = Phaser.Math.Between(0, 1) === 0 ? 0x40485a : 0x20252e;
      const p   = this.add.circle(flashX, flashY, Phaser.Math.FloatBetween(2, 4), col, 1).setDepth(18);
      this.tweens.add({
        targets: p,
        x: flashX + Math.cos(angle) * spd,
        y: flashY + Math.sin(angle) * spd + 12,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(200, 380), ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LASER OBSTACLE SYSTEM
  // ══════════════════════════════════════════════════════════════════════════

  _spawnLaser() {
    if (this.laserObstacle) return;

    const cur    = this.currentBasket;
    const tgt    = this.targetBasket;
    const laserY = cur.y + (tgt.y - cur.y) * 0.52;
    const lx1    = this.leftWallX  ?? 0;
    const lx2    = this.rightWallX ?? this.W;

    const glow   = this.add.graphics().setDepth(15);
    const beam   = this.add.graphics().setDepth(16);
    const center = this.add.graphics().setDepth(17);

    this.laserObstacle = {
      glow, beam, center,
      warnText: null,
      y: laserY, x1: lx1, x2: lx2,
      hitCooldown: 0,
      beamVisible: true,
      beamOn: true,
      onDuration:  800,   // ms beam stays ON
      offDuration: 700,   // ms beam stays OFF — safe window to cross
      blinkTimer:  0,
    };
  }

  _drawLaser() {
    const L = this.laserObstacle;
    if (!L || !L.beamOn) return;

    // Advance blink timer using Phaser loop delta
    const dt = this.game.loop.delta;
    L.blinkTimer += dt;
    const phase = L.beamVisible ? L.onDuration : L.offDuration;
    if (L.blinkTimer >= phase) {
      L.blinkTimer  = 0;
      L.beamVisible = !L.beamVisible;
    }

    const { glow, beam, center, y, x1, x2 } = L;
    glow.clear(); beam.clear(); center.clear();

    // Beam is OFF — nothing drawn, collision also disabled (see _checkLaserHit)
    if (!L.beamVisible) return;

    // Outer soft glow
    glow.lineStyle(16, 0xff0044, 0.09);
    glow.lineBetween(x1, y, x2, y);
    glow.lineStyle(9, 0xff0044, 0.20);
    glow.lineBetween(x1, y, x2, y);

    // Mid beam
    beam.lineStyle(4.5, 0xff2255, 0.80);
    beam.lineBetween(x1, y, x2, y);

    // Hot white core
    center.lineStyle(1.5, 0xffffff, 1.0);
    center.lineBetween(x1, y, x2, y);

    // End-cap ticks
    const capH = 8;
    [x1, x2].forEach(cx => {
      center.lineStyle(2.5, 0xff2255, 1.0);
      center.lineBetween(cx, y - capH, cx, y + capH);
    });
  }

  /** Check ball-laser collision each frame */
  _checkLaserHit() {
    const L = this.laserObstacle;
    if (!L || !L.beamOn || !L.beamVisible || !this.ballInFlight) return;
    if (L.hitCooldown > 0) { L.hitCooldown -= 1; return; }

    const ballR = 22 * this.ballScale;
    const dist  = Math.abs(this.ballY - L.y);

    if (dist < ballR + 5 && this.ballX >= L.x1 && this.ballX <= L.x2) {
      // Bounce ball away from laser
      this.ballVY = -Math.abs(this.ballVY) * 0.55;
      this.ballVX *= 0.75;
      this.ballY   = L.y - ballR - 6;

      L.hitCooldown = 30; // ~0.5s cooldown

      // Flash the laser red-white
      this._laserHitFlash();

      // Lose a life
      this.combo = 0;
      this.comboTimer = 0;
      this.comboText.setAlpha(0);
      this.lives--;
      this._refreshHearts();
      soundManager.playMiss();
      this.cameras.main.shake(100, 0.014);

      if (this.lives <= 0) {
        this.ballInFlight = false;
        this._gameOver();
      }
    }
  }

  _laserHitFlash() {
    const L = this.laserObstacle;
    if (!L) return;

    // Screen flash
    const flash = this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0xff0033, 0.28).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

    // Spark burst at impact point
    for (let i = 0; i < 10; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd   = Phaser.Math.FloatBetween(40, 110);
      const p     = this.add.circle(this.ballX, L.y, Phaser.Math.FloatBetween(2, 5), 0xff3366, 1).setDepth(22);
      this.tweens.add({
        targets: p,
        x: this.ballX + Math.cos(angle) * spd,
        y: L.y       + Math.sin(angle) * spd,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: Phaser.Math.Between(220, 450), ease: 'Power2',
        onComplete: () => p.destroy()
      });
    }

    this._scoreTextPop(this.ballX, L.y - 30, '⚡ ZAP!', '#ff2255');
  }

  /** Remove the active laser (called on score, or when world scrolls past it) */
  _clearLaser(animate = true) {
    const L = this.laserObstacle;
    if (!L) return;
    this.laserObstacle = null;

    const destroy = () => {
      L.glow.destroy();
      L.beam.destroy();
      L.center.destroy();
      if (L.warnText) L.warnText.destroy();
    };

    if (animate) {
      if (L.warnText) this.tweens.add({ targets: L.warnText, alpha: 0, duration: 180 });
      this.tweens.add({
        targets: { t: 0 }, t: 1, duration: 220,
        onUpdate: () => { L.glow.clear(); L.beam.clear(); L.center.clear(); },
        onComplete: destroy
      });
    } else {
      destroy();
    }

    // Schedule next laser: 2 or 3 baskets from now
    this.laserBasketsCount = 0;
    this.nextLaserIn = Phaser.Math.Between(2, 3);
  }

  /** Move the laser down when the world scrolls */
  _scrollLaser(dy) {
    const L = this.laserObstacle;
    if (!L) return;
    L.y += dy;
    if (L.warnText) L.warnText.y += dy;
    // If laser has scrolled below the screen, remove it silently
    if (L.y > this.H + 40) this._clearLaser(false);
  }

  // ── SHUTDOWN ──────────────────────────────────────────────────────────────
  shutdown() {
    clearInterval(this.ambientInterval);
    if (this.laserObstacle) this._clearLaser(false);
    this.scale.off('resize', this._onResize, this);
    this.input.off('pointerdown', this._onPointerDown, this);
    this.input.off('pointermove', this._onPointerMove, this);
    this.input.off('pointerup',   this._onPointerUp,   this);
  }
}