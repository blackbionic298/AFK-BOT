const mineflayer = require('mineflayer');
const express = require('express');
const fetch = require('node-fetch');

// ===== HTTP 保活服务器（Render 必须有 HTTP 接口） =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('AFK Bot 在线 - Running on Render');
});

app.listen(PORT, () => {
  console.log(`[Render] HTTP server started on port ${PORT}`);
});

// ===== 自 ping 保活（防止 Render Free 层 15 分钟休眠） =====
const RENDER_URL = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : `http://localhost:${PORT}`;

setInterval(() => {
  console.log('[Self-Ping] Pinging:', RENDER_URL);
  fetch(RENDER_URL).catch(err => {
    console.error('[Self-Ping] Failed:', err.message);
  });
}, 300000); // 每 5 分钟 ping 一次

// ===== 配置 =====
const CONFIG = {
  host: 'eternel.eu',
  port: 25565,
  version: false,
  auth: 'offline',

  checkTimeoutInterval: 180000
};

const BOT_USERNAME = 'accesscontrol';
const AUTHME_PASSWORD = process.env.AUTHME_PASSWORD || 'deutschland';

let bot;
let jumpInterval;
let reconnecting = false;

function startBot() {
  if (reconnecting) return;
  reconnecting = true;

  console.log('⏳ 连接中:', BOT_USERNAME);

  bot = mineflayer.createBot({
    ...CONFIG,
    username: BOT_USERNAME
  });

  bot.once('spawn', () => {
    console.log('✅ 已进服，尝试 AuthMe');
    reconnecting = false;

    bot.chat(`/login ${AUTHME_PASSWORD}`);
    bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);

    bot.on('messagestr', (msg) => {
      const m = msg.toLowerCase();
      if (m.includes('/register')) {
        console.log('→ 检测到注册');
        bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
      }
      if (m.includes('/login')) {
        console.log('→ 检测到登录');
        bot.chat(`/login ${AUTHME_PASSWORD}`);
      }
      if (
        m.includes('success') ||
        m.includes('logged') ||
        m.includes('验证成功') ||
        m.includes('已登录') ||
        m.includes('welcome')
      ) {
        console.log('✅ AuthMe 完成，开始 AFK');
        startAntiAFK();
      }
    });
  });

  bot.on('end', () => reconnect('连接结束'));
  bot.on('kicked', (r) => reconnect(r));
  bot.on('error', (e) => reconnect(e.message));
}

function startAntiAFK() {
  if (jumpInterval) return;
  jumpInterval = setInterval(() => {
    if (!bot?.entity) return;
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 300);
  }, 20000);
}

function reconnect(reason = '未知') {
  console.log('❌ 掉线:', reason);
  try { bot.quit(); } catch {}
  bot?.removeAllListeners();
  bot = null;
  if (jumpInterval) clearInterval(jumpInterval);
  setTimeout(() => {
    reconnecting = false;
    startBot();
  }, 30000);
}

startBot();
