// PilotOS RAG Backend
require('dotenv').config();
const express   = require('express');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI    = require('openai');
const { createClient } = require('@supabase/supabase-js');
const Stripe    = require('stripe');

const app = express();
app.use(express.json({ limit: '20mb' }));

// Stripe webhook necesita raw body — excluirlo del JSON parser global
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') return next();
  next();
});

// CORS — allow everything
app.use(function(req, res, next) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-api-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,PUT,DELETE');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai    = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const supabase  = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;

const JWT_SECRET  = process.env.JWT_SECRET;
const PORT        = process.env.PORT || 4000;
const MAX_REQS    = parseInt(process.env.MAX_REQUESTS_PER_DAY || '200');
const RESEND_KEY  = process.env.RESEND_API_KEY;
const FROM_EMAIL  = process.env.FROM_EMAIL || 'PilotOS <noreply@pilotos.aero>';

const stripe = process.env.STRIPE_SECRET_KEY
  ? Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Map Stripe Price ID → plan name
const STRIPE_PRICE_TO_PLAN = {
  'price_1TYkkx2KvMRpp4a22IP5SE4Y': 'pro',
  'price_1TYkln2KvMRpp4a2ScxBeQGJ': 'unlimited',
};

const APP_URL = process.env.APP_URL || 'https://pilotos.aero';

if (!process.env.ANTHROPIC_API_KEY || !JWT_SECRET) {
  console.error('Faltan variables de entorno');
  process.exit(1);
}

// Email al usuario cuando su cuenta es aprobada
async function notifyUserApproved(user) {
  if (!RESEND_KEY) { console.warn('[Webhook] RESEND_API_KEY no configurado'); return; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: user.email,
        subject: 'Tu cuenta PilotOS ya esta activa',
        html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0F172A;border-radius:16px">'
          + '<h2 style="color:#E2F4FF;margin:0 0 8px">Bienvenido' + (user.name ? ', ' + user.name : '') + '!</h2>'
          + '<p style="color:rgba(148,198,255,.8);font-size:14px;margin:0 0 24px">Tu cuenta de PilotOS ha sido aprobada. Ya puedes acceder con tu email y contrasena.</p>'
          + '<a href="https://pilotos.aero" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#6D28D9,#0891B2);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Acceder a PilotOS</a>'
          + '<p style="color:rgba(100,116,139,.5);font-size:11px;margin-top:24px">PilotOS - A319 / A320 / A321 - Vueling</p>'
          + '</div>'
      })
    });
    const body = await r.json();
    console.log('[Webhook] Email enviado a ' + user.email + ' status=' + r.status, JSON.stringify(body));
  } catch(e) {
    console.warn('[Webhook] Email fallido:', e.message);
  }
}

// Webhook: Supabase llama aqui cuando approved cambia a true
app.post('/api/webhook/user-approved', async (req, res) => {
  console.log('[Webhook] Recibido:', JSON.stringify(req.body));
  const secret = req.headers['x-webhook-secret'];
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    console.warn('[Webhook] Secret invalido:', secret);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const record = req.body && req.body.record;
  if (!record || !record.email) {
    console.warn('[Webhook] Payload invalido:', JSON.stringify(req.body));
    return res.status(400).json({ error: 'Invalid payload' });
  }
  if (!record.approved) {
    return res.json({ ok: true, skipped: 'not approved' });
  }
  await notifyUserApproved(record);
  res.json({ ok: true });
});

// ── PLAN SYSTEM ─────────────────────────────────────────────────
const PLAN_LIMITS = {
  free: {
    logbook_entries:        25,
    cafi_per_month:         20,
    ocr_per_month:          0,
    roster_per_month:       0,
    ai_analysis_per_month:  0,
    export:                 false,
    cloud_backup:           false,
    advanced_stats:         false,
  },
  pro: {
    logbook_entries:        Infinity,
    cafi_per_month:         200,
    ocr_per_month:          60,
    roster_per_month:       30,
    ai_analysis_per_month:  0,
    export:                 true,
    cloud_backup:           true,
    advanced_stats:         true,
  },
  unlimited: {
    logbook_entries:        Infinity,
    cafi_per_month:         Infinity,
    ocr_per_month:          Infinity,
    roster_per_month:       Infinity,
    ai_analysis_per_month:  10,
    export:                 true,
    cloud_backup:           true,
    advanced_stats:         true,
  },
};

function getMonth() {
  return new Date().toISOString().slice(0, 7); // '2026-05'
}

async function getUserPlan(userId) {
  if (!supabase) return 'free';
  try {
    const { data } = await supabase
      .from('pilot_users')
      .select('plan')
      .eq('id', userId)
      .single();
    return data?.plan || 'free';
  } catch(e) {
    console.warn('[Plan] getUserPlan error:', e.message);
    return 'free';
  }
}

async function getUsage(userId, month) {
  if (!supabase) return { cafi_calls: 0, ocr_calls: 0, roster_calls: 0, ai_analysis_calls: 0 };
  try {
    const { data } = await supabase
      .from('usage_monthly')
      .select('cafi_calls, ocr_calls, roster_calls, ai_analysis_calls')
      .eq('user_id', userId)
      .eq('month', month)
      .maybeSingle();
    return data || { cafi_calls: 0, ocr_calls: 0, roster_calls: 0, ai_analysis_calls: 0 };
  } catch(e) {
    console.warn('[Plan] getUsage error:', e.message);
    return { cafi_calls: 0, ocr_calls: 0, roster_calls: 0, ai_analysis_calls: 0 };
  }
}

async function incrementUsage(userId, month, field) {
  if (!supabase) return;
  try {
    // Ensure row exists with zero defaults before incrementing
    await supabase
      .from('usage_monthly')
      .upsert(
        { user_id: userId, month, cafi_calls: 0, ocr_calls: 0, roster_calls: 0, ai_analysis_calls: 0 },
        { onConflict: 'user_id,month', ignoreDuplicates: true }
      );
    const { data: row } = await supabase
      .from('usage_monthly')
      .select(field)
      .eq('user_id', userId)
      .eq('month', month)
      .single();
    const current = row?.[field] ?? 0;
    await supabase
      .from('usage_monthly')
      .update({ [field]: current + 1 })
      .eq('user_id', userId)
      .eq('month', month);
  } catch(e) {
    console.warn('[Plan] incrementUsage error:', e.message);
  }
}

// checkPlanLimit — returns { allowed, plan, used, limit, error }
async function checkPlanLimit(userId, feature) {
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  const limitKey = `${feature}_per_month`;
  const usageKey = `${feature}_calls`;
  const limit = limits[limitKey];

  if (limit === 0) {
    return { allowed: false, plan, used: 0, limit: 0,
      error: `El plan Free no incluye ${feature}. Actualiza a Pro.` };
  }
  if (limit === Infinity) {
    await incrementUsage(userId, getMonth(), usageKey);
    return { allowed: true, plan, used: 0, limit: Infinity };
  }
  const usage = await getUsage(userId, getMonth());
  const used = usage[usageKey] ?? 0;
  if (used >= limit) {
    return { allowed: false, plan, used, limit,
      error: `Has alcanzado el límite mensual de ${limit} usos de ${feature} (plan ${plan}).` };
  }
  await incrementUsage(userId, getMonth(), usageKey);
  return { allowed: true, plan, used: used + 1, limit };
}

// Legacy daily rate-limit fallback (solo para llamadas sin plan context)
const usageMap = new Map();
function checkRate(userId) {
  const now = Date.now();
  const u = usageMap.get(userId) || { count: 0, resetAt: now + 86400000 };
  if (now > u.resetAt) { u.count = 0; u.resetAt = now + 86400000; }
  if (u.count >= MAX_REQS) return false;
  u.count++;
  usageMap.set(userId, u);
  return true;
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token invalido' }); }
}

app.post('/auth/register', async (req, res) => {
  const { email, password, name, airline } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (airline && airline !== 'Vueling') return res.status(403).json({ error: 'PilotOS solo está disponible para pilotos de Vueling de momento. Próximamente más aerolíneas.' });
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    const { data: existing } = await supabase.from('pilot_users').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(409).json({ error: 'Email ya registrado' });
    const hash = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase
      .from('pilot_users')
      .insert({ email, name: name || '', airline: airline || 'Vueling', password_hash: hash, role: 'pilot' })
      .select('id, email, name, airline, role')
      .single();
    if (error) throw error;
    res.status(201).json({
      pending: true,
      message: 'Cuenta creada. Recibirás un email cuando esté activa.'
    });
  } catch(e) {
    console.error('[Register]', e.message);
    res.status(500).json({ error: 'Error al registrar: ' + e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    const { data: user, error } = await supabase.from('pilot_users').select('*').eq('email', email).single();
    if (error || !user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (!user.approved) return res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación. Contacta con el administrador.' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    const plan = user.plan || 'free';
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, plan } });
  } catch(e) {
    console.error('[Login]', e.message);
    res.status(500).json({ error: 'Error al iniciar sesión: ' + e.message });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  const { data: u, error } = await supabase.from('pilot_users').select('id, email, name, airline, role, plan').eq('id', req.user.id).single();
  if (error || !u) return res.status(404).json({ error: 'No encontrado' });
  const month = getMonth();
  const usage = await getUsage(req.user.id, month);
  const plan = u.plan || 'free';
  res.json({ id: u.id, email: u.email, name: u.name, airline: u.airline, plan, limits: PLAN_LIMITS[plan], usage, month });
});

// ── PLAN ENDPOINTS ──────────────────────────────────────────────

// GET /api/user/plan — plan del usuario autenticado + uso del mes
app.get('/api/user/plan', requireAuth, async (req, res) => {
  try {
    const plan = await getUserPlan(req.user.id);
    const month = getMonth();
    const usage = await getUsage(req.user.id, month);
    res.json({ plan, limits: PLAN_LIMITS[plan], usage, month });
  } catch(e) {
    console.error('[Plan GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/user/plan — solo admin puede cambiar el plan de un usuario
app.post('/api/user/plan', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Solo administradores pueden cambiar planes' });
  const { userId, plan } = req.body;
  if (!userId || !plan) return res.status(400).json({ error: 'Faltan userId y plan' });
  if (!PLAN_LIMITS[plan]) return res.status(400).json({ error: `Plan inválido. Opciones: ${Object.keys(PLAN_LIMITS).join(', ')}` });
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    const { error } = await supabase
      .from('pilot_users')
      .update({ plan })
      .eq('id', userId);
    if (error) throw error;
    console.log(`[Plan] userId=${userId} → plan=${plan} (by admin ${req.user.id})`);
    res.json({ ok: true, userId, plan });
  } catch(e) {
    console.error('[Plan POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/usage — uso del mes actual del usuario autenticado
app.get('/api/usage', requireAuth, async (req, res) => {
  try {
    const plan = await getUserPlan(req.user.id);
    const month = getMonth();
    const usage = await getUsage(req.user.id, month);
    res.json({ plan, limits: PLAN_LIMITS[plan], usage, month });
  } catch(e) {
    console.error('[Usage GET]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── LOGBOOK SYNC ──
//
// Supabase table — full schema (run once in SQL editor):
// ------------------------------------------------------------
// CREATE TABLE IF NOT EXISTS logbook_entries (
//   id               TEXT PRIMARY KEY,
//   user_id          UUID NOT NULL REFERENCES pilot_users(id) ON DELETE CASCADE,
//   date             TEXT,
//   dep              TEXT,
//   arr              TEXT,
//   role             TEXT,
//   block            TEXT,
//   saved_at         TEXT,
//   std              TEXT,
//   sta              TEXT,
//   flight_number    TEXT,
//   aobt             TEXT,
//   aibt             TEXT,
//   is_nocturnal     BOOLEAN DEFAULT FALSE,
//   diet_type        TEXT,
//   block_diff       TEXT,
//   roster_entry_id  TEXT,
//   logbook_status   TEXT DEFAULT 'empty',
//   data             JSONB NOT NULL DEFAULT '{}'
// );
// CREATE INDEX IF NOT EXISTS logbook_entries_user_idx ON logbook_entries(user_id);
// CREATE INDEX IF NOT EXISTS logbook_entries_date_idx  ON logbook_entries(date DESC);
//
// If table already exists with only basic columns, run this migration:
// ALTER TABLE logbook_entries
//   ADD COLUMN IF NOT EXISTS std             TEXT,
//   ADD COLUMN IF NOT EXISTS sta             TEXT,
//   ADD COLUMN IF NOT EXISTS flight_number   TEXT,
//   ADD COLUMN IF NOT EXISTS aobt            TEXT,
//   ADD COLUMN IF NOT EXISTS aibt            TEXT,
//   ADD COLUMN IF NOT EXISTS is_nocturnal    BOOLEAN DEFAULT FALSE,
//   ADD COLUMN IF NOT EXISTS diet_type       TEXT,
//   ADD COLUMN IF NOT EXISTS block_diff      TEXT,
//   ADD COLUMN IF NOT EXISTS roster_entry_id TEXT,
//   ADD COLUMN IF NOT EXISTS logbook_status  TEXT DEFAULT 'empty';
// ------------------------------------------------------------

// POST /api/logbook/sync  — upsert entries from device into Supabase
app.post('/api/logbook/sync', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  const { entries } = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries debe ser un array' });
  if (!entries.length) return res.json({ ok: true, synced: 0 });
  try {
    const userId = req.user.id;

    // ── Plan limit: Free max 25 logbook entries ──
    const plan = await getUserPlan(userId);
    const entryLimit = PLAN_LIMITS[plan].logbook_entries;
    if (entryLimit !== Infinity) {
      // Count existing entries in DB
      const { count, error: countErr } = await supabase
        .from('logbook_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (!countErr) {
        const existing = count || 0;
        // How many of these entries are NEW (not yet in DB)
        const existingIds = new Set();
        const { data: dbIds } = await supabase
          .from('logbook_entries')
          .select('id')
          .eq('user_id', userId);
        (dbIds || []).forEach(r => existingIds.add(r.id));
        const newEntries = entries.filter(e => !existingIds.has(e.id));
        if (existing + newEntries.length > entryLimit) {
          return res.status(403).json({
            error: 'plan_limit',
            message: `El plan Free está limitado a ${entryLimit} entradas en el logbook.`,
            limit: entryLimit,
            current: existing,
            plan,
          });
        }
      }
    }

    const ES_AIRPORTS = new Set([
      'BCN','MAD','VLC','SVQ','AGP','PMI','IBZ','MAH',
      'ACE','TFN','TFS','LPA','FUE','SPC','VIT','BIO',
      'SDR','OVD','SCQ','VGO','LCG','LEI','MJV','RJL',
      'HSK','BJZ','CQM','REU','GRO','GRX','XRY','MLC',
    ]);

    const rows = entries.map(e => {
      // ── is_nocturnal: aibt entre 22:00 y 06:00 (código 2111) ──
      let isNocturnal = false;
      if (e.aibt) {
        const [h, m] = e.aibt.split(':').map(Number);
        const mins = h * 60 + m;
        isNocturnal = mins >= 22 * 60 || mins < 6 * 60;
      }

      // ── diet_type: base Vueling = España ──
      let dietType = null;
      if (e.arr) {
        const isInt  = !ES_AIRPORTS.has(e.arr.toUpperCase());
        const hasPernoc = !!e.pernoc;
        if (isInt && hasPernoc)  dietType = 'int_pernoc';
        else if (isInt)          dietType = 'int';
        else if (hasPernoc)      dietType = 'nac_pernoc';
        else                     dietType = 'nac';
      }

      // ── block_diff: real vs STA programada ──
      let blockDiff = null;
      if (e.block && e.sta) {
        const toMins = t => { const [h, m] = t.replace(/^[ASE]/,'').split(':').map(Number); return h * 60 + m; };
        const diff = toMins(e.block) - toMins(e.sta);
        const sign = diff >= 0 ? '+' : '-';
        const abs  = Math.abs(diff);
        blockDiff  = `${sign}${String(Math.floor(abs / 60)).padStart(2,'0')}:${String(abs % 60).padStart(2,'0')}`;
      }

      // ── logbook_status ──
      let logbookStatus = 'empty';
      if (e.aobt && e.aibt && e.block)                          logbookStatus = 'complete';
      else if (e.aobt || e.aibt || e.block || e.dep || e.arr)   logbookStatus = 'partial';

      return {
        id:              e.id,
        user_id:         userId,
        date:            e.date              || null,
        dep:             e.dep               || null,
        arr:             e.arr               || null,
        role:            e.role              || null,
        block:           e.block             || null,
        saved_at:        e.savedAt           || new Date().toISOString(),
        // Tiempos programados (del roster)
        std:             e.std               || null,
        sta:             e.sta               || null,
        flight_number:   e.fl || e.flightNum || null,
        // Tiempos reales (introduce el piloto)
        aobt:            e.aobt              || null,
        aibt:            e.aibt              || null,
        // Calculados automáticamente
        is_nocturnal:    isNocturnal,
        diet_type:       dietType,
        block_diff:      blockDiff,
        roster_entry_id: e.rosterEntryId     || null,
        logbook_status:  logbookStatus,
        data:            e,
      };
    });
    const { error } = await supabase
      .from('logbook_entries')
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('[Logbook sync] Supabase upsert FAILED:', error.message, '| hint:', error.hint || 'none');
      console.error('[Logbook sync] If error mentions unknown column, run the ALTER TABLE migration in Supabase SQL Editor (see schema comment above).');
      throw error;
    }
    console.log(`[Logbook sync] user=${userId} plan=${plan} synced=${rows.length}`);
    res.json({ ok: true, synced: rows.length, plan });
  } catch (e) {
    console.error('[Logbook sync] ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/logbook  — return all entries for the authenticated user
app.get('/api/logbook', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    const { data, error } = await supabase
      .from('logbook_entries')
      .select('data, saved_at')
      .eq('user_id', req.user.id)
      .order('date', { ascending: false });
    if (error) throw error;
    // Return the full entry objects stored in the `data` column
    const entries = (data || []).map(r => r.data).filter(Boolean);
    res.json({ entries, count: entries.length });
  } catch (e) {
    console.error('[Logbook get]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/logbook/:id  — delete a single entry
app.delete('/api/logbook/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    const { error } = await supabase
      .from('logbook_entries')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[Logbook delete]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages, logbook_context, company } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'Mensajes invalidos' });

  // ── Plan-aware CAFI rate limit ──
  const cafiCheck = await checkPlanLimit(req.user.id, 'cafi');
  if (!cafiCheck.allowed) {
    return res.status(429).json({
      error: 'plan_limit',
      message: cafiCheck.error,
      plan: cafiCheck.plan,
      used: cafiCheck.used,
      limit: cafiCheck.limit,
    });
  }

  const userQuery = messages.filter(m => m.role === 'user').pop()?.content || '';

  let ragContext = '';
  let ragChunks = 0;
  try {
    if (openai && supabase) {
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: userQuery.slice(0, 800),
    });
    const { data, error } = await supabase.rpc('search_fcom', {
      query_embedding: embRes.data[0].embedding,
      match_count: 6,
      source_filter: null,
    });
    if (!error && data?.length) {
      ragChunks = data.length;
      ragContext = '\n---\n## TEXTO DEL FCOM/FCTM VUELING (DEC 25):\n\n';
      for (const chunk of data) {
        ragContext += `### ${chunk.source} — ${chunk.section} (p.${chunk.page})\n${chunk.text}\n\n`;
      }
      ragContext += '---\n';
    }
    }
  } catch(e) {
    console.log('RAG error:', e.message);
  }

  const companyLine = company ? `\nCompania: ${company.name} | Flota: ${company.aircraft}\n` : '';
  const logbookLine = logbook_context ? `\n---\n## LOGBOOK:\n${logbook_context}\n---\n` : '';

  const system = `Eres CAFI, instructor IA de PilotOS. Experto en FCOM/FCTM A320 Vueling (DEC 25), EASA y sistemas del A320.
${companyLine}
ESTILO DE RESPUESTA:
- Preguntas directas (valores, limites, definiciones): responde en 2-4 lineas maximo. Sin headers. Solo la respuesta + referencia.
- Procedimientos: respuesta con pasos, concisa.
- Explicaciones: respuesta completa con estructura.
- Si el contexto FCOM tiene la respuesta: citala con referencia exacta (capitulo y pagina).
- Si no esta en el contexto: usa tu conocimiento del FCOM A320.
- No uses emojis de advertencia en preguntas rutinarias.
- Responde siempre en espanol.
${ragContext}${logbookLine}`;

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages,
    });
    res.json({ content: response.content, usage: response.usage, rag_chunks: ragChunks, plan: cafiCheck.plan, cafi_used: cafiCheck.used, cafi_limit: cafiCheck.limit });
  } catch(e) {
    console.log('Claude error:', e.message);
    res.status(500).json({ error: 'Error al contactar con la IA: ' + e.message });
  }
});

// ── IATA AIRPORT VALIDATOR ──
// Loads airport data from public API on startup
// Falls back to Vueling-known airports if API unavailable

const VUELING_KNOWN = new Set([
  'BCN','MAD','VLC','SVQ','AGP','PMI','IBZ','MAH','ACE','TFN','TFS','LPA','FUE','SPC',
  'VIT','BIO','SDR','OVD','SCQ','VGO','LCG','LEI','MJV','RJL','HSK','BJZ','CQM','REU','GRO','GRX',
  'ORY','CDG','NCE','LYS','MRS','TLS','BOD','NTE','LIL','SXB','BIQ','CFE','MPL','PGF',
  'FCO','MXP','LIN','NAP','VCE','GOA','FLR','PSA','CAG','PMO','CTA','BRI','BLQ',
  'LGW','LHR','LTN','STN','MAN','EDI','GLA','BRS','BHX',
  'FRA','MUC','DUS','BER','HAM','STR','CGN','NUE',
  'LIS','OPO','FAO','AMS','BRU','GVA','ZRH','BSL','VIE','DUB',
  'ATH','HER','RHO','CFU','KGS','JTR','MJT','SKG','CHQ',
  'SPU','DBV','ZAG','TNG','CMN','RAK','AGA','FEZ',
  'ALG','ORN','TUN','MIR','DJE','HRG','SSH','CAI',
  'IST','AYT','ADB','TLV','AMM',
  'PRG','WAW','KRK','BUD','OTP','SOF','LJU','TGD','TIA','SKP',
  'HEL','ARN','OSL','CPH','KEF',
]);

let AIRPORT_SET = new Set(VUELING_KNOWN); // starts with known, grows when API loads

// Load all IATA codes from public dataset on startup
async function loadAirportCodes() {
  try {
    const res = await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const lines = text.split('\n').slice(1); // skip header
    let count = 0;
    lines.forEach(line => {
      const cols = line.split(',');
      const iata = cols[13] ? cols[13].replace(/"/g,'').trim() : '';
      if (iata && iata.length === 3 && iata !== '\\N' && /^[A-Z]{3}$/.test(iata)) {
        AIRPORT_SET.add(iata);
        count++;
      }
    });
    console.log(`[IATA] Loaded ${count} airport codes from OurAirports dataset`);
  } catch(e) {
    console.log('[IATA] Could not load airport dataset, using Vueling-known list:', e.message);
  }
}
loadAirportCodes();

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function validateIATA(code) {
  if (!code) return null;
  const asterisk = code.startsWith('*') ? '*' : '';
  code = code.replace(/^\*/, '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 3) return null;

  // Layer 1: Is it a known Vueling destination? Accept immediately
  if (VUELING_KNOWN.has(code)) return asterisk + code;

  // Layer 2: Not in Vueling network — find closest Vueling airport
  // (even if code exists globally, we prefer a Vueling destination)
  let best = code, bestDist = 99;
  for (const airport of VUELING_KNOWN) {
    const d = levenshtein(code, airport);
    if (d < bestDist) { bestDist = d; best = airport; }
  }

  // Only correct if distance is 1 (single character difference = likely OCR error)
  if (bestDist <= 1) {
    console.log(`[IATA] Corrected ${code} -> ${best} (distance ${bestDist}, not in Vueling network)`);
    return asterisk + best;
  }

  // Layer 3: Distance > 1 but code exists in global database → keep as-is (exotic but valid)
  if (AIRPORT_SET.has(code)) {
    console.log(`[IATA] Kept ${code} (not in Vueling network but valid globally)`);
    return asterisk + code;
  }

  // Layer 4: Not in Vueling, not global, distance > 1 → return original and log warning
  console.log(`[IATA] Warning: ${code} not found anywhere, keeping as-is`);
  return asterisk + code;
}


// ─────────────────────────────────────────────────────────────────
// DETERMINISTIC VUELING PDF ROSTER PARSER (pure JS, no Python)
// Uses pdf2json (pure CJS) to extract text with x/y coordinates.
// ─────────────────────────────────────────────────────────────────
const PDFParser = require('pdf2json');

// ── Token classifiers ──
const _TIME_P   = /^[ASE](\d{1,2}:\d{2})$/;
const _PLAIN_P  = /^\d{1,2}:\d{2}$/;
const _FLIGHT_P = /^\*?\d{4}$/;
const _IATA_P   = /^\*?[A-Z]{3}$/;
const _LM_P     = /^LM[A-Z0-9]{1,4}$/;
const _ACTYPE_P = /^\(3[0-9A-Z]+$|^NEO\)$|^PS\)$|^\(\d{3}[A-Z]?\)$/;
// ── Activity code sets (comprehensive Vueling roster codes) ──
const _SICK = new Set([
  'SICK','SICD','LSCK','ERSK','LSIC','DSIC','NJSK',  // sick/illness variants
  'UNFT','UNFD','FTG','NGND','PGND','CNAV',            // unfit/grounded
]);

const _NON_OPS = new Set([
  // Days off / vacation / rest
  'OFF','ROFF','VOFF','REST','XSOF','CDOF','VAC','RVAC','BOD','BODG',
  'SROF','NROF','XOF1','XOF2','XOF3','PVAC','DCOF','LOFF','DOFF',
  'NOFF','FOFF','AOFF','MEOF','PAOF','EOFF','VIOF','OFFA','DEOF',
  'NAOF','ARES','CLOF','LMOF','SODF','DS','DSD',
  // Franco / free days
  'F','F2','FR','FR2','EF','FZ','HFR','RF','SOFF',
  // Leaves / permits
  'PER','RPER','PERR','RPUR','RPPA','PPA','CPAR','CPAI',
  'PAI','PAD','PPAI','MAT','PAT','EMB','LAC','LAI','LAD',
  'ELAI','ELAD','ELAC','PRHI','PRH3','MUD','LPER','SPER',
  'NVAC','PNR','RSVD','UNIF','DCPF','NEST','PTD','AMO',
  'FALT','AHUE','DHUE','NQ','RSV',
  // Compensation / recovered days
  'LOF1','LOF2','LOF3','LOF4','LOF5','LOF6','RRES',
  // ERTE / special
  'PERT','CERT','NCRT','PCRT','FERT','SERT','VERT','NERT','PVRT',
  'CIGS','RSBY','HIGH','PTF','PTI','>OFF',
  // Vacaciones IT
  'VAI','PVAI','RVAI','VICC',
]);

const _STANDBY = new Set([
  // Standard standby
  'SBY','STBY','HSBY','XSBY','ZSBY','TSBY','RSBY','ESBY','OSBY',
  'FSBY','RSF','LSBY','ASBY','NSBY','OASF',
  // Numbered blocks
  '1SBY','2SBY','3SBY','4SBY','5SBY','8SBY',
  // Night standby
  'NBY1','NBY2','NBY3','NBY4','NBY5',
  // CP type standby
  'CSBY','SBYS','SBYM','SBYK','SBYA','SB21','D5BY',
  // Hotel standby
  'CHBY','HS21','2HBY','3HBY','2CHY','3CHY',
  // JC flexible
  'JTSB','J2HB','J3HB','JHSB','JRSB','J2SB','J3SB',
  // Consecutive / grouped
  'SB23','SB45','SBLF',
  // Airport standby
  'OABY','OAS1',
  // Compensatory rest (also in _NON_OPS — checked first, but kept here for completeness)
  'RRES',
]);

const _OSB = new Set(['OSB','OSB1','OSB2','OSB3','OSB4','OSB5']);

const isTm = t => _TIME_P.test(t);
const isPl = t => _PLAIN_P.test(t);
const isFl = t => _FLIGHT_P.test(t);
const isIA = t => _IATA_P.test(t);
const isLM = t => _LM_P.test(t);
const isAC = t => _ACTYPE_P.test(t) || (t.startsWith('(') && /3/.test(t)) || t==='NEO)' || t==='PS)';

// Returns { display, code } — code used for A/C CHANGE detection, display for UI
function normalizeAcType(raw) {
  // Vueling internal fleet codes (AIMS/Crewportal)
  // 320  = A320 CEO
  // 321  = A321 CEO
  // 32A  = A320 NEO
  // 32Q  = A321 NEO
  // NEO  = Generic NEO label
  const s = raw.replace(/[()]/g,'').toUpperCase().replace(/\s+/g,'');
  if (s.includes('32Q'))                        return { display:'A321neo', code:'32Q' };
  if (s.includes('32A'))                        return { display:'A320neo', code:'32A' };
  if (s.startsWith('321') && s.includes('XLR')) return { display:'A321XLR', code:'321X' };
  if (s.startsWith('321'))                      return { display:'A321',    code:'321' };
  if (s.startsWith('320'))                      return { display:'A320',    code:'320' };
  if (s.startsWith('319'))                      return { display:'A319',    code:'319' };
  if (s.includes('NEO'))                        return { display:'NEO',     code:'NEO' };
  if (s.startsWith('32'))                       return { display:'A32X',    code:s.slice(0,3) };
  return null;
}

function parseDayTokensJS(tokens, dateStr) {
  const entries = [];
  let i = 0;
  const n = tokens.length;
  const peek  = (off=0) => i+off < n ? tokens[i+off] : null;

  const captureAC = () => {
    let raw = '';
    while (i < n && isAC(peek())) { raw += tokens[i++] + ' '; }
    return normalizeAcType(raw.trim());
  };

  while (i < n) {
    const tok = tokens[i];

    if (_SICK.has(tok)) {
      entries.push({ date: dateStr, type: 'sick' }); i++;

    } else if (_NON_OPS.has(tok)) {
      entries.push({ date: dateStr, type: tok.toLowerCase() }); i++;

    } else if (_STANDBY.has(tok)) {
      const e = { date: dateStr, type: 'standby' }; i++;
      if (i < n && isPl(peek())) { e.checkin  = tokens[i++]; }
      if (i < n && isPl(peek())) { e.checkout = tokens[i++]; }
      entries.push(e);

    } else if (_OSB.has(tok)) {
      const e = { date: dateStr, type: 'osb' }; i++;
      if (i < n && isPl(peek())) { e.checkin  = tokens[i++]; }
      if (i < n && isPl(peek())) { e.checkout = tokens[i++]; }
      entries.push(e);

    } else if (isLM(tok)) {
      const e = { date: dateStr, type: 'lm', code: tok }; i++;
      if (i < n && isPl(peek())) { e.start = tokens[i++]; }
      if (i < n && isPl(peek())) { e.end   = tokens[i++]; }
      entries.push(e);

    } else if (isFl(tok)) {
      const f = {
        date: dateStr, type: 'flight',
        flightNum: tok.replace('*',''),
        positioning: tok.startsWith('*')
      };
      i++;

      // Plain time: look ahead to decide if it's STD or check-in.
      // Rule: plain time followed by A-time → it IS the scheduled STD (already-flown flight)
      //       plain time followed by S/E-time → it is the check-in/report time
      if (i < n && isPl(peek())) {
        const nextTok = peek(1);
        if (nextTok && isTm(nextTok) && nextTok[0] === 'A') {
          // Flown flight: plain = STD scheduled
          f.std = tokens[i++];
        } else {
          // Future flight: plain = check-in
          f.checkin = tokens[i++];
        }
      }

      // STD [A/S/E]HH:MM
      if (i < n && isTm(peek())) {
        const r=tokens[i++], p=r[0], v=r.slice(1);
        if (p==='A') f.std_actual=v;
        else if (p==='S') f.std=v;
        else if (p==='E') f.std_estimated=v;
      }

      // DEP
      if (i < n && isIA(peek())) {
        const r=tokens[i++];
        f.positioning = f.positioning || r.startsWith('*');
        f.dep = r.replace('*','');
      }

      // ARR
      if (i < n && isIA(peek())) { f.arr = tokens[i++]; }

      // STA [A/S/E]HH:MM
      if (i < n && isTm(peek())) {
        const r=tokens[i++], p=r[0], v=r.slice(1);
        if (p==='A') f.sta_actual=v;
        else if (p==='S') f.sta=v;
        else if (p==='E') f.sta_estimated=v;
      }

      const ac = captureAC();
      if (ac) { f.acType = ac.display; f.acTypeCode = ac.code; }
      Object.keys(f).forEach(k => {
        if (f[k]===null||f[k]===undefined||f[k]===false||f[k]==='') delete f[k];
      });
      entries.push(f);

    } else { i++; }
  }
  return entries.length ? entries : [{ date: dateStr, type: 'off' }];
}

async function parseRosterPDF(pdfBuffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', err => reject(new Error(String(err.parserError || err))));
    parser.on('pdfParser_dataReady', data => {
      try {
        const page = data.Pages && data.Pages[0];
        if (!page) return reject(new Error('PDF vacío'));
        const words = page.Texts.map(t => ({
          x: t.x, y: t.y,
          text: decodeURIComponent(t.R.map(r => r.T).join(''))
        }));
        const ft = words.map(w => w.text).join(' ');

        // ── Month detection — supports MM/DD/YYYY and DD/MM/YYYY, and "TO MM/YY" formats ──
        let monthStr = null;
        // Primary: "FROM MM/DD/YYYY" → month = MM, year = YYYY
        const mm = ft.match(/FROM\s+(\d{2})\/(\d{2})\/(\d{4})/);
        if (mm) {
          // Disambiguate MM/DD vs DD/MM: day part is mm[2] if mm[1]<=12 AND mm[2]<=12
          // Vueling format is MM/DD/YYYY (confirmed by "FROM 05/01/2026 TO 05/31/2026")
          monthStr = mm[3]+'-'+mm[1];
        }
        // Fallback: look for any "YYYY-MM" or "MM/YYYY" in the text
        if (!monthStr) {
          const mf = ft.match(/(\d{4})[\/\-](\d{2})/);
          if (mf && parseInt(mf[2]) >= 1 && parseInt(mf[2]) <= 12) monthStr = mf[1]+'-'+mf[2];
        }
        // Fallback: look for "TO MM/YYYY" or "TO DD/MM/YYYY"
        if (!monthStr) {
          const mt2 = ft.match(/TO\s+\d{2}\/(\d{2})\/(\d{4})/);
          if (mt2) monthStr = mt2[2]+'-'+mt2[1];
        }

        // ── Day column detection — supports English AND Spanish month abbreviations ──
        const MNS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const MNS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const MNS = [...MNS_EN, ...MNS_ES];
        const dayColsMap = {};
        for (const w of words) for (const mn of MNS)
          if (w.text.length===5 && w.text.startsWith(mn) && /^\d{2}$/.test(w.text.slice(3)))
            dayColsMap[parseInt(w.text.slice(3))] = w.x;
        if (!Object.keys(dayColsMap).length) return reject(new Error('No se encontraron columnas de días'));

        // ── Infer month from day column headers if FROM detection failed ──
        // e.g. if the PDF has "Jun01" headers, we know it's June even without the FROM line
        if (!monthStr) {
          const yearMatch = ft.match(/\b(20\d{2})\b/);
          const year = yearMatch ? yearMatch[1] : null;
          if (year) {
            for (const w of words) {
              for (let mi = 0; mi < MNS_EN.length; mi++) {
                if ((w.text.startsWith(MNS_EN[mi]) || w.text.startsWith(MNS_ES[mi]))
                    && w.text.length === 5 && /^\d{2}$/.test(w.text.slice(3))) {
                  monthStr = year + '-' + String(mi + 1).padStart(2, '0');
                  console.log('[RosterPDF] monthStr inferred from column headers:', monthStr);
                  break;
                }
              }
              if (monthStr) break;
            }
          }
        }
        if (!monthStr) console.warn('[RosterPDF] Could not detect month — dates will be ????-XX');

        const sortedDays = Object.keys(dayColsMap).map(Number).sort((a,b)=>a-b);
        const colW = (dayColsMap[sortedDays[sortedDays.length-1]] - dayColsMap[sortedDays[0]]) / (sortedDays.length-1);
        const allEntries = [];
        for (const dayNum of sortedDays) {
          const cx = dayColsMap[dayNum];
          const tokens = words.filter(w => w.y>=13 && w.y<=60 && Math.abs(w.x-cx)<=colW*0.65)
            .sort((a,b)=>a.y-b.y).map(w=>w.text);
          const dateStr = monthStr ? monthStr+'-'+String(dayNum).padStart(2,'0') : '????-'+String(dayNum).padStart(2,'0');
          allEntries.push(...parseDayTokensJS(tokens, dateStr));
        }
        const nF = allEntries.filter(e=>e.type==='flight').length;

        // ── Extract B (block) and D (duty) totals from bottom rows ──
        // Each value in the B row is a per-day block time; the maximum realistic single-day
        // block is ~16h. Values ≥ 16:00 are clock-times (e.g. "22:10" = 10:10 PM) that
        // accidentally land on the B row y-coordinate — they must be excluded to avoid
        // inflating the total by ~20h (the root cause of the block-hours discrepancy bug).
        const TIME_RE = /^\d{1,2}:\d{2}$/;
        const MAX_BLOCK_DAY_MIN = 960;   // 16h — no realistic daily block exceeds this
        const MAX_DUTY_DAY_MIN  = 1200;  // 20h — conservative FTL ceiling
        const bWord = words.find(w => w.text === 'B');
        const dWord = words.find(w => w.text === 'D');
        let pdf_block_min = 0, pdf_duty_min = 0;
        if (bWord && dWord) {
          const bY = bWord.y, dY = dWord.y;
          const tolerance = 0.8;
          words.filter(w => Math.abs(w.y - bY) <= tolerance && TIME_RE.test(w.text))
            .forEach(w => {
              const p=w.text.split(':');
              const mins = parseInt(p[0])*60+parseInt(p[1]);
              if(mins < MAX_BLOCK_DAY_MIN) {
                pdf_block_min += mins;
              } else {
                console.warn('[RosterPDF] ⚠ Ignorando valor B sospechoso (hora del día, no duración): "'+w.text+'" ('+mins+'min) en y='+w.y.toFixed(2));
              }
            });
          words.filter(w => Math.abs(w.y - dY) <= tolerance && TIME_RE.test(w.text))
            .forEach(w => {
              const p=w.text.split(':');
              const mins = parseInt(p[0])*60+parseInt(p[1]);
              if(mins < MAX_DUTY_DAY_MIN) {
                pdf_duty_min += mins;
              } else {
                console.warn('[RosterPDF] ⚠ Ignorando valor D sospechoso: "'+w.text+'" ('+mins+'min) en y='+w.y.toFixed(2));
              }
            });
        }
        console.log('[RosterPDF] '+nF+' flights, month='+monthStr+
          ' | B='+Math.floor(pdf_block_min/60)+'h'+( pdf_block_min%60)+'m'+
          ' | D='+Math.floor(pdf_duty_min/60)+'h'+(pdf_duty_min%60)+'m');

        resolve({ month: monthStr, entries: allEntries, pdf_block_min, pdf_duty_min });
      } catch(err) { reject(err); }
    });
    parser.parseBuffer(pdfBuffer);
  });
}

app.post('/roster/analyze', requireAuth, async (req, res) => {
  const { image_base64, media_type, text_content, pdf_buffer } = req.body;
  if (!image_base64 && !text_content && !pdf_buffer) return res.status(400).json({ error: 'Falta imagen, texto o PDF del roster' });

  // ── Plan-aware roster limit ──
  const rosterCheck = await checkPlanLimit(req.user.id, 'roster');
  if (!rosterCheck.allowed) {
    return res.status(403).json({
      error: 'plan_limit',
      message: rosterCheck.error,
      plan: rosterCheck.plan,
      used: rosterCheck.used,
      limit: rosterCheck.limit,
    });
  }

  // ── PATH 1: Deterministic PDF parser ──────────────────────────
  if (pdf_buffer) {
    try {
      const buf = Buffer.from(pdf_buffer, 'base64');
      const parsed = await parseRosterPDF(buf);
      if (!parsed.entries.length) throw new Error('No se encontraron entradas en el PDF');
      parsed.entries = parsed.entries.map(e => ({ ...e, dep: validateIATA(e.dep), arr: validateIATA(e.arr) }));
      return res.json(validateRoster(parsed));
    } catch(err) {
      console.log('[RosterPDF] Error:', err.message);
      return res.status(500).json({ error: 'Error parseando PDF: ' + err.message });
    }
  }

  const today = new Date().toISOString().slice(0,10);

  // ── Prompt for image/PDF (grid format) ──
  const imagePrompt = `You are analyzing a Vueling Airlines PERSONAL CREW SCHEDULE (monthly roster table).
The roster is a grid where COLUMNS = days of the month, ROWS = data for each day.

TABLE STRUCTURE - read each day column independently:
- Header row: day number (1,2,3...) with day name (Fri/Sat/Sun/Mon/Tue/Wed/Thu)
- Row 1 of day: Activity code (SROF, OFF, OSB3, 3SBY, flight number like 8478, LMF2, etc)
- Row 2: For flights: departure airport (BCN, ORY, MAH...) - For non-flights: empty or sub-code
- Row 3: For flights: arrival airport
- Row 4: Scheduled times "S HH:MM" - IGNORE "A HH:MM" (actual) lines
- If a day has 2+ flight pairs, they stack vertically within the same column
- Bottom rows show check-in/check-out times - GLOBAL, not per day, ignore them

CRITICAL READING RULES:
1. NEVER assign a flight to the wrong day - stay STRICTLY within each day column
2. TIMES ARE CRITICAL: The roster shows two types of times: "S HH:MM" (scheduled = USE THIS) and "A HH:MM" (actual = IGNORE COMPLETELY). ONLY extract times that have the letter "S" immediately before them. If you see "A 03:25" ignore it. If you see "S 03:25" use 03:25 as the time. Never use A-prefixed times under any circumstance.
3. OSB3 = create TWO entries: {type:"osb"} AND {type:"flight"} for each flight pair that day
4. 3SBY = type:"standby" - NOT a flight, even if flight data appears in adjacent columns
5. Flight numbers are exactly 4 digits (6034, 8161, 8478) - never invent or shift between days
6. Routes like "BCN ORY ORY BCN" = two flights: BCN->ORY and ORY->BCN (same day)
7. LMF2/LMCC/LMFE/LMSL/LMCE = all type:"lm"
8. *BCN (asterisk=positioning): type:"flight", dep MUST include the * prefix (e.g. dep:"*BCN"). Preserve * in dep field.
8b. PS (positioning sector) = type:"flight"
9. Order flights within a day by STD time ascending (earliest first)

CHRONOLOGICAL VALIDATION RULE (CRITICAL):
- Flights within a day MUST be in ascending STD order
- If STD of flight N+1 < STD of flight N → flight N+1 does NOT belong to this day, move it to day N+1
- Example: BCN-OPO S12:15 → OPO-BCN S15:35 → BCN-DUS S14:51 ❌ (14:51 < 15:35, BCN-DUS belongs to NEXT day)
- This rule has PRIORITY over visual appearance in the PDF column

PDF CELL OVERFLOW RULE:
- When a day has many flights, data can visually overflow into what looks like the same column
- Max reasonable flights per day for Vueling: 4 pairs (8 legs). More than that = likely overflow from next day
- Always verify with chronological rule before assigning

OCR CORRECTIONS FOR IATA CODES:
IATA codes are always 3 CAPITAL LETTERS. Apply these automatic corrections:
- SCO -> SCQ (Santiago de Compostela, O/Q look similar)
- Any code with digit 0 -> replace with letter O
- MAl -> MAH (Menorca, l/H similar)
- PMl -> PMI (Palma, l/I similar)
- lBZ -> IBZ (Ibiza, l/I similar)
- Any lowercase letters in IATA code -> convert to uppercase
General rule: if OCR produces a 3-character code that is not a valid IATA airport, check for visually similar letter substitutions.

ROUTE CONTINUITY RULE (CRITICAL):
- Within a day, legs must form a logical chain: ARR of leg N = DEP of leg N+1
- Correct: BCN->GOA, GOA->BCN, BCN->IBZ, IBZ->BCN ✅
- Incorrect: BCN->NCE, GOA->BCN ❌ (NCE ≠ GOA → second leg belongs to different day or has OCR error)
- If this rule breaks: first check for OCR error (visually similar letters); if not OCR, remove the conflicting leg from this day
- Better to have fewer correct legs than incorrect ones
- Also applies between days: DEP of first leg of day N+1 = ARR of last leg of day N (unless * prefix)

DYNAMIC BASE RULE:
- If last flight of day N arrives at X ≠ BCN → day N+1 first flight departs FROM X
- If last flight of day N arrives at BCN → day N+1 first flight departs FROM BCN
- Exception: *AIRPORT prefix = positioning, may depart from different airport
- This chains across multiple days until pilot returns to BCN

TYPE MAPPING:
SROF->srof | OFF->off | AOFF->aoff | NROF->nrof | MEOF->meof | OSB/OSB3->osb | 3SBY/STBY/SBY->standby | F->f | EF->ef | NOFF->noff
LM/LMF2/LMCC/LMFE/LMSL/LMCE->lm | SIM->training | SICK->sick | 4-digit number->flight | unknown->other

TIMES EXPLANATION:
- "S HH:MM" = Scheduled time (planned) → use for std/sta fields
- "A HH:MM" = Actual time (real block times, only for past flights) → use for std_actual/sta_actual fields
- Always extract BOTH if present. For future flights, std_actual and sta_actual will be null.

IMPORTANT: Your response must start with { and end with }. Do not write any text, explanation, analysis or markdown before or after the JSON. Just the raw JSON object. Start your response immediately with {"month":
The format is: {"month":"YYYY-MM","entries":[{"date":"YYYY-MM-DD","type":"TYPE","flightNum":"4digits or null","dep":"IATA or null","arr":"IATA or null","std":"HH:MM or null","sta":"HH:MM or null","std_actual":"HH:MM or null","sta_actual":"HH:MM or null"}]}

- Include ALL days 1-31, empty days = type:"off"
- One entry per flight leg
- OSB days: always osb entry + flight entries
- 3SBY days: standby only, no flights
- Month from header e.g. "FROM 05/01/2026 TO 05/31/2026" -> month:"2026-05"
Today is ${today}.`;

  // ── Prompt for TXT (plain text row format) ──
  const textPrompt = `You are parsing a Vueling Airlines PERSONAL CREW SCHEDULE exported as plain text.

TEXT FORMAT - each day is a row:
- Date line: "DD/MM/YYYY DayName  DUTYCODE  details  ReportTime  ActualTimes  Debrief  BlockHours  DutyHours"
- Flight sub-rows: "  FLIGHTNUM [acft]  DEP  -  ARR   A_dep - A_arr"
  Example: "  8478 [320]  BCN  -  OPO   A12:58 - A14:51"
- "A HH:MM" prefix = actual block-on/off times → use as std/sta (they are the real times)
- Report time = column before actual times (e.g. "12:15") → ignore for JSON, it's check-in
- OSB3 days have the OSB duty code on the date line PLUS flight sub-rows below
- 3SBY / SROF / OFF / SICK / EF / LM* / EVAL / SBTL appear as the duty code on the date line only

TYPE MAPPING:
SROF/SOFF->srof | OFF->off | AOFF->aoff | NROF->nrof | OSB3/OSB->osb | 3SBY/STBY/SBY/HSBY->standby | F->f | EF->ef | NOFF->noff
LM*/LMSL/LMCC/LMFE/LMF2/LMCE->lm | EBT->ebt | EVA/EVAL->eva | SBTL/SIM->training | SICK->sick | flight sub-row->flight | unknown->other

RULES:
1. OSB3 days: create one {type:"osb"} entry + one {type:"flight"} entry per flight sub-row
2. LM days may have multiple sub-codes (LMF2, LMCC, LMFE on separate lines) — create one {type:"lm"} entry per sub-code line
3. Flight numbers are 4 digits. Extract dep/arr from "DEP - ARR" columns. If dep has a leading * (e.g. *BCN), preserve it: dep:"*BCN"
4. Times with "A" prefix (actual) → set ONLY std_actual/sta_actual, leave std/sta as null. Example: "A12:58" → std_actual:"12:58", std:null
5. Times with "S" prefix (scheduled) → set ONLY std/sta, leave std_actual/sta_actual as null. Example: "S12:58" → std:"12:58", std_actual:null
6. Times with no prefix → set ONLY std/sta (scheduled), std_actual/sta_actual = null
7. Month from header: "DD/MM/YYYY - DD/MM/YYYY" → month:"YYYY-MM"

IMPORTANT: Your response must start with { and end with }. No markdown, no explanation. Raw JSON only.
Format: {"month":"YYYY-MM","entries":[{"date":"YYYY-MM-DD","type":"TYPE","flightNum":"4digits or null","dep":"IATA or null","arr":"IATA or null","std":"HH:MM or null","sta":"HH:MM or null","std_actual":"HH:MM or null","sta_actual":"HH:MM or null"}]}

- Include ALL days in the file
- Empty/OFF days = type:"off"
Today is ${today}.`;

  try {
    const messageContent = text_content
      ? [{ type: 'text', text: textPrompt + '\n\nROSTER TEXT:\n' + text_content }]
      : [
          { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 }},
          { type: 'text', text: imagePrompt }
        ];

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: messageContent }]
    });
    let text = (response.content[0]?.text || '').trim();
    console.log('[Roster] Raw response:', text.slice(0, 200));
    text = text.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
    const jsonStart = text.indexOf('{'), jsonEnd = text.lastIndexOf('}');
    if (jsonStart > -1 && jsonEnd > jsonStart) text = text.slice(jsonStart, jsonEnd+1);
    const parsed = JSON.parse(text);
    // Log summary per day for debugging
    if (parsed.entries) {
      const byDay = {};
      parsed.entries.forEach(e => { if(!byDay[e.date]) byDay[e.date]=[]; byDay[e.date].push(e.type+(e.dep?':'+e.dep+'-'+e.arr:'')); });
      Object.keys(byDay).sort().forEach(d => console.log(`[Roster] ${d}: ${byDay[d].join(', ')}`));
    }
    // Reclassify LM codes wrongly tagged as flight (e.g. LMSL, LMCC, LMFE, LMF2, LMCE)
    if (parsed.entries) {
      parsed.entries = parsed.entries.map(e => {
        if (e.type === 'flight' && e.flightNum && /^LM[A-Z0-9]/i.test(String(e.flightNum))) {
          console.log(`[Roster] Reclassified ${e.flightNum} on ${e.date} from flight -> lm`);
          return { ...e, type: 'lm', flightNum: null, dep: null, arr: null };
        }
        return e;
      });
    }
    // Validate and correct IATA codes
    if (parsed.entries) {
      parsed.entries = parsed.entries.map(e => ({
        ...e,
        dep: validateIATA(e.dep),
        arr: validateIATA(e.arr)
      }));
    }
    res.json(validateRoster(parsed));
  } catch(e) {
    console.log('Roster analyze error:', e.message);
    res.status(500).json({ error: 'Error al analizar roster: ' + e.message });
  }
});
// ── POST /api/roster/save — persiste entradas de vuelo del roster en Supabase ──
//
// Supabase table — full schema:
// ------------------------------------------------------------
// CREATE TABLE IF NOT EXISTS roster_entries (
//   id            TEXT PRIMARY KEY,
//   user_id       UUID NOT NULL REFERENCES pilot_users(id) ON DELETE CASCADE,
//   month         TEXT,
//   date          TEXT,
//   entry_type    TEXT DEFAULT 'flight',
//   flight_number TEXT,
//   dep           TEXT,
//   arr           TEXT,
//   std           TEXT,
//   sta           TEXT,
//   checkin       TEXT,
//   positioning   BOOLEAN DEFAULT FALSE,
//   raw_data      JSONB NOT NULL DEFAULT '{}'
// );
// CREATE INDEX IF NOT EXISTS roster_entries_user_idx  ON roster_entries(user_id);
// CREATE INDEX IF NOT EXISTS roster_entries_month_idx ON roster_entries(user_id, month);
// CREATE INDEX IF NOT EXISTS roster_entries_date_idx  ON roster_entries(date DESC);
// GRANT ALL ON TABLE roster_entries TO service_role;
// GRANT ALL ON TABLE roster_entries TO authenticated;
// ------------------------------------------------------------
app.post('/api/roster/save', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  const { entries, month } = req.body;
  if (!Array.isArray(entries) || !entries.length)
    return res.status(400).json({ error: 'entries debe ser un array no vacio' });

  const userId = req.user.id;
  try {
    const rows = entries
      .filter(e => e.date) // FIX: guardar todos los tipos (standby, off, training, sick, other)
      .map(e => ({
        id:            e.id || `r_${userId}_${e.date}_${e.type || 'x'}_${e.flightNum || 'x'}`,
        user_id:       userId,
        // FIX: use the entry's own date for the month field, never the request param.
        // Previously all entries sent together got tagged with month=newMonth, causing
        // May entries to be tagged as '2026-06' in the DB and corrupting multi-month state.
        month:         (e.date || '').slice(0, 7) || month,
        date:          e.date          || null,
        entry_type:    e.type          || 'flight',
        flight_number: e.flightNum     || null,
        dep:           e.dep           || null,
        arr:           e.arr           || null,
        std:           e.std           || e.std_actual || null,
        sta:           e.sta           || e.sta_actual || null,
        checkin:       e.checkin       || null,
        positioning:   !!e.positioning,
        raw_data:      e,
      }));

    if (!rows.length) return res.json({ ok: true, saved: 0 });

    // Delete existing entries for this month before inserting — ensures a re-import
    // always gives a clean slate and never leaves ghost entries from a previous import.
    const targetMonth = month || rows[0]?.month;
    if (targetMonth) {
      const { error: delErr } = await supabase
        .from('roster_entries')
        .delete()
        .eq('user_id', userId)
        .eq('month', targetMonth);
      if (delErr) console.warn('[Roster save] delete-before-upsert failed:', delErr.message);
    }

    const { error } = await supabase
      .from('roster_entries')
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('[Roster save] Supabase upsert FAILED:', error.message);
      if (error.message.includes('permission denied')) {
        console.error('[Roster save] FIX: run in Supabase SQL Editor → GRANT ALL ON TABLE roster_entries TO service_role;');
      }
      throw error;
    }

    console.log(`[Roster save] user=${userId} month=${targetMonth} saved=${rows.length}`);
    res.json({ ok: true, saved: rows.length, month });

    // Housekeeping: silently purge entries older than 5 months (fire-and-forget)
    const fiveMonthsAgo = new Date();
    fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 5);
    const cutoff = fiveMonthsAgo.toISOString().slice(0, 7) + '-01';
    supabase.from('roster_entries').delete()
      .eq('user_id', userId).lt('date', cutoff)
      .then(() => {}).catch(() => {});
  } catch(e) {
    console.error('[Roster save] ERROR:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/roster — devuelve entradas de los últimos 6 meses del usuario ──
app.get('/api/roster', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    // Window: 5 months back + 1 month forward (roster for next month is published on the 15th)
    const past = new Date();
    past.setMonth(past.getMonth() - 5);
    const future = new Date();
    future.setMonth(future.getMonth() + 1);
    const cutoffFrom = past.toISOString().slice(0, 7) + '-01';      // first day 5 months ago
    const cutoffTo   = future.toISOString().slice(0, 7) + '-31';    // last possible day next month

    const { data, error } = await supabase
      .from('roster_entries')
      .select('raw_data, date, entry_type, month')
      .eq('user_id', req.user.id)
      .gte('date', cutoffFrom)
      .lte('date', cutoffTo)
      .order('date', { ascending: true });
    if (error) throw error;
    const entries = (data || []).map(r => r.raw_data || { date: r.date, type: r.entry_type }).filter(Boolean);
    // Deduplicate by date+type+flightNum (protects against legacy duplicate saves)
    const seen = new Set();
    const unique = entries.filter(e => {
      const k = `${e.date}_${e.type||''}_${e.flightNum||''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    res.json({ entries: unique, count: unique.length });
  } catch (e) {
    console.error('[Roster get]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/roster — borra entradas del roster del usuario autenticado ──
// Query param opcional: ?month=YYYY-MM  → borra solo ese mes
// Sin param                             → borra todo el roster del usuario
app.delete('/api/roster', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });
  try {
    const month = req.query.month; // opcional
    let query = supabase.from('roster_entries').delete().eq('user_id', req.user.id);
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month))
        return res.status(400).json({ error: 'Formato de month inválido — usa YYYY-MM' });
      query = query.eq('month', month);
    }
    const { error } = await query;
    if (error) throw error;
    console.log(`[Roster delete] user=${req.user.id} month=${month || 'ALL'}`);
    res.json({ ok: true, month: month || null });
  } catch (e) {
    console.error('[Roster delete]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// ─────────────────────────────────────────────────────────────────
// ROSTER VALIDATION ENGINE
// Enriches every entry with warning objects + builds summary blocks.
// Warning object shape (matches PilotOS HTML expectations):
//   { code, severity, message, suggested_fix: { field, current, proposed, explanation } }
// ─────────────────────────────────────────────────────────────────
function validateRoster(parsed) {
  if (!parsed || !parsed.entries) return parsed;
  const entries = parsed.entries;

  // ── helpers ──
  function toMin(t) {
    if (!t || typeof t !== 'string') return null;
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
  }

  // Build a warning object
  function W(code, severity, message, fix) {
    return { code, severity, message, suggested_fix: fix || { explanation: message } };
  }

  // Init every entry
  entries.forEach(e => { e.warnings = []; e.confidence = 'high'; });

  // Group by date
  const byDate = {};
  entries.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
  const sortedDates = Object.keys(byDate).sort();

  function getFlights(date) {
    return (byDate[date] || [])
      .filter(e => e.type === 'flight')
      .sort((a, b) => (toMin(a.std || a.std_actual) ?? 9999) - (toMin(b.std || b.std_actual) ?? 9999));
  }

  // Pre-compute duplicate leg keys
  const seenKeys = {}, dupKeys = new Set();
  entries.forEach(e => {
    if (e.type === 'flight' && e.flightNum) {
      const k = `${e.date}_${e.flightNum}_${e.dep}_${e.arr}`;
      seenKeys[k] ? dupKeys.add(k) : (seenKeys[k] = true);
    }
  });

  // ── PER-DAY / PER-LEG RULES ──────────────────────────────────
  sortedDates.forEach((date, di) => {
    const dayEntries = byDate[date];
    const flights    = getFlights(date);
    const prevDate   = di > 0 ? sortedDates[di - 1] : null;
    const prevFlights = prevDate ? getFlights(prevDate) : [];
    const types = dayEntries.map(e => e.type);

    const hasStandby = types.includes('standby');
    const hasLm      = types.includes('lm');
    const hasSick    = types.includes('sick');
    const hasSrof    = types.includes('srof');
    const hasOsb     = types.includes('osb');
    const hasFlights = flights.length > 0;

    // ── Day-level structural ──
    if (hasStandby && hasFlights)
      flights.forEach(e => e.warnings.push(W('standby_has_flights','critical',
        'Día marcado como standby pero contiene legs de vuelo',
        { explanation: 'Los días 3SBY no deben tener vuelos reales. Verifica si el día es standby o vuelo operado.' })));

    if (hasOsb && !hasFlights)
      dayEntries.filter(e => e.type === 'osb').forEach(e => e.warnings.push(W('osb_missing_flights','warning',
        'Día OSB activado pero no se detectaron legs de vuelo',
        { explanation: 'Si el OSB fue activado debería tener al menos un vuelo. Puede ser que el OCR no leyera los vuelos.' })));

    if (hasLm && hasFlights)
      flights.forEach(e => e.warnings.push(W('lm_with_flights','warning',
        'Día de formación (LM) con legs de vuelo incluidos',
        { explanation: 'Los días de e-learning no deberían tener operaciones de vuelo. Revisa el tipo de día.' })));

    if (hasSick && hasFlights)
      flights.forEach(e => e.warnings.push(W('sick_with_flights','critical',
        'Día de baja (SICK) con legs de vuelo',
        { explanation: 'Inconsistente: el piloto está de baja pero aparecen vuelos. Posible error OCR en el código de día.' })));

    if (hasSrof && dayEntries.length > 1)
      dayEntries.filter(e => e.type === 'srof').forEach(e => e.warnings.push(W('rof_with_activity','warning',
        'Día SROF/SOFF con actividad adicional detectada',
        { explanation: 'Los días de libre no deberían tener ninguna actividad adicional.' })));

    if (flights.length > 6)
      flights.forEach(e => e.warnings.push(W('unusual_leg_count','warning',
        `${flights.length} legs en un solo día (máximo esperado: 6)`,
        { explanation: 'Probable overflow de celda PDF o error de asignación de columna por el OCR.' })));

    if (flights.length === 1) {
      const leg = flights[0];
      const dep = leg.dep?.replace('*','');
      if (dep && leg.arr && dep !== leg.arr)
        leg.warnings.push(W('single_leg_day','warning',
          `Único leg del día (${dep}→${leg.arr}) sin vuelo de retorno`,
          { explanation: 'El piloto no regresa a base — la base dinámica cambia para el día siguiente.' }));
    }

    // base_rule_broken — first DEP of day ≠ ARR of last leg of previous day
    if (hasFlights && prevFlights.length > 0) {
      const firstLeg = flights[0];
      const lastPrev = prevFlights[prevFlights.length - 1];
      const firstDep = firstLeg.dep?.replace('*','');
      if (firstDep && lastPrev.arr && firstDep !== lastPrev.arr && !firstLeg.dep?.startsWith('*'))
        firstLeg.warnings.push(W('base_rule_broken','critical',
          `Primer DEP del día (${firstDep}) ≠ ARR del último leg del día anterior (${lastPrev.arr})`,
          { field:'dep', current: firstDep, proposed: lastPrev.arr,
            explanation: `Según la regla de base dinámica, el piloto debería salir desde ${lastPrev.arr}, no desde ${firstDep}.` }));
    }

    // ── Per-leg ──
    flights.forEach((leg, li) => {

      // missing_std / missing_arr — only if no actual times either (flown flights use std_actual/sta_actual)
      if (!leg.std && !leg.std_actual)
        leg.warnings.push(W('missing_std','warning',
          `Vuelo ${leg.flightNum||'?'} (${leg.dep||'?'}→${leg.arr||'?'}) sin hora de salida programada ni real`,
          { field:'std', explanation: 'El OCR no pudo leer ninguna hora de salida. Introduce manualmente.' }));

      if (!leg.arr)
        leg.warnings.push(W('missing_arr','warning',
          `Vuelo ${leg.flightNum||'?'} desde ${leg.dep||'?'} sin aeropuerto de llegada`,
          { field:'arr', explanation: 'El OCR no pudo leer el destino. Introduce manualmente.' }));

      // ocr_risk_flightnum
      if (leg.flightNum && !/^\d{4}$/.test(String(leg.flightNum)))
        leg.warnings.push(W('ocr_risk_flightnum','warning',
          `Número de vuelo "${leg.flightNum}" no tiene exactamente 4 dígitos`,
          { field:'flightNum', current: leg.flightNum,
            explanation: 'Los vuelos Vueling tienen siempre 4 dígitos. Posible error de lectura OCR.' }));

      // ocr_risk_iata
      ['dep','arr'].forEach(f => {
        const raw = leg[f];
        if (raw) {
          const code = raw.replace('*','');
          if (!/^[A-Z]{3}$/.test(code))
            leg.warnings.push(W('ocr_risk_iata','warning',
              `Código IATA ${f.toUpperCase()}="${raw}" contiene caracteres inválidos (esperado: 3 letras mayúsculas)`,
              { field: f, current: raw,
                explanation: 'El OCR puede confundir 0 (cero) con O, l minúscula con I, o generar códigos de longitud incorrecta. Corrige manualmente.' }));
        }
      });

      // ocr_risk_time — only check scheduled times (actual times come from ops system, always valid)
      ['std','sta'].forEach(f => {
        const t = leg[f];
        if (t) {
          const m = t.match(/^(\d{1,2}):(\d{2})$/);
          if (!m || parseInt(m[1]) > 23 || parseInt(m[2]) > 59)
            leg.warnings.push(W('ocr_risk_time','warning',
              `${f.toUpperCase()}="${t}" tiene formato de hora inválido`,
              { field: f, current: t,
                explanation: 'El OCR leyó un tiempo con horas > 23 o minutos > 59. Corrige manualmente.' }));
        }
      });

      // Resolve effective times: prefer scheduled, fall back to actual (already-flown legs)
      const effStd = leg.std || leg.std_actual;
      const effSta = leg.sta || leg.sta_actual;

      // sta_before_std / midnight_crossing
      if (effStd && effSta) {
        const d = toMin(effStd), a = toMin(effSta);
        if (d !== null && a !== null && a < d) {
          (d - a < 600)
            ? leg.warnings.push(W('sta_before_std','warning',
                `STA ${effSta} es anterior al STD ${effStd} sin cruce de medianoche`,
                { explanation: 'El vuelo llegaría antes de salir. Comprueba si hay error OCR en los tiempos.' }))
            : leg.warnings.push(W('midnight_crossing','info',
                `STD ${effStd} tardío y STA ${effSta} temprano — posible cruce de medianoche`,
                { explanation: 'Parece un vuelo nocturno que llega al día siguiente. Verifica que los tiempos son correctos.' }));
        }
      }

      // sta_equals_std
      if (effStd && effSta && effStd === effSta)
        leg.warnings.push(W('sta_equals_std','warning',
          `STA = STD = ${effStd} en vuelo ${leg.flightNum||'?'} — tiempo de vuelo cero`,
          { explanation: 'Imposible que el vuelo tenga 0 minutos de duración. Error OCR en uno de los tiempos.' }));

      // duplicate_leg
      if (leg.flightNum) {
        const k = `${leg.date}_${leg.flightNum}_${leg.dep}_${leg.arr}`;
        if (dupKeys.has(k))
          leg.warnings.push(W('duplicate_leg','warning',
            `Leg ${leg.flightNum} ${leg.dep||'?'}→${leg.arr||'?'} aparece duplicado el ${leg.date}`,
            { explanation: 'El OCR leyó el mismo leg dos veces. Elimina el duplicado manualmente.' }));
      }

      // Rules needing previous leg (same day)
      if (li > 0) {
        const prev = flights[li - 1];
        const thisDep = leg.dep?.replace('*','');

        // dep_mismatch
        if (thisDep && prev.arr && thisDep !== prev.arr)
          leg.warnings.push(W('dep_mismatch','critical',
            `DEP del leg ${leg.flightNum||'?'} (${thisDep}) ≠ ARR del leg anterior (${prev.arr})`,
            { field:'dep', current: thisDep, proposed: prev.arr,
              explanation: `La cadena de vuelos está rota. El leg debería salir desde ${prev.arr}, no desde ${thisDep}.` }));

        // time_conflict / time_gap_short / time_gap_long — use effective times
        const thisEffStd = leg.std || leg.std_actual;
        const prevEffSta = prev.sta || prev.sta_actual;
        if (thisEffStd && prevEffSta) {
          const thisStd = toMin(thisEffStd), prevSta = toMin(prevEffSta);
          if (thisStd !== null && prevSta !== null) {
            if (thisStd < prevSta)
              leg.warnings.push(W('time_conflict','critical',
                `STD ${thisEffStd} es anterior al STA del leg previo (${prevEffSta})`,
                { explanation: `El vuelo ${leg.flightNum||'?'} sale antes de que aterrice el leg anterior. Posible overflow de columna OCR.` }));
            else {
              const gap = thisStd - prevSta;
              if (gap < 30)
                leg.warnings.push(W('time_gap_short','warning',
                  `Solo ${gap} min entre el aterrizaje anterior (${prevEffSta}) y el despegue siguiente (${thisEffStd})`,
                  { explanation: 'Turnaround muy corto. Puede ser válido en hub, pero verifica que los tiempos son correctos.' }));
              if (gap > 360)
                leg.warnings.push(W('time_gap_long','warning',
                  `${Math.floor(gap/60)}h ${gap%60}min de espera entre ${prevEffSta} y ${thisEffStd} en el mismo día`,
                  { explanation: 'Espera muy larga entre dos legs del mismo día. Comprueba si el segundo leg pertenece a otro día.' }));
            }
          }
        }
      }

      // overflow_risk — ends outside BCN but next day starts BCN without *
      if (li === flights.length - 1 && leg.arr && leg.arr !== 'BCN') {
        const nextDate = sortedDates[di + 1];
        if (nextDate) {
          const nf = getFlights(nextDate);
          if (nf.length > 0) {
            const nd = nf[0];
            const ndDep = nd.dep?.replace('*','');
            if (ndDep === 'BCN' && !nd.dep?.startsWith('*'))
              leg.warnings.push(W('overflow_risk','warning',
                `Último ARR=${leg.arr} ≠ BCN, pero el día siguiente empieza desde BCN sin posicionamiento`,
                { explanation: 'Probable overflow de celda PDF. El leg del día siguiente posiblemente pertenece a otro día o falta un posicionamiento (*).' }));
          }
        }
      }
    });
  });

  // ── ASSIGN CONFIDENCE first pass ──
  const CRIT_CODES = ['dep_mismatch','base_rule_broken','time_conflict','standby_has_flights','sick_with_flights'];
  function assignConf(e) {
    const hasCrit = e.warnings.some(w => CRIT_CODES.includes(w.code));
    e.confidence = hasCrit ? 'low' : e.warnings.length > 0 ? 'medium' : 'high';
  }
  entries.forEach(assignConf);

  // ── GLOBAL COHERENCE RULES ──

  // too_many_flagged_consecutive — 3+ consecutive days with low confidence
  let streak = 0, streakStart = 0;
  sortedDates.forEach((date, idx) => {
    const hasLow = (byDate[date] || []).some(e => e.confidence === 'low');
    if (hasLow) {
      if (streak === 0) streakStart = idx;
      streak++;
      if (streak >= 3) {
        const msg = W('too_many_flagged_consecutive','warning',
          `3+ días consecutivos con confianza baja (desde ${sortedDates[streakStart]}) — posible error sistemático de columna OCR`,
          { explanation: 'Cuando hay muchos días seguidos con errores críticos, es probable que el OCR haya desplazado columnas sistemáticamente. Considera reimportar el roster.' });
        for (let i = streakStart; i <= idx; i++) {
          (byDate[sortedDates[i]] || []).filter(e => e.type === 'flight').forEach(e => {
            if (!e.warnings.some(w => w.code === 'too_many_flagged_consecutive')) e.warnings.push(msg);
          });
        }
      }
    } else { streak = 0; }
  });

  // month_total_flights_outlier
  const totalLegs = entries.filter(e => e.type === 'flight').length;
  if (totalLegs > 120 || totalLegs < 10) {
    const first = entries.find(e => e.type === 'flight');
    if (first) first.warnings.push(W('month_total_flights_outlier','warning',
      `${totalLegs} legs de vuelo en el mes (esperado: 10–120)`,
      { explanation: 'El número total de legs parece anómalo. El mes puede estar mal leído o truncado.' }));
  }

  // gap_in_calendar — missing dates
  if (parsed.month) {
    const [yr, mo] = parsed.month.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const presentDates = new Set(entries.map(e => e.date));
    const missing = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${parsed.month}-${String(d).padStart(2,'0')}`;
      if (!presentDates.has(ds)) missing.push(ds);
    }
    if (missing.length) {
      const first = entries.find(e => e.type === 'flight') || entries[0];
      if (first) first.warnings.push(W('gap_in_calendar','info',
        `Fechas sin ninguna entrada en el roster: ${missing.slice(0,5).join(', ')}${missing.length>5?' y '+(missing.length-5)+' más':''}`,
        { explanation: 'Faltan días en el roster importado. Puede ser que el OCR no leyera todas las columnas del PDF.' }));
    }
  }

  // ── ASSIGN CONFIDENCE second pass (after global rules) ──
  entries.forEach(assignConf);

  // ── BUILD flagged_entries + import_summary ──
  const flagged_entries = [];
  entries.forEach(e => {
    if (e.confidence !== 'high') {
      e.warnings.forEach(w => {
        flagged_entries.push({
          date:           e.date,
          type:           e.type,
          flightNum:      e.flightNum || null,
          dep:            e.dep       || null,
          arr:            e.arr       || null,
          confidence:     e.confidence,
          reason:         w.code,
          message:        w.message,
          action_required: e.confidence === 'low' ? 'verify_manual' : 'review'
        });
      });
    }
  });

  const flightLegs   = entries.filter(e => e.type === 'flight');
  const highC  = flightLegs.filter(e => e.confidence === 'high').length;
  const medC   = flightLegs.filter(e => e.confidence === 'medium').length;
  const lowC   = flightLegs.filter(e => e.confidence === 'low').length;

  const import_summary = {
    total_entries:      entries.length,
    total_flight_legs:  flightLegs.length,
    high_confidence:    highC,
    medium_confidence:  medC,
    low_confidence:     lowC,
    auto_imported:      highC,
    flagged_for_review: medC + lowC
  };

  console.log(`[Validation] ${import_summary.total_flight_legs} legs → high:${highC} med:${medC} low:${lowC} | flagged:${flagged_entries.length}`);
  return { ...parsed, entries, flagged_entries, import_summary };
}

// ── LOGBOOK MCDU VISION ──────────────────────────────────────────
app.post('/api/logbook/analyze', requireAuth, async (req, res) => {
  const { image_base64, media_type } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'Falta imagen' });

  // ── Plan-aware OCR limit ──
  const ocrCheck = await checkPlanLimit(req.user.id, 'ocr');
  if (!ocrCheck.allowed) {
    return res.status(403).json({
      error: 'plan_limit',
      message: ocrCheck.error,
      plan: ocrCheck.plan,
      used: ocrCheck.used,
      limit: ocrCheck.limit,
    });
  }

  const prompt = `Analyze this Airbus MCDU screen and extract ALL visible data. This may be an FPLN page, INIT page, PERF page, or an AOC STATUS page (showing OUT/OFF/IN/ON/BLOCK/FLIGHT times).

Return ONLY valid JSON without markdown or code blocks:
{
  "flightNumber": "VY1234 or null",
  "departure": "ICAO 4-letter code like LEBL or null",
  "arrival": "ICAO 4-letter code like EGLL or null",
  "date": "YYYY-MM-DD or null",
  "atd": "HH:MM UTC — OUT time (actual off-block) or null",
  "std": "HH:MM UTC — OFF time (scheduled/actual takeoff) or null",
  "ata": "HH:MM UTC — IN time (actual on-block) or null",
  "sta": "HH:MM UTC — ON time (actual landing) or null",
  "block": "HH:MM — BLOCK time or null",
  "flightTime": "HH:MM — FLIGHT time or null",
  "aircraftType": "A319/A320/A320neo/A321/A321neo/A321XLR or null",
  "registration": "EC-XXX or null",
  "cruiseFL": "FL360 or null",
  "estimatedBlockTime": "HH:MM — use block field value if AOC STATUS page, else estimated or null",
  "confidence": "high/medium/low",
  "pageDetected": "AOC_STATUS/FPLN/INIT/PERF/OTHER",
  "error": "Not an MCDU screen or null"
}

IMPORTANT rules:
- AOC STATUS page shows: FLIGHT ID, ORIG/DEST, OUT (off-block), OFF (takeoff), IN (on-block), ON (landing), BLOCK, FLIGHT times. All times end in Z (UTC).
- If a time shows "----Z" it means not yet registered — return null for that field.
- Convert times like "0546Z" to "05:46", "2047Z" to "20:47".
- Convert dates like "17MAY26" to "2026-05-17".
- ORIG/DEST like "LEBL/LIMJ" → departure="LEBL", arrival="LIMJ". Note some airports use ICAO codes (4 letters like LEBL, BIKF, LIMJ).
- For BLOCK field, convert "0132" to "01:32", "0423" to "04:23".
- estimatedBlockTime should equal block if available.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 } },
        { type: 'text', text: prompt }
      ]}]
    });
    let text = (response.content[0]?.text || '').replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch(pe) {
      console.error('[LogbookOCR] JSON parse failed:', pe.message, text.slice(0, 200));
      return res.status(500).json({ error: 'Respuesta de IA no válida' });
    }
    res.json(parsed);
  } catch(e) {
    console.error('[LogbookOCR]', e.message);
    res.status(500).json({ error: 'Error al analizar imagen: ' + e.message });
  }
});

// ── WEATHER AI BRIEFING ──────────────────────────────────────────
app.post('/api/weather/analyze', requireAuth, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Falta prompt' });

  // Weather AI shares the CAFI quota
  const cafiCheck = await checkPlanLimit(req.user.id, 'cafi');
  if (!cafiCheck.allowed) {
    return res.status(429).json({
      error: 'plan_limit',
      message: cafiCheck.error,
      plan: cafiCheck.plan,
      used: cafiCheck.used,
      limit: cafiCheck.limit,
    });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });
    let text = (response.content[0]?.text || '').replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch(pe) {
      console.error('[WeatherAI] JSON parse failed:', pe.message, text.slice(0, 200));
      return res.status(500).json({ error: 'Respuesta de IA no válida' });
    }
    res.json(parsed);
  } catch(e) {
    console.error('[WeatherAI]', e.message);
    res.status(500).json({ error: 'Error al analizar meteorología: ' + e.message });
  }
});

// ── STRIPE ───────────────────────────────────────────────────────

// POST /api/stripe/checkout — crea sesión de pago y devuelve URL
app.post('/api/stripe/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe no configurado' });
  const { priceId } = req.body;
  if (!priceId) return res.status(400).json({ error: 'Falta priceId' });
  if (!STRIPE_PRICE_TO_PLAN[priceId])
    return res.status(400).json({ error: 'Price ID no válido' });

  try {
    // Buscar o crear customer en Stripe vinculado al email del usuario
    const { data: user } = await supabase
      .from('pilot_users')
      .select('id, email, name, stripe_customer_id')
      .eq('id', req.user.id)
      .single();

    let customerId = user?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name:  user.name || user.email,
        metadata: { pilot_user_id: req.user.id },
      });
      customerId = customer.id;
      // Guardar customer_id en Supabase
      await supabase
        .from('pilot_users')
        .update({ stripe_customer_id: customerId })
        .eq('id', req.user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: APP_URL + '?checkout=success&plan=' + STRIPE_PRICE_TO_PLAN[priceId],
      cancel_url:  APP_URL + '?checkout=cancelled',
      metadata: { pilot_user_id: req.user.id, plan: STRIPE_PRICE_TO_PLAN[priceId] },
      subscription_data: {
        metadata: { pilot_user_id: req.user.id, plan: STRIPE_PRICE_TO_PLAN[priceId] },
      },
    });

    console.log(`[Stripe] Checkout created user=${req.user.id} plan=${STRIPE_PRICE_TO_PLAN[priceId]}`);
    res.json({ url: session.url });
  } catch(e) {
    console.error('[Stripe checkout]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stripe/webhook — recibe eventos de Stripe
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }), // raw body para verificar firma
  async (req, res) => {
    if (!stripe) return res.status(500).json({ error: 'Stripe no configurado' });
    const sig    = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch(e) {
      console.error('[Stripe webhook] Firma inválida:', e.message);
      return res.status(400).json({ error: 'Webhook signature invalid' });
    }

    console.log(`[Stripe webhook] event=${event.type}`);

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId  = session.metadata?.pilot_user_id;
        const plan    = session.metadata?.plan;
        if (userId && plan && PLAN_LIMITS[plan]) {
          await supabase.from('pilot_users').update({ plan }).eq('id', userId);
          console.log(`[Stripe] ✓ Plan actualizado user=${userId} → ${plan}`);
        }
      }

      if (event.type === 'customer.subscription.deleted') {
        const sub    = event.data.object;
        const userId = sub.metadata?.pilot_user_id;
        if (userId) {
          await supabase.from('pilot_users').update({ plan: 'free' }).eq('id', userId);
          console.log(`[Stripe] ✓ Suscripción cancelada user=${userId} → free`);
        }
      }

      if (event.type === 'customer.subscription.updated') {
        const sub    = event.data.object;
        const userId = sub.metadata?.pilot_user_id;
        // Si la suscripción se pausa o cancela al final del período
        if (userId && (sub.cancel_at_period_end || sub.status === 'past_due')) {
          console.log(`[Stripe] Suscripción en riesgo user=${userId} status=${sub.status}`);
          // No bajamos el plan todavía — esperamos al deleted
        }
        // Si se reactiva
        if (userId && sub.status === 'active' && !sub.cancel_at_period_end) {
          const priceId = sub.items?.data?.[0]?.price?.id;
          const plan    = STRIPE_PRICE_TO_PLAN[priceId];
          if (plan) {
            await supabase.from('pilot_users').update({ plan }).eq('id', userId);
            console.log(`[Stripe] ✓ Suscripción reactivada user=${userId} → ${plan}`);
          }
        }
      }
    } catch(e) {
      console.error('[Stripe webhook] Error procesando evento:', e.message);
    }

    res.json({ received: true });
  }
);

// ─────────────────────────────────────────────────────────────────
// GET /api/paycheck?month=YYYY-MM
// Aggregates logbook_entries for the month and returns the data
// that pcImportFromLogbook() needs to pre-fill the PayCheck form.
// Fields returned:
//   status          : 'confirmed' | 'estimated' | 'empty'
//   block_hours     : decimal (e.g. 78.92)
//   night_hours     : decimal — sum of block for nocturnal sectors (code 2111)
//   nac_diets       : int
//   int_diets       : int
//   nac_pernoc      : int
//   int_pernoc      : int
//   flights_total   : int
//   flights_complete: int
// ─────────────────────────────────────────────────────────────────
app.get('/api/paycheck', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Base de datos no configurada' });

  const month = req.query.month; // expected: 'YYYY-MM'
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return res.status(400).json({ error: 'Parámetro month inválido — usa formato YYYY-MM' });

  try {
    const dateFrom = `${month}-01`;
    const dateTo   = `${month}-31`; // Supabase lte is fine; days > actual month end won't exist

    const { data, error } = await supabase
      .from('logbook_entries')
      .select('block, is_nocturnal, diet_type, logbook_status')
      .eq('user_id', req.user.id)
      .gte('date', dateFrom)
      .lte('date', dateTo);

    if (error) throw error;
    if (!data || data.length === 0) return res.json({ status: 'empty' });

    // HH:MM → minutes
    function toMins(t) {
      if (!t) return 0;
      const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
    }
    // minutes → decimal hours (2 dp)
    function toDecHours(mins) {
      return Math.round(mins / 60 * 100) / 100;
    }

    let blockMins = 0, nightMins = 0;
    let nac = 0, intD = 0, nacPernoc = 0, intPernoc = 0;
    let complete = 0;

    data.forEach(row => {
      const bm = toMins(row.block);
      blockMins += bm;

      // Código 2111: sector nocturno → todo el bloque cuenta como horas nocturnas
      if (row.is_nocturnal) nightMins += bm;

      switch (row.diet_type) {
        case 'nac':          nac++;       break;
        case 'int':          intD++;      break;
        case 'nac_pernoc':   nacPernoc++; break;
        case 'int_pernoc':   intPernoc++; break;
      }

      if (row.logbook_status === 'complete') complete++;
    });

    const total  = data.length;
    // 'confirmed' only if every flight has AOBT+AIBT+block recorded
    const status = complete === total ? 'confirmed' : 'estimated';

    console.log(`[Paycheck] user=${req.user.id} month=${month} total=${total} complete=${complete} status=${status}`);

    res.json({
      status,
      block_hours:      toDecHours(blockMins),
      night_hours:      toDecHours(nightMins),
      nac_diets:        nac,
      int_diets:        intD,
      nac_pernoc:       nacPernoc,
      int_pernoc:       intPernoc,
      flights_total:    total,
      flights_complete: complete,
    });
  } catch(e) {
    console.error('[Paycheck]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', rag: !!process.env.SUPABASE_URL, stripe: !!stripe, timestamp: new Date() }));

app.listen(PORT, () => {
  console.log(`PilotOS RAG Backend — http://localhost:${PORT}`);
  console.log(`   RAG: ${process.env.SUPABASE_URL ? 'Supabase OK' : 'Sin Supabase'}`);
});
