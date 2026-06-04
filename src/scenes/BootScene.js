import Phaser from 'phaser';
import { generateAssets } from '../utils/AssetGenerator.js';
import { soundManager } from '../utils/SoundManager.js';
import hoopdashUrl from '../assets/hoopdash.png';
import basketballUrl from '../assets/basketball.png';
import basketUrl from '../assets/basket.png';
import backgroundUrl from '../assets/background.png';
import gameoverUrl from '../assets/gameover.png';
import menubgPortraitUrl from '../assets/menubgportrait.png';
import menubgLandscapeUrl from '../assets/menubglandscape.png';
import playbtnUrl from '../assets/playbtn.png';
import gameoverbgUrl from '../assets/gameoverbg.png';
import playagainbtnUrl from '../assets/playagainbtn.png';
import menubtnUrl from '../assets/menubtn.png';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    this.load.image('basketball_png', basketballUrl);
    this.load.image('bg', backgroundUrl);
    this.load.on('filecomplete-image-basketball_png', () => { this._usePng = true; });
    this.load.on('filefailed-image-basketball_png',  () => { this._usePng = false; });
    this.load.image('basket_net', basketUrl);
    this.load.image('hoopdash_logo', hoopdashUrl);
    this.load.image('gameover_img', gameoverUrl);
    this.load.image('menubgportrait',  menubgPortraitUrl);
    this.load.image('menubglandscape', menubgLandscapeUrl);
    this.load.image('playbtn', playbtnUrl);
    this.load.image('gameoverbg', gameoverbgUrl);
    this.load.image('playagainbtn', playagainbtnUrl);
    this.load.image('menubtn', menubtnUrl);

    // Font warm-up — force rasterise before we need it
    const fontTest = this.add.text(-9999, -9999, 'LOADING 100%', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: '32px',
    });
    this.time.delayedCall(120, () => fontTest.destroy());

    const W = this.scale.width;
    const H = this.scale.height;
    const S = Math.min(W, H);

    this.cameras.main.setBackgroundColor('#000000');

    const centerY = H * 0.72;
    const barW    = Math.min(W * 0.68, 340);
    const barH    = 3;
    const barX    = W / 2 - barW / 2;
    const barY    = centerY;

    const tickG = this.add.graphics();
    tickG.lineStyle(1, 0xffffff, 0.06);
    const segments = 10;
    for (let i = 1; i < segments; i++) {
      const tx = barX + (barW / segments) * i;
      tickG.lineBetween(tx, barY - 6, tx, barY + barH + 6);
    }

    const track = this.add.graphics();
    track.fillStyle(0x111111, 1);
    track.fillRoundedRect(barX - 1, barY - 1, barW + 2, barH + 2, 2);

    const glowBar = this.add.graphics();
    const _drawGlow = (w) => {
      glowBar.clear();
      if (w < 2) return;
      glowBar.fillStyle(0xff6b35, 0.18);
      glowBar.fillRoundedRect(barX - 2, barY - 4, w + 4, barH + 8, 3);
    };

    const fillBar = this.add.graphics();
    const _drawFill = (w, done) => {
      fillBar.clear();
      if (w < 1) return;
      const col = done ? 0x00f5d4 : 0xff6b35;
      fillBar.fillStyle(col, 1);
      fillBar.fillRoundedRect(barX, barY, w, barH, 1);
      fillBar.fillStyle(0xffffff, done ? 0.6 : 0.9);
      fillBar.fillRect(barX + w - 2, barY, 2, barH);
    };

    const dot = this.add.circle(barX, barY + barH / 2, 4.5, 0xff9955, 1);
    const dotRing = this.add.graphics();
    const _drawRing = (x, done) => {
      dotRing.clear();
      dotRing.lineStyle(1, done ? 0x00f5d4 : 0xff9955, 0.5);
      dotRing.strokeCircle(x, barY + barH / 2, 7.5);
    };

    const pctSize = Math.min(S * 0.062, 26);
    const pctShadow = this.add.text(W / 2 + barW / 2 + 2, barY - 18, '0%', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${pctSize}px`,
      color: '#330e00',
    }).setOrigin(1, 1).setAlpha(0.8);

    const pctText = this.add.text(W / 2 + barW / 2, barY - 18, '0%', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${pctSize}px`,
      color: '#ff9955',
    }).setOrigin(1, 1);

    const labelSize = Math.min(S * 0.034, 14);

    const labelShadow = this.add.text(barX + 2, barY + barH + 14, 'LOADING', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${labelSize}px`,
      color: '#000000',
      letterSpacing: 6,
    }).setOrigin(0, 0).setAlpha(1);

    const loadLabel = this.add.text(barX, barY + barH + 13, 'LOADING', {
      fontFamily: '"Bebas Neue", Impact, sans-serif',
      fontSize: `${labelSize}px`,
      color: '#5590c0',
      letterSpacing: 6,
    }).setOrigin(0, 0);

    const prog = { v: 0 };
    this.tweens.add({
      targets: prog, v: 100,
      duration: 900, ease: 'Power2',
      onUpdate: () => {
        const pct   = Math.floor(prog.v);
        const fillW = (prog.v / 100) * barW;
        const dotX  = barX + fillW;
        const done  = prog.v >= 99.9;

        _drawGlow(fillW);
        _drawFill(fillW, done);

        dot.x = dotX;
        dot.setFillStyle(done ? 0x00f5d4 : 0xff9955);
        _drawRing(dotX, done);

        pctShadow.setText(pct + '%');
        pctText.setText(pct + '%');

        if (done) {
          pctText.setStyle({ color: '#00f5d4' });
          pctShadow.setStyle({ color: '#003d30' });
          loadLabel.setStyle({ color: '#00c8a8' });
          labelShadow.setStyle({ color: '#000000' });
        }
      },
    });

    this.tweens.add({
      targets: dot, scaleX: 1.35, scaleY: 1.35,
      duration: 480, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const dotLabels = ['LOADING', 'LOADING .', 'LOADING . .', 'LOADING . . .'];
    let dotIdx = 0;
    this.time.addEvent({
      delay: 260, repeat: 14,
      callback: () => {
        dotIdx = (dotIdx + 1) % dotLabels.length;
        loadLabel.setText(dotLabels[dotIdx]);
        labelShadow.setText(dotLabels[dotIdx]);
      },
    });

    const scanG = this.add.graphics().setAlpha(0.03).setDepth(50);
    for (let sy = 0; sy < H; sy += 4) {
      scanG.lineStyle(1, 0xffffff, 1);
      scanG.lineBetween(0, sy, W, sy);
    }

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
        fontFamily: '"Bebas Neue", Impact, sans-serif',
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