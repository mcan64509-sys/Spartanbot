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
      times: ['02:31', '04:01', '05:31', '07:01', '08:31', '10:01', '11:31', '13:01', '14:31', '16:01', '17:31', '19:01', '20:31', '22:01', '23:31', '01:01'],
    },
    f9: {
      label: 'F9', emoji: '🕷️', color: 0x9b59b6,
      voiceChannelId: '1475585178415009975',
      logChannelId: '1475584796423094403',
      times: ['01:01', '03:01', '05:01', '07:01', '09:01', '11:01', '13:01', '15:01', '17:01', '19:01', '21:01', '23:01'],
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
    .setName('log').setDescription('Ses kanalındaki herkese 1 set ekler ve log alır.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addIntegerOption(o => o.setName('kivrik').setDescription('Bu logda alınan kıvrık').setMinValue(0).setMaxValue(100000).setRequired(false))
    .addStringOption(o => o.setName('not').setDescription('İsteğe bağlı açıklama').setMaxLength(300).setRequired(false)),
  new SlashCommandBuilder()
    .setName('set-ekle').setDescription('Bir kullanıcıya manuel set ekler.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addUserOption(o => o.setName('uye').setDescription('Set eklenecek kullanıcı').setRequired(true))
    .addIntegerOption(o => o.setName('miktar').setDescription('Eklenecek set').setMinValue(1).setMaxValue(100000).setRequired(true)),
  new SlashCommandBuilder()
    .setName('set-sil').setDescription('Bir kullanıcının setini azaltır.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addUserOption(o => o.setName('uye').setDescription('Seti azaltılacak kullanıcı').setRequired(true))
    .addIntegerOption(o => o.setName('miktar').setDescription('Silinecek set').setMinValue(1).setMaxValue(100000).setRequired(true)),
  new SlashCommandBuilder()
    .setName('kivrik-ekle').setDescription('Güncel kıvrık toplamına ekleme yapar.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addIntegerOption(o => o.setName('miktar').setDescription('Eklenecek kıvrık').setMinValue(1).setMaxValue(1000000).setRequired(true)),
  new SlashCommandBuilder()
    .setName('kivrik-sil').setDescription('Güncel kıvrık toplamını azaltır.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addIntegerOption(o => o.setName('miktar').setDescription('Silinecek kıvrık').setMinValue(1).setMaxValue(1000000).setRequired(true)),
  new SlashCommandBuilder()
    .setName('sonuc').setDescription('Genel sıralamayı veya kullanıcı sonucunu gösterir.')
    .addStringOption(o => o.setName('tur').setDescription('Boss türü').setRequired(true)
      .addChoices({ name: '🛡️ General', value: 'general' }, { name: '🕷️ F9', value: 'f9' }))
    .addUserOption(o => o.setName('uye').setDescription('Boş bırakılırsa genel sonuç gösterilir').setRequired(false)),
  new SlashCommandBuilder()
    .setName('log-sil').setDescription('Yanlış alınan logu geri alır.')
    .addIntegerOption(o => o.setName('id').setDescription('Silinecek log numarası').setMinValue(1).setRequired(true)),
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
    ALTER TABLE spartan_logs ADD COLUMN IF NOT EXISTS curl_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE spartan_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE spartan_logs ADD COLUMN IF NOT EXISTS deleted_by TEXT;
    CREATE TABLE IF NOT EXISTS spartan_curls (
      guild_id TEXT NOT NULL,
      boss_type TEXT NOT NULL,
      curl_count INTEGER NOT NULL DEFAULT 0 CHECK (curl_count >= 0),
      PRIMARY KEY (guild_id, boss_type)
    );
    CREATE TABLE IF NOT EXISTS spartan_manual_actions (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      boss_type TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_user_id TEXT,
      amount INTEGER NOT NULL,
      moderator_id TEXT NOT NULL,
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
  const curlAmount = interaction.options.getInteger('kivrik') || 0;
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
    const currentCounts = new Map();
    for (const member of members) {
      const updated = await db.query(`
        INSERT INTO spartan_user_sets(guild_id,user_id,boss_type,set_count)
        VALUES($1,$2,$3,1)
        ON CONFLICT(guild_id,user_id,boss_type)
        DO UPDATE SET set_count=spartan_user_sets.set_count + 1
        RETURNING set_count
      `, [CONFIG.guildId, member.id, type]);
      currentCounts.set(member.id, Number(updated.rows[0].set_count));
    }
    const saved = await db.query(`
      INSERT INTO spartan_logs(guild_id,boss_type,set_amount,member_ids,moderator_id,note,curl_amount)
      VALUES($1,$2,1,$3,$4,$5,$6) RETURNING id
    `, [CONFIG.guildId, type, members.map(m => m.id), interaction.user.id, note, curlAmount]);
    const curl = await db.query(`
      INSERT INTO spartan_curls(guild_id,boss_type,curl_count) VALUES($1,$2,$3)
      ON CONFLICT(guild_id,boss_type)
      DO UPDATE SET curl_count=spartan_curls.curl_count + EXCLUDED.curl_count
      RETURNING curl_count
    `, [CONFIG.guildId, type, curlAmount]);
    await db.query('COMMIT');
    const list = members
      .sort((a, b) => currentCounts.get(b.id) - currentCounts.get(a.id))
      .map((member, i) => `${i + 1}. ${member} — **Güncel set: ${currentCounts.get(member.id)}**`)
      .join('\n');
    const header = `**Her kullanıcıya eklenen:** +1 set\n**Katılımcı:** ${members.length}\n**Bu logda alınan kıvrık:** ${curlAmount}\n**Güncel toplam kıvrık:** ${Number(curl.rows[0].curl_count)}\n**Yetkili:** ${interaction.user}\n**Log ID:** #${saved.rows[0].id}${note ? `\n**Not:** ${note}` : ''}\n\n`;
    const chunks = splitText(header + list, 3900);
    for (let i = 0; i < chunks.length; i++) {
      await logChannel.send({ embeds: [embed(`${cfg.emoji} ${cfg.label} LOG${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`, chunks[i], cfg.color)] });
    }
    return interaction.editReply(`✅ ${members.length} üyeye +1 ${cfg.label} seti eklendi. Güncel kıvrık: ${Number(curl.rows[0].curl_count)} • Log #${saved.rows[0].id}`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('❌ /log:', error);
    return interaction.editReply('❌ Log kaydedilemedi. Railway loglarını kontrol et.');
  } finally {
    db.release();
  }
}

function splitText(text, maxLength) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + line + '\n').length > maxLength && current) { chunks.push(current.trim()); current = ''; }
    current += line + '\n';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function sendAudit(cfg, title, description) {
  const channel = client.guilds.cache.get(CONFIG.guildId)?.channels.cache.get(cfg.logChannelId)
    || await client.channels.fetch(cfg.logChannelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed(title, description, cfg.color)] });
}

async function handleSetChange(interaction, direction) {
  if (!isLogAuthorized(interaction)) return interaction.reply({ content: '❌ Bu komut yalnızca log yetkilisi tarafından kullanılabilir.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const type = interaction.options.getString('tur');
  const user = interaction.options.getUser('uye');
  const requested = interaction.options.getInteger('miktar');
  const cfg = CONFIG.types[type];
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const beforeResult = await db.query('SELECT set_count FROM spartan_user_sets WHERE guild_id=$1 AND user_id=$2 AND boss_type=$3 FOR UPDATE', [CONFIG.guildId, user.id, type]);
    const before = Number(beforeResult.rows[0]?.set_count || 0);
    const actual = direction > 0 ? requested : Math.min(requested, before);
    const after = before + direction * actual;
    await db.query(`INSERT INTO spartan_user_sets(guild_id,user_id,boss_type,set_count) VALUES($1,$2,$3,$4)
      ON CONFLICT(guild_id,user_id,boss_type) DO UPDATE SET set_count=EXCLUDED.set_count`, [CONFIG.guildId, user.id, type, after]);
    await db.query(`INSERT INTO spartan_manual_actions(guild_id,boss_type,action_type,target_user_id,amount,moderator_id) VALUES($1,$2,$3,$4,$5,$6)`,
      [CONFIG.guildId, type, direction > 0 ? 'set_add' : 'set_remove', user.id, actual, interaction.user.id]);
    await db.query('COMMIT');
    const description = `**Kullanıcı:** ${user}\n**Değişiklik:** ${direction > 0 ? '+' : '-'}${actual} set\n**Önceki:** ${before}\n**Güncel:** ${after}\n**Yetkili:** ${interaction.user}`;
    await sendAudit(cfg, `${direction > 0 ? '➕' : '➖'} ${cfg.label} MANUEL SET ${direction > 0 ? 'EKLENDİ' : 'SİLİNDİ'}`, description);
    return interaction.editReply(`✅ ${user} • ${cfg.label} güncel set: ${after}`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {}); console.error('❌ Set değişikliği:', error);
    return interaction.editReply('❌ Set değiştirilemedi.');
  } finally { db.release(); }
}

async function handleCurlChange(interaction, direction) {
  if (!isLogAuthorized(interaction)) return interaction.reply({ content: '❌ Bu komut yalnızca log yetkilisi tarafından kullanılabilir.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const type = interaction.options.getString('tur');
  const requested = interaction.options.getInteger('miktar');
  const cfg = CONFIG.types[type];
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO spartan_curls(guild_id,boss_type,curl_count) VALUES($1,$2,0) ON CONFLICT DO NOTHING', [CONFIG.guildId, type]);
    const beforeResult = await db.query('SELECT curl_count FROM spartan_curls WHERE guild_id=$1 AND boss_type=$2 FOR UPDATE', [CONFIG.guildId, type]);
    const before = Number(beforeResult.rows[0].curl_count);
    const actual = direction > 0 ? requested : Math.min(requested, before);
    const after = before + direction * actual;
    await db.query('UPDATE spartan_curls SET curl_count=$3 WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, type, after]);
    await db.query(`INSERT INTO spartan_manual_actions(guild_id,boss_type,action_type,amount,moderator_id) VALUES($1,$2,$3,$4,$5)`,
      [CONFIG.guildId, type, direction > 0 ? 'curl_add' : 'curl_remove', actual, interaction.user.id]);
    await db.query('COMMIT');
    const description = `**Değişiklik:** ${direction > 0 ? '+' : '-'}${actual} kıvrık\n**Önceki:** ${before}\n**Güncel:** ${after}\n**Yetkili:** ${interaction.user}`;
    await sendAudit(cfg, `${direction > 0 ? '➕' : '➖'} ${cfg.label} KIVRIK ${direction > 0 ? 'EKLENDİ' : 'SİLİNDİ'}`, description);
    return interaction.editReply(`✅ ${cfg.label} güncel kıvrık: ${after}`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {}); console.error('❌ Kıvrık değişikliği:', error);
    return interaction.editReply('❌ Kıvrık değiştirilemedi.');
  } finally { db.release(); }
}

async function handleResult(interaction) {
  const type = interaction.options.getString('tur');
  const user = interaction.options.getUser('uye');
  const cfg = CONFIG.types[type];
  const curlResult = await pool.query('SELECT curl_count FROM spartan_curls WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, type]);
  const curls = Number(curlResult.rows[0]?.curl_count || 0);
  if (user) {
    const result = await pool.query('SELECT set_count FROM spartan_user_sets WHERE guild_id=$1 AND user_id=$2 AND boss_type=$3', [CONFIG.guildId, user.id, type]);
    return interaction.reply({ embeds: [embed(`${cfg.emoji} ${cfg.label} KULLANICI SONUCU`, `${user}\n\n**Güncel set:** ${Number(result.rows[0]?.set_count || 0)}`, cfg.color)] });
  }
  const result = await pool.query('SELECT user_id,set_count FROM spartan_user_sets WHERE guild_id=$1 AND boss_type=$2 AND set_count > 0 ORDER BY set_count DESC,user_id ASC', [CONFIG.guildId, type]);
  const logCount = await pool.query('SELECT COUNT(*)::int AS count FROM spartan_logs WHERE guild_id=$1 AND boss_type=$2 AND deleted_at IS NULL', [CONFIG.guildId, type]);
  const list = result.rows.map((row, i) => `${i + 1}. <@${row.user_id}> — **${row.set_count} set**`).join('\n') || 'Henüz set kaydı yok.';
  const chunks = splitText(`**Toplam aktif log:** ${logCount.rows[0].count}\n**Güncel toplam kıvrık:** ${curls}\n\n${list}`, 3900);
  return interaction.reply({ embeds: chunks.map((chunk, i) => embed(`📊 ${cfg.label} GENEL SONUÇ${chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : ''}`, chunk, cfg.color)) });
}

async function handleLogDelete(interaction) {
  if (!isLogAuthorized(interaction)) return interaction.reply({ content: '❌ Bu komut yalnızca log yetkilisi tarafından kullanılabilir.', ephemeral: true });
  await interaction.deferReply({ ephemeral: true });
  const id = interaction.options.getInteger('id');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const found = await db.query('SELECT * FROM spartan_logs WHERE id=$1 AND guild_id=$2 FOR UPDATE', [id, CONFIG.guildId]);
    const row = found.rows[0];
    if (!row) { await db.query('ROLLBACK'); return interaction.editReply('❌ Bu log bulunamadı.'); }
    if (row.deleted_at) { await db.query('ROLLBACK'); return interaction.editReply('❌ Bu log daha önce silinmiş.'); }
    for (const userId of row.member_ids) {
      await db.query('UPDATE spartan_user_sets SET set_count=GREATEST(0,set_count-$4) WHERE guild_id=$1 AND user_id=$2 AND boss_type=$3', [CONFIG.guildId, userId, row.boss_type, row.set_amount]);
    }
    await db.query('UPDATE spartan_curls SET curl_count=GREATEST(0,curl_count-$3) WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, row.boss_type, row.curl_amount]);
    await db.query('UPDATE spartan_logs SET deleted_at=NOW(),deleted_by=$2 WHERE id=$1', [id, interaction.user.id]);
    await db.query('COMMIT');
    const cfg = CONFIG.types[row.boss_type];
    const curlNow = await pool.query('SELECT curl_count FROM spartan_curls WHERE guild_id=$1 AND boss_type=$2', [CONFIG.guildId, row.boss_type]);
    await sendAudit(cfg, `🗑️ ${cfg.label} LOG GERİ ALINDI`, `**Log ID:** #${id}\n**Seti geri alınan kişi:** ${row.member_ids.length}\n**Geri alınan kıvrık:** ${row.curl_amount}\n**Güncel kıvrık:** ${Number(curlNow.rows[0]?.curl_count || 0)}\n**Yetkili:** ${interaction.user}`);
    return interaction.editReply(`✅ #${id} numaralı ${cfg.label} logu geri alındı.`);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {}); console.error('❌ Log silme:', error);
    return interaction.editReply('❌ Log geri alınamadı.');
  } finally { db.release(); }
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
    if (interaction.commandName === 'set-ekle') return handleSetChange(interaction, 1);
    if (interaction.commandName === 'set-sil') return handleSetChange(interaction, -1);
    if (interaction.commandName === 'kivrik-ekle') return handleCurlChange(interaction, 1);
    if (interaction.commandName === 'kivrik-sil') return handleCurlChange(interaction, -1);
    if (interaction.commandName === 'sonuc') return handleResult(interaction);
    if (interaction.commandName === 'log-sil') return handleLogDelete(interaction);
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
