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

// Helper: single source of truth for supported platforms
// keys: lowercase route keys; values: DB column suffix before "Url"
const SUPPORTED_PLATFORMS = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  google: 'googleReview', // NEW
};
const PLATFORM_LIST = Object.keys(SUPPORTED_PLATFORMS);

// ---- helpers for form parsing ----
const isOn = (v) => {
  if (Array.isArray(v)) return v.some((x) => isOn(x));
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === '1' || s === 'on' || s === 'true';
  }
  return false;
};

const nz = (s) => {
  if (s === undefined || s === null) return null;
  if (Array.isArray(s)) s = s[s.length - 1]; // take last if duplicates
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
      instagramUrl, tiktokUrl, youtubeUrl, googleReviewUrl, // includes Google
      showLogo, qrLayout, steps,
      ctaBgColor
    } = req.body;

    const slug = (customSlug && customSlug.trim().length)
      ? customSlug.trim().toLowerCase()
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    const biz = await prisma.business.create({
      data: {
        name, slug, logoUrl: nz(logoUrl),
        brandColor: nz(brandColor),
        publicTitle: nz(publicTitle),
        publicSubtitle: nz(publicSubtitle),
        publicFooter: nz(publicFooter),
        ctaLabel: nz(ctaLabel),
        ctaText: nz(ctaText),
        instagramUrl: nz(instagramUrl),
        tiktokUrl: nz(tiktokUrl),
        youtubeUrl: nz(youtubeUrl),
        googleReviewUrl: nz(googleReviewUrl), // NEW
        showLogo: !!showLogo,
        qrLayout: (qrLayout === 'horizontal' ? 'horizontal' : 'vertical'),
        ctaBgColor: nz(ctaBgColor)
      }
    });

    // Initial steps (textarea, one per line)
    if (steps && steps.trim().length) {
      const lines = steps.split('\n').map(l => l.trim()).filter(Boolean);
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

// Save theme / CTA / steps — ADMIN ONLY
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
      instagramUrl, tiktokUrl, youtubeUrl, googleReviewUrl,  // includes Google
      enableTiktok, enableInstagram, enableYoutube, enableGoogle, // NEW
      steps
    } = req.body;

    // normalize alignment
    const alignOptions = ['left','center','right'];
    const align = alignOptions.includes((ctaLabel || '').toLowerCase())
      ? ctaLabel.toLowerCase()
      : 'left';

    // checkboxes + URLs normalized
    const tiktokFinal       = isOn(enableTiktok)    ? nz(tiktokUrl)       : null;
    const instagramFinal    = isOn(enableInstagram) ? nz(instagramUrl)    : null;
    const youtubeFinal      = isOn(enableYoutube)   ? nz(youtubeUrl)      : null;
    const googleReviewFinal = isOn(enableGoogle)    ? nz(googleReviewUrl) : null; // NEW

    await prisma.business.update({
      where: { id: biz.id },
      data: {
        name: nz(name) || biz.name,
        ctaLabel: align,
        logoBgColor: nz(logoBgColor),
        ctaColor: nz(ctaColor),
        ctaBgColor: nz(ctaBgColor),
        brandColor: nz(brandColor),
        publicTitle: nz(publicTitle),
        publicSubtitle: nz(publicSubtitle),
        publicFooter: nz(publicFooter),
        ctaText: nz(ctaText),
        showLogo: !!showLogo,
        qrLayout: (qrLayout === 'horizontal' ? 'horizontal' : 'vertical'),
        logoUrl: nz(logoUrl),

        // platforms
        instagramUrl: instagramFinal,
        tiktokUrl: tiktokFinal,
        youtubeUrl: youtubeFinal,
        googleReviewUrl: googleReviewFinal,
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

// Toggle platform enable/disable — ADMIN ONLY
app.post('/business/:slug/toggle', basicAuth, async (req, res) => {
  try {
    const biz = await prisma.business.findUnique({ where: { slug: req.params.slug } });
    if (!biz) return res.status(404).send('Not found');

    const { platform, enabled } = req.body;
    if (!PLATFORM_LIST.includes(platform)) return res.status(400).send('Invalid platform');

    const dbKey = SUPPORTED_PLATFORMS[platform] + 'Url';
    const isEnabled = enabled === 'on';

    if (!isEnabled) {
      await prisma.business.update({ where: { id: biz.id }, data: { [dbKey]: null } });
      await prisma.redirectHistory.create({
        data: { businessId: biz.id, platform: platform.toUpperCase(), fromUrl: biz[dbKey], toUrl: '' }
      });
    } else {
      const { newUrl } = req.body;
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

    await prisma.redirectHistory.deleteMany({ where: { businessId: biz.id } });
    await prisma.scanEvent.deleteMany({ where: { businessId: biz.id } });
    await prisma.step.deleteMany({ where: { businessId: biz.id } });
    await prisma.business.delete({ where: { id: biz.id } });

    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).send('Delete failed: ' + (e?.message || e));
  }
});

// ---------- POSTER VIEWS ----------

// Public flyer (no toolbar, defaults to A4)
app.get('/p/:slug', async (req, res) => {
  const biz = await prisma.business.findUnique({
    where: { slug: req.params.slug },
    include: { steps: true }
  });
  if (!biz) return res.status(404).send('Not found');
  res.render('poster', { biz, isPublic: true });
});

// ---------- Redirect + Analytics + QR ----------

// Redirect: QR target (and log scan) — PUBLIC
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

// Analytics JSON — ADMIN ONLY (avoid leaking internal stats)
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

// Dynamic QR images (stable, cached) — PUBLIC
const QR_OPTS = { errorCorrectionLevel: 'M', margin: 2, width: 800 };
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
