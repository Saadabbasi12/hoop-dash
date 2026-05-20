import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.bestScore = 0;
  }

  async create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const S = Math.min(W, H);

    this.cameras.main.fadeIn(500);

    // ── BACKGROUND ────────────────────────────────────────────────────────
    // Deep navy gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x030810, 0x030810, 0x071220, 0x071220, 1);
    bg.fillRect(0, 0, W, H);

    // Hardwood court lines — gold, very subtle
    const court = this.add.graphics();
    court.lineStyle(1.5, 0xd4a017, 0.1);
    court.strokeCircle(W / 2, H * 0.6, S * 0.32);
    court.lineStyle(1, 0xd4a017, 0.06);
    court.strokeCircle(W / 2, H * 0.6, S * 0.5);
    court.lineStyle(1, 0xd4a017, 0.08);
    court.lineBetween(W * 0.05, H * 0.6, W * 0.95, H * 0.6);

    // Three-point arc (top half only)
    court.lineStyle(1.5, 0xd4a017, 0.08);
    court.beginPath();
    court.arc(W / 2, H * 0.9, S * 0.45, Math.PI, 0, false);
    court.strokePath();

    // Scanlines
    const scan = this.add.graphics();
    for (let y = 0; y < H; y += 3) {
      scan.lineStyle(1, 0x000000, 0.03);
      scan.lineBetween(0, y, W, y);
    }

    // Stars
    for (let i = 0; i < 55; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, H * 0.7),
        Phaser.Math.FloatBetween(0.3, 1.5), 0xffffff,
        Phaser.Math.FloatBetween(0.05, 0.35)
      );
      this.tweens.add({
        targets: star, alpha: 0.02,
        duration: Phaser.Math.Between(700, 2500), yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2000)
      });
    }

    // ── LOAD SAVE ─────────────────────────────────────────────────────────
    try {
      const data = await YTPlayables.loadData();
      if (data?.bestScore) this.bestScore = data.bestScore;
    } catch (e) {}

    // ── LAYOUT ────────────────────────────────────────────────────────────
    const isWide   = W > H;
    const titleY   = isWide ? H * 0.15 : H * 0.14;
    const ballY    = isWide ? H * 0.48 : H * 0.50;
    const bestY    = isWide ? H * 0.64 : H * 0.67;
    const btnY     = isWide ? H * 0.74 : H * 0.78;
    const hintY    = isWide ? H * 0.88 : H * 0.90;

    // ── LOGO ──────────────────────────────────────────────────────────────
    const titleSize = Math.min(S * (isWide ? 0.11 : 0.17), 96);

    // HOOP — white with gold stroke
    const t1 = this.add.text(W / 2, titleY, 'HOOP', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${titleSize}px`,
      color: '#ffffff',
      stroke: '#d4a017',
      strokeThickness: 2,
      letterSpacing: titleSize * 0.1,
    }).setOrigin(0.5).setAlpha(0);

    // Gold divider under HOOP
    const divW = t1.width * 0.8;
    const divider = this.add.graphics().setAlpha(0);
    divider.fillStyle(0xd4a017, 1);
    divider.fillRect(W / 2 - divW / 2, titleY + titleSize * 0.58, divW, 2.5);

    // DASH — gold
    const t2 = this.add.text(W / 2, titleY + titleSize * 0.88, 'DASH', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(titleSize * 0.72, 70)}px`,
      color: '#d4a017',
      letterSpacing: titleSize * 0.22,
    }).setOrigin(0.5).setAlpha(0);

    const tagline = this.add.text(W / 2, titleY + titleSize * 1.55, 'THROW  ·  DODGE  ·  SCORE', {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${Math.min(S * 0.027, 13)}px`,
      color: '#3a6080',
      letterSpacing: 4
    }).setOrigin(0.5).setAlpha(0);

    // Animate title in
    this.tweens.add({ targets: t1,       alpha: 1, y: titleY - 4,                    duration: 550, ease: 'Back.easeOut', delay: 80 });
    this.tweens.add({ targets: divider,  alpha: 1,                                    duration: 400, delay: 300 });
    this.tweens.add({ targets: t2,       alpha: 1, y: titleY + titleSize * 0.88 - 4, duration: 550, ease: 'Back.easeOut', delay: 200 });
    this.tweens.add({ targets: tagline,  alpha: 1,                                    duration: 400, delay: 420 });

    // ── BALL ──────────────────────────────────────────────────────────────
    const ballScale = Math.min(S * 0.075, 44) / 24;
    const ballImg = this.add.image(W / 2, ballY, 'ball')
      .setScale(ballScale).setAlpha(0);

    this.tweens.add({
      targets: ballImg, alpha: 1, duration: 350, delay: 500,
      onComplete: () => {
        this.tweens.add({
          targets: ballImg,
          y: ballY - 10,
          scaleX: ballScale * 1.06, scaleY: ballScale * 1.06,
          duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
    });

    // Shadow under ball — premium touch
    const shadow = this.add.ellipse(W / 2, ballY + ballScale * 20, ballScale * 44, ballScale * 10, 0x000000, 0.3).setAlpha(0);
    this.tweens.add({ targets: shadow, alpha: 0.3, duration: 350, delay: 500 });
    this.tweens.add({ targets: shadow, scaleX: 0.8, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Hoop above ball
    const hoopImg = this.add.image(W / 2, ballY - S * 0.1, 'hoop')
      .setAlpha(0).setTint(0xd4a017);
    this.tweens.add({ targets: hoopImg, alpha: 0.45, duration: 400, delay: 600 });

    // ── BEST SCORE ────────────────────────────────────────────────────────
    if (this.bestScore > 0) {
      // Glass pill
      const pillW = Math.min(W * 0.5, 200);
      const pillH = Math.min(S * 0.07, 44);
      const pill = this.add.graphics();
      pill.fillStyle(0xd4a017, 0.08);
      pill.lineStyle(1, 0xd4a017, 0.35);
      pill.strokeRoundedRect(W / 2 - pillW / 2, bestY - pillH / 2, pillW, pillH, pillH / 2);
      pill.fillRoundedRect(W / 2 - pillW / 2, bestY - pillH / 2, pillW, pillH, pillH / 2);

      this.add.text(W / 2 - pillW * 0.15, bestY, '🏆', {
        fontSize: `${Math.min(S * 0.04, 20)}px`
      }).setOrigin(0.5);

      this.add.text(W / 2 + pillW * 0.08, bestY, `BEST  ${this.bestScore}`, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: `${Math.min(S * 0.04, 18)}px`,
        color: '#d4a017',
        letterSpacing: 2
      }).setOrigin(0.5);
    }

    // ── PLAY BUTTON ───────────────────────────────────────────────────────
    const btnW = Math.min(W * 0.62, 270);
    const btnH = Math.min(H * 0.075, 58);

    // Button shadow layer
    const btnShadow = this.add.graphics().setAlpha(0);
    btnShadow.fillStyle(0xd4a017, 0.15);
    btnShadow.fillRoundedRect(W / 2 - btnW / 2 + 3, btnY - btnH / 2 + 5, btnW, btnH, btnH / 2);

    // Main button — gold gradient feel via layered rects
    const btnBg = this.add.graphics().setAlpha(0);
    // Dark border
    btnBg.lineStyle(1.5, 0xd4a017, 0.9);
    btnBg.strokeRoundedRect(W / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, btnH / 2);
    // Top shine
    btnBg.fillStyle(0xd4a017, 0.12);
    btnBg.fillRoundedRect(W / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH * 0.5, { tl: btnH / 2, tr: btnH / 2, bl: 0, br: 0 });

    const btnText = this.add.text(W / 2, btnY, 'PLAY NOW', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.055, 26)}px`,
      color: '#d4a017',
      letterSpacing: 5,
    }).setOrigin(0.5).setAlpha(0);

    // Animate button in
    this.tweens.add({ targets: [btnShadow, btnBg, btnText], alpha: 1, y: `-=5`, duration: 450, delay: 700, ease: 'Back.easeOut' });

    // Subtle pulse
    this.time.delayedCall(1200, () => {
      this.tweens.add({
        targets: [btnBg, btnText],
        scaleX: 1.02, scaleY: 1.02,
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    });

    // ── HINT ──────────────────────────────────────────────────────────────
    this.add.text(W / 2, hintY, '👆  drag to aim   •   release to throw', {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${Math.min(S * 0.03, 13)}px`,
      color: '#2a4560',
      letterSpacing: 1
    }).setOrigin(0.5);

    // ── CORNER BADGE — version / brand ────────────────────────────────────
    this.add.text(W - 10, H - 8, 'v1.0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '10px',
      color: '#1a3050',
    }).setOrigin(1, 1);

    // ── INPUT ─────────────────────────────────────────────────────────────
    // Invisible full-screen hit area for button
    const hitArea = this.add.rectangle(W / 2, btnY, btnW * 1.1, btnH * 1.5, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    const startGame = () => {
      soundManager.resume();
      soundManager.playClick();
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.time.delayedCall(300, () => this.scene.start('GameScene'));
    };

    hitArea.on('pointerdown', startGame);
    btnText.setInteractive({ useHandCursor: true });
    btnText.on('pointerdown', startGame);
    this.input.keyboard?.on('keydown-SPACE', startGame);
    this.input.keyboard?.on('keydown-ENTER', startGame);

    hitArea.on('pointerover', () => {
      this.tweens.add({ targets: [btnBg, btnText], scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });
    hitArea.on('pointerout', () => {
      this.tweens.add({ targets: [btnBg, btnText], scaleX: 1, scaleY: 1, duration: 100 });
    });

    // ── YT ────────────────────────────────────────────────────────────────
    YTPlayables.onPause(() => { this.scene.pause(); });
    YTPlayables.onResume(() => { this.scene.resume(); });
    YTPlayables.onAudioEnabledChange((en) => { soundManager.setEnabled(en); });
    soundManager.setEnabled(YTPlayables.isAudioEnabled());
    YTPlayables.gameReady();
  }
}