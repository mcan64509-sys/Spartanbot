const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { Pool } = require('pg');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const { YouTubeDlpExtractor, setFFmpegPath, setYtDlpPath } = require('discord-player-youtubedlp');

// =====================================================
// SABİT AYARLAR
// =====================================================
const CONFIG = {
  guildId: '1425090142057529440',
  bossChannelId: '1550880656802713620',
  authorizedRoleId: '1475586372277637352',
  timezone: 'Europe/Istanbul',
  types: {
    general: {
      label: 'GENERAL', emoji: '🛡️', color: 0x3498db,
      voiceChannelId: '1475584393425850449',
      logChannelId: '1475580542480285861',
      times: ['01:12', '02:43', '04:12', '05:43', '07:12', '08:43', '10:12', '11:43', '13:12', '14:43', '16:12', '17:43', '19:12', '20:43', '22:12', '23:43'],
    },
    f9: {
      label: 'F9', emoji: '🕷️', color: 0x9b59b6,
      voiceChannelId: '1475585178415009975',
      logChannelId: '1475584796423094403',
      times: ['00:12', '02:12', '04:12', '06:12', '08:12', '10:12', '12:12', '14:12', '16:12', '18:12', '20:12', '22:12'],
    },
  },
};

const TOKEN = String(process.env.TOKEN || '').trim();
const CLIENT_ID = String(process.env.CLIENT_ID || '').trim();
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
if (!TOKEN || !CLIENT_ID || !DATABASE_URL) {
  console.error('❌ Eksik Railway Variables: TOKEN, CLIENT_ID, DATABASE_URL');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMembers],
});
const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
pool.on('error', error => console.error('❌ PostgreSQL:', error));

const player = new Player(client, { skipFFmpeg: false });
setFFmpegPath('/usr/bin/ffmpeg');
setYtDlpPath('/usr/local/bin/yt-dlp');
player.events.on('error', (queue, error) => console.error('❌ Müzik queue:', error));
player.events.on('playerError', (queue, error) => console.error('❌ Müzik player:', error));

const commands = [
  new SlashCommandBuilder()
    .setName('log').setDescription('Ses kanalındaki üyelerin setini kaydeder.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addIntegerOption(o => o.setName('set').setDescription('Eklenecek set sayısı').setMinValue(1).setMaxValue(100).setRequired(false))
    .addStringOption(o => o.setName('not').setDescription('İsteğe bağlı açıklama').setMaxLength(300).setRequired(false)),
  new SlashCommandBuilder()
    .setName('durum').setDescription('General ve F9 set toplamını gösterir.')
    .addUserOption(o => o.setName('uye').setDescription('Bakılacak üye').setRequired(false)),
  new SlashCommandBuilder().setName('çal').setDescription('Ses kanalında müzik çalar.')
    .addStringOption(o => o.setName('şarkı').setDescription('Şarkı adı veya YouTube bağlantısı').setRequired(true)),
  new SlashCommandBuilder().setName('geç').setDescription('Çalan şarkıyı geçer.'),
  new SlashCommandBuilder().setName('durdur').setDescription('Müziği durdurur ve kuyruğu temizler.'),
  new SlashCommandBuilder().setName('kuyruk').setDescription('Müzik kuyruğunu gösterir.'),
  new SlashCommandBuilder().setName('şimdiçalıyor').setDescription('Çalan şarkıyı gösterir.'),
];

function embed(title, description, color = 0x8b0000) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)
    .setFooter({ text: 'Spartan Bot • Created By Lymix' }).setTimestamp();
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spartan_user_sets (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      boss_type TEXT NOT NULL,
      set_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, boss_type)
    );
    CREATE TABLE IF NOT EXISTS spartan_logs (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      boss_type TEXT NOT NULL,
      set_amount INTEGER NOT NULL,
      member_ids TEXT[] NOT NULL,
      moderator_id TEXT NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS spartan_boss_notifications (
      guild_id TEXT NOT NULL,
      boss_type TEXT NOT NULL,
      boss_date TEXT NOT NULL,
      boss_time TEXT NOT NULL,
      PRIMARY KEY (guild_id, boss_type, boss_date, boss_time)
    );
  `);
  console.log('✅ PostgreSQL tabloları hazır.');
}

function istanbulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function subtractMinutes(hhmm, amount) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m - amount + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function bossDateForReminder(date, bossTime, reminderTime) {
  if (reminderTime <= bossTime) return date;
  const [y, m, d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d));
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

async function checkBossNotifications() {
  if (!client.isReady()) return;
  const guild = client.guilds.cache.get(CONFIG.guildId);
  const channel = guild?.channels.cache.get(CONFIG.bossChannelId) || await guild?.channels.fetch(CONFIG.bossChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const now = istanbulNow();

  for (const [type, cfg] of Object.entries(CONFIG.types)) {
    for (const bossTime of cfg.times) {
      const reminderTime = subtractMinutes(bossTime, 10);
      if (now.time !== reminderTime) continue;
      const bossDate = bossDateForReminder(now.date, bossTime, reminderTime);
      const inserted = await pool.query(`
        INSERT INTO spartan_boss_notifications(guild_id,boss_type,boss_date,boss_time)
        VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING guild_id
      `, [CONFIG.guildId, type, bossDate, bossTime]);
      if (!inserted.rowCount) continue;
      try {
        await channel.send({
          content: '@everyone **💀 SPARTAN UYAN BOSS SAATİ 💀**',
          embeds: [embed(`${cfg.emoji} ${cfg.label} BOSS`, `⏰ **10 dakika kaldı!**\n🕒 Boss saati: **${bossTime}**`, cfg.color)],
          allowedMentions: { parse: ['everyone'] },
        });
        console.log(`✅ Boss bildirimi: ${cfg.label} ${bossTime}`);
      } catch (error) {
        await pool.query('DELETE FROM spartan_boss_notifications WHERE guild_id=$1 AND boss_type=$2 AND boss_date=$3 AND boss_time=$4', [CONFIG.guildId, type, bossDate, bossTime]);
        console.error('❌ Boss bildirimi:', error);
      }
    }
  }
}

function isLogAuthorized(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    || interaction.member?.roles?.cache?.has(CONFIG.authorizedRoleId);
}

async function handleLog(interaction) {
  if (!isLogAuthorized(interaction)) return interaction.reply({ content: '❌ Bu komut yalnızca log yetkilisi tarafından kullanılabilir.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const type = interaction.options.getString('tur');
  const amount = interaction.options.getInteger('set') || 1;
  const note = interaction.options.getString('not') || null;
  const cfg = CONFIG.types[type];
  const voice = interaction.guild.channels.cache.get(cfg.voiceChannelId) || await interaction.guild.channels.fetch(cfg.voiceChannelId).catch(() => null);
  const logChannel = interaction.guild.channels.cache.get(cfg.logChannelId) || await interaction.guild.channels.fetch(cfg.logChannelId).catch(() => null);
  if (!voice?.isVoiceBased()) return interaction.editReply('❌ Ses kanalı bulunamadı.');
  if (!logChannel?.isTextBased()) return interaction.editReply('❌ Log metin kanalı bulunamadı.');
  const members = [...voice.members.values()].filter(member => !member.user.bot);
  if (!members.length) return interaction.editReply('❌ Ses kanalında kaydedilecek üye yok.');

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const member of members) {
      await db.query(`
        INSERT INTO spartan_user_sets(guild_id,user_id,boss_type,set_count)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(guild_id,user_id,boss_type)
        DO UPDATE SET set_count=spartan_user_sets.set_count + EXCLUDED.set_count
      `, [CONFIG.guildId, member.id, type, amount]);
    }
    const saved = await db.query(`
      INSERT INTO spartan_logs(guild_id,boss_type,set_amount,member_ids,moderator_id,note)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id
    `, [CONFIG.guildId, type, amount, members.map(m => m.id), interaction.user.id, note]);
    await db.query('COMMIT');
    const list = members.map((member, i) => `${i + 1}. ${member}`).join('\n');
    const description = `**Eklenen set:** ${amount}\n**Üye sayısı:** ${members.length}\n**Yetkili:** ${interaction.user}\n**Log ID:** #${saved.rows[0].id}${note ? `\n**Not:** ${note}` : ''}\n\n${list}`;
    await logChannel.send({ embeds: [embed(`${cfg.emoji} ${cfg.label} LOG`, description, cfg.color)] });
    return interaction.editReply(`✅ ${members.length} üyeye ${amount} ${cfg.label} seti eklendi. Log ID: #${saved.rows[0].id}`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('❌ /log:', error);
    return interaction.editReply('❌ Log kaydedilemedi. Railway loglarını kontrol et.');
  } finally {
    db.release();
  }
}

async function handleStatus(interaction) {
  const user = interaction.options.getUser('uye') || interaction.user;
  const result = await pool.query('SELECT boss_type,set_count FROM spartan_user_sets WHERE guild_id=$1 AND user_id=$2', [CONFIG.guildId, user.id]);
  const totals = { general: 0, f9: 0 };
  for (const row of result.rows) totals[row.boss_type] = Number(row.set_count);
  return interaction.reply({ embeds: [embed('📊 SPARTAN DURUM', `${user}\n\n🛡️ **General:** ${totals.general} set\n🕷️ **F9:** ${totals.f9} set`, 0x57f287)] });
}

const COOKIE_FILE = '/tmp/spartan-youtube-cookies.txt';
function prepareCookies() {
  const raw = process.env.YOUTUBE_COOKIES;
  if (!raw?.trim()) return null;
  fs.writeFileSync(COOKIE_FILE, raw.replace(/\r\n/g, '\n').trim() + '\n', { mode: 0o600 });
  return COOKIE_FILE;
}

function ytDlpStream(url) {
  const cookieFile = prepareCookies();
  const args = ['--no-playlist', '--no-warnings', '--quiet', '--js-runtimes', 'node', '--remote-components', 'ejs:github'];
  if (cookieFile) args.push('--cookies', cookieFile);
  args.push('-f', 'bestaudio[protocol^=http]/bestaudio/best', '-o', '-', url);
  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
  proc.on('close', code => { if (code && code !== 0) console.error(`❌ yt-dlp (${code}):`, stderr.slice(-1500)); });
  return proc.stdout;
}

async function handlePlay(interaction) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) return interaction.reply({ content: '❌ Önce bir ses kanalına gir.', ephemeral: true });
  await interaction.deferReply();
  let query = interaction.options.getString('şarkı');
  try {
    const url = new URL(query);
    if (url.hostname === 'music.youtube.com' && url.searchParams.get('v')) query = `https://www.youtube.com/watch?v=${url.searchParams.get('v')}`;
  } catch {}
  try {
    const result = await player.play(voice, query, {
      requestedBy: interaction.user,
      nodeOptions: {
        metadata: { textChannelId: interaction.channelId },
        onBeforeCreateStream: async track => {
          const url = track?.url || query;
          return /youtube\.com|youtu\.be/.test(url) ? ytDlpStream(url) : null;
        },
        leaveOnEmpty: true, leaveOnEmptyCooldown: 60_000,
        leaveOnEnd: true, leaveOnEndCooldown: 60_000,
      },
    });
    return interaction.editReply({ embeds: [embed('🎵 MÜZİĞE EKLENDİ', `**${result.track.title}**\n⏱️ ${result.track.duration || 'Hesaplanıyor'}\n👤 ${interaction.user}`, 0x57f287)] });
  } catch (error) {
    console.error('❌ /çal:', error);
    return interaction.editReply('❌ Şarkı açılamadı. YouTube cookies veya Railway loglarını kontrol et.');
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== CONFIG.guildId) return;
  try {
    if (interaction.commandName === 'log') return handleLog(interaction);
    if (interaction.commandName === 'durum') return handleStatus(interaction);
    if (interaction.commandName === 'çal') return handlePlay(interaction);
    const queue = player.nodes.get(interaction.guildId);
    if (interaction.commandName === 'geç') {
      if (!queue?.currentTrack) return interaction.reply({ content: '❌ Çalan şarkı yok.', ephemeral: true });
      const title = queue.currentTrack.title; queue.node.skip();
      return interaction.reply(`⏭️ **${title}** geçildi.`);
    }
    if (interaction.commandName === 'durdur') {
      if (!queue) return interaction.reply({ content: '❌ Aktif müzik yok.', ephemeral: true });
      queue.delete(); return interaction.reply('⏹️ Müzik durduruldu ve kuyruk temizlendi.');
    }
    if (interaction.commandName === 'kuyruk') {
      if (!queue?.currentTrack) return interaction.reply({ content: '❌ Kuyruk boş.', ephemeral: true });
      const next = queue.tracks.toArray().slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n') || 'Sırada başka şarkı yok.';
      return interaction.reply({ embeds: [embed('🎶 MÜZİK KUYRUĞU', `**Şimdi:** ${queue.currentTrack.title}\n\n${next}`, 0x5865f2)] });
    }
    if (interaction.commandName === 'şimdiçalıyor') {
      if (!queue?.currentTrack) return interaction.reply({ content: '❌ Çalan şarkı yok.', ephemeral: true });
      return interaction.reply({ embeds: [embed('🎵 ŞİMDİ ÇALIYOR', `**${queue.currentTrack.title}**\n⏱️ ${queue.currentTrack.duration}`, 0x5865f2)] });
    }
  } catch (error) {
    console.error('❌ Interaction:', error);
    const payload = { content: '❌ İşlem tamamlanamadı. Railway loglarını kontrol et.', ephemeral: true };
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
    return interaction.reply(payload).catch(() => {});
  }
});

client.once('clientReady', async () => {
  console.log(`🤖 ${client.user.tag} aktif.`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, CONFIG.guildId), { body: commands.map(c => c.toJSON()) });
  console.log(`✅ ${commands.length} slash komutu yüklendi.`);
  checkBossNotifications().catch(console.error);
  setInterval(() => checkBossNotifications().catch(console.error), 30_000);
});

async function start() {
  try {
    console.log('🚀 Spartan Clean başlatılıyor...');
    await pool.query('SELECT NOW()');
    await initDatabase();
    await player.extractors.loadMulti(DefaultExtractors);
    await player.extractors.register(YouTubeDlpExtractor, { debug: false, searchLimit: 5, ytdlpTimeoutMs: 30_000 });
    await client.login(TOKEN);
  } catch (error) {
    console.error('❌ BOT BAŞLATILAMADI:', error);
    process.exit(1);
  }
}

process.once('SIGTERM', async () => { client.destroy(); await pool.end().catch(() => {}); process.exit(0); });
process.once('SIGINT', async () => { client.destroy(); await pool.end().catch(() => {}); process.exit(0); });
start();
