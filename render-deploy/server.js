const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const { QUESTIONS_BANK, getRandomQuestion } = require('./questions');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Specific routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/spectator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'spectator.html'));
});

app.get('/tv', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'spectator.html'));
});

// Helper: Get local IP for QR code and mobile connection
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  for (const devName in interfaces) {
    const isVirtual = /vmware|virtual|vethernet|wsl|pseudo|loopback/i.test(devName);
    const isWifiOrEthernet = /wi-fi|wifi|wireless|ethernet|lan/i.test(devName);
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal && !alias.address.startsWith('169.254')) {
        candidates.push({
          address: alias.address,
          name: devName,
          priority: isWifiOrEthernet ? 2 : (isVirtual ? 0 : 1)
        });
      }
    }
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

function resolveJoinUrl(req) {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  const host = req ? req.get('host') : null;
  const protocol = (req && (req.headers['x-forwarded-proto'] || req.protocol)) || 'http';

  // Nếu host là domain online (Render, Localtunnel, Ngrok, v.v...) hoặc IP cụ thể
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return `${protocol}://${host}`;
  }

  // Khi truy cập qua localhost trên máy tính cá nhân, tự động dùng IP Wi-Fi thật để điện thoại quét mã vào được!
  const localIp = getLocalIpAddress();
  return `http://${localIp}:${PORT}`;
}

app.get('/api/server-info', (req, res) => {
  const joinUrl = resolveJoinUrl(req);
  res.json({
    ip: getLocalIpAddress(),
    port: PORT,
    joinUrl: joinUrl,
    url: joinUrl,
    totalQuestions: QUESTIONS_BANK.length
  });
});

app.get('/api/questions', (req, res) => {
  res.json(QUESTIONS_BANK);
});

// ==========================================
// GAME CONFIGURATION (QUY MÔ 40 HỌC SINH)
// ==========================================
const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 1000;
const PLAYER_RADIUS = 22;
const BASE_SPEED = 240; // px/sec
const BOMB_SPEED_MULTIPLIER = 1.25; // 25% faster for bomb holder
const DASH_DISTANCE = 90; // px
const DASH_COOLDOWN = 3.0; // seconds
const DASH_DURATION = 0.15; // seconds
const DASH_SPEED = DASH_DISTANCE / DASH_DURATION;
const TELEPORT_COOLDOWN = 12.0; // seconds for bomb holder teleport skill
let BOMB_COUNTDOWN_DEFAULT = 15.0; // 15.0s theo luật sinh tồn mới
const GRACE_PERIOD = 2.5; // seconds immunity from previous passer

// Đấu trường phòng Lab Tin học 1600 x 1000
const OBSTACLES = [
  // 4 góc
  { type: 'circle', x: 320, y: 220, radius: 48 },
  { type: 'circle', x: 1280, y: 220, radius: 48 },
  { type: 'circle', x: 320, y: 780, radius: 48 },
  { type: 'circle', x: 1280, y: 780, radius: 48 },
  // Cụm Server Racks trung tâm tạo hành lang
  { type: 'rect', x: 520, y: 380, width: 80, height: 240, radius: 12 },
  { type: 'rect', x: 1000, y: 380, width: 80, height: 240, radius: 12 },
  { type: 'rect', x: 700, y: 200, width: 200, height: 70, radius: 12 },
  { type: 'rect', x: 700, y: 730, width: 200, height: 70, radius: 12 },
  // Lõi trung tâm
  { type: 'circle', x: 800, y: 500, radius: 44 }
];

// ==========================================

// ==========================================
// BẢO MẬT & MẬT KHẨU MÀN HÌNH GIÁO VIÊN (HOST AUTH)
// ==========================================
let TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || '123456';
const authenticatedHostSockets = new Set();

function isHostAuthorized(socket) {
  return authenticatedHostSockets.has(socket.id) || !!socket.isHostAuthenticated;
}

function requireHostAuth(socket) {
  if (isHostAuthorized(socket)) return true;
  socket.emit('host_auth_required', { message: 'Cần mật khẩu giáo viên để thực hiện thao tác này!' });
  return false;
}

// GAME & TOURNAMENT STATE (5 PHÚT TỔNG TRẬN ĐẤU)
// ==========================================
const MATCH_TOTAL_TIME = 5 * 60; // 5 phút = 300 giây

let gameState = {
  status: 'LOBBY', // 'LOBBY' | 'ROUND_INTRO' | 'PLAYING' | 'INTERMISSION' | 'GAME_OVER'
  roundNumber: 0,
  bombTimer: BOMB_COUNTDOWN_DEFAULT,
  matchTimer: MATCH_TOTAL_TIME,
  matchDuration: MATCH_TOTAL_TIME,
  bombHolderId: null,
  immunePlayerId: null,
  graceTimer: 0,
  introCountdown: 0,
  activeQuiz: null,
  winner: null,
  lastEventLog: []
};

// Registered players: id -> { id, socketId, name, avatar, color, isBot, score, correctCount, wrongCount, explodedCount }
let players = new Map();

// Game physics players: id -> physics & state object
let gamePlayers = new Map();

// Rương báu trắc nghiệm: chestId -> { id, x, y, radius, attemptsLeft, createdAt }
let chests = new Map();
let chestSpawnTimer = 0;
const CHEST_FAST_RESPAWN_DELAY = 3.0; // Đúng 3 giây sau khi 1 rương bị giải hoặc biến mất!
let survivalScoreAccumulator = 0;

// Hệ thống thống kê phân tích câu hỏi học sinh làm sai (phục vụ Review Phase Bài 30)
let questionStats = new Map(); // questionId -> { id, question, options, correct, correctAnswer, explain, wrongCount, correctCount, wrongPlayers: [] }

function recordQuestionAnswer(question, isCorrect, playerName, chosenIndex) {
  if (!question || !question.id) return;
  let stat = questionStats.get(question.id);
  if (!stat) {
    stat = {
      id: question.id,
      question: question.question,
      options: question.options,
      correct: question.correct,
      correctAnswer: (question.options && question.options[question.correct]) ? question.options[question.correct] : '',
      explain: question.explain || '',
      wrongCount: 0,
      correctCount: 0,
      wrongPlayers: []
    };
    questionStats.set(question.id, stat);
  }
  if (isCorrect) {
    stat.correctCount++;
  } else {
    stat.wrongCount++;
    if (playerName && !stat.wrongPlayers.includes(playerName)) {
      stat.wrongPlayers.push(playerName);
    }
  }
}

function getTopWrongQuestions(limit = 3) {
  const list = Array.from(questionStats.values()).filter(q => q.wrongCount > 0);
  list.sort((a, b) => b.wrongCount - a.wrongCount);
  return list.slice(0, limit);
}

// Trạng thái sự kiện "Bão Rương" (Treasure Rain Event)
let treasureRainActive = false;
let treasureRainTimer = 0;
let rain1Triggered = false; // Phút 04:00 (còn 240s)
let rain2Triggered = false; // Phút 01:00 (còn 60s)

// 1. QUY MÔ HÓA THEO SĨ SỐ PHÒNG CHƠI (DYNAMIC CAPACITY - TỐI ƯU RENDER 512MB RAM)
// - Dưới 15 học sinh: Cố định 3 rương
// - Từ 15 - 40 học sinh: Cố định 4 rương (chia 4 góc sân đấu tạo cạnh tranh cao)
// - Bão Rương: Tối đa 5 rương (tránh bão gói tin socket gây OOM crash)
function getMaxChests() {
  const count = gamePlayers.size || players.size || 0;
  let cap = (count >= 15) ? 4 : 3;
  if (treasureRainActive) {
    cap = 5;
  }
  return cap;
}

function isTreasureRainActive() {
  return treasureRainActive;
}

// 2. RÚT NGẮN CHU KỲ HỒI SINH (FAST RESPAWN CYCLE - ĐÚNG 3 GIÂY)
function scheduleChestRespawn(delayMs = 3000) {
  setTimeout(() => {
    if (gameState.status === 'PLAYING') {
      const maxAllowed = getMaxChests();
      if (chests.size < maxAllowed) {
        spawnChest();
      }
    }
  }, delayMs);
}

// 3. KÍCH HOẠT SỰ KIỆN "BÃO RƯƠNG" (TREASURE RAIN EVENT - 30 GIÂY)
function triggerTreasureRain() {
  treasureRainActive = true;
  treasureRainTimer = 30.0;
  const newCap = getMaxChests();

  io.emit('treasure_rain_started', {
    duration: 30,
    pointMultiplier: 1.5,
    maxChests: newCap
  });

  broadcastTopAnnouncement(
    '⚠️ CƠN MƯA RƯƠNG DEBUG XUẤT HIỆN!',
    'Trong 30s: Rương tăng gấp đôi & Trả lời đúng nhận x1.5 điểm (+30đ)!',
    'chest',
    '🌧️'
  );
  addEventLog(`🌧️⚠️ BÃO RƯƠNG XUẤT HIỆN! Số lượng rương tăng gấp đôi (${newCap} rương) & mỗi câu đúng x1.5 điểm!`, 'warning');

  // Rơi ngay các rương mới xuống sàn đấu cho đến khi đạt trần gấp đôi!
  while (chests.size < newCap) {
    spawnChest();
  }
  rosterDirty = true;
  broadcastGameState();
}

// Helper: tìm vị trí ngẫu nhiên an toàn trên bản đồ
function getSafeRandomPosition(minDistFromX = null, minDistFromY = null, minDist = 0) {
  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    const x = Math.floor(Math.random() * (ARENA_WIDTH - 200)) + 100;
    const y = Math.floor(Math.random() * (ARENA_HEIGHT - 200)) + 100;

    // Kiểm tra khoảng cách với điểm cho trước
    if (minDistFromX !== null && minDistFromY !== null) {
      const d = Math.hypot(x - minDistFromX, y - minDistFromY);
      if (d < minDist) continue;
    }

    // Kiểm tra không va vào chướng ngại vật
    let hitObstacle = false;
    for (const obs of OBSTACLES) {
      if (obs.type === 'circle') {
        if (Math.hypot(x - obs.x, y - obs.y) < obs.radius + PLAYER_RADIUS + 30) {
          hitObstacle = true;
          break;
        }
      } else if (obs.type === 'rect') {
        if (x >= obs.x - 40 && x <= obs.x + obs.width + 40 &&
            y >= obs.y - 40 && y <= obs.y + obs.height + 40) {
          hitObstacle = true;
          break;
        }
      }
    }
    if (!hitObstacle) return { x, y };
  }
  return { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
}

function addEventLog(message, type = 'info') {
  const event = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    message,
    type
  };
  gameState.lastEventLog.unshift(event);
  if (gameState.lastEventLog.length > 8) {
    gameState.lastEventLog.pop();
  }
  io.emit('game_event_log', event);
}

// Thông báo nổi bật ở giữa trên cùng (Top-Center Announcement)
function broadcastTopAnnouncement(title, subtitle, type = 'info', icon = '📢') {
  io.emit('top_announcement', {
    id: Date.now() + Math.random(),
    title,
    subtitle,
    type, // 'correct' | 'wrong' | 'eliminated' | 'chest' | 'info'
    icon
  });
}

// Tìm vị trí an toàn cho rương báu: cách người chơi tối thiểu 5 mét (~160px)
function getSafeRandomChestPosition(minDistFromPlayers = 160) {
  let attempts = 0;
  while (attempts < 60) {
    attempts++;
    const pos = getSafeRandomPosition();
    let tooClose = false;
    for (const p of gamePlayers.values()) {
      if (p.isAlive && Math.hypot(pos.x - p.x, pos.y - p.y) < minDistFromPlayers) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) return pos;
  }
  return getSafeRandomPosition();
}

// Sinh rương báu trắc nghiệm ngẫu nhiên
function spawnChest() {
  const maxAllowed = getMaxChests();
  if (chests.size >= maxAllowed) return null;
  const pos = getSafeRandomChestPosition(160);
  const id = 'chest_' + Math.random().toString(36).substring(2, 9);
  const chest = {
    id,
    x: pos.x,
    y: pos.y,
    radius: 28,
    attemptsLeft: 2,
    openedByPlayerId: null, // Khóa rương: chỉ 1 người mở tại 1 thời điểm
    decayTimer: 20.0, // Tuổi thọ rương chưa mở: 20 giây tự biến mất làm mới vị trí
    createdAt: Date.now()
  };
  chests.set(id, chest);
  io.emit('chest_spawned', chest);
  addEventLog(`🎁 Rương Báu Debug đã xuất hiện trên sàn đấu! (Hiện có ${chests.size}/${maxAllowed})`, 'info');
  return chest;
}

// ==========================================
// PHYSICS & COLLISION ENGINE
// ==========================================
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function resolveWallCollision(p) {
  const pad = 24;
  p.x = clamp(p.x, pad + p.radius, ARENA_WIDTH - pad - p.radius);
  p.y = clamp(p.y, pad + p.radius, ARENA_HEIGHT - pad - p.radius);
}

function resolveObstacleCollision(p) {
  for (const obs of OBSTACLES) {
    if (obs.type === 'circle') {
      const dx = p.x - obs.x;
      const dy = p.y - obs.y;
      const dist = Math.hypot(dx, dy);
      const minDist = p.radius + obs.radius;
      if (dist < minDist && dist > 0.0001) {
        const overlap = minDist - dist;
        p.x += (dx / dist) * overlap;
        p.y += (dy / dist) * overlap;
      }
    } else if (obs.type === 'rect') {
      const nearestX = clamp(p.x, obs.x, obs.x + obs.width);
      const nearestY = clamp(p.y, obs.y, obs.y + obs.height);
      const dx = p.x - nearestX;
      const dy = p.y - nearestY;
      const dist = Math.hypot(dx, dy);
      if (dist < p.radius) {
        if (dist > 0.0001) {
          const overlap = p.radius - dist;
          p.x += (dx / dist) * overlap;
          p.y += (dy / dist) * overlap;
        } else {
          if (p.x < obs.x + obs.width / 2) {
            p.x = obs.x - p.radius;
          } else {
            p.x = obs.x + obs.width + p.radius;
          }
        }
      }
    }
  }
}

function resolvePlayerCollisions() {
  const activeList = Array.from(gamePlayers.values()).filter(p => p.isAlive);

  for (let i = 0; i < activeList.length; i++) {
    for (let j = i + 1; j < activeList.length; j++) {
      const p1 = activeList[i];
      const p2 = activeList[j];

      // Nếu 1 trong 2 người đang tàng hình / mở rương: XUYÊN QUA NHAU, KHÔNG ĐẨY NHAU, KHÔNG DÍ VÔ TƯỜNG!
      if (p1.isInvisible || p1.isOpeningChest || p2.isInvisible || p2.isOpeningChest) {
        continue;
      }

      const minDist = p1.radius + p2.radius;
      const dx = p2.x - p1.x;
      if (Math.abs(dx) >= minDist) continue;
      const dy = p2.y - p1.y;
      if (Math.abs(dy) >= minDist) continue;
      const dist = Math.hypot(dx, dy);

      if (dist < minDist && dist > 0.0001) {
        // Đẩy mềm (Soft Relaxation) chống va đập dao động tần số cao
        const push = Math.min((minDist - dist) * 0.2, 3.5);
        const nx = dx / dist;
        const ny = dy / dist;
        p1.x -= nx * push;
        p1.y -= ny * push;
        p2.x += nx * push;
        p2.y += ny * push;

        // Xử lý chạm chuyền bom tức thì (Instant Bomb Tag 60 FPS)
        if (gameState.status === 'PLAYING') {
          checkTriggerPassBomb(p1, p2);
        }
      }
    }
  }

  // Luôn đảm bảo sau khi đẩy nhau, mọi người chơi đều nằm trong biên hợp lệ trước khi gửi qua Socket
  for (const p of activeList) {
    resolveWallCollision(p);
    resolveObstacleCollision(p);
  }
}

// ==========================================
// QUIZ PASSING & UNFREEZE LOGIC
// ==========================================

// ==========================================
// CHUYỀN BOM TỨC THÌ (TẦM CHẠM TỰ NHIÊN 68PX - CHUẨN XÁC 100% VỚI MÀN HÌNH)
// ==========================================
const BOMB_TAG_RADIUS = 68; // Tương ứng 2 nhân vật chạm mép ngoài nhau (36px + 36px = 72px)
const BOMB_TAG_RADIUS_SQ = BOMB_TAG_RADIUS * BOMB_TAG_RADIUS;

function checkBombTagPassing() {
  if (gameState.status !== 'PLAYING') return;
  const holder = gamePlayers.get(gameState.bombHolderId);
  if (!holder || !holder.isAlive || !holder.hasBomb) return;
  if (holder.isFrozen || holder.isStunned || holder.isRespawning || holder.isOpeningChest) return;
  if (holder.passCooldown > 0) return;

  for (const target of gamePlayers.values()) {
    if (!target.isAlive || target.id === holder.id) continue;
    if (target.isOpeningChest || target.isInvisible || target.isStunned || target.isRespawning) continue;
    if (target.id === gameState.immunePlayerId && gameState.graceTimer > 0) continue;

    const dx = target.x - holder.x;
    if (Math.abs(dx) > BOMB_TAG_RADIUS) continue;
    const dy = target.y - holder.y;
    if (Math.abs(dy) > BOMB_TAG_RADIUS) continue;

    const distSq = dx * dx + dy * dy;
    if (distSq <= BOMB_TAG_RADIUS_SQ) {
      triggerInstantBombPass(holder, target);
      break;
    }
  }
}

function checkTriggerPassBomb(p1, p2) {
  checkBombTagPassing();
}

function triggerInstantBombPass(holder, target) {
  // 1. CHUYỀN BOM SANG TAY TỨC THÌ (60 FPS, không delay!)
  holder.hasBomb = false;
  target.hasBomb = true;
  target.passCooldown = 0; // Đảm bảo người nhận mới KHÔNG bị cooldown tồn đọng
  gameState.bombHolderId = target.id;

  // 2. GRACE PERIOD 1.0s & NO TAG-BACK: Người vừa chuyền được miễn nhiễm 1.0s chống bị chuyền ngược lại
  gameState.immunePlayerId = holder.id;
  gameState.graceTimer = 1.0;
  holder.passCooldown = 1.2;

  // 3. BẢO HIỂM PACING: Đảm bảo người nhận bom có tối thiểu 4.0s để kịp phản xạ rượt đuổi người khác
  if (gameState.bombTimer < 4.0) {
    gameState.bombTimer = 4.0;
  }

  // 4. THƯỞNG ĐIỂM: Thưởng +5 điểm cho người chuyền bom thành công
  holder.score = (holder.score || 0) + 5;
  const baseP = players.get(holder.id);
  if (baseP) baseP.score = holder.score;

  // 5. PHÁT SỰ KIỆN TỨC THÌ TỚI TẤT CẢ CLIENTS
  io.emit('bomb_passed', {
    fromId: holder.id,
    fromName: holder.name,
    fromAvatar: holder.avatar || '🏃',
    toId: target.id,
    toName: target.name,
    toAvatar: target.avatar || '💣',
    bombTimer: Math.round(gameState.bombTimer * 10) / 10
  });

  broadcastTopAnnouncement(
    `⚡ ${holder.name} CHUYỀN BOM CHO ${target.name}! (+5đ)`,
    `Chuyền tức thì! ${target.name} mau rượt đuổi bạn khác!`,
    'warning',
    '⚡'
  );
  addEventLog(`⚡ ${holder.name} (+5đ) đã chuyền bom tức thì sang ${target.name}!`, 'warning');

  rosterDirty = true;
  broadcastGameState();
}

// Khóa di chuyển người nhận bom & yêu cầu trả lời câu hỏi mở khóa
function freezeAndAssignUnlockQuiz(target) {
  target.isFrozen = true;
  target.targetVx = 0;
  target.targetVy = 0;
  const question = getRandomQuestion();
  target.unlockQuestion = question;

  const payload = {
    type: 'UNLOCK',
    playerId: target.id,
    playerName: target.name,
    playerAvatar: target.avatar || '🎓',
    questionId: question.id,
    question: question.question,
    options: question.options
  };

  gameState.activeQuiz = payload;

  const targetSocketId = target.socketId || (!target.isBot ? target.id : null);
  if (targetSocketId) {
    io.to(targetSocketId).emit('show_unlock_quiz', payload);
  }
  io.emit('player_frozen_quiz', payload);
  addEventLog(`❄️ ${target.name} dính bom và bị đóng băng! Phải trả lời đúng để mở khóa!`, 'warning');

  // Bot tự động giải đố mở khóa
  if (target.isBot) {
    scheduleBotUnlockAnswer(target);
  }
}

function scheduleBotUnlockAnswer(bot) {
  setTimeout(() => {
    if (bot.isFrozen && bot.hasBomb && gameState.status === 'PLAYING') {
      const q = bot.unlockQuestion;
      if (!q) return;
      const isCorrect = Math.random() < 0.8;
      const chosen = isCorrect ? q.correct : ((q.correct + 1) % 4);

      // 1. Đồng bộ chọn đáp án lên TV
      io.emit('quiz_option_hovered', {
        playerId: bot.id,
        playerName: bot.name,
        playerAvatar: bot.avatar,
        chosenIndex: chosen
      });

      // 2. Chờ 0.5s rồi gửi đáp án chính thức
      setTimeout(() => {
        if (bot.isFrozen && bot.hasBomb && gameState.status === 'PLAYING') {
          handleUnlockQuizAnswer(bot.id, chosen);
        }
      }, 500);
    }
  }, 400);
}

function handleUnlockQuizAnswer(playerId, chosenIndex) {
  const p = gamePlayers.get(playerId);
  if (!p || !p.isFrozen || !p.unlockQuestion) return;

  const question = p.unlockQuestion;
  const isCorrect = (chosenIndex === question.correct);
  const playerObj = players.get(p.id);

  // Ghi nhận câu trả lời vào thống kê phục vụ Review Phase Bài 30
  recordQuestionAnswer(question, isCorrect, p.name, chosenIndex);

  // Phát tín hiệu kết quả câu hỏi để Spectator & Player hiển thị xanh/đỏ và giải thích
  io.emit('quiz_result_revealed', {
    type: 'UNLOCK',
    isCorrect,
    chosenIndex,
    chosenOption: (question.options && question.options[chosenIndex]) ? question.options[chosenIndex] : '',
    correctIndex: question.correct,
    correctOption: (question.options && question.options[question.correct]) ? question.options[question.correct] : '',
    questionText: question.question,
    explain: question.explain,
    playerName: p.name,
    playerAvatar: p.avatar
  });

  if (isCorrect) {
    // MỞ KHÓA THÀNH CÔNG!
    p.isFrozen = false;
    p.unlockQuestion = null;
    gameState.activeQuiz = null;

    // TÍCH ĐIỂM +10 cho giải đố mở khóa
    p.score = (p.score || 0) + 10;
    if (playerObj) playerObj.score = p.score;
    rosterDirty = true;

    const pSocketId = p.socketId || (!p.isBot ? p.id : null);
    if (pSocketId) {
      io.to(pSocketId).emit('unlock_quiz_success', {
        explain: question.explain
      });
    }

    io.emit('player_unfrozen', {
      id: p.id,
      name: p.name,
      explain: question.explain
    });

    addEventLog(`🔓 ${p.name} trả lời ĐÚNG! (+10đ) Đã giải phóng đóng băng và có thể chạy tiếp!`, 'success');
  } else {
    // VẪN TIẾP TỤC ĐÓNG BĂNG, ĐỔI CÂU HỎI MỚI HOẶC BẮT TRẢ LỜI LẠI!
    // Đổi câu hỏi khác để học sinh tiếp tục thử sức
    const newQuestion = getRandomQuestion(question.id);
    p.unlockQuestion = newQuestion;

    const payload = {
      type: 'UNLOCK',
      playerId: p.id,
      playerName: p.name,
      questionId: newQuestion.id,
      question: newQuestion.question,
      options: newQuestion.options,
      previousExplain: question.explain,
      retry: true
    };

    gameState.activeQuiz = payload;
    io.emit('player_frozen_quiz', payload);

    const pSocketId = p.socketId || (!p.isBot ? p.id : null);
    if (pSocketId) {
      io.to(pSocketId).emit('unlock_quiz_retry', payload);
    }

    addEventLog(`⚠️ ${p.name} trả lời sai mở khóa! Tiếp tục bị đóng băng và nhận câu hỏi mới!`, 'error');

    // Nếu bot thì tiếp tục thử lại
    if (p.isBot) {
      scheduleBotUnlockAnswer(p);
    }
  }

  rosterDirty = true;
  broadcastGameState();
}

// ==========================================
// RƯƠNG BÁU TRẮC NGHIỆM TRÊN CHIẾN TRƯỜNG
// ==========================================
function checkChestCollisions() {
  if (gameState.status !== 'PLAYING' || chests.size === 0) return;

  for (const chest of chests.values()) {
    if (chest.attemptsLeft <= 0) continue;

    // Nếu rương đang có người mở, kiểm tra xem người đó còn hợp lệ không
    if (chest.openedByPlayerId) {
      const opener = gamePlayers.get(chest.openedByPlayerId);
      if (!opener || !opener.isAlive || !opener.isOpeningChest) {
        chest.openedByPlayerId = null;
      } else {
        continue; // Đang có người mở rương này, người khác không thể chạm mở cùng lúc!
      }
    }

    // TỐI ƯU VA CHẠM: Bounding box + Squared distance (Không dùng Math.hypot chậm)
    for (const p of gamePlayers.values()) {
      if (!p.isAlive || p.isFrozen || p.isPassingQuiz || p.isOpeningChest || p.unlockQuestion || p.isStunned || p.isInvisible || p.isRespawning) {
        continue;
      }

      const dx = p.x - chest.x;
      const dy = p.y - chest.y;
      const minR = p.radius + chest.radius;
      if (Math.abs(dx) >= minR || Math.abs(dy) >= minR) continue;

      if (dx * dx + dy * dy < minR * minR) {
        // KIỂM TRA THỜI GIAN CHỜ (Cooldown cá nhân 5s/6s)
        if (p.chestOpenCooldown > 0) {
          if (!p.lastChestCooldownWarn || Date.now() - p.lastChestCooldownWarn > 1800) {
            p.lastChestCooldownWarn = Date.now();
            const pSocketId = p.socketId || (!p.isBot ? p.id : null);
            if (pSocketId) {
              io.to(pSocketId).emit('chest_cooldown_active', {
                timeLeft: Math.round(p.chestOpenCooldown * 10) / 10
              });
            }
          }
          continue;
        }

        triggerChestQuiz(p, chest);
        break; // Khóa rương cho người này
      }
    }
  }
}

function cancelChestQuiz(p, reason = 'TIMEOUT') {
  if (!p || !p.isOpeningChest) return;

  const chestId = p.activeChestId;
  const chest = chests.get(chestId);
  if (chest && chest.openedByPlayerId === p.id) {
    chest.openedByPlayerId = null;
  }

  // Đặt thời gian chờ 5 giây mới được mở rương tiếp theo
  p.chestOpenCooldown = 5.0;

  // QUÁ 7 GIÂY NẾU CHƯA CHỌN THÌ RƯƠNG TỰ ĐÓNG VÀ BIẾN MẤT
  if (reason === 'TIMEOUT' && chest) {
    chests.delete(chest.id);
    io.emit('chest_despawned', { id: chest.id });
    scheduleChestRespawn(3000); // 3 giây sau rơi rương mới
  }

  p.isOpeningChest = false;
  p.isInvisible = false;
  p.chestQuizQuestion = null;
  p.activeChestId = null;
  p.chestQuizTimeLeft = 0;

  // KHÔNG CÓ ĐỘ TRỄ DELAY AN TOÀN KHI BẤM BỎ QUA HOẶC TIMEOUT (Tránh lợi dụng câu giờ)
  if (gameState.immunePlayerId === p.id) {
    gameState.immunePlayerId = null;
    gameState.graceTimer = 0;
  }

  const pSocketId = p.socketId || (!p.isBot ? p.id : null);
  if (pSocketId) {
    io.to(pSocketId).emit('chest_quiz_cancelled', {
      reason,
      message: reason === 'TIMEOUT' ? '⏰ Quá 7 giây mở rương! Rương đã tự đóng và biến mất!' : '🛡️ Đã đóng rương báu!'
    });
  }

  if (reason === 'TIMEOUT') {
    addEventLog(`⏰ ${p.name} quá 7 giây mở rương! Rương tự đóng và biến mất.`, 'warning');
  } else if (reason === 'CANCEL') {
    addEventLog(`🛡️ ${p.name} chủ động đóng rương báu.`, 'info');
  }

  rosterDirty = true;
  broadcastGameState();
}

function triggerChestQuiz(p, chest) {
  // Khóa rương cho người chạm đầu tiên
  chest.openedByPlayerId = p.id;

  const question = getRandomQuestion();
  p.isOpeningChest = true;
  // Trạng thái tàng hình & miễn nhiễm CHỈ DÀNH CHO NGƯỜI KHÔNG ÔM BOM!
  // Người ôm bom vẫn hiển thị và quả bom vẫn tích tắc đếm ngược!
  p.isInvisible = !p.hasBomb;
  p.chestQuizQuestion = question;
  p.activeChestId = chest.id;
  p.chestQuizTimeLeft = 7.0; // TỐI ĐA 7 GIÂY ĐỌC VÀ TRẢ LỜI
  p.targetVx = 0;
  p.targetVy = 0;

  const quizPayload = {
    type: 'CHEST',
    chestId: chest.id,
    playerId: p.id,
    playerName: p.name,
    playerAvatar: p.avatar || '🎓',
    questionId: question.id,
    question: question.question,
    options: question.options,
    timeLimit: 7.0,
    hasBomb: !!p.hasBomb,
    isTreasureRain: isTreasureRainActive()
  };

  const pSocketId = p.socketId || (!p.isBot ? p.id : null);
  if (pSocketId) {
    // CHỈ GỬI CÂU HỎI CHO RIÊNG HỌC SINH MỞ RƯƠNG (Không broadcast toàn server)
    io.to(pSocketId).emit('show_chest_quiz', quizPayload);
  }

  addEventLog(`🎁 ${p.name} chạm vào RƯƠNG BÁU! Đang giải mã câu hỏi...`, 'info');

  // Bot tự giải đố sau 0.8s - 1.4s
  if (p.isBot) {
    setTimeout(() => {
      if (p.isOpeningChest && p.isAlive && gameState.status === 'PLAYING') {
        const isCorrect = Math.random() < 0.75;
        const chosen = isCorrect ? question.correct : ((question.correct + 1) % 4);
        handleChestQuizAnswer(p.id, chosen);
      }
    }, 800 + Math.random() * 600);
  }
}

function handleChestQuizAnswer(playerId, chosenIndex) {
  const p = gamePlayers.get(playerId);
  if (!p || !p.isOpeningChest || !p.chestQuizQuestion) return;

  const question = p.chestQuizQuestion;
  const chestId = p.activeChestId;
  const chest = chests.get(chestId);
  const isCorrect = (chosenIndex === question.correct);

  p.isOpeningChest = false;
  p.isInvisible = false; // Kết thúc tàng hình ngay lập tức khi bấm chọn đáp án
  p.chestQuizQuestion = null;
  p.activeChestId = null;
  p.chestQuizTimeLeft = 0;

  // Hủy miễn nhiễm (không có độ trễ delay an toàn)
  if (gameState.immunePlayerId === p.id) {
    gameState.immunePlayerId = null;
    gameState.graceTimer = 0;
  }

  // Giảm số lượt trả lời của rương (tối đa 2 lần/rương theo luật)
  if (chest) {
    if (chest.openedByPlayerId === p.id) {
      chest.openedByPlayerId = null;
    }
    chest.attemptsLeft = Math.max(0, chest.attemptsLeft - 1);
    if (chest.attemptsLeft <= 0) {
      chests.delete(chest.id);
      io.emit('chest_despawned', { id: chest.id });
      // Rút ngắn chu kỳ hồi sinh: đúng 3s sau lập tức có 1 rương mới rơi xuống!
      scheduleChestRespawn(3000);
    } else {
      io.emit('chest_updated', chest);
    }
  }

  const pSocketId = p.socketId || (!p.isBot ? p.id : null);

  // Ghi nhận câu trả lời vào thống kê phục vụ Review Phase Bài 30
  recordQuestionAnswer(question, isCorrect, p.name, chosenIndex);

  let rewardName = '';

  if (isCorrect) {
    // 1. TÍCH ĐIỂM CƠ BẢN: +20đ (hoặc x1.5 = +30đ trong Bão Rương)
    const isRain = isTreasureRainActive();
    const basePoints = 20;
    const earnedPoints = isRain ? Math.round(basePoints * 1.5) : basePoints;
    p.score = (p.score || 0) + earnedPoints;
    const baseP = players.get(p.id);
    if (baseP) baseP.score = p.score;
    p.correctCount = (p.correctCount || 0) + 1;
    rosterDirty = true;

    // Thời gian chờ mở rương tiếp theo: 5 giây
    p.chestOpenCooldown = 5.0;

    const rainTag = isRain ? ' 🌧️[BÃO RƯƠNG x1.5]' : '';

    if (p.hasBomb) {
      // ==========================================
      // QUY TẮC: NGƯỜI ÔM BOM GIẢI ĐÚNG RƯƠNG
      // ==========================================
      // 1. Bom được cộng thêm +5 giây (hạ nhiệt quả bom)
      gameState.bombTimer = Math.min(25.0, gameState.bombTimer + 5.0);
      // 2. Được hồi chiêu ngay lập tức kỹ năng Dash / Tốc biến
      p.dashCooldown = 0;
      p.hasTeleportCharge = true;
      p.teleportCooldown = 0;
      rewardName = '❄️ HẠ NHIỆT BOM +5s & HỒI CHIÊU TỐC BIẾN/DASH';
      addEventLog(`❄️ ${p.name} ôm bom mạo hiểm mở rương thành công: Bom +5s, hồi chiêu Dash/Tốc biến & +${earnedPoints}đ${rainTag}!`, 'success');

    } else {
      // ==========================================
      // TỶ LỆ RỚT ĐẶC QUYỀN (CHO NGƯỜI KHÔNG ÔM BOM)
      // ==========================================
      p.hasTeleportCharge = true; // Sạc sẵn 1 lần tốc biến chủ động

      const rand = Math.random();
      if (rand < 0.35) {
        // 35%: ⚡ TÍCH ĐIỂM X2 (8 GIÂY)
        p.scoreMultiplier = 2;
        p.scoreMultiplierTimer = 8.0;
        rewardName = '⚡ TÍCH ĐIỂM X2 (8s)';
      } else if (rand < 0.65) {
        // 30%: 👟 TĂNG TỐC +35% (5 GIÂY)
        p.speedMultiplier = 1.35;
        p.speedMultiplierTimer = 5.0;
        rewardName = '👟 TĂNG TỐC +35% (5s)';
      } else if (rand < 0.85) {
        // 20%: 🌀 TỐC BIẾN PHÒNG THỦ (SAFE BLINK) - Dịch chuyển xa người giữ bom + Khiên 1.5s
        const holder = gamePlayers.get(gameState.bombHolderId);
        const safePos = holder ? getSafeRandomPosition(holder.x, holder.y, 650) : getSafeRandomPosition();
        const oldX = p.x;
        const oldY = p.y;
        p.x = safePos.x;
        p.y = safePos.y;
        // Tạo 1 khiên chống bom trong 1.5 giây đầu sau khi đáp đất
        gameState.immunePlayerId = p.id;
        gameState.graceTimer = 1.5;

        io.emit('player_teleported', {
          id: p.id,
          name: p.name,
          fromX: oldX,
          fromY: oldY,
          toX: p.x,
          toY: p.y,
          reason: 'CHEST_SAFE_BLINK'
        });
        rewardName = '🌀 TỐC BIẾN PHÒNG THỦ & KHIÊN 1.5s';
      } else {
        // 15%: ⚡😵 SÉT LÀM CHOÁNG NGƯỜI GIỮ BOM (2.5 GIÂY)
        const holder = gamePlayers.get(gameState.bombHolderId);
        if (holder && holder.isAlive) {
          holder.isStunned = true;
          holder.stunTimer = 2.5;
          rewardName = `⚡😵 SÉT LÀM CHOÁNG ${holder.name} (2.5s)`;
          io.emit('bomb_holder_stunned', {
            holderId: holder.id,
            holderName: holder.name,
            stunnerId: p.id,
            stunnerName: p.name,
            duration: 2.5
          });
        } else {
          p.speedMultiplier = 1.35;
          p.speedMultiplierTimer = 5.0;
          rewardName = '👟 TĂNG TỐC +35% (5s)';
        }
      }

      addEventLog(`🎁 ${p.name} mở Rương thành công! Nhận [${rewardName}] & +${earnedPoints}đ${rainTag}!`, 'success');
    }

    if (pSocketId) {
      io.to(pSocketId).emit('chest_quiz_result', {
        isCorrect: true,
        rewardName,
        explain: question.explain,
        score: p.score,
        hasBomb: !!p.hasBomb,
        cooldown: 5.0
      });
    }

  } else {
    // ==========================================
    // ĐIỀU CHỈNH CƠ CHẾ PHẠT KHI GIẢI SAI
    // ==========================================
    // 1. Trừ điểm nhẹ: -5 điểm (không trừ âm dưới 0)
    p.score = Math.max(0, (p.score || 0) - 5);
    const baseP = players.get(p.id);
    if (baseP) baseP.score = p.score;
    p.wrongCount = (p.wrongCount || 0) + 1;

    // 2. Hiệu ứng "Lỗi biên dịch" (Compile Error Slow): Giảm 30% tốc độ di chuyển trong 3 giây
    p.slowMultiplier = 0.70;
    p.slowTimer = 3.0;
    p.isFrozen = false; // KHÔNG đóng băng cứng
    p.penaltyFreezeTimer = 0;

    // 3. Thời gian khóa rương cá nhân: 6 giây
    p.chestOpenCooldown = 6.0;

    if (p.hasBomb) {
      // 4A. NẾU NGƯỜI ÔM BOM TRẢ LỜI SAI: Bị trừ 3 giây trên đồng hồ bom đếm ngược
      gameState.bombTimer = Math.max(1.0, gameState.bombTimer - 3.0);
      addEventLog(`⚠️ ${p.name} ôm bom trả lời sai Rương! Bị trừ 5đ, đồng hồ bom rút ngắn 3s và dính Lỗi biên dịch!`, 'error');

    } else {
      // 4B. NGƯỜI KHÔNG ÔM BOM TRẢ LỜI SAI
      addEventLog(`⚠️ ${p.name} trả lời sai Rương báu! Bị trừ 5đ, dính Lỗi biên dịch (-30% tốc độ 3s) và khóa rương 6s.`, 'error');
    }

    if (pSocketId) {
      io.to(pSocketId).emit('chest_quiz_result', {
        isCorrect: false,
        explain: question.explain,
        penaltyDuration: 3.0,
        isSlowed: true,
        hasBomb: !!p.hasBomb,
        score: p.score,
        cooldown: 6.0
      });
    }
  }

  // Phát tín hiệu kết quả câu hỏi (Chỉ đính kèm văn bản câu hỏi khi học sinh trả lời SAI để hiển thị Bug Alert)
  io.emit('quiz_result_revealed', {
    type: 'CHEST',
    isCorrect,
    chosenIndex,
    chosenOption: (question.options && question.options[chosenIndex]) ? question.options[chosenIndex] : '',
    correctIndex: question.correct,
    correctOption: (!isCorrect && question.options && question.options[question.correct]) ? question.options[question.correct] : '',
    questionText: isCorrect ? '' : question.question,
    explain: isCorrect ? '' : question.explain,
    playerName: p.name,
    playerAvatar: p.avatar,
    hasBomb: !!p.hasBomb,
    rewardName: isCorrect ? rewardName : '',
    targetName: ''
  });

  rosterDirty = true;
  broadcastGameState();
}

// ==========================================
// KỸ NĂNG: TỐC BIẾN (BLINK - YÊU CẦU SẠC TỪ RƯƠNG BÁU)
// ==========================================
function triggerTeleport(p) {
  if (!p || !p.isAlive || p.isFrozen || p.isStunned || p.isRespawning) {
    return false;
  }

  // Bắt buộc phải có lượt sạc từ việc giải đúng Rương báu!
  if (!p.hasTeleportCharge) {
    const pSocketId = p.socketId || (!p.isBot ? p.id : null);
    if (pSocketId) {
      io.to(pSocketId).emit('teleport_charge_required', {
        message: '⚠️ Bạn cần giải đúng câu hỏi Rương báu để sạc Tốc biến!'
      });
    }
    return false;
  }

  const oldX = p.x;
  const oldY = p.y;
  let newX = p.x;
  let newY = p.y;

  if (p.hasBomb) {
    // Người ôm bom: Tốc biến áp sát người xa nhất
    const aliveOthers = Array.from(gamePlayers.values()).filter(o => o.isAlive && o.id !== p.id && !o.isStunned && !o.isInvisible && !o.isRespawning);
    if (aliveOthers.length === 0) return false;

    let farthest = null;
    let maxDist = -1;
    for (const other of aliveOthers) {
      const d = Math.hypot(other.x - p.x, other.y - p.y);
      if (d > maxDist) {
        maxDist = d;
        farthest = other;
      }
    }
    if (!farthest) return false;

    const angle = Math.random() * Math.PI * 2;
    newX = clamp(farthest.x + Math.cos(angle) * 55, 60, ARENA_WIDTH - 60);
    newY = clamp(farthest.y + Math.sin(angle) * 55, 60, ARENA_HEIGHT - 60);
  } else {
    // Người không giữ bom: Tốc biến đào tẩu tới vùng an toàn cách xa bom nhất
    const holder = gamePlayers.get(gameState.bombHolderId);
    const safePos = holder ? getSafeRandomPosition(holder.x, holder.y, 600) : getSafeRandomPosition();
    newX = safePos.x;
    newY = safePos.y;
  }

  p.x = newX;
  p.y = newY;
  p.hasTeleportCharge = false; // Tiêu thụ 1 lượt sạc
  p.teleportCooldown = 2.0;

  io.emit('player_teleported', {
    id: p.id,
    name: p.name,
    fromX: oldX,
    fromY: oldY,
    toX: p.x,
    toY: p.y,
    reason: p.hasBomb ? 'BLINK_APPROACH' : 'BLINK_ESCAPE'
  });

  addEventLog(`⚡ ${p.name} kích hoạt TỐC BIẾN (${p.hasBomb ? 'Áp sát mục tiêu' : 'Đào tẩu an toàn'})!`, 'info');
  return true;
}

// Giữ alias triggerTeleportFarthest để tương thích ngược
const triggerTeleportFarthest = triggerTeleport;

// ==========================================
// DASH TRIGGER
// ==========================================
function triggerDash(p) {
  if (p.dashCooldown > 0 || !p.isAlive || p.isFrozen) return false;

  let dirX = p.targetVx;
  let dirY = p.targetVy;

  if (Math.hypot(dirX, dirY) < 0.1) {
    dirX = Math.cos(p.facingAngle || 0);
    dirY = Math.sin(p.facingAngle || 0);
  } else {
    const len = Math.hypot(dirX, dirY);
    dirX /= len;
    dirY /= len;
  }

  p.isDashing = true;
  p.dashTimer = DASH_DURATION;
  p.dashCooldown = DASH_COOLDOWN;
  p.dashDirX = dirX;
  p.dashDirY = dirY;

  io.emit('player_dashed', {
    id: p.id,
    x: p.x,
    y: p.y,
    dirX: dirX,
    dirY: dirY
  });

  return true;
}

// ==========================================
// BOT AI LOGIC (HỖ TRỢ LÊN TỚI 40 HỌC SINH/BOT KHÔNG BỊ DỒN GÓC HAY RUNG GIẬT)
// ==========================================
function updateBotAI(bot, dt) {
  if (!bot.isAlive || gameState.status !== 'PLAYING' || bot.isFrozen || bot.isPassingQuiz) {
    return;
  }

  const alivePlayers = Array.from(gamePlayers.values()).filter(p => p.isAlive && p.id !== bot.id);
  if (alivePlayers.length === 0) return;

  // Cập nhật timer quyết định dash
  bot.dashDecisionTimer = (bot.dashDecisionTimer || 0) - dt;

  if (bot.hasBomb) {
    // Đang ôm bom: Tìm mục tiêu gần nhất để đuổi bắt
    let closest = null;
    let minDist = Infinity;
    let maxDist = -1;

    for (const other of alivePlayers) {
      // Người tàng hình / mở rương: Bot ôm bom hoàn toàn KHÔNG THẤY và KHÔNG ĐUỔI THEO!
      if (other.isInvisible || other.isOpeningChest) {
        continue;
      }
      if (other.id === gameState.immunePlayerId && gameState.graceTimer > 0.8) {
        continue;
      }
      const d = Math.hypot(other.x - bot.x, other.y - bot.y);
      if (d < minDist) {
        minDist = d;
        closest = other;
      }
      if (d > maxDist) {
        maxDist = d;
      }
    }
    if (!closest) {
      // Nếu tất cả người khác đang tàng hình hoặc miễn nhiễm: tuần tra ngẫu nhiên giữa sân
      closest = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    }

    // Nếu người gần nhất quá xa (> 450px) mà bot đã sạc đầy Tốc Biến từ Rương -> dùng tốc biến áp sát!
    if (minDist > 450 && bot.hasTeleportCharge && Math.random() < 0.05) {
      triggerTeleport(bot);
      return;
    }

    const dx = closest.x - bot.x;
    const dy = closest.y - bot.y;
    const dist = Math.hypot(dx, dy);

    let desiredVx = 0;
    let desiredVy = 0;
    if (dist > 0.001) {
      desiredVx = dx / dist;
      desiredVy = dy / dist;
    }

    // Steering Lerp (0.28) đuổi bắt mượt mà không ngoặt gấp
    bot.targetVx += (desiredVx - bot.targetVx) * 0.28;
    bot.targetVy += (desiredVy - bot.targetVy) * 0.28;
    bot.facingAngle = Math.atan2(bot.targetVy, bot.targetVx);

    if (dist < 150 && bot.dashCooldown <= 0 && bot.dashDecisionTimer <= 0) {
      bot.dashDecisionTimer = 0.8 + Math.random() * 0.4;
      if (Math.random() < 0.6) {
        triggerDash(bot);
      }
    }
  } else {
    // Không có bom: Chạy trốn khỏi người giữ bom + phân tán đám đông (Flocking Separation)
    const holder = gamePlayers.get(gameState.bombHolderId);
    let fx = 0;
    let fy = 0;

    // 1. Lực né người cầm bom (chỉ kích hoạt mạnh khi người cầm bom lại gần)
    let holderDist = 9999;
    if (holder && holder.isAlive) {
      const hdx = bot.x - holder.x;
      const hdy = bot.y - holder.y;
      holderDist = Math.hypot(hdx, hdy);

      if (holderDist > 0.001) {
        // Càng gần người cầm bom, lực chạy trốn càng mạnh
        const fleeStrength = Math.max(0.6, (800 - holderDist) / 800 * 3.0);
        fx += (hdx / holderDist) * fleeStrength;
        fy += (hdy / holderDist) * fleeStrength;

        // Thêm lực tiếp tuyến (tangential dodge) để bot chạy lượn cung tròn né tránh thay vì phi thẳng một đường vào góc tường
        const botSeed = (bot.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 97);
        const tangentSign = (botSeed % 2 === 0) ? 1 : -1;
        const tangentMag = Math.sin(Date.now() * 0.0015 + botSeed) * 0.75;
        fx += (-hdy / holderDist) * tangentSign * tangentMag;
        fy += (hdx / holderDist) * tangentSign * tangentMag;
      }
    }

    // 2. Lực phân tách đám đông (Boids / Separation Force): Đảm bảo các bot tự động giãn cách 85px, không bao giờ tụ lại thành chóp tam giác
    const SEPARATION_RADIUS = 85;
    for (const other of alivePlayers) {
      const odx = bot.x - other.x;
      if (Math.abs(odx) >= SEPARATION_RADIUS) continue;
      const ody = bot.y - other.y;
      if (Math.abs(ody) >= SEPARATION_RADIUS) continue;
      const od = Math.hypot(odx, ody);
      if (od < SEPARATION_RADIUS && od > 0.001) {
        const repulsion = (SEPARATION_RADIUS - od) / SEPARATION_RADIUS;
        fx += (odx / od) * repulsion * 2.8;
        fy += (ody / od) * repulsion * 2.8;
      }
    }

    // Hút nhẹ về phía Rương Báu nếu bom đang ở xa (> 320px) và không bị nguy hiểm
    if (holderDist > 320 && chests.size > 0 && !bot.isOpeningChest) {
      let nearestChest = null;
      let minChestDist = 450;
      for (const c of chests.values()) {
        if (c.attemptsLeft > 0 && !c.openedByPlayerId) {
          const cd = Math.hypot(c.x - bot.x, c.y - bot.y);
          if (cd < minChestDist) {
            minChestDist = cd;
            nearestChest = c;
          }
        }
      }
      if (nearestChest) {
        const cdx = nearestChest.x - bot.x;
        const cdy = nearestChest.y - bot.y;
        fx += (cdx / minChestDist) * 1.5;
        fy += (cdy / minChestDist) * 1.5;
      }
    }

    // 3. Lực tránh chướng ngại vật mượt mà
    for (const obs of OBSTACLES) {
      if (obs.type === 'circle') {
        const obDx = bot.x - obs.x;
        const obDy = bot.y - obs.y;
        const obDist = Math.hypot(obDx, obDy);
        const safeRadius = obs.radius + 60;
        if (obDist < safeRadius && obDist > 0.001) {
          const push = (safeRadius - obDist) / safeRadius;
          fx += (obDx / obDist) * push * 2.5;
          fy += (obDy / obDist) * push * 2.5;
        }
      } else if (obs.type === 'rect') {
        const nearX = clamp(bot.x, obs.x, obs.x + obs.width);
        const nearY = clamp(bot.y, obs.y, obs.y + obs.height);
        const obDx = bot.x - nearX;
        const obDy = bot.y - nearY;
        const obDist = Math.hypot(obDx, obDy);
        if (obDist < 60 && obDist > 0.001) {
          const push = (60 - obDist) / 60;
          fx += (obDx / obDist) * push * 2.5;
          fy += (obDy / obDist) * push * 2.5;
        }
      }
    }

    // 4. Lực đệm tường mềm (Smooth Wall Cushioning): Thay thế bước nhảy biên cứng để triệt tiêu rung giật
    const wallMargin = 140;
    if (bot.x < wallMargin) {
      const p = (wallMargin - bot.x) / wallMargin;
      fx += p * p * 3.5;
    } else if (bot.x > ARENA_WIDTH - wallMargin) {
      const p = (bot.x - (ARENA_WIDTH - wallMargin)) / wallMargin;
      fx -= p * p * 3.5;
    }

    if (bot.y < wallMargin) {
      const p = (wallMargin - bot.y) / wallMargin;
      fy += p * p * 3.5;
    } else if (bot.y > ARENA_HEIGHT - wallMargin) {
      const p = (bot.y - (ARENA_HEIGHT - wallMargin)) / wallMargin;
      fy -= p * p * 3.5;
    }

    // 5. Chuẩn hóa vector vận tốc mong muốn và điều hướng mượt mà
    const fDist = Math.hypot(fx, fy);
    let desiredVx = 0;
    let desiredVy = 0;
    if (fDist > 0.01) {
      desiredVx = fx / fDist;
      desiredVy = fy / fDist;
    }

    // Steering Lerp (0.22): Giúp chuyển động lướt mềm như người chơi thật
    bot.targetVx += (desiredVx - bot.targetVx) * 0.22;
    bot.targetVy += (desiredVy - bot.targetVy) * 0.22;
    bot.facingAngle = Math.atan2(bot.targetVy, bot.targetVx);

    // Kích hoạt lướt dash khi bom tới quá gần
    if (holderDist < 140 && bot.dashCooldown <= 0 && bot.dashDecisionTimer <= 0) {
      bot.dashDecisionTimer = 0.8 + Math.random() * 0.4;
      if (Math.random() < 0.5) {
        triggerDash(bot);
      }
    }
  }
}

// ==========================================
// TOURNAMENT & BATTLE ROYALE SURVIVAL CONTROLLER
// ==========================================
function startRound(roundNumber) {
  if (players.size < 2) {
    return { success: false, message: "Cần ít nhất 2 học sinh để bắt đầu trận đấu sinh tồn!" };
  }

  gameState.roundNumber = roundNumber || (gameState.roundNumber + 1);
  gameState.status = 'ROUND_INTRO';
  gameState.introCountdown = 3.0;
  gameState.bombTimer = BOMB_COUNTDOWN_DEFAULT; // 15.0s
  gameState.matchTimer = MATCH_TOTAL_TIME; // 5 phút = 300s
  gameState.graceTimer = 0;
  gameState.immunePlayerId = null;
  gameState.activeQuiz = null;
  gameState.winner = null;
  isExplosionInProgress = false;
  questionStats.clear(); // Làm mới thống kê câu hỏi cho trận mới

  // Đặt lại các mốc sự kiện Bão Rương (Treasure Rain Event)
  treasureRainActive = false;
  treasureRainTimer = 0;
  rain1Triggered = false;
  rain2Triggered = false;

  // Xóa rương cũ và hồi sinh đủ rương theo quy mô phòng (Dynamic Capacity)
  chests.clear();
  chestSpawnTimer = 0;
  survivalScoreAccumulator = 0;
  const initialCap = getMaxChests();
  for (let i = 0; i < initialCap; i++) {
    spawnChest();
  }

  // Khởi tạo tất cả học sinh trong đấu trường sinh tồn
  gamePlayers.clear();
  const playerList = Array.from(players.values());

  playerList.forEach(p => {
    const pos = getSafeRandomPosition();
    p.score = 0; // Làm mới điểm số cho trận đấu mới
    gamePlayers.set(p.id, {
      id: p.id,
      socketId: p.socketId || (!p.isBot ? p.id : null),
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      isBot: p.isBot || false,
      score: 0,
      scoreMultiplier: 1,
      scoreMultiplierTimer: 0,
      speedMultiplier: 1.0,
      speedMultiplierTimer: 0,
      slowMultiplier: 1.0,
      slowTimer: 0,
      isStunned: false,
      stunTimer: 0,
      penaltyFreezeTimer: 0,
      hasTeleportCharge: false, // Sạc tốc biến từ rương báu
      isRespawning: false,
      respawnTimer: 0,
      chestOpenCooldown: 0, // Thời gian chờ giữa 2 lần mở rương
      isInvisible: false,
      isOpeningChest: false,
      chestQuizQuestion: null,
      activeChestId: null,
      chestQuizTimeLeft: 0,
      x: pos.x,
      y: pos.y,
      targetVx: 0,
      targetVy: 0,
      facingAngle: 0,
      radius: PLAYER_RADIUS,
      isAlive: true,
      rank: null,
      hasBomb: false,
      isFrozen: false,
      unlockQuestion: null,
      isPassingQuiz: false,
      passTargetId: null,
      activeQuestion: null,
      passCooldown: 0,
      isDashing: false,
      dashCooldown: 0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirY: 0,
      teleportCooldown: 0
    });
  });

  // Chọn ngẫu nhiên 1 người giữ bom 15s ban đầu
  const ids = Array.from(gamePlayers.keys());
  const randomHolderId = ids[Math.floor(Math.random() * ids.length)];
  const initialHolder = gamePlayers.get(randomHolderId);
  initialHolder.hasBomb = true;
  gameState.bombHolderId = randomHolderId;

  // BỎ ĐÓNG BĂNG ĐẦU TRẬN - Tất cả học sinh bắt đầu chạy tự do ngay sau 3s đếm ngược intro!
  rosterDirty = true;
  broadcastGameState();
  addEventLog(`🚀 Đấu trường sinh tồn BẮT ĐẦU (${gamePlayers.size} bạn)! ${initialHolder.name} giữ bom 15s đầu tiên!`, 'warning');
  return { success: true };
}

// Xử lý khi hết 5 phút trận đấu: Kết thúc game và vinh danh người cao điểm nhất
function handleMatchTimeOut() {
  gameState.status = 'GAME_OVER';
  gameState.bombHolderId = null;

  // Dọn dẹp câu hỏi và trạng thái bom/rương của tất cả người chơi
  gamePlayers.forEach(p => {
    p.hasBomb = false;
    p.isPassingQuiz = false;
    p.isOpeningChest = false;
    p.isInvisible = false;
    p.unlockQuestion = null;
    p.isFrozen = false;
    p.isStunned = false;
  });
  gameState.activeQuiz = null;
  io.emit('quiz_completed', { success: false, reason: 'TIMEOUT' });

  // Tìm học sinh có ĐIỂM SỐ CAO NHẤT trong toàn bộ game để vinh danh QUÁN QUÂN
  const sorted = Array.from(gamePlayers.values()).sort((a, b) => {
    // 1. Điểm số cao nhất lên trước
    if ((b.score || 0) !== (a.score || 0)) {
      return (b.score || 0) - (a.score || 0);
    }
    // 2. Nếu bằng điểm: ưu tiên người còn sống
    if (a.isAlive && !b.isAlive) return -1;
    if (!a.isAlive && b.isAlive) return 1;
    // 3. Nếu vẫn bằng: ưu tiên số câu trả lời đúng
    return (b.correctCount || 0) - (a.correctCount || 0);
  });

  const winner = sorted[0] || { name: 'Vô địch', avatar: '👑', score: 0 };
  winner.rank = 1;

  // Cập nhật thứ hạng chung cuộc
  sorted.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  gameState.winner = {
    id: winner.id,
    name: winner.name,
    avatar: winner.avatar,
    color: winner.color,
    score: winner.score || 0,
    isAlive: winner.isAlive
  };

  rosterDirty = true;
  const rankings = getSurvivalRankings();
  const topWrongs = getTopWrongQuestions(3);

  io.emit('game_victory', {
    winner: gameState.winner,
    rankings: rankings,
    topWrongQuestions: topWrongs,
    reason: 'TIME_OUT'
  });

  broadcastTopAnnouncement(
    `⏰ HẾT GIỜ 5 PHÚT! 👑 ${winner.name} ĐOẠT QUÁN QUÂN!`,
    `Vinh danh học sinh có điểm số cao nhất lớp: ${winner.score || 0} điểm!`,
    'chest',
    '🏆'
  );
  addEventLog(`⏰ HẾT GIỜ 5 PHÚT! 👑 ${winner.name} dẫn đầu lớp với ${winner.score || 0} điểm và đoạt QUÁN QUÂN!`, 'success');
}

let isExplosionInProgress = false;

function handleBombExplosion() {
  if (isExplosionInProgress) return;
  const holder = gamePlayers.get(gameState.bombHolderId);
  if (!holder) return;

  isExplosionInProgress = true;

  // 1. TRỪ ĐIỂM PHẠT -30 VÀ CHOÁNG 3S (KHÔNG BỊ LOẠI KHỎI GAME - 100% HỌC SINH ĐẤU ĐỦ 7 PHÚT!)
  const scoreBefore = holder.score || 0;
  holder.score = Math.max(0, scoreBefore - 30);
  const baseP = players.get(holder.id);
  if (baseP) baseP.score = holder.score;

  holder.hasBomb = false;
  holder.isFrozen = false;
  holder.unlockQuestion = null;
  holder.isPassingQuiz = false;
  holder.isOpeningChest = false;
  holder.isInvisible = false;
  holder.isStunned = true;
  holder.stunTimer = 3.0;
  holder.isRespawning = true;
  holder.respawnTimer = 3.0;
  holder.explodedCount = (holder.explodedCount || 0) + 1;
  gameState.activeQuiz = null;

  io.emit('player_exploded', {
    id: holder.id,
    name: holder.name,
    x: Math.round(holder.x),
    y: Math.round(holder.y),
    scorePenalty: 30,
    currentScore: holder.score,
    respawnTimer: 3.0
  });

  const holderSocketId = holder.socketId || (!holder.isBot ? holder.id : null);
  if (holderSocketId) {
    io.to(holderSocketId).emit('player_respawning', {
      scorePenalty: 30,
      currentScore: holder.score,
      respawnTimer: 3.0
    });
  }

  broadcastTopAnnouncement(
    `💥 BOM NỔ: ${holder.name} (-30đ)!`,
    `Điểm: ${scoreBefore} ➔ ${holder.score}đ! Choáng 3s rồi tiếp tục chiến đấu!`,
    'eliminated',
    '💥'
  );
  addEventLog(`💥 BÙM! Bom nổ trên tay ${holder.name} (-30đ)! Choáng 3s rồi hồi sinh!`, 'error');
  rosterDirty = true;

  // 2. TẠM DỪNG 3.0s CHO HIỆU ỨNG NỔ & HỒI SINH XONG, SAU ĐÓ CHỌN NGƯỜI TIẾP THEO NHẬN BOM
  gameState.status = 'INTERMISSION';
  gameState.bombHolderId = null;
  broadcastGameState();

  setTimeout(() => {
    isExplosionInProgress = false;

    // Đảm bảo người vừa bị nổ bom được giải phóng trạng thái hoàn toàn
    if (holder) {
      holder.isRespawning = false;
      holder.isStunned = false;
      holder.respawnTimer = 0;
      holder.stunTimer = 0;
    }

    // Nếu hết giờ hoặc game đã dừng thì không sinh bom mới
    if (gameState.status === 'GAME_OVER') return;

    // Lấy danh sách các học sinh khác (ngoại trừ người vừa bị nổ)
    const candidates = Array.from(gamePlayers.values()).filter(p => p.id !== holder.id && p.isAlive);
    let nextHolder = null;

    if (candidates.length > 0) {
      // Cơ chế Rubber-band: Ưu tiên trao bom cho người có điểm cao nhất để cân bằng thế trận!
      candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
      const topPool = candidates.slice(0, Math.min(2, candidates.length));
      nextHolder = topPool[Math.floor(Math.random() * topPool.length)];
    } else {
      nextHolder = holder;
    }

    if (nextHolder) {
      nextHolder.hasBomb = true;
      gameState.bombHolderId = nextHolder.id;
      gameState.bombTimer = BOMB_COUNTDOWN_DEFAULT; // 15.0s
      gameState.graceTimer = 1.0;
      gameState.immunePlayerId = holder.id; // Người vừa bị nổ bom được miễn nhiễm 1s
      gameState.status = 'PLAYING';

      io.emit('new_bomb_round', {
        id: nextHolder.id,
        name: nextHolder.name,
        avatar: nextHolder.avatar,
        x: Math.round(nextHolder.x),
        y: Math.round(nextHolder.y),
        bombTimer: gameState.bombTimer
      });

      broadcastTopAnnouncement(
        `💣 BOM 15s MỚI: ${nextHolder.name} ĐANG CẦM!`,
        `Cả lớp chú ý né tránh! ${nextHolder.name} mau rượt đuổi bạn khác!`,
        'warning',
        '💣'
      );
      addEventLog(`💣 Quả bom 15s mới trao cho ${nextHolder.name}! Đấu trường tiếp tục!`, 'warning');
      rosterDirty = true;
      broadcastGameState();
    }
  }, 3000);
}

function resetGame() {
  isExplosionInProgress = false;
  gameState.status = 'LOBBY';
  gameState.roundNumber = 0;
  gameState.bombTimer = BOMB_COUNTDOWN_DEFAULT; // 15.0s
  gameState.matchTimer = MATCH_TOTAL_TIME; // 5 phút
  gameState.bombHolderId = null;
  gameState.immunePlayerId = null;
  questionStats.clear(); // Làm mới thống kê câu hỏi gỡ lỗi
  gameState.graceTimer = 0;
  gameState.activeQuiz = null;
  gameState.winner = null;
  gameState.lastEventLog = [];

  chests.clear();
  chestSpawnTimer = 0;
  survivalScoreAccumulator = 0;

  gamePlayers.clear();

  // Xóa toàn bộ bot và dọn dẹp các học sinh đã thoát / ngắt kết nối (chỉ giữ người đang online thật sự)
  for (const [id, p] of players.entries()) {
    p.score = 0;
    if (p.isBot) {
      players.delete(id);
      continue;
    }
    const sockId = p.socketId || p.id;
    const isOnline = io.sockets.sockets.has(sockId);
    if (!isOnline) {
      players.delete(id);
    }
  }

  rosterDirty = true;
  broadcastGameState();
  io.emit('game_reset');
  addEventLog(`🔄 Giáo viên đã làm mới trận đấu và đưa cả lớp về phòng chờ.`, 'info');
}

// ==========================================
// BROADCAST SURVIVAL ROSTER & STATE
// ==========================================
let cachedSurvivalRoster = [];
let rosterDirty = true;

function getSurvivalRankings() {
  return Array.from(gamePlayers.values())
    .sort((a, b) => {
      // Khi kết thúc toàn bộ trận đấu (GAME_OVER): Xếp theo ĐIỂM SỐ cao nhất lên đầu để vinh danh người cao điểm nhất
      if (gameState.status === 'GAME_OVER') {
        if ((b.score || 0) !== (a.score || 0)) {
          return (b.score || 0) - (a.score || 0);
        }
        if (a.isAlive && !b.isAlive) return -1;
        if (!a.isAlive && b.isAlive) return 1;
        if (a.rank && b.rank) return a.rank - b.rank;
        return 0;
      }
      // Người còn sống xếp trước
      if (a.isAlive && !b.isAlive) return -1;
      if (!a.isAlive && b.isAlive) return 1;
      // Trong nhóm còn sống: xếp theo điểm số cao hơn lên trước
      if (a.isAlive && b.isAlive) {
        if ((b.score || 0) !== (a.score || 0)) {
          return (b.score || 0) - (a.score || 0);
        }
      }
      // Người bị loại xếp theo thứ hạng (Hạng 2 trước Hạng 3)
      if (a.rank && b.rank) return a.rank - b.rank;
      return (b.score || 0) - (a.score || 0);
    })
    .map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      score: p.score || 0,
      isAlive: p.isAlive,
      rank: p.rank || (p.isAlive ? (gameState.winner?.id === p.id ? 1 : null) : null),
      hasBomb: p.hasBomb,
      isFrozen: p.isFrozen,
      isInvisible: p.isInvisible || false,
      isStunned: p.isStunned || false,
      isRespawning: p.isRespawning || false,
      hasTeleportCharge: !!p.hasTeleportCharge,
      respawnTimer: Math.max(0, Math.round((p.respawnTimer || 0) * 10) / 10),
      stunTimer: Math.max(0, Math.round((p.stunTimer || 0) * 10) / 10),
      scoreMultiplier: p.scoreMultiplier || 1,
      speedMultiplier: p.speedMultiplier || 1
    }));
}

let lastRosterBroadcastTime = 0;
let lobbyTickCounter = 0;

function broadcastGameState(forceRoster = false) {
  const livingPlayers = Array.from(gamePlayers.values()).filter(p => p.isAlive);
  const activeGamePlayers = Array.from(gamePlayers.values()).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    score: p.score || 0,
    x: Math.round(p.x),
    y: Math.round(p.y),
    facingAngle: Math.round(p.facingAngle * 10) / 10,
    isAlive: p.isAlive,
    rank: p.rank || null,
    hasBomb: p.hasBomb,
    isFrozen: p.isFrozen,
    isInvisible: p.isInvisible || false,
    isOpeningChest: p.isOpeningChest || false,
    isStunned: p.isStunned || false,
    isRespawning: p.isRespawning || false,
    hasTeleportCharge: !!p.hasTeleportCharge,
    respawnTimer: Math.max(0, Math.round((p.respawnTimer || 0) * 10) / 10),
    chestOpenCooldown: Math.max(0, Math.round((p.chestOpenCooldown || 0) * 10) / 10),
    stunTimer: Math.max(0, Math.round((p.stunTimer || 0) * 10) / 10),
    scoreMultiplier: p.scoreMultiplier || 1,
    scoreMultiplierTimer: Math.max(0, Math.round((p.scoreMultiplierTimer || 0) * 10) / 10),
    speedMultiplierTimer: Math.max(0, Math.round((p.speedMultiplierTimer || 0) * 10) / 10),
    isPassingQuiz: p.isPassingQuiz,
    isDashing: p.isDashing,
    dashCooldown: Math.max(0, Math.round(p.dashCooldown * 10) / 10),
    teleportCooldown: Math.max(0, Math.round(p.teleportCooldown * 10) / 10),
    slowTimer: Math.max(0, Math.round((p.slowTimer || 0) * 10) / 10)
  }));

  const activeChests = Array.from(chests.values()).map(c => ({
    id: c.id,
    x: Math.round(c.x),
    y: Math.round(c.y),
    attemptsLeft: c.attemptsLeft,
    decayTimer: Math.max(0, Math.round((c.decayTimer !== undefined ? c.decayTimer : 20.0) * 10) / 10),
    isBeingOpened: !!c.openedByPlayerId
  }));

  if (rosterDirty || cachedSurvivalRoster.length === 0) {
    cachedSurvivalRoster = getSurvivalRankings();
    rosterDirty = false;
  }

  const now = Date.now();
  const shouldSendRoster = forceRoster || (now - lastRosterBroadcastTime >= 1000) || (gameState.status !== 'PLAYING');
  if (shouldSendRoster) {
    lastRosterBroadcastTime = now;
  }

  io.emit('game_tick', {
    status: gameState.status,
    roundNumber: gameState.roundNumber,
    introCountdown: Math.max(0, Math.ceil(gameState.introCountdown)),
    bombTimer: Math.max(0, Math.round(gameState.bombTimer * 10) / 10),
    matchTimer: Math.max(0, Math.round(gameState.matchTimer * 10) / 10),
    matchDuration: MATCH_TOTAL_TIME,
    isTreasureRain: isTreasureRainActive(),
    treasureRainTimer: Math.max(0, Math.round(treasureRainTimer * 10) / 10),
    maxChests: getMaxChests(),
    bombHolderId: gameState.bombHolderId,
    immunePlayerId: gameState.immunePlayerId,
    graceTimer: Math.max(0, Math.round(gameState.graceTimer * 10) / 10),
    activeQuiz: gameState.activeQuiz,
    players: activeGamePlayers,
    chests: activeChests,
    rosterCount: players.size,
    aliveCount: livingPlayers.length,
    survivalRoster: shouldSendRoster ? cachedSurvivalRoster : undefined,
    topWrongQuestions: (gameState.status === 'GAME_OVER') ? getTopWrongQuestions(3) : [],
    winner: gameState.winner || null
  });
}

// ==========================================
// 20 FPS SERVER GAME LOOP (TỐI ƯU SIÊU BĂNG THÔNG CHO GÓI FREE RENDER)
// ==========================================
const TICK_RATE = 20;
const DT = 1 / TICK_RATE;

setInterval(() => {
  if (gameState.status === 'ROUND_INTRO') {
    gameState.introCountdown -= DT;
    if (gameState.introCountdown <= 0) {
      gameState.status = 'PLAYING';
      io.emit('round_started', { round: gameState.roundNumber });
      rosterDirty = true;
    }
    broadcastGameState(true);
    return;
  }

  if (gameState.status !== 'PLAYING' && gameState.status !== 'LOBBY') {
    return;
  }

  // Trong sảnh chờ (LOBBY), chỉ phát tick 1 lần mỗi giây hoặc ngay khi có học sinh vào để tiết kiệm 95% băng thông
  if (gameState.status === 'LOBBY') {
    lobbyTickCounter = (lobbyTickCounter || 0) + 1;
    if (rosterDirty || lobbyTickCounter >= TICK_RATE) {
      lobbyTickCounter = 0;
      broadcastGameState(true);
    }
    return;
  }

  // Cập nhật khi trận đấu đang diễn ra
  if (gameState.status === 'PLAYING') {
    // 0. Đếm ngược thời gian tổng trận đấu (5 phút = 300 giây)
    gameState.matchTimer -= DT;
    if (gameState.matchTimer <= 0) {
      gameState.matchTimer = 0;
      handleMatchTimeOut();
      rosterDirty = true;
      broadcastGameState();
      return;
    }

    // 1. Tích điểm sinh tồn: Mỗi 1 giây sống sót được +1 điểm (nhân đôi nếu có buff x2)
    survivalScoreAccumulator += DT;
    if (survivalScoreAccumulator >= 1.0) {
      survivalScoreAccumulator -= 1.0;
      gamePlayers.forEach(p => {
        if (p.isAlive) {
          const mult = p.scoreMultiplier || 1;
          p.score = (p.score || 0) + 1 * mult;
          const baseP = players.get(p.id);
          if (baseP) baseP.score = p.score;
        }
      });
      rosterDirty = true;
    }

    // 2. RÚT NGẮN CHU KỲ HỒI SINH RƯƠNG SIÊU TỐC (Fast Respawn Cycle: 3.0s)
    const currentMaxChests = getMaxChests();
    if (chests.size < currentMaxChests) {
      chestSpawnTimer += DT;
      if (chestSpawnTimer >= CHEST_FAST_RESPAWN_DELAY) {
        chestSpawnTimer = 0;
        spawnChest();
      }
    } else {
      chestSpawnTimer = 0;
    }

    // 2.2. TUỔI THỌ RƯƠNG CHƯA MỞ (DECAY TIME: 20s tự biến mất và đổi vị trí mới)
    for (const [id, chest] of chests.entries()) {
      if (!chest.openedByPlayerId) {
        chest.decayTimer = (chest.decayTimer !== undefined ? chest.decayTimer : 20.0) - DT;
        if (chest.decayTimer <= 0) {
          chests.delete(id);
          io.emit('chest_despawned', { id });
          scheduleChestRespawn(3000);
          addEventLog('⏳ Rương báu sau 20s không ai mở đã tự làm mới sang vị trí khác!', 'info');
        }
      }
    }

    // 2.5. CƠ CHẾ "BÃO RƯƠNG" (TREASURE RAIN EVENT) ở phút 04:00 (240s) và phút 01:00 (60s)
    if (!rain1Triggered && gameState.matchTimer <= 180.0 && gameState.matchTimer > 150.0) {
      rain1Triggered = true;
      triggerTreasureRain();
    }
    if (!rain2Triggered && gameState.matchTimer <= 60.0 && gameState.matchTimer > 30.0) {
      rain2Triggered = true;
      triggerTreasureRain();
    }

    if (treasureRainActive) {
      treasureRainTimer -= DT;
      if (treasureRainTimer <= 0) {
        treasureRainActive = false;
        treasureRainTimer = 0;
        io.emit('treasure_rain_ended', {});
        broadcastTopAnnouncement('🌤️ BÃO RƯƠNG ĐÃ QUA!', 'Đấu trường trở lại nhịp độ bình thường!', 'info', '🌤️');
        addEventLog('🌤️ Cơn mưa rương đã kết thúc! Tỷ lệ điểm và số rương trở lại bình thường.', 'info');
        rosterDirty = true;
      }
    }

    // 3. Kiểm tra va chạm người chơi với rương báu
    checkChestCollisions();

    // 4. Grace timer countdown
    if (gameState.graceTimer > 0) {
      gameState.graceTimer -= DT;
      if (gameState.graceTimer < 0) gameState.graceTimer = 0;
    }

    // 5. Bomb timer countdown
    gameState.bombTimer -= DT;
    if (gameState.bombTimer <= 0) {
      gameState.bombTimer = 0;
      handleBombExplosion();
      rosterDirty = true;
  broadcastGameState();
      return;
    }
  }

  // Cập nhật từng người chơi
  gamePlayers.forEach(p => {
    if (!p.isAlive) return;

    // Bot AI
    if (p.isBot) {
      updateBotAI(p, DT);
    }

    // Giảm thời gian chờ mở rương tiếp theo (5 giây chống gom rương)
    if (p.chestOpenCooldown > 0) {
      p.chestOpenCooldown -= DT;
      if (p.chestOpenCooldown < 0) p.chestOpenCooldown = 0;
    }

    // Giảm thời gian buff đặc quyền rương báu
    if (p.scoreMultiplierTimer > 0) {
      p.scoreMultiplierTimer -= DT;
      if (p.scoreMultiplierTimer <= 0) {
        p.scoreMultiplierTimer = 0;
        p.scoreMultiplier = 1;
      }
    }
    if (p.speedMultiplierTimer > 0) {
      p.speedMultiplierTimer -= DT;
      if (p.speedMultiplierTimer <= 0) {
        p.speedMultiplierTimer = 0;
        p.speedMultiplier = 1;
      }
    }
    // Giảm thời gian hiệu ứng "Lỗi biên dịch" (chậm 30% trong 3s)
    if (p.slowTimer > 0) {
      p.slowTimer -= DT;
      if (p.slowTimer <= 0) {
        p.slowTimer = 0;
        p.slowMultiplier = 1.0;
      }
    }
    if (p.stunTimer > 0) {
      p.stunTimer -= DT;
      if (p.stunTimer <= 0) {
        p.stunTimer = 0;
        p.isStunned = false;
      }
    }
    if (p.respawnTimer > 0) {
      p.respawnTimer -= DT;
      if (p.respawnTimer <= 0) {
        p.respawnTimer = 0;
        p.isRespawning = false;
        p.isStunned = false;
        rosterDirty = true;
      }
    }
    if (p.penaltyFreezeTimer > 0) {
      p.penaltyFreezeTimer -= DT;
      if (p.penaltyFreezeTimer <= 0) {
        p.penaltyFreezeTimer = 0;
        if (!p.unlockQuestion) {
          p.isFrozen = false;
        }
      }
    }

    // Đếm ngược thời gian mở rương báu (tối đa 8s) - chống ôm rương câu giờ
    if (p.isOpeningChest && p.chestQuizTimeLeft !== undefined && p.chestQuizTimeLeft > 0) {
      p.chestQuizTimeLeft -= DT;
      if (p.chestQuizTimeLeft <= 0) {
        cancelChestQuiz(p, 'TIMEOUT');
      }
    }

    // Cooldowns kỹ năng
    if (p.dashCooldown > 0) {
      p.dashCooldown -= DT;
      if (p.dashCooldown < 0) p.dashCooldown = 0;
    }
    if (p.teleportCooldown > 0) {
      p.teleportCooldown -= DT;
      if (p.teleportCooldown < 0) p.teleportCooldown = 0;
    }
    if (p.passCooldown > 0) {
      p.passCooldown -= DT;
      if (p.passCooldown < 0) p.passCooldown = 0;
    }

    // Dash duration
    if (p.isDashing) {
      p.dashTimer -= DT;
      if (p.dashTimer <= 0) {
        p.isDashing = false;
      }
    }

    // Nếu bị đóng băng, bị choáng, hoặc đang trả lời câu hỏi chuyền bom thì không di chuyển
    // (Mở rương tàng hình VẪN ĐƯỢC DI CHUYỂN né bom tự do!)
    if (p.isFrozen || p.isPassingQuiz || p.isStunned) {
      return;
    }

    let speed = BASE_SPEED * (p.speedMultiplier || 1.0) * (p.slowMultiplier || 1.0);
    if (p.hasBomb) {
      speed *= BOMB_SPEED_MULTIPLIER;
    }

    let moveX = 0;
    let moveY = 0;

    if (p.isDashing) {
      moveX = p.dashDirX * DASH_SPEED * DT;
      moveY = p.dashDirY * DASH_SPEED * DT;
    } else {
      const inputLen = Math.hypot(p.targetVx, p.targetVy);
      if (inputLen > 0.05) {
        const normX = p.targetVx / (inputLen > 1 ? inputLen : 1);
        const normY = p.targetVy / (inputLen > 1 ? inputLen : 1);
        moveX = normX * speed * DT;
        moveY = normY * speed * DT;
        p.facingAngle = Math.atan2(normY, normX);
      }
    }

    p.x += moveX;
    p.y += moveY;

    resolveWallCollision(p);
    resolveObstacleCollision(p);
  });

  resolvePlayerCollisions();
  checkBombTagPassing();
  broadcastGameState();
}, 1000 / TICK_RATE);

// ==========================================
// SOCKET.IO EVENT HANDLERS
// ==========================================
io.on('connection', (socket) => {
  socket.emit('init_arena', {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    obstacles: OBSTACLES,
    questionsCount: QUESTIONS_BANK.length,
    joinUrl: resolveJoinUrl()
  });
  rosterDirty = true;
  broadcastGameState();

  // 1. Học sinh đăng nhập vào phòng
  socket.on('player_join', (data) => {
    const { name, avatar, color } = data;
    const cleanName = (name || "Học sinh " + (players.size + 1)).trim().slice(0, 18);

    const playerObj = {
      id: socket.id,
      socketId: socket.id,
      name: cleanName,
      avatar: avatar || '🎓',
      color: color || '#FF2E7E',
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      explodedCount: 0,
      isBot: false
    };

    players.set(socket.id, playerObj);

    // Cho người chơi vào sân ngay lập tức (cả LOBBY lẫn PLAYING) để học sinh di chuyển và thử nút bấm
    const pos = getSafeRandomPosition();
    gamePlayers.set(socket.id, {
      id: socket.id,
      socketId: socket.id,
      name: playerObj.name,
      avatar: playerObj.avatar,
      color: playerObj.color,
      isBot: false,
      score: 0,
      scoreMultiplier: 1,
      scoreMultiplierTimer: 0,
      speedMultiplier: 1.0,
      speedMultiplierTimer: 0,
      slowMultiplier: 1.0,
      slowTimer: 0,
      isStunned: false,
      stunTimer: 0,
      penaltyFreezeTimer: 0,
      hasTeleportCharge: false,
      isRespawning: false,
      respawnTimer: 0,
      isInvisible: false,
      isOpeningChest: false,
      chestOpenCooldown: 0,
      chestQuizQuestion: null,
      activeChestId: null,
      chestQuizTimeLeft: 0,
      x: pos.x,
      y: pos.y,
      targetVx: 0,
      targetVy: 0,
      facingAngle: 0,
      radius: PLAYER_RADIUS,
      isAlive: true,
      hasBomb: false,
      isFrozen: false,
      unlockQuestion: null,
      isPassingQuiz: false,
      passTargetId: null,
      activeQuestion: null,
      passCooldown: 0,
      isDashing: false,
      dashCooldown: 0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirY: 0,
      teleportCooldown: 0
    });

    socket.emit('join_success', playerObj);
    addEventLog(`👋 ${cleanName} đã tham gia lớp học! (Hiện có ${players.size} bạn)`, 'info');
    rosterDirty = true;
  broadcastGameState();
  });

  // 2. Điều khiển Joystick
  socket.on('player_input', (input) => {
    const p = gamePlayers.get(socket.id);
    if (!p || !p.isAlive || p.isFrozen || p.isPassingQuiz || p.isStunned) return;

    p.targetVx = clamp(input.x || 0, -1, 1);
    p.targetVy = clamp(input.y || 0, -1, 1);
  });

  // 3. Kỹ năng Dash (Lướt)
  socket.on('player_dash', () => {
    const p = gamePlayers.get(socket.id);
    if (p && p.isAlive && !p.isFrozen && !p.isPassingQuiz && !p.isStunned) {
      triggerDash(p);
    }
  });

  // 4. Kỹ năng Tốc Biến (Yêu cầu có lượt sạc từ Rương Báu)
  socket.on('player_teleport_farthest', () => {
    const p = gamePlayers.get(socket.id);
    if (p && p.isAlive && !p.isFrozen && !p.isStunned && !p.isRespawning) {
      triggerTeleport(p);
    }
  });

  // 4B. Học sinh chạm rương (Client-side Claim - O(1) tức thì, không tải Server)
  socket.on('player_claim_chest', (data) => {
    if (gameState.status !== 'PLAYING') return;
    const p = gamePlayers.get(socket.id);
    if (!p || !p.isAlive || p.isFrozen || p.isOpeningChest || p.isStunned || p.isRespawning) return;
    if (p.chestOpenCooldown > 0) return;

    const chest = chests.get(data?.chestId);
    if (!chest || chest.attemptsLeft <= 0 || chest.openedByPlayerId) return;

    // Dung sai khoảng cách an toàn (bounding box + squared distance)
    const dx = p.x - chest.x;
    const dy = p.y - chest.y;
    const maxAllowedDist = p.radius + chest.radius + 35;
    if (Math.abs(dx) < maxAllowedDist && Math.abs(dy) < maxAllowedDist && (dx * dx + dy * dy < maxAllowedDist * maxAllowedDist)) {
      triggerChestQuiz(p, chest);
    }
  });

  // 5. Học sinh chạm chọn đáp án trên điện thoại (đồng bộ tức thì lên TV giáo viên)
  socket.on('quiz_select_option', (data) => {
    const p = gamePlayers.get(socket.id) || players.get(socket.id);
    if (!p) return;
    io.emit('quiz_option_hovered', {
      playerId: socket.id,
      playerName: p.name,
      playerAvatar: p.avatar,
      chosenIndex: data?.chosenIndex
    });
  });

  // 6. Học sinh gửi đáp án câu hỏi chuyền bom
  socket.on('submit_pass_quiz', (data) => {
    handlePassQuizAnswer(socket.id, data?.chosenIndex);
  });

  // 7. Học sinh gửi đáp án câu hỏi mở khóa đóng băng
  socket.on('submit_unlock_quiz', (data) => {
    handleUnlockQuizAnswer(socket.id, data?.chosenIndex);
  });

  // 8. Học sinh gửi đáp án câu hỏi rương báu
  socket.on('submit_chest_quiz', (data) => {
    handleChestQuizAnswer(socket.id, data?.chosenIndex);
  });

  // Học sinh chủ động hủy/bỏ qua mở rương báu
  socket.on('cancel_chest_quiz', () => {
    const p = gamePlayers.get(socket.id);
    if (p && p.isOpeningChest) {
      cancelChestQuiz(p, 'CANCEL');
    }
  });

  // 9. Điều khiển của Giáo viên (Host - Yêu cầu xác thực mật khẩu)
  socket.on('host_login', (data, callback) => {
    const pass = (data && data.password ? data.password : '').toString().trim();
    if (pass === TEACHER_PASSWORD) {
      authenticatedHostSockets.add(socket.id);
      socket.isHostAuthenticated = true;
      if (typeof callback === 'function') callback({ success: true });
      else socket.emit('host_login_response', { success: true });
      addEventLog('🔑 Giáo viên đã mở khóa quyền điều khiển máy chiếu thành công.', 'info');
    } else {
      if (typeof callback === 'function') callback({ success: false, message: 'Sai mật khẩu giáo viên!' });
      else socket.emit('host_login_response', { success: false, message: 'Sai mật khẩu!' });
    }
  });

  socket.on('host_start_round', (data) => {
    if (!requireHostAuth(socket)) return;
    startRound(data?.round || (gameState.roundNumber + 1));
  });

  socket.on('host_reset_game', () => {
    if (!requireHostAuth(socket)) return;
    resetGame();
  });

  socket.on('host_set_bomb_timer', (data) => {
    if (!requireHostAuth(socket)) return;
    const sec = parseInt(data?.seconds) || 30;
    BOMB_COUNTDOWN_DEFAULT = sec;
    gameState.bombTimer = sec;
    rosterDirty = true;
  broadcastGameState();
    addEventLog(`⏱ Giáo viên chỉnh thời gian bom: ${sec} giây.`, 'info');
  });

  socket.on('host_force_explode', () => {
    if (!requireHostAuth(socket)) return;
    if (gameState.status === 'PLAYING') {
      gameState.bombTimer = 0;
    }
  });

  // Thêm 1 Bot học sinh (chỉ giáo viên đã xác thực mới được thêm)
  socket.on('host_add_bot', () => {
    if (!requireHostAuth(socket)) return;
    if (players.size >= 45) return;
    const botAvatars = ['🤖', '🐱', '🦊', '⚡', '🐼', '🐯', '🦄', '🚀', '🌺', '💎', '🐧', '🐶', '🦁', '🦉', '🐢'];
    const botColors = ['#FF4757', '#2ED573', '#1E90FF', '#FFA502', '#9B59B6', '#00CEC9', '#E84393', '#FD79A8'];
    const names = [
      'An', 'Bình', 'Châu', 'Dương', 'Giang', 'Hà', 'Khánh', 'Linh', 'Minh', 'Nam',
      'Phong', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tú', 'Uyên', 'Vinh', 'Yến', 'Khoa',
      'Đạt', 'Hiếu', 'Huy', 'Hưng', 'Long', 'Phúc', 'Quang', 'Thắng', 'Thịnh', 'Trung'
    ];

    const num = players.size + 1;
    const randomName = names[Math.floor(Math.random() * names.length)] + ` (${num})`;
    const botId = 'bot_' + Math.random().toString(36).substring(2, 9);

    const botObj = {
      id: botId,
      socketId: null,
      name: randomName,
      avatar: botAvatars[num % botAvatars.length],
      color: botColors[num % botColors.length],
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      explodedCount: 0,
      isBot: true
    };

    players.set(botId, botObj);

    // Thêm bot vào sân ngay lập tức (LOBBY hoặc PLAYING)
    const pos = getSafeRandomPosition();
    gamePlayers.set(botId, {
      id: botId,
      socketId: null,
      name: botObj.name,
      avatar: botObj.avatar,
      color: botObj.color,
      isBot: true,
      score: 0,
      scoreMultiplier: 1,
      scoreMultiplierTimer: 0,
      speedMultiplier: 1.0,
      speedMultiplierTimer: 0,
      slowMultiplier: 1.0,
      slowTimer: 0,
      isStunned: false,
      stunTimer: 0,
      penaltyFreezeTimer: 0,
      hasTeleportCharge: false,
      isRespawning: false,
      respawnTimer: 0,
      isInvisible: false,
      isOpeningChest: false,
      chestOpenCooldown: 0,
      chestQuizQuestion: null,
      activeChestId: null,
      chestQuizTimeLeft: 0,
      x: pos.x,
      y: pos.y,
      targetVx: 0,
      targetVy: 0,
      facingAngle: 0,
      radius: PLAYER_RADIUS,
      isAlive: true,
      hasBomb: false,
      isFrozen: false,
      unlockQuestion: null,
      isPassingQuiz: false,
      passTargetId: null,
      activeQuestion: null,
      passCooldown: 0,
      isDashing: false,
      dashCooldown: 0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirY: 0,
      teleportCooldown: 0
    });

    rosterDirty = true;
  broadcastGameState();
    addEventLog(`🤖 Đã thêm 1 Bot (${randomName}) vào phòng! (Tổng: ${players.size} bạn)`, 'info');
  });

  socket.on('host_remove_bots', () => {
    let removed = 0;
    for (const [id, p] of players.entries()) {
      if (p.isBot) {
        players.delete(id);
        if (gamePlayers.has(id)) gamePlayers.delete(id);
        removed++;
      }
    }
    rosterDirty = true;
  broadcastGameState();
    addEventLog(`🧹 Đã xóa ${removed} Bot học sinh khỏi lớp!`, 'info');
  });

  // 9. Disconnect (Học sinh thoát hoặc đóng tab)
  socket.on('disconnect', () => {
    authenticatedHostSockets.delete(socket.id);
    // Nếu học sinh ngắt kết nối đang mở rương báu
    const discPlayer = gamePlayers.get(socket.id);
    if (discPlayer && discPlayer.isOpeningChest) {
      cancelChestQuiz(discPlayer, 'DISCONNECT');
    }

    // Nếu học sinh ngắt kết nối đang giữ bom trong trận đấu
    if (gameState.status === 'PLAYING' && gameState.bombHolderId === socket.id) {
      const living = Array.from(gamePlayers.values()).filter(p => p.isAlive && p.id !== socket.id);
      if (living.length > 0) {
        const next = living[Math.floor(Math.random() * living.length)];
        next.hasBomb = true;
        gameState.bombHolderId = next.id;
        freezeAndAssignUnlockQuiz(next);
      }
    }

    // Xóa học sinh đã đóng tab ra khỏi hệ thống
    players.delete(socket.id);
    gamePlayers.delete(socket.id);

    rosterDirty = true;
  broadcastGameState();
  });
});

// Start Server (tương thích Render, Cloud & Local LAN)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🎓 ĐẤU TRƯỜNG BOM TIN HỌC 10 - BÀI 30: KIỂM THỬ VÀ GỠ LỖI`);
  console.log(`🚀 Server đang khởi chạy trên cổng: ${PORT}`);
  console.log(`📺 Màn hình Giáo viên: /spectator`);
  console.log(`📱 Màn hình Học sinh:  / (quét mã QR để vào thi đấu)`);
  console.log(`====================================================`);
});
