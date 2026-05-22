import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';

export class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); this.bestScore = 0; }

  async create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const S = Math.min(W, H);
    const isPortrait = H > W;

    this.cameras.main.fadeIn(600);
    this.cameras.main.setBackgroundColor('#030812');

    // ── LOAD DATA FIRST before any UI ─────────────────────────────────────
    try {
      const data = await YTPlayables.loadData();
      if (data?.bestScore) this.bestScore = data.bestScore;
    } catch (e) {}

    // ── LOGO ──────────────────────────────────────────────────────────────
    // Logo is BIG: up to 38% of screen height, 90% of width — whichever fits
    let logoH = 0;
    if (this.textures.exists('hoopdash_logo')) {
      const tex      = this.textures.get('hoopdash_logo').source[0];
      const maxLogoH = H * 0.38;           // was 0.28 — much bigger now
      const maxLogoW = W * 0.90;           // was 0.80 — use more width
      const scaleByH = maxLogoH / tex.height;
      const scaleByW = maxLogoW / tex.width;
      const scale    = Math.min(scaleByH, scaleByW);
      logoH          = tex.height * scale;

      const logoY = H * 0.025 + logoH / 2;
      const logo  = this.add.image(W / 2, logoY, 'hoopdash_logo').setScale(scale).setAlpha(0);
      this.tweens.add({ targets: logo, alpha: 1, duration: 560, ease: 'Cubic.easeOut', delay: 80 });
    }

    // ── SLOT LAYOUT ───────────────────────────────────────────────────────
    // Remaining height below logo split into 4 slots: ball | best | play | hint
    // On portrait mobile the ball gets a bigger slice so it sits lower & larger
    const topUsed = H * 0.025 + logoH;
    const botPad  = H * 0.04;
    const avail   = H - topUsed - botPad;

    // Give ball slot 35% of available space so it sits visually lower
    const ballSlotFrac = isPortrait ? 0.35 : 0.30;
    const restSlots    = 3;                           // best, btn, hint
    const ballSlotH    = avail * ballSlotFrac;
    const otherSlotH   = (avail * (1 - ballSlotFrac)) / restSlots;

    const ballY = topUsed + ballSlotH * 0.55;         // slightly lower in its slot
    const bestY = topUsed + ballSlotH + otherSlotH * 0.50;
    const btnY  = topUsed + ballSlotH + otherSlotH * 1.50;
    const hintY = topUsed + ballSlotH + otherSlotH * 2.50;

    // ── BASKETBALL ────────────────────────────────────────────────────────
    // Ball fills ~45% of its slot height — removed the tiny S*0.10 cap
    const ballDisplayR = Math.min(ballSlotH * 0.42, W * 0.18, 72);
    const ballTexW     = this.textures.get('ball')?.source?.[0]?.width || 52;
    const ballScale    = (ballDisplayR * 2) / ballTexW;

    const shadow = this.add.ellipse(
      W / 2, ballY + ballDisplayR * 0.80,
      ballDisplayR * 1.6, ballDisplayR * 0.30,
      0x000000, 0
    );
    this.tweens.add({ targets: shadow, alpha: 0.5, duration: 320, delay: 480 });

    const ballImg = this.add.image(W / 2, ballY, 'ball').setScale(ballScale).setAlpha(0);
    this.tweens.add({
      targets: ballImg, alpha: 1, duration: 360, delay: 460,
      onComplete: () => {
        this.tweens.add({ targets: ballImg, angle: 360, duration: 3200, repeat: -1, ease: 'Linear' });
        this.tweens.add({ targets: ballImg, y: ballY - 9, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: shadow, scaleX: 0.60, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });

    // ── BEST SCORE ────────────────────────────────────────────────────────
    if (this.bestScore > 0) {
      const pillW = Math.min(W * 0.55, 220);
      const pillH = Math.min(otherSlotH * 0.55, 42);
      const pillG = this.add.graphics();
      pillG.lineStyle(1, 0xd4a017, 0.6);
      pillG.strokeRoundedRect(W / 2 - pillW / 2, bestY - pillH / 2, pillW, pillH, pillH / 2);
      this.add.text(W / 2, bestY, `🏆  BEST  ${this.bestScore}`, {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: `${Math.min(otherSlotH * 0.30, S * 0.048, 20)}px`,
        color: '#d4a017', letterSpacing: 2,
      }).setOrigin(0.5);
    }

    // ── PLAY BUTTON ───────────────────────────────────────────────────────
    const btnW = Math.min(W * 0.68, 260);
    const btnH = Math.min(otherSlotH * 0.58, 56);
    const btnR = 6;

    const btnBg = this.add.graphics().setAlpha(0);
    btnBg.lineStyle(1.4, 0xffffff, 0.55);
    btnBg.strokeRoundedRect(W / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);

    const btnTxt = this.add.text(W / 2, btnY, 'PLAY', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(otherSlotH * 0.32, S * 0.060, 26)}px`,
      color: '#ffffff', letterSpacing: 10,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [btnBg, btnTxt], alpha: 1, duration: 500, delay: 680, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.btnPulseTween = this.tweens.add({
          targets: [btnBg, btnTxt], alpha: { from: 1, to: 0.55 },
          duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
    });

    // ── HINT ──────────────────────────────────────────────────────────────
    this.add.text(W / 2, hintY, '  drag to aim  ·  release to throw  ', {
      fontFamily: '"Arial", sans-serif',
      fontSize: `${Math.min(otherSlotH * 0.24, S * 0.034, 14)}px`,
      color: '#d0bb9d', letterSpacing: 1,
    }).setOrigin(0.5).setAlpha(0.75);

    // ── VERSION ───────────────────────────────────────────────────────────
    this.add.text(W - 10, H - 8, 'v1.0', {
      fontFamily: '"Courier New", monospace', fontSize: '9px', color: '#111820',
    }).setOrigin(1, 1);

    // ── INPUT ─────────────────────────────────────────────────────────────
    const startGame = () => {
      soundManager.resume();
      soundManager.playClick();
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.time.delayedCall(260, () => this.scene.start('GameScene'));
    };

    const hitArea = this.add
      .rectangle(W / 2, btnY, btnW * 1.15, btnH * 1.8, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerdown', startGame);
    hitArea.on('pointerover', () => {
      this.tweens.killTweensOf(btnBg);
      this.tweens.killTweensOf(btnTxt);
      btnBg.clear();
      btnBg.lineStyle(1.6, 0xd4a017, 1);
      btnBg.strokeRoundedRect(W / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
      btnBg.setAlpha(1);
      btnTxt.setAlpha(1);
      btnTxt.setStyle({ color: '#d4a017' });
    });
    hitArea.on('pointerout', () => {
      this.tweens.killTweensOf(btnBg);
      this.tweens.killTweensOf(btnTxt);
      btnBg.clear();
      btnBg.lineStyle(1.4, 0xffffff, 0.55);
      btnBg.strokeRoundedRect(W / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
      btnBg.setAlpha(1);
      btnTxt.setAlpha(1);
      btnTxt.setStyle({ color: '#ffffff' });
      this.btnPulseTween = this.tweens.add({
        targets: [btnBg, btnTxt], alpha: { from: 1, to: 0.55 },
        duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });
    });

    this.input.keyboard?.on('keydown-SPACE', startGame);
    this.input.keyboard?.on('keydown-ENTER', startGame);

    YTPlayables.onPause(() => this.scene.pause());
    YTPlayables.onResume(() => this.scene.resume());
    YTPlayables.onAudioEnabledChange(en => soundManager.setEnabled(en));
    soundManager.setEnabled(YTPlayables.isAudioEnabled());
    YTPlayables.gameReady();
  }
}