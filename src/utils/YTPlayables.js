/**
 * YouTube Playables SDK Wrapper
 * Safely wraps all ytgame API calls with fallbacks for local dev
 */

export const YTPlayables = {
  firstFrameReady() {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.game?.firstFrameReady) {
        ytgame.game.firstFrameReady();
        console.log('[YT] firstFrameReady called');
      } else {
        console.log('[YT] firstFrameReady (local dev - no-op)');
      }
    } catch (e) {
      console.warn('[YT] firstFrameReady error:', e);
    }
  },

  gameReady() {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.game?.gameReady) {
        ytgame.game.gameReady();
        console.log('[YT] gameReady called');
      } else {
        console.log('[YT] gameReady (local dev - no-op)');
      }
    } catch (e) {
      console.warn('[YT] gameReady error:', e);
    }
  },

  sendScore(value) {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.engagement?.sendScore) {
        ytgame.engagement.sendScore({ value: Math.floor(value) });
        console.log('[YT] sendScore:', value);
      }
    } catch (e) {
      console.warn('[YT] sendScore error:', e);
    }
  },

  async saveData(data) {
    try {
      const str = JSON.stringify(data);
      if (typeof ytgame !== 'undefined' && ytgame?.game?.saveData) {
        await ytgame.game.saveData(str);
        console.log('[YT] saveData success');
      } else {
        // Local fallback
        localStorage.setItem('hoop_dash_save', str);
      }
    } catch (e) {
      console.warn('[YT] saveData error:', e);
    }
  },

  async loadData() {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.game?.loadData) {
        const str = await ytgame.game.loadData();
        if (str) return JSON.parse(str);
        return null;
      } else {
        // Local fallback
        const str = localStorage.getItem('hoop_dash_save');
        if (str) return JSON.parse(str);
        return null;
      }
    } catch (e) {
      console.warn('[YT] loadData error:', e);
      return null;
    }
  },

  isAudioEnabled() {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.system?.isAudioEnabled) {
        return ytgame.system.isAudioEnabled();
      }
      return true;
    } catch (e) {
      return true;
    }
  },

  onAudioEnabledChange(callback) {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.system?.onAudioEnabledChange) {
        ytgame.system.onAudioEnabledChange(callback);
      }
    } catch (e) {}
  },

  onPause(callback) {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.system?.onPause) {
        ytgame.system.onPause(callback);
      }
    } catch (e) {}
  },

  onResume(callback) {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.system?.onResume) {
        ytgame.system.onResume(callback);
      }
    } catch (e) {}
  },

  logError(msg) {
    try {
      if (typeof ytgame !== 'undefined' && ytgame?.health?.logError) {
        ytgame.health.logError(msg);
      }
    } catch (e) {}
  },

  inPlayablesEnv() {
    try {
      return typeof ytgame !== 'undefined' && ytgame?.IN_PLAYABLES_ENV === true;
    } catch (e) {
      return false;
    }
  }
};
