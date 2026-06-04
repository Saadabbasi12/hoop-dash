import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.bestScore = 0;
  }

  create() {
    const W   = this.scale.width;
    const H   = this.scale.height;
    const S   = Math.min(W, H);
    const DPR = Math.min(window.devicePixelRatio || 1, 3); // cap at 3× for perf
    const isPortrait = H > W;

    // NOTE: setRoundPixels(true) is intentionally NOT used here.
    // It snaps every sprite to integer pixels each frame, which makes smooth
    // tweens (ball float, rotation) stutter and flicker on mobile.
    // Text sharpness is handled per-object via `resolution: DPR` instead.
    this.cameras.main.fadeIn(600);
    this.cameras.main.setBackgroundColor('#030812');

    // ── MENU BACKGROUND ───────────────────────────────────────────────────
    // Portrait on mobile (H > W), landscape on desktop — each pre-cropped to
    // the correct ratio so cover-scale never upscales and stays sharp.
    const _bgKey = isPortrait ? 'menubgportrait' : 'menubglandscape';
    const _bgTex = this.textures.exists(_bgKey)
      ? _bgKey
      : this.textures.exists('bg') ? 'bg' : null;
    if (_bgTex) {
      const tex   = this.textures.get(_bgTex).source[0];
      this.textures.get(_bgTex).setFilter(Phaser.Textures.FilterMode.LINEAR);
      const scale = Math.max(W / tex.width, H / tex.height);
      this.add.image(W / 2, H / 2, _bgTex).setScale(scale).setDepth(-20);
    }

    // Load saved data in background — gameReady fires regardless
    YTPlayables.loadData().then(data => {
      if (data && data.bestScore) {
        this.bestScore = data.bestScore;
        if (this.bestScoreText) {
          this.bestScorePill.setAlpha(1);
          this.bestScoreText.setText('  BEST  ' + this.bestScore).setAlpha(1);
        }
      }
    }).catch(() => {});

    // ── LOGO ──────────────────────────────────────────────────────────────
    let logoH = 0;
    if (this.textures.exists('hoopdash_logo')) {
      const tex      = this.textures.get('hoopdash_logo').source[0];
      const maxLogoH = H * 0.38;
      const maxLogoW = W * 0.90;
      const scaleByH = maxLogoH / tex.height;
      const scaleByW = maxLogoW / tex.width;
      const scale    = Math.min(scaleByH, scaleByW);
      logoH          = tex.height * scale;
      // Snap Y to integer so logo doesn't sit on a half-pixel
      const logoY    = Math.round(H * 0.025 + logoH / 2);
      const logo     = this.add.image(W / 2, logoY, 'hoopdash_logo')
        .setScale(scale)
        .setAlpha(0);
      this.tweens.add({ targets: logo, alpha: 1, duration: 560, ease: 'Cubic.easeOut', delay: 80 });
    } else {
      logoH = Math.min(S * 0.13, 52) * 1.4;
      const logoY = Math.round(H * 0.025 + logoH / 2);
      const logo  = this.add.text(W / 2, logoY, '🏀 HOOP DASH', {
        fontFamily: '"Bebas Neue", Impact, sans-serif',
        fontSize: `${Math.min(S * 0.13, 52)}px`,
        color: '#ff6b35', stroke: '#7a2c00', strokeThickness: 4,
        resolution: DPR,   // ← render text at device pixel ratio
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: logo, alpha: 1, duration: 560, ease: 'Cubic.easeOut', delay: 80 });
    }

    // ── SLOT LAYOUT ───────────────────────────────────────────────────────
    const topUsed      = H * 0.025 + logoH;
    const botPad       = H * 0.04;
    const avail        = H - topUsed - botPad;
    const ballSlotFrac = isPortrait ? 0.35 : 0.30;
    const ballSlotH    = avail * ballSlotFrac;
    const otherSlotH   = (avail * (1 - ballSlotFrac)) / 3;

    // Snap all Y positions to integers — prevents sub-pixel blur
    const ballY = Math.round(topUsed + ballSlotH * 0.55);
    const bestY = Math.round(topUsed + ballSlotH + otherSlotH * 0.50);
    const btnY  = Math.round(topUsed + ballSlotH + otherSlotH * 1.50);
    const hintY = Math.round(topUsed + ballSlotH + otherSlotH * 2.50);

    // ── BASKETBALL ────────────────────────────────────────────────────────
    const ballDisplayR = Math.min(ballSlotH * 0.42, W * 0.18, 72);
    const ballTexW     = this.textures.get('ball') && this.textures.get('ball').source[0]
      ? this.textures.get('ball').source[0].width : 52;
    const ballScale    = (ballDisplayR * 2) / ballTexW;

    const shadow = this.add.ellipse(
      W / 2, ballY + ballDisplayR * 0.80,
      ballDisplayR * 1.6, ballDisplayR * 0.30,
      0x000000, 0
    );
    this.tweens.add({ targets: shadow, alpha: 0.5, duration: 320, delay: 480 });

    const ballImg = this.add.image(W / 2, ballY, 'ball')
      .setScale(ballScale)
      .setAlpha(0);
    this.tweens.add({
      targets: ballImg, alpha: 1, duration: 360, delay: 460,
      onComplete: () => {
        this.tweens.add({ targets: ballImg, angle: 360, duration: 3200, repeat: -1, ease: 'Linear' });
        this.tweens.add({ targets: ballImg, y: ballY - 9, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: shadow, scaleX: 0.60, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });

    // ── BEST SCORE ────────────────────────────────────────────────────────
    const pillW = Math.min(W * 0.55, 220);
    const pillH = Math.min(otherSlotH * 0.55, 42);

    this.bestScorePill = this.add.graphics().setAlpha(0);
    this.bestScorePill.lineStyle(1, 0xd4a017, 0.6);
    this.bestScorePill.strokeRoundedRect(
      Math.round(W / 2 - pillW / 2), Math.round(bestY - pillH / 2),
      Math.round(pillW), Math.round(pillH),
      pillH / 2
    );

    this.bestScoreText = this.add.text(Math.round(W / 2), bestY, '', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${Math.min(otherSlotH * 0.30, S * 0.048, 20)}px`,
      color: '#d4a017',
      letterSpacing: 2,
      resolution: DPR,   // ← crisp on retina/mobile
    }).setOrigin(0.5).setAlpha(0);

    if (this.bestScore > 0) {
      this.bestScorePill.setAlpha(1);
      this.bestScoreText.setText('  BEST  ' + this.bestScore).setAlpha(1);
    }

    // ── PLAY BUTTON (image) ───────────────────────────────────────────────
    const playbtnTex = this.textures.exists('playbtn') ? this.textures.get('playbtn').source[0] : null;

    const playbtnImg = playbtnTex
      ? (() => {
          // LINEAR filter for smooth bilinear interpolation on a raster image.
          // The source PNG is pre-resized to 560px (2× the 280px display cap) so
          // the downscale ratio stays at ~2× max — small enough for LINEAR to look
          // smooth with no harshness or aliasing on any mobile DPR.
          this.textures.get('playbtn').setFilter(Phaser.Textures.FilterMode.LINEAR);

          const targetW = Math.round(Math.min(W * 0.58, 280));
          const targetH = Math.round((playbtnTex.height / playbtnTex.width) * targetW);

          return this.add.image(W / 2, btnY, 'playbtn')
            .setDisplaySize(targetW, targetH)
            .setAlpha(0);
        })()
      : null;

    // Fallback: plain text button if image didn't load
    const btnBg  = !playbtnImg ? this.add.graphics().setAlpha(0) : null;
    const btnTxt = !playbtnImg
      ? this.add.text(Math.round(W / 2), btnY, 'PLAY', {
          fontFamily: '"Bebas Neue", Impact, sans-serif',
          fontSize: `${Math.min(otherSlotH * 0.32, S * 0.060, 26)}px`,
          color: '#ffffff',
          letterSpacing: 10,
          resolution: DPR,
        }).setOrigin(0.5).setAlpha(0)
      : null;

    const btnBgW = Math.min(W * 0.68, 260);
    const btnBgH = Math.min(otherSlotH * 0.58, 56);
    if (btnBg) {
      btnBg.lineStyle(1.4, 0xffffff, 0.55);
      btnBg.strokeRoundedRect(
        Math.round(W / 2 - btnBgW / 2), Math.round(btnY - btnBgH / 2),
        Math.round(btnBgW), Math.round(btnBgH),
        6
      );
    }

    const btnTargets = playbtnImg ? [playbtnImg] : [btnBg, btnTxt].filter(Boolean);

    this.tweens.add({
      targets: btnTargets, alpha: 1, duration: 500, delay: 680, ease: 'Cubic.easeOut',
    });

    // Hit area sized to match actual displayed image size
    const _btnDisplayW = playbtnTex ? Math.round(Math.min(W * 0.58, 280)) : 0;
    const _btnDisplayH = playbtnTex ? Math.round((playbtnTex.height / playbtnTex.width) * _btnDisplayW) : 0;
    const hitW = playbtnImg ? (_btnDisplayW + 24) : btnBgW * 1.15;
    const hitH = playbtnImg ? (_btnDisplayH + 24) : btnBgH * 1.8;

    // ── HINT TEXT ─────────────────────────────────────────────────────────
    this.add.text(Math.round(W / 2), hintY, 'drag to aim  ·  release to throw', {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${Math.min(otherSlotH * 0.30, S * 0.040, 22)}px`,
      color: '#3b0764',
      stroke: '#6b21a8',
      strokeThickness: 1,
      shadow: { offsetX: 0, offsetY: 0, color: '#a855f7', blur: 0, fill: false },
      letterSpacing: 2,
      resolution: DPR,
    }).setOrigin(0.5).setAlpha(1);

    // ── INPUT ─────────────────────────────────────────────────────────────
    const startGame = () => {
      soundManager.resume();
      soundManager.playClick();
      this.cameras.main.fadeOut(260, 0, 0, 0);
      this.time.delayedCall(260, () => this.scene.start('GameScene'));
    };

    const hitArea = this.add
      .rectangle(Math.round(W / 2), btnY, hitW, hitH, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });

    hitArea.on('pointerdown', startGame);
    hitArea.on('pointerover', () => {
      this.tweens.killTweensOf(btnTargets);
      btnTargets.forEach(t => t.setAlpha(1));
      if (playbtnImg) {
        const targetW = Math.round(Math.min(W * 0.58, 280) * 1.04);
        const targetH = Math.round((playbtnTex.height / playbtnTex.width) * targetW);
        playbtnImg.setDisplaySize(targetW, targetH);
      }
      if (btnTxt) btnTxt.setStyle({ color: '#d4a017' });
    });
    hitArea.on('pointerout', () => {
      this.tweens.killTweensOf(btnTargets);
      btnTargets.forEach(t => t.setAlpha(1));
      if (playbtnImg) {
        const targetW = Math.round(Math.min(W * 0.58, 280));
        const targetH = Math.round((playbtnTex.height / playbtnTex.width) * targetW);
        playbtnImg.setDisplaySize(targetW, targetH);
      }
      if (btnTxt) btnTxt.setStyle({ color: '#ffffff' });
    });

    this.input.keyboard && this.input.keyboard.on('keydown-SPACE', startGame);
    this.input.keyboard && this.input.keyboard.on('keydown-ENTER', startGame);

    // ── YT SDK HOOKS ──────────────────────────────────────────────────────
    YTPlayables.onPause(() => this.scene.pause());
    YTPlayables.onResume(() => this.scene.resume());
    YTPlayables.onAudioEnabledChange(en => soundManager.setEnabled(en));
    soundManager.setEnabled(YTPlayables.isAudioEnabled());

    YTPlayables.gameReady();
    console.log('[YT] gameReady fired from MenuScene.create()');
  }
}