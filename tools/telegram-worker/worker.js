// Sigma Store - Telegram order relay (Cloudflare Worker, free plan).
//
// The storefront is static (GitHub Pages) and cannot hold the bot token, so it
// posts the order here and this Worker forwards it to Telegram.
//
// Secrets (Worker -> Settings -> Variables and Secrets, type "Secret"):
//   BOT_TOKEN  the bot token from @BotFather
//   CHAT_ID    your chat id (one id, or several separated by commas)
//
// Nothing secret is stored in this file.

const ALLOWED_ORIGINS = [
  'https://sigmastore9.github.io'
];

const MAX_BODY_BYTES = 20000;
const MAX_ITEMS = 40;

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, n);

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? cors(origin) : {}) }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const originOk = ALLOWED_ORIGINS.includes(origin);

    if (request.method === 'OPTIONS') {
      return originOk ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
    }
    if (request.method !== 'POST') return reply(405, { ok: false }, originOk ? origin : '');
    if (!originOk) return reply(403, { ok: false, error: 'origin' }, '');
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply(500, { ok: false, error: 'not-configured' }, origin);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: 'too-large' }, origin);

    let o;
    try { o = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'json' }, origin); }

    const name = clip(o.customer_name, 80);
    const phone = clip(o.customer_phone, 20);
    if (!name || !/^\d{9,15}$/.test(phone)) return reply(400, { ok: false, error: 'invalid' }, origin);

    const items = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS);
    if (items.length === 0) return reply(400, { ok: false, error: 'no-items' }, origin);

    let total = 0;
    const lines = items.map((it, i) => {
      const qty = Math.max(1, Math.min(999, parseInt(it.qty, 10) || 1));
      const price = Math.max(0, Number(it.price) || 0);
      total += qty * price;
      const model = it.model ? `[${clip(it.model, 40)}] ` : '';
      return `\n${i + 1}. ${model}${clip(it.name, 100)}\n   ▫️ الكمية: ${qty} | ${Math.round(qty * price).toLocaleString('en-US')} د.ع`;
    }).join('');

    let intl = phone.replace(/\D/g, '');
    if (intl.startsWith('0')) intl = '964' + intl.slice(1);

    const notes = clip(o.notes, 300);
    const text = `🔔 طلب شراء جديد من متجر Sigma Store!
━━━━━━━━━━━━━━━━━━
🔢 رقم الطلب: #${clip(o.orderNumber, 20)}
👤 الزبون: ${name}
📞 الهاتف: ${phone}
📍 الموقع: ذي قار - ${clip(o.district, 40)} (${clip(o.address, 200)})
${notes ? `📝 ملاحظات: ${notes}\n` : ''}━━━━━━━━━━━━━━━━━━
🛒 المنتجات:${lines}
━━━━━━━━━━━━━━━━━━
💰 المجموع: ${Math.round(total).toLocaleString('en-US')} د.ع
⏰ ${new Date().toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
━━━━━━━━━━━━━━━━━━
💬 واتساب الزبون: https://wa.me/${intl}
(الطلب جاء من الموقع العام؛ الأسعار كما ظهرت للزبون)`;

    const ids = String(env.CHAT_ID).split(',').map(s => s.trim()).filter(Boolean);
    const results = await Promise.all(ids.map(id =>
      fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: id, text, disable_web_page_preview: true })
      }).then(r => r.ok).catch(() => false)
    ));

    const sent = results.some(Boolean);
    return reply(sent ? 200 : 502, { ok: sent }, origin);
  }
};
