import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { generateAssets } from '../utils/AssetGenerator.js';
import { soundManager } from '../utils/SoundManager.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    YTPlayables.firstFrameReady();

    // With RESIZE scale mode, read dimensions from scale manager
    const W = this.scale.width;
    const H = this.scale.height;

    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Responsive font size: comfortable on both 320 px mobile and 1440 px desktop
    const titleSize = Math.min(W * 0.14, 90);

    this.add.text(W / 2, H * 0.35, 'HOOP', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${titleSize}px`,
      color: '#ff6b35',
      stroke: '#ff4500',
      strokeThickness: 4,
      shadow: { color: '#ff6b35', blur: 20, fill: true }
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.35 + titleSize * 0.95, 'DASH', {
      fontFamily: '"Arial Black", Impact, sans-serif',
      fontSize: `${titleSize}px`,
      color: '#00f5d4',
      stroke: '#00c4aa',
      strokeThickness: 4,
      shadow: { color: '#00f5d4', blur: 20, fill: true }
    }).setOrigin(0.5);

    // Loading bar
    const barW = Math.min(W * 0.65, 400);
    const barH = 12;
    const barX = W / 2 - barW / 2;
    const barY = H * 0.65;

    this.add.rectangle(W / 2, barY + barH / 2, barW + 4, barH + 4, 0x333355);
    const bar = this.add.rectangle(barX, barY + barH / 2, 0, barH, 0xff6b35).setOrigin(0, 0.5);

    this.add.text(W / 2, barY + 36, 'LOADING...', {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${Math.min(W * 0.038, 16)}px`,
      color: '#aaaacc',
      letterSpacing: 4
    }).setOrigin(0.5);

    this.tweens.add({ targets: bar, width: barW, duration: 800, ease: 'Power2' });

    generateAssets(this);
    soundManager.init();

    this.load.on('complete', () => { bar.setFillStyle(0x00f5d4); });
  }

  create() {
    this.time.delayedCall(600, () => { this.scene.start('MenuScene'); });
  }
}