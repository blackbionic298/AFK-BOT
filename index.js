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

const BOT_USERNAME = 'reflix';
const AUTHME_PASSWORD = process.env.AUTHME_PASSWORD || 'deutsch_land';
const MASTER_PLAYER = 'RFLIX500K'; // 自动接受这个玩家的 TPA

let bot;
let jumpInterval;
let reconnecting = false;
let awaitingCaptcha = false; // 新增：验证码等待状态

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

      // ── AuthMe 处理 ──
      if (m.includes('/register')) {
        console.log('→ 检测到注册提示');
        bot.chat(`/register ${AUTHME_PASSWORD} ${AUTHME_PASSWORD}`);
      }
      if (m.includes('/login')) {
        console.log('→ 检测到登录提示');
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

      // ── 自动接受 TPA ──
      if (
        m.includes(MASTER_PLAYER.toLowerCase()) &&
        (m.includes('requested to teleport') ||
         m.includes('wants to teleport') ||
         m.includes('has requested tpa') ||
         m.includes('/tpaaccept') ||
         (m.includes('tpa') && m.includes('to you')))
      ) {
        if (m.includes(bot.username.toLowerCase()) || m.includes('to you')) {
          console.log(`→ 检测到 ${MASTER_PLAYER} 的 TPA 请求，0.8秒后自动接受`);
          setTimeout(() => {
            bot.chat('/tpaaccept');
          }, 800);
        }
      }

      // ── 验证码检测 ──
      if (
        m.includes('being verified') ||
        m.includes('do not move') ||
        m.includes('please process') ||
        m.includes('enter the text') ||
        m.includes('displayed on the map') ||
        m.includes('antbot') ||
        m.includes('antibot') ||
        (m.includes('verification') && m.includes('map'))
      ) {
        console.log('╔════════════════════════════════════════════╗');
        console.log('║          [验证码] 需要手动输入！          ║');
        console.log('║  请打开 Minecraft 查看你获得的地图       ║');
        console.log('║  把地图上的文字输入到**这个控制台**后回车 ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('完整提示：');
        console.log(msg);
        awaitingCaptcha = true;
      }

      // ── 验证码通过判断 ──
      if (
        awaitingCaptcha &&
        (m.includes('verified') ||
         m.includes('success') ||
         m.includes('passed') ||
         m.includes('human') ||
         m.includes('通过') ||
         m.includes('correct') ||
         m.includes('welcome back'))
      ) {
        console.log('┌────────────────────────────┐');
        console.log('│     [验证码] 通过！        │');
        console.log('└────────────────────────────┘');
        awaitingCaptcha = false;
        startAntiAFK(); // 确保 AFK 继续
      }
    });
  });

  // ── 收到地图数据包时提醒 ──
  bot.on('map', (data) => {
    if (!awaitingCaptcha) return;

    console.log('╔════════════════════════════════════════════╗');
    console.log('║       [验证码] 收到地图数据！             ║');
    console.log(`║  地图ID: ${data.itemDamage || data.mapId || '未知'}`);
    console.log(`║  颜色数据长度: ${data.colors?.length || '无'}`);
    console.log('║                                            ║');
    console.log('║  → 现在请查看游戏里的地图物品             ║');
    console.log('║  → 输入验证码到控制台后按回车             ║');
    console.log('╚════════════════════════════════════════════╝');
  });

  bot.on('end', () => reconnect('连接结束'));
  bot.on('kicked', (r) => reconnect(`被踢出: ${r}`));
  bot.on('error', (e) => reconnect(`错误: ${e.message}`));
}

function startAntiAFK() {
  if (jumpInterval) return;
  console.log('启动反AFK：每20秒跳一下');
  jumpInterval = setInterval(() => {
    if (!bot?.entity) return;
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 300);
  }, 20000);
}

function reconnect(reason = '未知') {
  console.log('❌ 掉线原因:', reason);
  try { bot.quit(); } catch {}
  bot?.removeAllListeners();
  bot = null;
  if (jumpInterval) {
    clearInterval(jumpInterval);
    jumpInterval = null;
  }
  awaitingCaptcha = false;

  setTimeout(() => {
    reconnecting = false;
    startBot();
  }, 30000); // 30秒后重连
}

// ── 监听控制台输入（用于验证码） ──
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (input) => {
  const text = input.trim();
  if (text.length === 0) return;

  if (awaitingCaptcha) {
    console.log(`→ 发送验证码: "${text}"`);
    bot.chat(text);
    // 不立即设为 false，等服务器确认通过再清状态（更稳）
  } else {
    console.log('(当前不在验证码等待状态，输入已忽略)');
  }
});

// 启动！
startBot();
