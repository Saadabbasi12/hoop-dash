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

    const isNewBest = this.finalScore > 0 && this.finalScore >= this.bestScore;

    // ── CONFETTI for new best ──────────────────────────────────────────────
    if (isNewBest) {
      this.time.delayedCall(200, () => {
        for (let i = 0; i < 36; i++) {
          this.time.delayedCall(i * 30, () => {
            const x   = Phaser.Math.Between(W * 0.08, W * 0.92);
            const col = [0xffd700, 0xff6b35, 0x00f5d4, 0xff3355, 0x00aaff][Phaser.Math.Between(0, 4)];
            const p   = this.add.circle(x, H * 0.05, Phaser.Math.FloatBetween(3, 7), col).setDepth(30);
            this.tweens.add({
              targets: p, y: H * 0.55, x: x + Phaser.Math.Between(-80, 80),
              alpha: 0, angle: Phaser.Math.Between(-180, 180),
              duration: Phaser.Math.Between(700, 1300), ease: 'Power1',
              onComplete: () => p.destroy()
            });
          });
        }
      });
    }

    // ── FIXED LAYOUT — divide screen into equal slots ──────────────────────
    // Slot positions as % of H — calculated so nothing overlaps on any screen
    const pad   = H * 0.05;          // top padding
    const slots = 5;                  // title, score, stats, playBtn, menuBtn
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

    const title = this.add.text(W / 2, titleY, titleTxt, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${titleSize}px`,
      color: titleCol,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 500, ease: 'Cubic.easeOut', delay: 100 });

    // ── SCORE ─────────────────────────────────────────────────────────────
    const labelSize = Math.min(S * 0.030, 13);
    const scoreSize = Math.min(S * 0.15, 72);

    this.add.text(W / 2, scoreY - scoreSize * 0.55, 'SCORE', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${labelSize}px`,
      color: '#2a4060', letterSpacing: 7
    }).setOrigin(0.5);

    const scoreNum = this.add.text(W / 2, scoreY + scoreSize * 0.15, this.finalScore.toString(), {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${scoreSize}px`,
      color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);
    this.tweens.add({ targets: scoreNum, alpha: 1, scaleX: 1, scaleY: 1, duration: 500, ease: 'Back.easeOut', delay: 250 });

    // Thin divider above stats
    const divG = this.add.graphics();
    divG.lineStyle(1, 0xffffff, 0.15);
    divG.lineBetween(W * 0.1, statsY - gap * 0.46, W * 0.9, statsY - gap * 0.46);

    // ── STAT BOXES ────────────────────────────────────────────────────────
    const statW = Math.min(W * 0.40, 160);
    const statH = Math.min(gap * 0.75, 64);
    this._statBox(W / 2 - statW * 0.58, statsY, statW, statH, ' BEST',    this.bestScore.toString(), isNewBest ? 0xd4a017 : 0x778899, S);
    this._statBox(W / 2 + statW * 0.58, statsY, statW, statH, ' BASKETS', this.baskets.toString(),   0x00c8a8, S);

    // ── PLAY AGAIN BUTTON ─────────────────────────────────────────────────
    const btnW  = Math.min(W * 0.60, 230);
    const btnH  = Math.min(gap * 0.55, 48);
    const btnR  = 6;

    const playBg = this.add.graphics().setAlpha(0);
    playBg.lineStyle(1.6, 0xff6b35, 0.85);
    playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);

    const playTxt = this.add.text(W / 2, playBtnY, 'PLAY AGAIN', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.044, 18)}px`,
      color: '#ff6b35', letterSpacing: 6,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [playBg, playTxt], alpha: 1, duration: 500, delay: 500, ease: 'Cubic.easeOut' });
    this.time.delayedCall(1200, () => {
      this.tweens.add({ targets: playBg, alpha: { from: 0.6, to: 1 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ── MENU BUTTON ───────────────────────────────────────────────────────
    const menuBtnW = Math.min(W * 0.40, 150);
    const menuBtnH = Math.min(gap * 0.45, 38);

    const menuBg = this.add.graphics().setAlpha(0);
    menuBg.lineStyle(1.2, 0xffffff, 0.35);
    menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);

    const menuTxt = this.add.text(W / 2, menuBtnY, 'MENU', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.036, 15)}px`,
      color: '#ffffff', letterSpacing: 8,
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
      playBg.clear(); playBg.lineStyle(1.8, 0xff6b35, 1);
      playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
      playBg.setAlpha(1); playTxt.setStyle({ color: '#ffffff' });
    });
    playHit.on('pointerout', () => {
      playBg.clear(); playBg.lineStyle(1.6, 0xff6b35, 0.85);
      playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
      playBg.setAlpha(1); playTxt.setStyle({ color: '#ff6b35' });
    });

    const menuHit = this.add.rectangle(W / 2, menuBtnY, menuBtnW * 1.1, menuBtnH * 1.6, 0xffffff, 0).setInteractive({ useHandCursor: true });
    menuHit.on('pointerdown', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('MenuScene'));
    });
    menuHit.on('pointerover', () => {
      menuBg.clear(); menuBg.lineStyle(1.4, 0xd4a017, 1);
      menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
      menuBg.setAlpha(1); menuTxt.setStyle({ color: '#d4a017' });
    });
    menuHit.on('pointerout', () => {
      menuBg.clear(); menuBg.lineStyle(1.2, 0xffffff, 0.35);
      menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
      menuBg.setAlpha(1); menuTxt.setStyle({ color: '#ffffff' });
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
    g.fillStyle(color, 0.10);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 10);
    g.lineStyle(2, color, 1);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10);

    this.add.text(x, y - h * 0.20, label, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.028, 12)}px`,
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0.9);

    this.add.text(x, y + h * 0.20, value, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${Math.min(S * 0.068, 28)}px`,
      color: hexColor,
    }).setOrigin(0.5);
  }
}