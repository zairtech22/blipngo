/* eslint-disable */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// --- auth middleware (expects middleware/basicAuth.js) ---
const basicAuth = require('./middleware/basicAuth');

// --- init ---
const prisma = new PrismaClient();
const app = express();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
app.locals.BASE_URL = BASE_URL;

// --- middleware & view engine ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper: supported platforms (DB column suffixes before "Url")
const SUPPORTED_PLATFORMS = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  google: 'googleReview', // kept for redirects/history; not shown on social poster
};
const PLATFORM_LIST = Object.keys(SUPPORTED_PLATFORMS);

const nz = (s) => {
  if (s === undefined || s === null) return null;
  if (Array.isArray(s)) s = s[s.length - 1];
  const v = String(s).trim();
  return v.length ? v : null;
};

// ---------------- ROUTES ----------------

// Home (list businesses) — ADMIN ONLY
app.get('/', basicAuth, async (req, res) => {
  const businesses = await prisma.business.findMany({ orderBy: { createdAt: 'desc' } });
  res.render('index', { businesses, BASE_URL });
});

// Create business — ADMIN ONLY
app.post('/business', basicAuth, async (req, res) => {
  try {
    const {
      name,
      slug: customSlug,
      logoUrl,
      brandColor,
      publicTitle, publicSubtitle, publicFooter,
      ctaLabel, ctaText,
      instagramUrl, tiktokUrl, youtubeUrl, googleReviewUrl,
      showLogo, qrLayout, steps,
      ctaBgColor, ctaColor, logoBgColor,
    } = req.body;

    if (!name || !String(name).trim()) return res.status(400).send('Name required');

    const slug = (customSlug && customSlug.trim().length)
      ? customSlug.trim().toLowerCase()
      : String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const biz = await prisma.business.create({
      data: {
        name: String(name).trim(),
        slug,
        logoUrl: nz(logoUrl),
        brandColor: nz(brandColor),
        publicTitle: nz(publicTitle),
        publicSubtitle: nz(publicSubtitle),
        publicFooter: nz(publicFooter),
        ctaLabel: nz(ctaLabel) || 'left',
        ctaText: nz(ctaText),
        instagramUrl: nz(instagramUrl),
        tiktokUrl: nz(tiktokUrl),
        youtubeUrl: nz(youtubeUrl),
        googleReviewUrl: nz(googleReviewUrl), // editable later on AI page too
        qrLayout: (qrLayout === 'horizontal' ? 'horizontal' : 'vertical'),
        ctaBgColor: nz(ctaBgColor),
        ctaColor: nz(ctaColor),
        logoBgColor: nz(logoBgColor),
      }
    });

    // Initial steps (textarea, one per line)
    if (steps && String(steps).trim().length) {
      const lines = String(steps).split('\n').map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        await prisma.step.create({
          data: { businessId: biz.id, order: i + 1, text: lines[i] }
        });
      }
    }

    res.redirect(`/business/${biz.slug}`);
  } catch (e) {
    console.error(e);
    res.status(500).send('Error creating business: ' + (e?.message || e));
  }
});

// Admin: manage business page — ADMIN ONLY
app.get('/business/:slug', basicAuth, async (req, res) => {
  const biz = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    include: { steps: true }
  });
  if (!biz) return res.status(404).send('Not found');
  res.render('business', { biz, BASE_URL });
});

// Save theme / CTA / steps — ADMIN ONLY (Option A: forgiving save)
app.post('/business/:slug/theme', basicAuth, async (req, res) => {
  try {
    const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
    if (!biz) return res.status(404).send('Not found');

    const {
      name,
      ctaLabel,
      logoBgColor,
      ctaColor,
      ctaBgColor,
      brandColor, publicTitle, publicSubtitle, publicFooter,
      ctaText, showLogo, qrLayout,
      logoUrl,
      instagramUrl, tiktokUrl, youtubeUrl, // no enable* flags
      steps
    } = req.body;

    const alignOptions = ['left','center','right'];
    const align = alignOptions.includes((ctaLabel || '').toLowerCase())
      ? ctaLabel.toLowerCase()
      : 'left';

    const instagramFinal = instagramUrl && instagramUrl.trim() ? instagramUrl.trim() : null;
    const tiktokFinal    = tiktokUrl    && tiktokUrl.trim()    ? tiktokUrl.trim()    : null;
    const youtubeFinal   = youtubeUrl   && youtubeUrl.trim()   ? youtubeUrl.trim()   : null;

    await prisma.business.update({
      where: { id: biz.id },
      data: {
        name: (name && name.trim()) || biz.name,
        ctaLabel: align,
        logoBgColor: nz(logoBgColor),
        ctaColor: nz(ctaColor),
        ctaBgColor: nz(ctaBgColor),
        brandColor: nz(brandColor),
        publicTitle: nz(publicTitle),
        publicSubtitle: nz(publicSubtitle),
        publicFooter: nz(publicFooter),
        ctaText: nz(ctaText),
        qrLayout: (qrLayout === 'horizontal' ? 'horizontal' : 'vertical'),
        logoUrl: nz(logoUrl),

        instagramUrl: instagramFinal,
        tiktokUrl:    tiktokFinal,
        youtubeUrl:   youtubeFinal,
        // googleReviewUrl is managed on the AI page now
      }
    });

    // replace steps
    await prisma.step.deleteMany({ where: { businessId: biz.id } });
    if (steps && String(steps).trim().length) {
      const lines = String(steps).split('\n').map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        await prisma.step.create({
          data: { businessId: biz.id, order: i + 1, text: lines[i] }
        });
      }
    }

    res.redirect(`/business/${biz.slug}`);
  } catch (e) {
    console.error(e);
    res.status(500).send('Theme save failed: ' + (e?.message || e));
  }
});

// Update any single platform URL (and log redirect history) — ADMIN ONLY
app.post('/business/:slug/update', basicAuth, async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).send('Not found');

  const { platform, newUrl } = req.body;
  const platKey = (platform || '').toLowerCase();
  if (!PLATFORM_LIST.includes(platKey)) return res.status(400).send('Invalid platform');

  const dbKey = SUPPORTED_PLATFORMS[platKey] + 'Url';
  const current = biz[dbKey];
  const data = {}; data[dbKey] = nz(newUrl);

  await prisma.$transaction([
    prisma.redirectHistory.create({
      data: { businessId: biz.id, platform: platKey.toUpperCase(), fromUrl: current, toUrl: data[dbKey] || '' }
    }),
    prisma.business.update({ where: { id: biz.id }, data })
  ]);

  res.redirect(`/business/${biz.slug}`);
});

// Toggle platform enable/disable — ADMIN ONLY (kept for compatibility)
app.post('/business/:slug/toggle', basicAuth, async (req, res) => {
  try {
    const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
    if (!biz) return res.status(404).send('Not found');

    const { platform, enabled, newUrl } = req.body;
    if (!PLATFORM_LIST.includes(platform)) return res.status(400).send('Invalid platform');

    const dbKey = SUPPORTED_PLATFORMS[platform] + 'Url';
    const isEnabled = enabled === 'on';

    if (!isEnabled) {
      await prisma.business.update({ where: { id: biz.id }, data: { [dbKey]: null } });
      await prisma.redirectHistory.create({
        data: { businessId: biz.id, platform: platform.toUpperCase(), fromUrl: biz[dbKey], toUrl: '' }
      });
    } else {
      const toUrl = nz(newUrl) || biz[dbKey];
      if (!toUrl) return res.status(400).send('Provide a URL to enable this platform.');
      await prisma.business.update({ where: { id: biz.id }, data: { [dbKey]: toUrl } });
      await prisma.redirectHistory.create({
        data: { businessId: biz.id, platform: platform.toUpperCase(), fromUrl: biz[dbKey], toUrl }
      });
    }

    res.redirect(`/business/${biz.slug}`);
  } catch (e) {
    console.error(e);
    res.status(500).send('Toggle failed: ' + (e?.message || e));
  }
});

// Delete business — ADMIN ONLY
app.post('/business/:slug/delete', basicAuth, async (req, res) => {
  try {
    const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
    if (!biz) return res.status(404).send('Not found');

    await prisma.$transaction([
      prisma.aiReviewConfig.deleteMany({ where: { businessId: biz.id } }), // <-- delete AI config first
      prisma.redirectHistory.deleteMany({ where: { businessId: biz.id } }),
      prisma.scanEvent.deleteMany({ where: { businessId: biz.id } }),
      prisma.step.deleteMany({ where: { businessId: biz.id } }),
      prisma.business.delete({ where: { id: biz.id } }),
    ]);

    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).send('Delete failed: ' + (e?.message || e));
  }
});

// ---------- POSTER VIEWS ----------

// Admin preview (toolbar, A4/Letter toggle)
app.get('/poster/:slug', async (req, res) => {
  const biz = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    include: { steps: true }
  });
  if (!biz) return res.status(404).send('Not found');
  res.render('poster', { biz, isPublic: false });
});

// Public flyer (no toolbar, defaults to A4)
app.get('/p/:slug', async (req, res) => {
  const biz = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    include: { steps: true }
  });
  if (!biz) return res.status(404).send('Not found');
  res.render('poster', { biz, isPublic: true });
});

// ---------- AI REVIEW ADMIN + POSTER ----------

// Ensure AiReviewConfig exists for a business
async function ensureAiConfig(bizId) {
  let cfg = await prisma.aiReviewConfig.findUnique({ where: { businessId: bizId } });
  if (!cfg) {
    cfg = await prisma.aiReviewConfig.create({
      data: {
        businessId: bizId,
        platform: 'google',
        defaultTone: 'friendly',
        defaultLength: 'short',
        headline: 'We’ll draft it for you — edit & paste',
        disclaimer: 'Reviews are optional and appreciated.',
        llmEnabled: false,
      }
    });
  }
  return cfg;
}

// Admin UI to edit AI poster settings
app.get('/admin/ai/:slug', basicAuth, async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).send('Business not found');

  const cfg = await ensureAiConfig(biz.id);
  const targetUrl = biz.googleReviewUrl || null;

  res.render('ai_admin', { biz, cfg, targetUrl, BASE_URL });
});

// Save AI settings (+ editable Google link with history log)
app.post('/admin/ai/:slug/save', basicAuth, async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).send('Business not found');

  const {
    platform,
    defaultTone,
    defaultLength,
    headline,
    disclaimer,
    llmEnabled,
    llmProvider,
    llmModel,
    llmSystem,
    llmTemp,
    googleReviewUrl, // editable from AI Settings page
  } = req.body;

  const newGoogleUrl = (googleReviewUrl || '').trim() || null;

  await ensureAiConfig(biz.id);

  const tx = [];

  // Update AI config (idempotent)
  tx.push(
    prisma.aiReviewConfig.update({
      where: { businessId: biz.id },
      data: {
        platform: (platform || 'google').toLowerCase(),
        defaultTone: nz(defaultTone),
        defaultLength: nz(defaultLength),
        headline: nz(headline),
        disclaimer: nz(disclaimer),
        llmEnabled: !!llmEnabled,
        llmProvider: nz(llmProvider),
        llmModel: nz(llmModel),
        llmSystem: nz(llmSystem),
        llmTemp: (typeof llmTemp !== 'undefined' && llmTemp !== null && String(llmTemp).trim() !== '') ? Number(llmTemp) : null,
      }
    })
  );

  // If Google link changed, log redirect history and update Business
  if (newGoogleUrl !== (biz.googleReviewUrl || null)) {
    tx.push(
      prisma.redirectHistory.create({
        data: {
          businessId: biz.id,
          platform: 'GOOGLE',
          fromUrl: biz.googleReviewUrl || null,
          toUrl: newGoogleUrl || '',
        }
      })
    );
    tx.push(
      prisma.business.update({
        where: { id: biz.id },
        data: { googleReviewUrl: newGoogleUrl }
      })
    );
  }

  await prisma.$transaction(tx);
  res.redirect(`/admin/ai/${biz.slug}`);
});

// AI Review helper form (public)
app.get('/ai-review/:slug', async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).send('Business not found');

  const cfg = await prisma.aiReviewConfig.findUnique({ where: { businessId: biz.id } });
  const platform = String(req.query.platform || cfg?.platform || 'google').toLowerCase();

  const platformTargets = {
    google: biz.googleReviewUrl || null,
  };
  const targetUrl = platformTargets[platform] || null;

  // lightweight analytics
  await prisma.scanEvent.create({
    data: {
      businessId: biz.id,
      platform: `AI_REVIEW_${platform.toUpperCase()}`,
      userAgent: req.headers['user-agent'] || null
    }
  });

  res.render('ai_review_form', {
    biz, platform, targetUrl, BASE_URL,
    defaultTone: cfg?.defaultTone, defaultLength: cfg?.defaultLength,
    headline: cfg?.headline, disclaimer: cfg?.disclaimer
  });
});

// AI Review: Generate a draft (templated for now)
app.post('/ai-review/:slug/generate', async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).json({ error: 'Business not found' });

  const { rating = 5, order = '', highlights = '', tone = 'friendly', length = 'short', extras = '' } = req.body || {};

  const r = Math.max(1, Math.min(5, parseInt(rating, 10) || 5));
  const stars = '★'.repeat(r);
  const lenMap = { short: 40, medium: 80, long: 140 };
  const targetLen = lenMap[length] || 80;

  const bits = [
    `I had a${r>=4?' fantastic':r>=3?' solid':' mixed'} experience at ${biz.name}.`,
    order ? `I ordered ${order}.` : '',
    highlights ? `${highlights}.` : '',
    extras ? `${extras}.` : '',
    `Overall: ${stars}/★★★★★.`
  ].filter(Boolean).join(' ');

  const toned =
    tone === 'professional'
      ? bits.replace(/fantastic|solid|mixed/gi, m => ({ fantastic: 'excellent', solid: 'good', mixed: 'adequate' }[m.toLowerCase()] || m))
      : tone === 'enthusiastic'
        ? bits + ' Highly recommend!'
        : bits;

  let draft = toned;
  if (draft.length > targetLen) draft = draft.slice(0, targetLen).replace(/\s+\S*$/,'') + '…';

  res.json({ draft });
});

// AI Review Poster (public)
app.get('/ai-poster/:slug/:platform', async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).send('Not found');
  const cfg = await prisma.aiReviewConfig.findUnique({ where: { businessId: biz.id } });
  const platform = String(req.params.platform || cfg?.platform || 'google').toLowerCase();
  res.render('poster_ai_review', { biz, platform, BASE_URL, headline: cfg?.headline });
});

// ---------- Redirect + Analytics + QR ----------

// QR for AI poster
const QR_OPTS_AI = { errorCorrectionLevel: 'M', margin: 2, width: 800 };
app.get('/qr/ai/:slug/:platform.png', async (req, res) => {
  const { slug, platform } = req.params;
  const biz = await prisma.business.findUnique({ where: { slug } });
  if (!biz) return res.status(404).send('Not found');

  const urlToEncode = `${BASE_URL}/ai-review/${biz.slug}?platform=${encodeURIComponent(String(platform).toLowerCase())}`;
  try {
    const buf = await QRCode.toBuffer(urlToEncode, QR_OPTS_AI);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).send('QR error');
  }
});

// Redirect: QR target (and log scan) — PUBLIC (social & google redirect)
const QR_OPTS = { errorCorrectionLevel: 'M', margin: 2, width: 800 };
app.get('/r/:slug/:platform', async (req, res) => {
  const plat = (req.params.platform || '').toLowerCase();
  if (!PLATFORM_LIST.includes(plat)) return res.status(400).send('Invalid platform');

  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).send('Not found');

  const dbKey = SUPPORTED_PLATFORMS[plat] + 'Url';
  const target = biz[dbKey];
  if (!target) return res.redirect(`/p/${biz.slug}`);

  const ua = req.headers['user-agent'] || null;
  const ipRaw = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
  const ip = ipRaw.split(',')[0].trim();
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;
  const referer = req.headers['referer'] || null;

  await prisma.scanEvent.create({
    data: { businessId: biz.id, platform: plat.toUpperCase(), userAgent: ua, ipHash, referer }
  });

  res.redirect(target);
});

// Analytics JSON — ADMIN ONLY
app.get('/business/:slug/analytics.json', basicAuth, async (req, res) => {
  const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
  if (!biz) return res.status(404).json({ error: 'Not found' });
  const rows = await prisma.scanEvent.groupBy({
    by: ['platform'],
    _count: { _all: true },
    where: { businessId: biz.id }
  });
  res.json({ business: biz.slug, counts: rows.map(r => ({ platform: r.platform, count: r._count._all })) });
});

// QR for social poster
app.get('/qr/:slug/:platform.png', async (req, res) => {
  const { slug, platform } = req.params;
  if (!PLATFORM_LIST.includes(platform)) return res.status(400).send('Invalid platform');

  const biz = await prisma.business.findUnique({ where: { slug } });
  if (!biz) return res.status(404).send('Not found');

  const urlToEncode = `${BASE_URL}/r/${biz.slug}/${platform}`;
  try {
    const buf = await QRCode.toBuffer(urlToEncode, QR_OPTS);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).send('QR error');
  }
});

// --- start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
});
