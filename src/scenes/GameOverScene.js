import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';

export class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data) {
    this.finalScore = data.score     || 0;
    this.bestScore  = data.bestScore || 0;
    this.baskets    = data.baskets   || 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    const S = Math.min(W, H);

    this.cameras.main.setBackgroundColor('#030812');
    this.cameras.main.fadeIn(400);

    // Background image — stretched to fill screen
    if (this.textures.exists('bg')) {
      this.add.image(W / 2, H / 2, 'bg').setDisplaySize(W, H).setDepth(-20);
    }

    const isNewBest = this.finalScore > 0 && this.finalScore >= this.bestScore;

    // ── CONFETTI for new best ──────────────────────────────────────────────
    if (isNewBest) {
      const cols = [0xffd700, 0xff6b35, 0x00f5d4, 0xff3355, 0x00aaff];
      const confettiCount = 24;
      const pieces = [];
      for (let i = 0; i < confettiCount; i++) {
        const x = Phaser.Math.Between(W * 0.08, W * 0.92);
        const col = cols[i % cols.length];
        const p = this.add.circle(x, H * 0.05, Phaser.Math.FloatBetween(3, 6), col, 0).setDepth(30);
        pieces.push({ p, x });
      }
      this.time.delayedCall(200, () => {
        pieces.forEach(({ p, x }, i) => {
          this.time.delayedCall(i * 22, () => {
            p.setAlpha(1);
            this.tweens.add({
              targets: p, y: H * 0.55, x: x + Phaser.Math.Between(-70, 70),
              alpha: 0, angle: Phaser.Math.Between(-160, 160),
              duration: Phaser.Math.Between(650, 1100), ease: 'Power1',
              onComplete: () => p.destroy()
            });
          });
        });
      });
    }

    // ── FIXED LAYOUT ───────────────────────────────────────────────────────
    const pad   = H * 0.05;
    const slots = 5;
    const gap   = (H - pad * 2) / slots;

    const titleY   = pad + gap * 0.5;
    const scoreY   = pad + gap * 1.5;
    const statsY   = pad + gap * 2.5;
    const playBtnY = pad + gap * 3.5;
    const menuBtnY = pad + gap * 4.5;

    // ── TITLE ─────────────────────────────────────────────────────────────
    const titleTxt = isNewBest ? '🏆  NEW BEST!' : 'GAME OVER';
    const titleCol = isNewBest ? '#ffd700' : '#ff3355';
    const titleSize = Math.min(S * 0.075, 38);

    // Title shadow layer for crispness
    this.add.text(W / 2 + 2, titleY + 2, titleTxt, {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${titleSize}px`,
      color: isNewBest ? '#7a5a00' : '#7a0020',
    }).setOrigin(0.5).setAlpha(0.6);

    const title = this.add.text(W / 2, titleY, titleTxt, {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${titleSize}px`,
      color: titleCol,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 500, ease: 'Cubic.easeOut', delay: 100 });

    // ── SCORE LABEL ───────────────────────────────────────────────────────
    const labelSize = Math.min(S * 0.030, 13);
    const scoreSize = Math.min(S * 0.16, 80);   // slightly larger

    this.add.text(W / 2, scoreY - scoreSize * 0.58, 'SCORE', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${labelSize}px`,
      color: '#e8ecf0',      // brighter than before
      letterSpacing: 7,
    }).setOrigin(0.5);

    // ── SCORE NUMBER — bright white with vivid glow shadow ────────────────
    // Glow layer 1 (soft outer glow — largest offset, most transparent)
    this.add.text(W / 2, scoreY + scoreSize * 0.15, this.finalScore.toString(), {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
     fontSize: `${Math.round(scoreSize * 1.04)}px`,
      color: '#00cfff',
    }).setOrigin(0.5).setAlpha(0.18);

    // Glow layer 2 (tighter cyan halo)
    this.add.text(W / 2, scoreY + scoreSize * 0.15, this.finalScore.toString(), {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${scoreSize}px`,
      color: '#80e8ff',
    }).setOrigin(0.5).setAlpha(0.28).setScale(1.02);

    // Main score — pure bright white, crisp
    const scoreNum = this.add.text(W / 2, scoreY + scoreSize * 0.15, this.finalScore.toString(), {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${scoreSize}px`,
      color: '#ffffff',
      stroke: '#c0eeff',
      strokeThickness: 1,
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);
    this.tweens.add({ targets: scoreNum, alpha: 1, scaleX: 1, scaleY: 1, duration: 520, ease: 'Back.easeOut', delay: 250 });

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(1, 0xffffff, 0.18);
    divG.lineBetween(W * 0.1, statsY - gap * 0.46, W * 0.9, statsY - gap * 0.46);

    // ── STAT BOXES ────────────────────────────────────────────────────────
    const statW = Math.min(W * 0.40, 160);
    const statH = Math.min(gap * 0.75, 64);
    this._statBox(W / 2 - statW * 0.58, statsY, statW, statH, 'BEST',    this.bestScore.toString(), isNewBest ? 0xffd700 : 0x778899, S);
    this._statBox(W / 2 + statW * 0.58, statsY, statW, statH, 'BASKETS', this.baskets.toString(),   0x00f5d4, S);

    // ── PLAY AGAIN BUTTON ─────────────────────────────────────────────────
    const btnW  = Math.min(W * 0.60, 230);
    const btnH  = Math.min(gap * 0.55, 48);
    const btnR  = 6;

    // Subtle filled bg for the play button — makes it pop more
    const playFill = this.add.graphics().setAlpha(0);
    playFill.fillStyle(0xff6b35, 0.08);
    playFill.fillRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);

    const playBg = this.add.graphics().setAlpha(0);
    playBg.lineStyle(2, 0xff6b35, 1);   // thicker, fully opaque border — crisp
    playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);

    const playTxt = this.add.text(W / 2, playBtnY, 'PLAY AGAIN', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.046, 20)}px`,  // slightly larger
      color: '#ff6b35',
      letterSpacing: 6,
      stroke: '#ff6b3520',
      strokeThickness: 0.5,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [playFill, playBg, playTxt], alpha: 1, duration: 500, delay: 500, ease: 'Cubic.easeOut' });
    this.time.delayedCall(1200, () => {
      this.tweens.add({ targets: playBg, alpha: { from: 0.55, to: 1 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ── MENU BUTTON ───────────────────────────────────────────────────────
    const menuBtnW = Math.min(W * 0.40, 150);
    const menuBtnH = Math.min(gap * 0.45, 38);

    const menuBg = this.add.graphics().setAlpha(0);
    menuBg.lineStyle(1.5, 0xffffff, 0.45);   // slightly more visible
    menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);

    const menuTxt = this.add.text(W / 2, menuBtnY, 'MENU', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.038, 16)}px`,  // slightly larger
      color: '#e0e8f0',    // near-white, crisper than pure grey
      letterSpacing: 8,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [menuBg, menuTxt], alpha: 1, duration: 500, delay: 700, ease: 'Cubic.easeOut' });

    // ── HIT AREAS ─────────────────────────────────────────────────────────
    const playHit = this.add.rectangle(W / 2, playBtnY, btnW * 1.1, btnH * 1.6, 0xffffff, 0).setInteractive({ useHandCursor: true });
    playHit.on('pointerdown', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('GameScene'));
    });
    playHit.on('pointerover', () => {
      this.tweens.killTweensOf(playBg);
      this.tweens.killTweensOf(playTxt);
      playFill.clear();
      playFill.fillStyle(0xff6b35, 0.18);
      playFill.fillRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
      playFill.setAlpha(1);
      playBg.clear(); playBg.lineStyle(2, 0xff6b35, 1);
      playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
      playBg.setAlpha(1);
      playTxt.setAlpha(1);
      playTxt.setStyle({ color: '#ffffff', stroke: '#ff6b35', strokeThickness: 1 });
    });
    playHit.on('pointerout', () => {
      this.tweens.killTweensOf(playBg);
      this.tweens.killTweensOf(playTxt);
      playFill.clear();
      playFill.fillStyle(0xff6b35, 0.08);
      playFill.fillRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
      playFill.setAlpha(1);
      playBg.clear(); playBg.lineStyle(2, 0xff6b35, 1);
      playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
      playBg.setAlpha(1);
      playTxt.setAlpha(1);
      playTxt.setStyle({ color: '#ff6b35', stroke: '#ff6b3520', strokeThickness: 0.5 });
    });

    const menuHit = this.add.rectangle(W / 2, menuBtnY, menuBtnW * 1.1, menuBtnH * 1.6, 0xffffff, 0).setInteractive({ useHandCursor: true });
    menuHit.on('pointerdown', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('MenuScene'));
    });
    menuHit.on('pointerover', () => {
      menuBg.clear(); menuBg.lineStyle(1.5, 0xffd700, 1);
      menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
      menuBg.setAlpha(1); menuTxt.setStyle({ color: '#ffd700' });
    });
    menuHit.on('pointerout', () => {
      menuBg.clear(); menuBg.lineStyle(1.5, 0xffffff, 0.45);
      menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
      menuBg.setAlpha(1); menuTxt.setStyle({ color: '#e0e8f0' });
    });

    // ── SAVE ──────────────────────────────────────────────────────────────
    if (this.finalScore > 0) {
      YTPlayables.saveData({ bestScore: this.bestScore, lastScore: this.finalScore }).catch(() => {});
      YTPlayables.sendScore(this.bestScore);
    }
  }

  _statBox(x, y, w, h, label, value, color, S) {
    const hexColor = '#' + color.toString(16).padStart(6, '0');
    const g = this.add.graphics();

    // Crisper fill — slightly more opaque
    g.fillStyle(color, 0.13);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);

    // Two-layer border for crispness: outer glow + sharp inner line
    g.lineStyle(3, color, 0.25);
    g.strokeRoundedRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, 11);
    g.lineStyle(1.5, color, 1);   // sharp, fully opaque inner border
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);

    // Label — brighter
    this.add.text(x, y - h * 0.22, label, {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.028, 12)}px`,
      color: '#c0ccd8',   // brighter than #ffffff at 0.9 alpha
      letterSpacing: 2,
    }).setOrigin(0.5);

    // Value — full color, crisp with thin stroke
    this.add.text(x, y + h * 0.22, value, {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.072, 30)}px`,
      color: hexColor,
      stroke: hexColor + '40',
      strokeThickness: 1,
    }).setOrigin(0.5);
  }
}