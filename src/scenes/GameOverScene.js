import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.finalScore = data.score     || 0;
    this.bestScore  = data.bestScore || 0;
    this.baskets    = data.baskets   || 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.cameras.main.setBackgroundColor('#0a0a1a');
    this.cameras.main.fadeIn(400);

    // Responsive helpers
    const shortSide = Math.min(W, H);
    const fs = (frac, max = 999) => Math.min(shortSide * frac, max);

    // ── Stars ─────────────────────────────────────────────────────────────
    for (let i = 0; i < 50; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
        Phaser.Math.FloatBetween(0.5, 2), 0xffffff, Phaser.Math.FloatBetween(0.1, 0.4)
      );
      this.tweens.add({ targets: star, alpha: 0.05, duration: Phaser.Math.Between(600, 1800), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1000) });
    }

    // ── Panel ─────────────────────────────────────────────────────────────
    const panelW = Math.min(W * 0.92, 420);
    const panelH = Math.min(H * 0.80, 680);
    const panelY = H / 2;
    const panel  = this.add.rectangle(W / 2, panelY, panelW, panelH, 0x0d1b2a, 0.95);
    panel.setStrokeStyle(2, 0xff6b35, 0.8);

    // Corner accents
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
      this.add.rectangle(W / 2 + sx * panelW / 2, panelY + sy * panelH / 2, 14, 14, 0xff6b35, 0.9);
    });

    // ── GAME OVER / NEW BEST title ─────────────────────────────────────────
    const isNewBest  = this.finalScore >= this.bestScore && this.finalScore > 0;
    const titleText  = isNewBest ? '🏆 NEW BEST!' : 'GAME OVER';
    const titleColor = isNewBest ? '#ffd700' : '#ff4444';
    const titleStroke= isNewBest ? '#aa8800' : '#aa0000';
    const titleY     = panelY - panelH / 2 - fs(0.06, 28);

    const title = this.add.text(W / 2, titleY, titleText, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${fs(0.09, 46)}px`,
      color: titleColor, stroke: titleStroke, strokeThickness: 5,
      shadow: { color: titleColor, blur: 24, fill: true }
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, y: titleY, duration: 500, ease: 'Back.easeOut', delay: 100 });

    // Confetti for new best
    if (isNewBest) {
      this.time.delayedCall(300, () => {
        for (let i = 0; i < 30; i++) {
          this.time.delayedCall(i * 40, () => {
            const x   = Phaser.Math.Between(W * 0.1, W * 0.9);
            const col = [0xffd700, 0xff6b35, 0x00f5d4, 0xff4444][Phaser.Math.Between(0, 3)];
            const p   = this.add.circle(x, H * 0.05, Phaser.Math.FloatBetween(3, 7), col).setDepth(20);
            this.tweens.add({ targets: p, y: H * 0.4, x: x + Phaser.Math.Between(-60, 60), alpha: 0, duration: Phaser.Math.Between(600, 1200), ease: 'Power1', onComplete: () => p.destroy() });
          });
        }
      });
    }

    // ── Score ─────────────────────────────────────────────────────────────
    const scoreY = panelY - panelH * 0.28;
    this.add.text(W / 2, scoreY, 'SCORE', {
      fontFamily: 'Arial, sans-serif', fontSize: `${fs(0.038, 16)}px`,
      color: '#778899', letterSpacing: 6
    }).setOrigin(0.5).setAlpha(0.8);

    const scoreNum = this.add.text(W / 2, scoreY + fs(0.05, 22) + 10, this.finalScore.toString(), {
      fontFamily: '"Arial Black", Impact, sans-serif', fontSize: `${fs(0.16, 80)}px`,
      color: '#ffffff', shadow: { color: '#ff6b35', blur: 20, fill: true }
    }).setOrigin(0.5).setAlpha(0).setScale(0.5);

    this.tweens.add({ targets: scoreNum, alpha: 1, scaleX: 1, scaleY: 1, duration: 500, ease: 'Back.easeOut', delay: 300 });

    // ── Stat boxes ────────────────────────────────────────────────────────
    const statsY = panelY + panelH * 0.02;
    const statW  = panelW * 0.42;
    this._statBox(W / 2 - statW * 0.55, statsY, statW, '🏆 BEST',    this.bestScore.toString(), 0xffd700, fs);
    this._statBox(W / 2 + statW * 0.55, statsY, statW, '🏀 BASKETS', this.baskets.toString(),   0x00f5d4, fs);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x334455, 0.8);
    div.lineBetween(W / 2 - panelW * 0.4, statsY + 44, W / 2 + panelW * 0.4, statsY + 44);

    // ── Buttons ───────────────────────────────────────────────────────────
    const btnAreaTop = panelY + panelH * 0.25;
    const btnW       = Math.min(panelW * 0.8, 280);
    const btnH       = Math.min(H * 0.072, 54);
    const btnGap     = btnH * 1.5;

    const playBtn = this._createButton(W / 2, btnAreaTop,          btnW,       btnH, 'PLAY AGAIN', 0xff6b35, 0xff9900, 800, fs);
    const menuBtn = this._createButton(W / 2, btnAreaTop + btnGap, btnW * 0.7, btnH * 0.85, 'MENU', 0x1a3a5a, 0x2a5a8a, 1000, fs);

    playBtn.on('click', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('GameScene'));
    });
    menuBtn.on('click', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('MenuScene'));
    });

    // ── Save ──────────────────────────────────────────────────────────────
    if (this.finalScore > 0) {
      YTPlayables.saveData({ bestScore: this.bestScore, lastScore: this.finalScore }).catch(() => {});
      YTPlayables.sendScore(this.bestScore);
    }
  }

  _statBox(x, y, w, label, value, color, fs) {
    this.add.rectangle(x, y, w, 70, 0x111d2e).setStrokeStyle(1.5, color, 0.5);
    this.add.text(x, y - 14, label, {
      fontFamily: 'Arial, sans-serif', fontSize: `${fs(0.032, 13)}px`, color: '#778899', letterSpacing: 2
    }).setOrigin(0.5);
    this.add.text(x, y + 14, value, {
      fontFamily: '"Arial Black", Impact, sans-serif', fontSize: `${fs(0.065, 28)}px`,
      color: Phaser.Display.Color.IntegerToColor(color).rgba
    }).setOrigin(0.5);
  }

  _createButton(x, y, w, h, label, fillColor, strokeColor, delay = 0, fs) {
    const emitter = new Phaser.Events.EventEmitter();
    const bg  = this.add.rectangle(x, y, w, h, fillColor).setStrokeStyle(2.5, strokeColor).setAlpha(0);
    const txt = this.add.text(x, y, label, {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${fs ? fs(0.055, 24) : 22}px`,
      color: '#ffffff', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [bg, txt], alpha: 1, y: y - 3, duration: 400, delay, ease: 'Back.easeOut' });

    bg.setInteractive({ useHandCursor: true });
    txt.setInteractive({ useHandCursor: true });
    bg.on('pointerdown',  () => emitter.emit('click'));
    txt.on('pointerdown', () => emitter.emit('click'));

    bg.on('pointerover', () => this.tweens.add({ targets: [bg, txt], scaleX: 1.05, scaleY: 1.05, duration: 100 }));
    bg.on('pointerout',  () => this.tweens.add({ targets: [bg, txt], scaleX: 1,    scaleY: 1,    duration: 100 }));

    this.time.delayedCall(delay + 500, () => {
      this.tweens.add({ targets: bg, scaleX: 1.02, scaleY: 1.02, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    return emitter;
  }
}