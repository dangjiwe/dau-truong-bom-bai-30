/**
 * ĐẤU TRƯỜNG BOM TIN HỌC 10 - BÀI 30
 * SOUND & PROCEDURAL BGM ENGINE (WEB AUDIO API)
 * 100% Thuần Web Audio API - Hoạt động độc lập, không cần tải file ngoài, 0MB băng thông!
 */

(function (window) {
  'use strict';

  let audioCtx = null;
  let masterGain = null;
  let sfxGain = null;
  let bgmGain = null;

  let isAudioUnlocked = false;
  let soundEnabled = true;
  let bgmEnabled = true;

  // Tần số các nốt nhạc chuẩn (A4 = 440Hz)
  const NOTE = {
    A1: 55.00, B1: 61.74,
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
  };

  // Khởi tạo AudioContext
  function getContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioCtx = new AudioContextClass();

      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);

      sfxGain = audioCtx.createGain();
      sfxGain.gain.setValueAtTime(0.55, audioCtx.currentTime);
      sfxGain.connect(masterGain);

      bgmGain = audioCtx.createGain();
      bgmGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      bgmGain.connect(masterGain);
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Tự động mở khóa AudioContext sau lần chạm/click đầu tiên
  function unlockAudio() {
    if (isAudioUnlocked) return;
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        isAudioUnlocked = true;
      });
    } else if (ctx) {
      isAudioUnlocked = true;
    }
  }

  ['click', 'touchstart', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });

  // Tạo đệm White Noise dùng cho trống Snare, Hi-hat, Nổ bom
  let noiseBuffer = null;
  function getNoiseBuffer(ctx) {
    if (!noiseBuffer) {
      const bufferSize = ctx.sampleRate * 1.0;
      noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBuffer;
  }

  // ==========================================
  // PROCEDURAL BGM ENGINE (CHIPTUNE / ARCADE)
  // Tự động điều chỉnh nhịp điệu theo diễn biến trận đấu
  // ==========================================
  let bgmMode = 'none'; // 'lobby' | 'battle' | 'panic' | 'victory' | 'none'
  let bgmInterval = null;
  let bgmStep = 0;
  let nextStepTime = 0;

  // Giai điệu và Hợp âm cho các chế độ
  const BGM_PATTERNS = {
    // 1. PHÒNG CHỜ (LOBBY): Nhẹ nhàng, tươi vui, thư giãn (104 BPM)
    lobby: {
      bpm: 104,
      bass: [
        NOTE.A2, 0, NOTE.A2, 0, NOTE.F2, 0, NOTE.F2, 0,
        NOTE.C3, 0, NOTE.C3, 0, NOTE.G2, 0, NOTE.G2, 0
      ],
      lead: [
        NOTE.C4, NOTE.E4, NOTE.A4, NOTE.E4, NOTE.A3, NOTE.C4, NOTE.F4, NOTE.C4,
        NOTE.G3, NOTE.C4, NOTE.E4, NOTE.C4, NOTE.G3, NOTE.B3, NOTE.D4, NOTE.G4
      ],
      kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    },

    // 2. THI ĐẤU BÌNH THƯỜNG (BATTLE): Dồn dập, sôi động, phong cách Arcade (128 BPM)
    battle: {
      bpm: 128,
      bass: [
        NOTE.A2, NOTE.A2, 0, NOTE.A3, NOTE.F2, NOTE.F2, 0, NOTE.F3,
        NOTE.C2, NOTE.C2, 0, NOTE.C3, NOTE.G2, NOTE.G2, NOTE.B2, NOTE.G2
      ],
      lead: [
        NOTE.E4, NOTE.A4, NOTE.C5, NOTE.B4, NOTE.A4, NOTE.E4, NOTE.F4, NOTE.A4,
        NOTE.G4, NOTE.C5, NOTE.E5, NOTE.D5, NOTE.C5, NOTE.G4, NOTE.B4, NOTE.D5
      ],
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]
    },

    // 3. CAO TRÀO BÁO ĐỘNG (PANIC): Bom dưới 5s hoặc Trận dưới 60s (148 BPM cực căng thẳng!)
    panic: {
      bpm: 148,
      bass: [
        NOTE.A2, NOTE.A3, NOTE.A2, NOTE.A3, NOTE.F2, NOTE.F3, NOTE.F2, NOTE.F3,
        NOTE.D2, NOTE.D3, NOTE.D2, NOTE.D3, NOTE.E2, NOTE.E3, NOTE.E2, NOTE.E3
      ],
      lead: [
        NOTE.E5, NOTE.A5, NOTE.E5, NOTE.A5, NOTE.F5, NOTE.A5, NOTE.F5, NOTE.A5,
        NOTE.G5, NOTE.B5, NOTE.G5, NOTE.B5, NOTE.A5, NOTE.C6, NOTE.B5, NOTE.G5
      ],
      kick:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      hihat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    },

    // 4. VINH DANH QUÁN QUÂN (VICTORY): Hân hoan, rộn rã ăn mừng (120 BPM)
    victory: {
      bpm: 120,
      bass: [
        NOTE.C3, 0, NOTE.C3, 0, NOTE.F2, 0, NOTE.F2, 0,
        NOTE.G2, 0, NOTE.G2, 0, NOTE.C3, 0, NOTE.G2, NOTE.C3
      ],
      lead: [
        NOTE.C5, 0, NOTE.E5, 0, NOTE.G5, 0, NOTE.C6, 0,
        NOTE.B5, NOTE.A5, NOTE.G5, NOTE.E5, NOTE.C5, NOTE.D5, NOTE.E5, NOTE.C5
      ],
      kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hihat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    }
  };

  // Lập lịch phát 1 bước nốt nhạc (Lookahead Web Audio Scheduling)
  function scheduleBGMStep(step, time, pattern) {
    const ctx = getContext();
    if (!ctx || !bgmEnabled || !soundEnabled) return;

    // 1. Trống Bass (Kick Drum)
    if (pattern.kick && pattern.kick[step]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(35, time + 0.08);

      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

      osc.connect(gain);
      gain.connect(bgmGain);
      osc.start(time);
      osc.stop(time + 0.09);
    }

    // 2. Trống Snare
    if (pattern.snare && pattern.snare[step]) {
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1200, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(bgmGain);
      noise.start(time);
      noise.stop(time + 0.08);
    }

    // 3. Trống Hi-hat
    if (pattern.hihat && pattern.hihat[step]) {
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6500, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.035);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(bgmGain);
      noise.start(time);
      noise.stop(time + 0.035);
    }

    // 4. Âm trầm Bassline
    const bassNote = pattern.bass[step];
    if (bassNote) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassNote, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, time);
      filter.Q.setValueAtTime(3.0, time);

      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.11);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(bgmGain);
      osc.start(time);
      osc.stop(time + 0.12);
    }

    // 5. Giai điệu dẫn (Lead Synth)
    const leadNote = pattern.lead[step];
    if (leadNote) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = (bgmMode === 'lobby') ? 'sine' : 'square';
      osc.frequency.setValueAtTime(leadNote, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, time);

      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.13);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(bgmGain);
      osc.start(time);
      osc.stop(time + 0.14);
    }
  }

  // Bộ lập lịch thời gian thực (Web Audio Scheduler)
  function bgmScheduler() {
    const ctx = getContext();
    if (!ctx) return;
    const pattern = BGM_PATTERNS[bgmMode];
    if (!pattern) return;

    const secondsPerStep = (60.0 / pattern.bpm) / 4.0;
    const lookahead = 0.12;

    while (nextStepTime < ctx.currentTime + lookahead) {
      scheduleBGMStep(bgmStep, nextStepTime, pattern);
      nextStepTime += secondsPerStep;
      bgmStep = (bgmStep + 1) % 16;
    }
  }

  // ==========================================
  // SFX ENGINE (HIỆU ỨNG ÂM THANH ARCADE)
  // ==========================================
  const SFX = {
    // 1. Chuyền bom vút sang tay người khác
    pass: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.14);

      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    },

    // 2. Nhận bom mới: Chuông còi cảnh báo khẩn
    receiveBomb: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      [0, 0.12].forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime + offset);
        osc.frequency.setValueAtTime(1174, ctx.currentTime + offset + 0.06);

        gain.gain.setValueAtTime(0.3, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + offset + 0.11);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.12);
      });
    },

    // 3. Bom nổ sấm sét (Cinematic Heavy Explosion)
    explosion: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;

      // Tiếng ầm ĩ của sóng chấn động (Noise)
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(360, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.85);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.85, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      noise.start();
      noise.stop(ctx.currentTime + 0.9);

      // Sóng hạ âm rung chuyển (Sub-bass rumble)
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.7);

      subGain.gain.setValueAtTime(0.65, ctx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.75);

      sub.connect(subGain);
      subGain.connect(sfxGain);
      sub.start();
      sub.stop(ctx.currentTime + 0.75);
    },

    // 4. Mở rương báu (Magical Chest Chime)
    chestOpen: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const notes = [NOTE.E5, NOTE.G5, NOTE.B5, NOTE.E6];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);

        gain.gain.setValueAtTime(0.22, ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.05 + 0.22);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(ctx.currentTime + idx * 0.05);
        osc.stop(ctx.currentTime + idx * 0.05 + 0.25);
      });
    },

    // 5. Trả lời ĐÚNG rương báu (Triumphant Ding-Ding)
    correct: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);

        gain.gain.setValueAtTime(0.25, ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.07 + 0.35);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(ctx.currentTime + idx * 0.07);
        osc.stop(ctx.currentTime + idx * 0.07 + 0.38);
      });
    },

    // 6. Trả lời SAI (Buzzer gỡ lỗi vui nhộn)
    wrong: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.32);

      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.33);
    },

    // 7. Tốc biến (Laser Warp Beam)
    teleport: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.22);

      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.24);

      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    },

    // 8. Lướt Dash gió
    dash: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      noise.start();
      noise.stop(ctx.currentTime + 0.16);
    },

    // 9. Choáng / Đóng băng
    stun: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    },

    // 10. Hồi sinh hoàn tất (1-UP Retro Arcade)
    respawn: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      [NOTE.E5, NOTE.G5, NOTE.E6, NOTE.C6, NOTE.D6, NOTE.G6].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.055);

        gain.gain.setValueAtTime(0.22, ctx.currentTime + idx * 0.055);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.055 + 0.18);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(ctx.currentTime + idx * 0.055);
        osc.stop(ctx.currentTime + idx * 0.055 + 0.2);
      });
    },

    // 11. Bão rương Debug xuất hiện (Power-up Fanfare)
    powerup: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.06 + 0.25);

        osc.connect(gain);
        gain.connect(sfxGain);
        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.26);
      });
    },

    // 12. Tiếng đếm ngược khẩn cấp (Beep)
    beepUrgent: (pitch = 850) => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, ctx.currentTime);

      gain.gain.setValueAtTime(0.24, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    },

    // 13. Nút bấm UI / Tick
    tick: () => {
      if (!soundEnabled) return;
      const ctx = getContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, ctx.currentTime);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    }
  };

  // ==========================================
  // PUBLIC API: GameAudio
  // ==========================================
  const GameAudio = {
    // Mở khóa AudioContext
    init: () => {
      unlockAudio();
    },

    // Phát BGM theo chế độ ('lobby', 'battle', 'panic', 'victory')
    playBGM: (mode) => {
      unlockAudio();
      if (!BGM_PATTERNS[mode]) mode = 'battle';
      if (bgmMode === mode && bgmInterval) return;

      bgmMode = mode;
      bgmStep = 0;
      const ctx = getContext();
      if (ctx) {
        nextStepTime = ctx.currentTime + 0.05;
      }

      if (bgmInterval) clearInterval(bgmInterval);
      bgmInterval = setInterval(bgmScheduler, 25);
    },

    // Tắt BGM
    stopBGM: () => {
      bgmMode = 'none';
      if (bgmInterval) {
        clearInterval(bgmInterval);
        bgmInterval = null;
      }
    },

    // Đổi chế độ BGM mượt mà
    setBGMMode: (mode) => {
      if (bgmMode !== mode) {
        GameAudio.playBGM(mode);
      }
    },

    // Bật/tắt toàn bộ âm thanh
    toggleMaster: () => {
      unlockAudio();
      soundEnabled = !soundEnabled;
      if (!soundEnabled) {
        GameAudio.stopBGM();
      }
      return soundEnabled;
    },

    // Trạng thái âm thanh hiện tại
    isMasterEnabled: () => soundEnabled,

    // Bật/tắt riêng BGM
    toggleBGM: () => {
      unlockAudio();
      bgmEnabled = !bgmEnabled;
      if (!bgmEnabled) {
        GameAudio.stopBGM();
      }
      return bgmEnabled;
    },

    isBGMEnabled: () => bgmEnabled,
    setBGMEnabled: (enabled) => {
      bgmEnabled = !!enabled;
      if (!bgmEnabled) GameAudio.stopBGM();
    },
    setMasterEnabled: (enabled) => {
      soundEnabled = !!enabled;
      if (!soundEnabled) GameAudio.stopBGM();
    },

    // Bộ sưu tập SFX
    sfx: SFX
  };

  window.GameAudio = GameAudio;

})(typeof window !== 'undefined' ? window : this);
