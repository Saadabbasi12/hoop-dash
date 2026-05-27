import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator.js';
import { soundManager } from '../utils/SoundManager.js';
import hoopdashUrl from '../assets/hoopdash.png';
import basketballUrl from '../assets/basketball.png';
import basketUrl from '../assets/basket.png';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    // firstFrameReady already called in main.js before Phaser started.
    // Load images — graceful fallback if files missing.
    this.load.image('basketball_png', basketballUrl);
    this.load.on('filecomplete-image-basketball_png', () => { this._usePng = true; });
    this.load.on('filefailed-image-basketball_png',  () => { this._usePng = false; });
    this.load.image('basket_net', basketUrl);
    this.load.image('hoopdash_logo', hoopdashUrl);

    const W = this.scale.width;
    const H = this.scale.height;
    const S = Math.min(W, H);

    this.cameras.main.setBackgroundColor('#030812');

    const barW = Math.min(W * 0.55, 300);
    const barH = 4;
    const barX = W / 2 - barW / 2;
    const barY = H * 0.72;

    this.add.rectangle(W / 2, barY + barH / 2, barW + 2, barH + 2, 0x111830);
    const bar    = this.add.rectangle(barX, barY + barH / 2, 2, barH, 0xff6b35).setOrigin(0, 0.5);
    const barDot = this.add.circle(barX + 2, barY + barH / 2, 5, 0xff9955, 1);

    this.tweens.add({
      targets: bar, width: barW, duration: 900, ease: 'Power2',
      onUpdate: () => { barDot.x = barX + bar.width; }
    });

    const pctText = this.add.text(W / 2 + barW / 2, barY - 14, '0%', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.min(S * 0.028, 12)}px`,
      color: '#ff6b35',
    }).setOrigin(1, 1);

    this.tweens.add({
      targets: { v: 0 }, v: 100, duration: 900, ease: 'Power2',
      onUpdate: (tw, t) => { pctText.setText(Math.floor(t.v) + '%'); },
      onComplete: () => { bar.setFillStyle(0x00e8c0); pctText.setText('100%'); }
    });

    const loadLabel = this.add.text(W / 2, barY + 20, 'LOADING', {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.min(S * 0.030, 12)}px`,
      color: '#2a4060', letterSpacing: 6
    }).setOrigin(0.5);

    let dotCount = 0;
    this.time.addEvent({
      delay: 280, repeat: 12,
      callback: () => { loadLabel.setText('LOADING' + '.'.repeat(dotCount % 4)); dotCount++; }
    });

    generateAssets(this);
    soundManager.init();
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    if (this.textures.exists('hoopdash_logo')) {
      const tex      = this.textures.get('hoopdash_logo').source[0];
      const logoMaxW = Math.min(W * 0.62, 320);
      const scale    = logoMaxW / tex.width;
      const logo     = this.add.image(W / 2, H * 0.40, 'hoopdash_logo').setScale(scale).setAlpha(0);
      this.tweens.add({ targets: logo, alpha: 1, duration: 500, ease: 'Cubic.easeOut' });
    } else {
      const S = Math.min(W, H);
      this.add.text(W / 2, H * 0.40, '🏀 HOOP DASH', {
        fontFamily: '"Arial Black", Impact, sans-serif',
        fontSize: `${Math.min(S * 0.13, 52)}px`,
        color: '#ff6b35', stroke: '#7a2c00', strokeThickness: 4,
      }).setOrigin(0.5);
    }

    if (this._usePng && this.textures.exists('basketball_png')) {
      if (this.textures.exists('ball')) this.textures.remove('ball');
      this.textures.get('basketball_png').key = 'ball';
      this.textures.list['ball'] = this.textures.list['basketball_png'];
      delete this.textures.list['basketball_png'];
    }

    this.time.delayedCall(700, () => this.scene.start('MenuScene'));
  }
}