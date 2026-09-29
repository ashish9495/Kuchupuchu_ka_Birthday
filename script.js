/* ==========================================================================
   💗 HER BIRTHDAY WORLD — script.js
   --------------------------------------------------------------------------
   0.  CONFIG ← ✏️ everything you'll want to tweak lives here
   1.  Utilities
   2.  AudioManager (background music + VOLUME DUCKING logic)
   3.  Gift start screen
   4.  Floating countdown
   5.  Ambient effects (floating hearts, cursor sparkles, scroll reveal, confetti)
   6.  Section 1 · Apology
   7.  Section 2 · Wardrobe (DRESS-UP GAME logic)
   8.  Magic Door transition
   9.  Section 3 · Midnight Drive (scroll-driven scenery)
   10. Section 4 · Sugarless Café (+ touch-me-not plant)
   11. Section 5 · Cozy Lounge (LED TV, 6 channels, popup notes, treasure chest)
   11½. Section 6 · Our First Album (photo scrapbook + viewer)
   11¾. Section 7 · Our Story on the Big Screen (Times Square billboard)
   11⅞. Section 8 · Her New Chapter (new job: charms, hurdle run, promise)
   12a. Daya's aarti (animated corner scene in the finale)
   12. Section 9 · Finale video
   13. Boot
   ========================================================================== */
'use strict';

/* ==========================================================================
   0. CONFIG  ✏️
   ========================================================================== */
const CONFIG = {
  // Her name / nickname — shown in the finale title and NYC billboard
  HER_NAME: 'My Love',

  // 🎂 HER BIRTHDAY — format: 'YYYY-MM-DDTHH:MM:SS' in YOUR local time.
  // ⚠️ REPLACE THIS with the real date (midnight of her birthday).
  BIRTHDAY: '2026-10-22T00:00:00',

  // Section 1 texts
  APOLOGY_TEXT: "I'm sorry about our fight... to make it up to you, I made this special birthday world just for you! 😊",
  FORGIVEN_TEXT: 'Yayyy! 🥹💗 Okay birthday girl, first things first — let\'s get you dressed…',
  NO_BUTTON_DODGES: 4,        // how many times "no" runs away before giving up

  // 🔊 AUDIO DUCKING
  AUDIO: {
    NORMAL_VOLUME: 0.5,       // music volume normally (0 = silent, 1 = max)
    DUCKED_VOLUME: 0.05,      // music volume while any video plays (0.05 = 5%, 0.1 = 10%)
    FADE_MS: 700,             // how long the volume fade takes (milliseconds)
  },

  // Finale: auto-play the Jethalal video when it scrolls into view
  FINALE_AUTOPLAY: true,

  // Midnight Drive — OPTIONAL real photos instead of the CSS scenery.
  // Leave '' to use the drawn scenery. Example: city: 'PLACEHOLDER_SCENE_CITY.jpg'
  SCENERY_IMAGES: { city: '', aurora: '', paris: '', nyc: '' },

  CURSOR_SPARKLES: true,      // little sparkles following the mouse (desktop)
  FLOATING_HEARTS: true,      // hearts/petals floating up the page
};


/* ==========================================================================
   1. UTILITIES
   ========================================================================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const rand    = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp   = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls onMissing if an <img> fails to load (works even if it already failed). */
function watchImage(img, onMissing) {
  if (!img) return;
  const rescuing = img.dataset.rescue && img.dataset.rescue !== 'failed';   // being re-fetched (see ASSET RESCUE in index.html)
  if (!rescuing && img.complete && img.naturalWidth === 0) onMissing(img);
  img.addEventListener('error', () => onMissing(img), { once: true });
}

/**
 * VIDEO / AUDIO LOADING — robust across browsers
 * 1. The file is played straight from its own URL first.
 * 2. Only if that fails with a real error (e.g. iPhone Safari on a host that
 *    doesn't support "range" requests) do we download it once and retry it
 *    as an in-memory blob.
 * 3. Only if BOTH fail is the "missing clip" placeholder shown — and it is
 *    removed again the moment the media loads.
 */
function mediaUrl(media) {
  const source = $('source', media);
  return media.dataset.src || (source && source.getAttribute('src')) || media.getAttribute('src');
}
function recoverWithBlob(media) {
  if (media.dataset.blobTried || !/^https?:$/.test(location.protocol)) return Promise.resolve(false);
  media.dataset.blobTried = '1';
  const url = mediaUrl(media);
  if (!url) return Promise.resolve(false);
  return fetch(url)
    .then(r => (r.ok ? r.blob() : Promise.reject(new Error('HTTP ' + r.status))))
    .then(blob => new Promise(resolve => {
      const done = ok => { media.removeEventListener('loadeddata', onOk); media.removeEventListener('error', onErr); resolve(ok); };
      const onOk = () => done(true), onErr = () => done(false);
      media.addEventListener('loadeddata', onOk);
      media.addEventListener('error', onErr);
      media.src = URL.createObjectURL(blob);
      media.load();
    }))
    .catch(() => false);
}
/** onMissing() when a clip truly can't load, onReady() whenever it does load. */
function watchVideoSource(media, onMissing, onReady = () => {}) {
  media.dataset.src = mediaUrl(media) || '';
  let handling = false;
  const fail = () => {
    if (handling) return;
    handling = true;
    recoverWithBlob(media).then(ok => { handling = false; if (!ok) onMissing(); });
  };
  const source = $('source', media);
  if (source) source.addEventListener('error', fail);
  media.addEventListener('error', fail);
  media.addEventListener('loadeddata', onReady);
  media.addEventListener('playing', onReady);
}

let toastTimer;
function showToast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Restart a CSS animation class on an element. */
function replayClass(el, cls, removeAfter) {
  el.classList.remove(cls);
  void el.offsetWidth;          // forces a reflow so the animation restarts
  el.classList.add(cls);
  if (removeAfter) setTimeout(() => el.classList.remove(cls), removeAfter);
}


/* ==========================================================================
   2. AUDIO MANAGER — background music + volume ducking
   --------------------------------------------------------------------------
   HOW DUCKING WORKS
   • Anything that needs quiet music calls  AudioManager.duck('some-name')
     and later                              AudioManager.release('some-name').
   • We keep a Set of active "reasons". If the set is NOT empty the music
     fades to AUDIO.DUCKED_VOLUME, otherwise back to AUDIO.NORMAL_VOLUME.
   • Every video is hooked with AudioManager.watchVideo(video, name):
     play → duck, pause/ended → release. So TV channels + the finale all
     duck automatically, and overlapping videos never fight each other.
   • iPhone/iPad Safari does NOT allow JavaScript to change volume. We
     detect that and PAUSE the music while ducked instead, then resume.
   ========================================================================== */
const AudioManager = (() => {
  const music  = $('#bg-music');
  const btn    = $('#music-toggle');
  const songBtn = $('#song-play-btn');                 // "Play our song" button in the interlude
  const reasons = new Set();
  let fadeRaf = null;
  let wantPlaying = false;       // does she want music on? (music button)
  let volumeLocked = false;      // true on iOS (volume is read-only there)

  // --- detect iOS-style locked volume ---
  try {
    music.volume = 0.42;
    volumeLocked = Math.abs(music.volume - 0.42) > 0.01;
  } catch (e) { volumeLocked = true; }

  const targetVolume = () => (reasons.size ? CONFIG.AUDIO.DUCKED_VOLUME : CONFIG.AUDIO.NORMAL_VOLUME);

  /** Smoothly animate music.volume to `to` (ease-in-out). */
  function fadeTo(to, ms = CONFIG.AUDIO.FADE_MS) {
    cancelAnimationFrame(fadeRaf);
    const from = music.volume;
    const t0 = performance.now();
    const step = now => {
      const k = clamp((now - t0) / ms, 0, 1);
      const eased = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      music.volume = clamp(from + (to - from) * eased, 0, 1);
      if (k < 1) fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  }

  /** Re-evaluate what the music should be doing right now. */
  function apply() {
    if (!wantPlaying) return;
    if (volumeLocked) {                       // iOS fallback: pause instead of lowering
      if (reasons.size) music.pause();
      else music.play().catch(() => {});
      return;
    }
    fadeTo(targetVolume());
  }

  function updateButton() {
    btn.classList.toggle('playing', wantPlaying);
    btn.setAttribute('aria-pressed', String(wantPlaying));
    if (songBtn) songBtn.textContent = wantPlaying ? '❚❚ Pause our song' : '▶ Play our song';
  }
  // body.music-on makes the record spin (style.css → Interlude)
  music.addEventListener('playing', () => { document.body.classList.add('music-on'); if (wantPlaying) apply(); });
  music.addEventListener('pause',   () => document.body.classList.remove('music-on'));
  watchVideoSource(music, () => {}, () => {});        // same rescue path for the song

  function start() {
    wantPlaying = true;
    if (!volumeLocked) music.volume = 0;      // start silent, then fade in
    const shouldWaitForDuck = volumeLocked && reasons.size;
    if (shouldWaitForDuck) { updateButton(); return; }
    music.play()
      .then(() => { apply(); updateButton(); })
      .catch(() => {
        const src = $('source', music);
        if (src && src.dataset.rescue && src.dataset.rescue !== 'failed') { updateButton(); return; }   // still loading → plays by itself
        wantPlaying = false; updateButton();
        showToast('🎵 Keep hua_main_song.mp3 next to index.html to hear the music', 3800);
      });
  }

  function stop() {
    wantPlaying = false;
    cancelAnimationFrame(fadeRaf);
    music.pause();
    updateButton();
  }

  const toggle = () => (wantPlaying ? stop() : start());
  btn.addEventListener('click', toggle);
  if (songBtn) songBtn.addEventListener('click', toggle);

  return {
    start,
    toggle,
    duck(reason)    { reasons.add(reason);    apply(); },
    release(reason) { reasons.delete(reason); apply(); },
    /** Hook a video so it ducks the music while it plays. */
    watchVideo(video, name) {
      video.addEventListener('play',  () => this.duck(name));
      video.addEventListener('pause', () => this.release(name));
      video.addEventListener('ended', () => this.release(name));
    },
  };
})();


/* ==========================================================================
   3. GIFT START SCREEN
   (Browsers block music until the visitor clicks something — this is it.)
   ========================================================================== */
function initGift() {
  const overlay = $('#gift-overlay');
  $('#open-gift-btn').addEventListener('click', () => {
    AudioManager.start();
    overlay.classList.add('opening');
    confettiBurst(70);
    setTimeout(() => {
      overlay.classList.add('gone');
      document.body.classList.remove('locked');
      Apology.begin();
    }, 1000);
    setTimeout(() => overlay.remove(), 2000);
  }, { once: true });
}


/* ==========================================================================
   4. FLOATING COUNTDOWN
   ========================================================================== */
function initCountdown() {
  const target = new Date(CONFIG.BIRTHDAY).getTime();
  const box = $('#countdown');
  const title = $('#cd-title');
  const els = { d: $('#cd-days'), h: $('#cd-hours'), m: $('#cd-mins'), s: $('#cd-secs') };
  const pad = n => String(n).padStart(2, '0');
  let timer;

  if (Number.isNaN(target)) { title.textContent = '✏️ set her birthday in script.js'; return; }

  function set(el, value) {
    if (el.textContent !== value) { el.textContent = value; replayClass(el, 'tick'); }
  }

  function tick() {
    const diff = target - Date.now();
    if (diff <= 0) {
      box.classList.add('is-today');
      title.textContent = "🎉 It's your birthday! 🎉";
      clearInterval(timer);
      return;
    }
    const total = Math.floor(diff / 1000);
    set(els.d, pad(Math.floor(total / 86400)));
    set(els.h, pad(Math.floor((total % 86400) / 3600)));
    set(els.m, pad(Math.floor((total % 3600) / 60)));
    set(els.s, pad(total % 60));
  }
  tick();
  timer = setInterval(tick, 1000);
}


/* ==========================================================================
   5. AMBIENT EFFECTS
   ========================================================================== */
function initFloaties() {
  if (!CONFIG.FLOATING_HEARTS || REDUCED_MOTION) return;
  const layer = $('#floaty-layer');
  const shapes = ['♡', '✿', '✦', '❀', '♥'];
  const colors = ['#ffb0cb', '#ff8db4', '#ffd0e0', '#f5679a', '#fff'];
  setInterval(() => {
    if (document.hidden || layer.childElementCount > 18) return;
    const f = document.createElement('span');
    f.className = 'floaty';
    f.textContent = pick(shapes);
    f.style.left = rand(0, 100) + 'vw';
    f.style.fontSize = rand(12, 26) + 'px';
    f.style.color = pick(colors);
    f.style.setProperty('--dur', rand(11, 19) + 's');
    f.style.setProperty('--sway', rand(-60, 60) + 'px');
    f.style.setProperty('--rot', rand(-200, 200) + 'deg');
    layer.appendChild(f);
    f.addEventListener('animationend', () => f.remove());
  }, 1100);
}

function initCursorSparkles() {
  if (!CONFIG.CURSOR_SPARKLES || REDUCED_MOTION) return;
  let last = 0;
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - last < 45) return;
    last = now;
    const s = document.createElement('span');
    s.className = 'cursor-sparkle';
    s.textContent = pick(['✦', '♡', '✧']);
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';
    document.body.appendChild(s);
    s.addEventListener('animationend', () => s.remove());
  });
}

function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.15 });
  $$('.reveal').forEach(el => io.observe(el));
}

/** Confetti rain from the top of the screen. */
function confettiBurst(count = 80) {
  if (REDUCED_MOTION) count = Math.min(count, 15);
  const colors = ['#ff8db4', '#ffd0e0', '#ffffff', '#f5679a', '#e9b949', '#ffb3cf'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'confetti' + (Math.random() < .3 ? ' round' : '');
    p.style.left = rand(0, 100) + 'vw';
    p.style.background = pick(colors);
    p.style.setProperty('--dur', rand(2.2, 4.2) + 's');
    p.style.setProperty('--sway', rand(-90, 90) + 'px');
    p.style.setProperty('--spin', rand(360, 1080) + 'deg');
    p.style.animationDelay = rand(0, .7) + 's';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 5200);
  }
}

/** Hearts shooting out of an element. */
function heartBurst(el, count = 14) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const h = document.createElement('span');
    h.className = 'burst-heart';
    h.textContent = pick(['💗', '💖', '💕', '♡']);
    h.style.left = r.left + r.width / 2 + 'px';
    h.style.top = r.top + r.height / 2 + 'px';
    const angle = rand(0, Math.PI * 2), dist = rand(80, 200);
    h.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    h.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    document.body.appendChild(h);
    h.addEventListener('animationend', () => h.remove());
  }
}

/** Fairy-light string: bulbs hanging along a curve (used in café + lounge). */
function buildFairyLights(container, count) {
  const sag = 16, ctrl = sag * 2 - 2, h = sag + 4;
  container.innerHTML = `<svg class="fl-wire" viewBox="0 0 100 ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 2 Q50 ${ctrl} 100 2" vector-effect="non-scaling-stroke"/></svg>`;
  const colors = ['#fff3b0', '#ffb0cb', '#ffffff', '#ffd27a', '#ff8db4'];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = (1 - t) ** 2 * 2 + 2 * (1 - t) * t * ctrl + t * t * 2;   // point on the curve
    const b = document.createElement('span');
    b.className = 'bulb';
    b.style.left = t * 100 + '%';
    b.style.top = (y / h) * 100 + '%';
    b.style.setProperty('--c', colors[i % colors.length]);
    b.style.setProperty('--delay', rand(0, 2.4) + 's');
    container.appendChild(b);
  }
}


/* ==========================================================================
   6. SECTION 1 · APOLOGY
   ========================================================================== */
const Apology = (() => {
  const portrait = $('#my-portrait');
  const textEl   = $('#apology-text');
  const actions  = $('#apology-actions');
  const yesBtn   = $('#forgive-btn');
  const noBtn    = $('#no-btn');
  const NO_LINES = ['Are you sure? 🥺', 'Pleeease? 🥹', 'Pretty please? 👉👈', 'Last chance… 🥺'];
  let started = false, dodges = 0, forgiven = false, moodTimer;

  /** Swap your face: 'smile' (start) · 'sad' (she says no) · 'love' (she forgives) */
  function setMood(mood, backToSmileAfter) {
    clearTimeout(moodTimer);
    portrait.dataset.mood = mood;
    if (backToSmileAfter) moodTimer = setTimeout(() => { if (!forgiven) portrait.dataset.mood = 'smile'; }, backToSmileAfter);
  }

  // show the cartoon fallback if your Ghibli image isn't added yet
  watchImage($('#my-face-img'), () => portrait.classList.add('img-missing'));

  /** Typewriter effect. Array.from keeps emojis intact. */
  function typeText(el, text, speed = 38) {
    return new Promise(resolve => {
      const chars = Array.from(text);
      let i = 0;
      el.textContent = '';
      el.classList.add('typing');
      const t = setInterval(() => {
        el.textContent += chars[i++];
        if (i >= chars.length) { clearInterval(t); el.classList.remove('typing'); resolve(); }
      }, REDUCED_MOTION ? 0 : speed);
    });
  }

  async function begin() {
    if (started) return;
    started = true;
    await typeText(textEl, CONFIG.APOLOGY_TEXT);
    actions.classList.add('show');
  }

  /** The "no" button runs away (a few times) 😤 */
  function dodge() {
    dodges++;
    setMood('sad', 2600);
    if (dodges >= CONFIG.NO_BUTTON_DODGES) {
      noBtn.style.transform = '';
      noBtn.textContent = 'Okay fine… YES 🥹';
      return;
    }
    const x = rand(-110, 110), y = rand(-60, 30);
    noBtn.style.transform = `translate(${x}px, ${y}px) rotate(${rand(-10, 10)}deg)`;
    noBtn.textContent = NO_LINES[(dodges - 1) % NO_LINES.length];
  }

  function forgive() {
    if (forgiven) return;
    forgiven = true;
    setMood('love');
    portrait.classList.add('forgiven');
    heartBurst(portrait, 20);
    actions.classList.remove('show');
    typeText(textEl, CONFIG.FORGIVEN_TEXT, 28).then(() => {
      setTimeout(() => $('#wardrobe').scrollIntoView({ behavior: 'smooth' }), 900);
    });
  }

  noBtn.addEventListener('pointerenter', e => {
    if (e.pointerType === 'mouse' && dodges < CONFIG.NO_BUTTON_DODGES) dodge();
  });
  noBtn.addEventListener('click', () => (dodges < CONFIG.NO_BUTTON_DODGES ? dodge() : forgive()));
  // just hovering over "no" already makes you sad 🥺
  noBtn.addEventListener('pointerenter', () => { if (!forgiven) setMood('sad', 2600); });
  yesBtn.addEventListener('click', forgive);

  return { begin };
})();


/* ==========================================================================
   7. SECTION 2 · WARDROBE — DRESS-UP GAME
   --------------------------------------------------------------------------
   HOW IT WORKS
   • Her body is one SVG (index.html → #character-svg, 200×460 units).
   • Clothes are GENERATED to fit that body:
        makeTop(options)   → every top in the "Types of Tops" chart
        makeJeans(options) → every pair of jeans
     so a new item is usually ONE line in TOPS / JEANS below.
   • Each item returns up to 3 LAYERS so they stack right:
        bottom → over the legs      top → over the torso      over → over the ARMS (sleeves, layers, pallu)
   • state = { top, bottom, saree }. Sarees replace top+bottom; picking a
     top/bottom takes the saree off. Tapping a worn item takes it off.
   ========================================================================== */

/* ---------- 7a. BODY MEASUREMENTS ----------
   Clothes are generated to fit her body. HALF_W = half-width of her torso at
   each height (character viewBox is 200 × 460, centre line x = 100).       */
const SKIN = '#f2be92';
const HALF_W = [[104, 14], [108, 26], [112, 31], [118, 30], [124, 27], [130, 26], [142, 25], [152, 24.2], [158, 23.5],
                [168, 21], [176, 19.2], [180, 18.5], [188, 19.6], [196, 21.5], [204, 24], [214, 26], [232, 27], [240, 27]];
function lerpTable(tbl, y) {
  if (y <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) {
    if (y <= tbl[i][0]) { const [y0, v0] = tbl[i - 1], [y1, v1] = tbl[i]; return v0 + (v1 - v0) * (y - y0) / (y1 - y0); }
  }
  return tbl[tbl.length - 1][1];
}
const halfW = y => lerpTable(HALF_W, y);
const mirrorPts = pts => pts.map(([x, y]) => [200 - x, y]);
const f1 = n => Math.round(n * 10) / 10;

/** Smooth closed path through points (Catmull-Rom → cubic Bézier). */
function smoothPath(pts, closed = true, k = 0.18) {
  const n = pts.length, P = i => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) * k)} ${f1(p1[1] + (p2[1] - p0[1]) * k)} ${f1(p2[0] - (p3[0] - p1[0]) * k)} ${f1(p2[1] - (p3[1] - p1[1]) * k)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + (closed ? ' Z' : '');
}
const linePath = (pts, closed) => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L') + (closed ? ' Z' : '');

/** Darken (amt < 0) or lighten (amt > 0) a hex colour. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
  return '#' + c.map(v => Math.round(v + (t - v) * a).toString(16).padStart(2, '0')).join('');
}

/* ---------- 7b. FABRIC PATTERNS (added once to the SVG <defs>) ---------- */
const FABRIC_DEFS = `
  <linearGradient id="clothShade" gradientUnits="userSpaceOnUse" x1="68" y1="0" x2="132" y2="0">
    <stop offset="0" stop-color="#3a1428" stop-opacity=".2"/><stop offset=".22" stop-color="#3a1428" stop-opacity="0"/>
    <stop offset=".78" stop-color="#3a1428" stop-opacity="0"/><stop offset="1" stop-color="#3a1428" stop-opacity=".22"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity=".45"/>
    <stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="velvetSheen" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#8a5a9e" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <pattern id="pat-rib" patternUnits="userSpaceOnUse" width="3" height="10"><path d="M1.5 0 V10" stroke="#000" stroke-opacity=".1" stroke-width=".8"/></pattern>
  <pattern id="pat-cord" patternUnits="userSpaceOnUse" width="2.6" height="10"><path d="M1.3 0 V10" stroke="#3a2010" stroke-opacity=".3" stroke-width="1"/></pattern>
  <pattern id="pat-rugby" patternUnits="userSpaceOnUse" width="10" height="16"><rect width="10" height="6" fill="#26305a"/><rect y="9" width="10" height="2.5" fill="#8fa7d6"/></pattern>
  <pattern id="pat-plaidRed" patternUnits="userSpaceOnUse" width="16" height="16"><rect width="6" height="16" fill="#123a24" opacity=".5"/><rect width="16" height="6" fill="#123a24" opacity=".5"/><path d="M11 0 V16 M0 11 H16" stroke="#f3c64a" stroke-width=".7" opacity=".8"/><path d="M3 0 V16 M0 3 H16" stroke="#000" stroke-width=".6" opacity=".35"/></pattern>
  <pattern id="pat-plaidBW" patternUnits="userSpaceOnUse" width="14" height="14"><rect width="5" height="14" fill="#1a1a1a" opacity=".75"/><rect width="14" height="5" fill="#1a1a1a" opacity=".75"/><path d="M9.5 0 V14 M0 9.5 H14" stroke="#1a1a1a" stroke-width=".8" opacity=".6"/></pattern>
  <pattern id="pat-floral" patternUnits="userSpaceOnUse" width="14" height="14"><g fill="#c9737a"><circle cx="4" cy="3" r="1.4"/><circle cx="5.6" cy="4.4" r="1.4"/><circle cx="3.4" cy="5" r="1.4"/></g><circle cx="4.4" cy="4.2" r=".7" fill="#e8b84a"/><g fill="#7a8a5a"><circle cx="11" cy="10" r="1.2"/><circle cx="12.2" cy="11.4" r="1.1"/></g><circle cx="9" cy="12" r=".7" fill="#b86a4a"/></pattern>
  <pattern id="pat-floralGold" patternUnits="userSpaceOnUse" width="18" height="18"><g fill="#8a5a2a" opacity=".75"><path d="M5 2 q2 3 0 6 q-2 -3 0 -6z"/><path d="M1 5 q3 -2 6 0 q-3 2 -6 0z"/></g><g fill="#f7ecd0"><circle cx="13" cy="12" r="1.6"/><circle cx="15" cy="14" r="1.2"/></g><circle cx="10" cy="4" r="1" fill="#b8402f" opacity=".6"/></pattern>
  <pattern id="pat-lace" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="3" cy="3" r="2.2" fill="none" stroke="#8a7a70" stroke-opacity=".35" stroke-width=".5"/><circle cx="0" cy="0" r=".7" fill="#8a7a70" fill-opacity=".3"/><circle cx="6" cy="6" r=".7" fill="#8a7a70" fill-opacity=".3"/></pattern>
  <pattern id="pat-sequin" patternUnits="userSpaceOnUse" width="3" height="3"><circle cx=".8" cy=".8" r=".75" fill="#fff6cf" opacity=".9"/><circle cx="2.3" cy="2.3" r=".75" fill="#7a5214" opacity=".45"/><circle cx="2.3" cy=".8" r=".5" fill="#ffe28a" opacity=".7"/></pattern>
  <pattern id="pat-denim" patternUnits="userSpaceOnUse" width="3" height="3"><path d="M0 3 L3 0" stroke="#fff" stroke-opacity=".14" stroke-width=".6"/></pattern>
  <pattern id="pat-chambray" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="1" height="1" fill="#fff" opacity=".2"/></pattern>
  <pattern id="pat-linen" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0 1 H4 M1 0 V4" stroke="#8a7a60" stroke-opacity=".12" stroke-width=".5"/></pattern>
  <pattern id="pat-dots" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="3" cy="3" r="1.1" fill="#26222a"/></pattern>
  <pattern id="pat-mesh" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0 0 L4 4 M4 0 L0 4" stroke="#1a141d" stroke-width=".7"/></pattern>
  <pattern id="pat-acid" patternUnits="userSpaceOnUse" width="26" height="30"><g fill="#fff" opacity=".28"><ellipse cx="6" cy="6" rx="5" ry="3"/><ellipse cx="18" cy="16" rx="6" ry="3.4"/><ellipse cx="8" cy="24" rx="4" ry="2.4"/></g></pattern>
  <pattern id="pat-twill" patternUnits="userSpaceOnUse" width="3" height="3"><path d="M0 3 L3 0" stroke="#000" stroke-opacity=".08" stroke-width=".6"/></pattern>
  <pattern id="pat-stars" patternUnits="userSpaceOnUse" width="22" height="26"><path d="M6 3 l1.3 3 3.2 .3 -2.4 2.1 .8 3.1 -2.9 -1.7 -2.9 1.7 .8 -3.1 -2.4 -2.1 3.2 -.3z" fill="#ff8db4"/><path d="M16 15 l1 2.2 2.4 .2 -1.8 1.6 .6 2.3 -2.2 -1.3 -2.2 1.3 .6 -2.3 -1.8 -1.6 2.4 -.2z" fill="#fff" opacity=".85"/></pattern>
`;

/* ---------- 7c. TOP GENERATOR ----------
   makeTop(o) → { top, over }   ('top' layer sits under the arms, 'over' on top of them)
   o.style   : sleeved | tank | muscle | straps | strapless | halter | high | off | one | asym | bra
   o.neck    : crew | boat | scoop | v | deepv | square | collar | sweet   (for straps/strapless: straight | sweetheart | v | cowl | scoop)
   o.sleeve  : cap | short | elbow | three | long      o.sl : fitted | relaxed | puff | bishop | balloon | flutter | wide | roll | cold
   o.hem     : y where the top ends (160 = crop … 230 = tunic)      o.fit : ease (1 fitted … 7 oversized)
   o.c / o.c2: colours     o.pat: fabric pattern id (see FABRIC_DEFS)     o.x: list of extra details
   o.sheer   : see-through fabric     o.under: something worn underneath     o.outer: kimono | poncho | cape | shrug | bolero */
const NECK = {
  crew:   [[90.5, 104.6], [92.8, 109.6], [100, 111.6]],
  boat:   [[84, 105.4], [92, 108.4], [100, 108.8]],
  scoop:  [[89.6, 104.8], [90.4, 116], [94.2, 121.6], [100, 123.4]],
  v:      [[91, 104.8], [95.6, 117], [100, 129]],
  deepv:  [[91, 104.8], [96, 122], [100, 139]],
  square: [[88.4, 105.2], [88.4, 122.4], [100, 122.4]],
  collar: [[91, 104.4], [95, 112], [100, 119]],
  sweet:  [[88.2, 105.4], [88.6, 117], [93.5, 121.5], [98, 123.6], [100, 127.5]],
};
const BUST_NECK = {
  straight:   [[88, 127.6], [100, 127.4]],
  sweetheart: [[81, 124.6], [89.5, 121.2], [96, 124], [100, 129.6]],
  v:          [[86, 124], [100, 133]],
  cowl:       [[87, 125.5], [100, 131]],
  scoop:      [[87, 124], [93, 130], [100, 131.5]],
};
function topEdgeLeft(o) {
  const neck = NECK[o.neck] || NECK.crew;
  switch (o.style) {
    case 'tank':      return [[75.4, 129], [78.6, 120.5], [82.6, 108.5], [85.6, 105.2], ...neck];
    case 'muscle':    return [[73.6, 138], [76.4, 124], [80.8, 108.5], [85, 105.2], ...neck];
    case 'straps':
    case 'strapless': return [[75, 130.5], ...(BUST_NECK[o.neck] || BUST_NECK.straight)];
    case 'halter':    return [[75.4, 131], [80, 121], [88.5, 103], [93.5, 93.5], [100, 92.6]];
    case 'high':      return [[75.4, 130], [80.4, 118], [86.6, 104], [92.6, 94.6], [100, 93.8]];
    case 'off':       return [[68.6, 120], [84, 118], [100, 118.8]];
    default:          return [[68.6 - (o.fit || 0) * .35, 112.5], [79, 106.8], ...neck];   // sleeved
  }
}
const peplumExtra = (o, y) => (o.x || []).includes('peplum') && y > 180 ? (y - 180) * .5 : 0;
const sideHalf = (o, y) => {
  let w = halfW(y);
  if ((o.fit || 0) >= 6 && y >= 124) w = Math.max(w, 27.5);
  return w + (o.fit || 1) + peplumExtra(o, y);
};

/** The body of the top (torso part) as a closed outline. */
function torsoOutline(o) {
  let edge;
  if (o.style === 'one' || o.style === 'asym') {
    edge = [[75.4, 128.5], [78.8, 118], [82.4, 107.4], [90, 104.6], [101, 112.5], [114, 122.5], [124.6, 130.5]];
  } else {
    const L = topEdgeLeft(o);
    edge = [...L, ...mirrorPts(L).reverse().slice(1)];
  }
  const hem = o.hem || 204;
  const yStartR = Math.max(edge[edge.length - 1][1] + 4, 124);
  const right = [], left = [];
  for (let y = yStartR; y < hem - 1; y += 5) right.push([100 + sideHalf(o, y), y]);
  const yStartL = Math.max(edge[0][1] + 4, 124);
  for (let y = yStartL; y < hem - 1; y += 5) left.push([100 - sideHalf(o, y), y]);
  const hs = sideHalf(o, hem);
  const bottom = [[100 + hs, hem], [100 + hs * .45, hem + 1.6], [100 - hs * .45, hem + 1.6], [100 - hs, hem]];
  return [...edge, ...right, ...bottom, ...left.reverse()];
}

/* arm centre line (left arm; the right one is mirrored) */
const ARM = [[71, 110.5], [68.6, 130], [66.4, 150], [65.6, 172], [63.4, 198], [61, 222]];
const ARM_LEN = (() => { const l = [0]; for (let i = 1; i < ARM.length; i++) l.push(l[i - 1] + Math.hypot(ARM[i][0] - ARM[i - 1][0], ARM[i][1] - ARM[i - 1][1])); return l; })();
function armAt(t) {
  const L = ARM_LEN[ARM_LEN.length - 1] * t;
  let i = 1; while (i < ARM.length - 1 && ARM_LEN[i] < L) i++;
  const a = ARM[i - 1], b = ARM[i], k = (L - ARM_LEN[i - 1]) / (ARM_LEN[i] - ARM_LEN[i - 1]);
  const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy);
  return { p: [a[0] + dx * k, a[1] + dy * k], tan: [dx / m, dy / m] };
}
const SLEEVE_END = { cap: .09, short: .24, elbow: .5, three: .72, long: 1 };
function sleeveWidth(sl, t, t1) {
  const base = 7.4 - 2.7 * t;
  switch (sl) {
    case 'relaxed': return base + 2.6;
    case 'puff':    return base + 2 + 7 * Math.exp(-(((t - .1) / .09) ** 2));
    case 'bishop':  return base + 2 + Math.max(0, t - .35) * 18 * (t > t1 - .05 ? .35 : 1);
    case 'balloon': return base + 2 + 8 * Math.sin(Math.PI * Math.min(t / (t1 * .95), 1)) * (t > t1 - .05 ? .3 : 1);
    case 'flutter': return base + 2 + t * 26;
    case 'offpuff': return base + 1.6 + 6.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - .1) / Math.max(.01, t1 - .1))));
    case 'wide':    return base + 4 + t * 24;
    case 'roll':    return base + 2.6;
    default:        return base + 1.2;          // fitted / cold
  }
}
/** Left sleeve outline (mirror for the right). */
function sleeveOutline(o) {
  const t1 = SLEEVE_END[o.sleeve] || .24;
  const t0 = o.sleeveStart != null ? o.sleeveStart : (o.sl === 'cold' ? .2 : 0);
  const outer = [], inner = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0) * i / N, { p, tan } = armAt(t), nrm = [-tan[1], tan[0]];
    const w = sleeveWidth(o.sl, t, t1);
    outer.push([p[0] - nrm[0] * w, p[1] - nrm[1] * w]);
    inner.push([p[0] + nrm[0] * w, p[1] + nrm[1] * w]);
  }
  const cap = [];
  if (t0 === 0) { const { p, tan } = armAt(0); cap.push([p[0] - tan[0] * 5, p[1] - tan[1] * 5]); }
  return [...cap, ...outer, ...inner.reverse()];
}
function cuffBand(o, color) {
  const t1 = SLEEVE_END[o.sleeve] || .24, t0 = t1 - .045;
  const pts = [];
  [[t0, 1], [t1, 1], [t1, -1], [t0, -1]].forEach(([t, s]) => {
    const { p, tan } = armAt(t), w = sleeveWidth(o.sl === 'bishop' || o.sl === 'balloon' ? 'fitted' : o.sl, t, t1) + .6;
    pts.push([p[0] - tan[1] * w * s, p[1] + tan[0] * w * s]);
  });
  return `<path d="${linePath(pts, true)}" fill="${color}"/>`;
}

/** fill + fabric pattern + soft shading + outline for any garment path */
function fabric(d, o, { shadeIt = true, opacity } = {}) {
  const op = opacity != null ? opacity : (o.sheer ? .38 : 1);
  let s = `<path d="${d}" fill="${o.c}" fill-opacity="${op}"/>`;
  if (o.pat) s += `<path d="${d}" fill="url(#pat-${o.pat})"/>`;
  if (o.shine) s += `<path d="${d}" fill="url(#sheen)"/>`;
  if (o.velvet) s += `<path d="${d}" fill="url(#velvetSheen)"/>`;
  if (shadeIt && !o.sheer) s += `<path d="${d}" fill="url(#clothShade)"/>`;
  s += `<path d="${d}" fill="none" stroke="${shade(o.c, -.28)}" stroke-width=".8" stroke-opacity="${o.sheer ? .5 : .75}"/>`;
  return s;
}

/* little details — each returns SVG (drawn on the torso unless noted) */
const button = (x, y, c = '#fff') => `<circle cx="${x}" cy="${y}" r="1.2" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".4"/>`;
function extrasSVG(o) {
  const x = o.x || [], hem = o.hem || 204, dk = shade(o.c, -.3), lt = shade(o.c, .5);
  let top = '', over = '';
  const neckY = { crew: 111.6, boat: 108.8, scoop: 123.4, v: 129, deepv: 139, square: 122.4, collar: 119, sweet: 127.5 }[o.neck] || 112;
  x.forEach(e => {
    switch (e) {
      case 'buttons': { top += `<path d="M100 ${neckY + 1} V${hem - 2}" stroke="${dk}" stroke-width=".7" opacity=".6"/>`; for (let y = neckY + 6; y < hem - 4; y += 12) top += button(100, y, o.btn || lt); break; }
      case 'collar': case 'whiteCollar': {
        const c = e === 'whiteCollar' ? '#fff' : (o.c2 || o.c);
        const L = [[91.4, 101.8], [84.6, 113.6], [98.6, 119.2]];
        top += `<path d="M91 102.5 Q100 98.5 109 102.5" stroke="${shade(c, -.25)}" stroke-width="3" fill="none"/>`;
        [L, mirrorPts(L)].forEach(p => { top += `<path d="${linePath(p, true)}" fill="${c}" stroke="${shade(c, -.3)}" stroke-width=".7" stroke-linejoin="round"/>`; });
        break; }
      case 'polo': {
        const c = o.c2 || o.c, L = [[92, 103.2], [88.2, 111.4], [98.8, 113.4]];
        [L, mirrorPts(L)].forEach(p => { top += `<path d="${linePath(p, true)}" fill="${c}" stroke="${shade(c, -.3)}" stroke-width=".7"/>`; });
        top += `<path d="M100 112 V127" stroke="${dk}" stroke-width=".7"/>${button(100, 117, lt)}${button(100, 123, lt)}`; break; }
      case 'henley': top += `<path d="M100 111 V131" stroke="${dk}" stroke-width=".8"/>${button(100, 116, lt)}${button(100, 122, lt)}${button(100, 128, lt)}`; break;
      case 'pocket': top += `<path d="M106 127 H117 V137 Q111.5 140 106 137 Z" fill="none" stroke="${dk}" stroke-width=".8"/>`; break;
      case 'pockets2': [[83, 127], [106, 127]].forEach(([px, py]) => { top += `<path d="M${px} ${py} h11 v10 q-5.5 3 -11 0z" fill="none" stroke="${dk}" stroke-width=".8"/><path d="M${px - .5} ${py - 1} h12 v4 q-6 2 -12 0z" fill="${o.c}" stroke="${dk}" stroke-width=".8"/>${button(px + 5.5, py + 2.6, lt)}`; }); break;
      case 'goldStitch': top += `<path d="M98.5 ${neckY + 2} V${hem - 2} M101.5 ${neckY + 2} V${hem - 2}" stroke="#e0ad4c" stroke-width=".6" stroke-dasharray="1.5 1.2"/>`; break;
      case 'heartPrint': top += `<path d="M100 132 c-3 -5 -10 -1 -6 4 l6 6 6 -6 c4 -5 -3 -9 -6 -4z" fill="#ff8db4"/>`; break;
      case 'embroHeart': top += `<path d="M110 128 c-1.5 -2.5 -5 -.5 -3 2 l3 3 3 -3 c2 -2.5 -1.5 -4.5 -3 -2z" fill="#e8546e"/>`; break;
      case 'laceTrim': top += `<path d="M86 124.5 L100 133.5 L114 124.5" stroke="#fff" stroke-width="2.4" stroke-dasharray=".1 2.6" stroke-linecap="round" fill="none"/>`; break;
      case 'boning': [88, 94, 106, 112].forEach(bx => { top += `<path d="M${bx} 133 V${hem - 2}" stroke="${dk}" stroke-width=".7" opacity=".55"/>`; }); break;
      case 'lacing': { top += `<path d="M100 132 V${hem - 1}" stroke="${dk}" stroke-width=".6"/>`; for (let y = 136; y < hem - 3; y += 6) top += `<path d="M97.5 ${y} L102.5 ${y + 4} M102.5 ${y} L97.5 ${y + 4}" stroke="#fff" stroke-width=".7"/>`; break; }
      case 'cups': top += `<path d="M80 131 Q90 141 100 131 Q110 141 120 131" stroke="${dk}" stroke-width=".8" fill="none" opacity=".7"/>`; break;
      case 'gathered': top += `<path d="M97 130 q3 4 0 8 q3 4 0 8 M103 130 q-3 4 0 8 q-3 4 0 8" stroke="${dk}" stroke-width=".7" fill="none" opacity=".6"/>`; break;
      case 'shine': top += `<path d="M81 134 Q80 150 83 166" stroke="#fff" stroke-width="2.4" opacity=".22" fill="none" stroke-linecap="round"/>`; break;
      case 'elastic': top += `<path d="M70 121 Q100 118 130 121" stroke="${dk}" stroke-width=".7" stroke-dasharray="1.2 1.2" fill="none"/>`; break;
      case 'darts': top += `<path d="M90 146 Q91 164 90 184 M110 146 Q109 164 110 184" stroke="${dk}" stroke-width=".6" fill="none" opacity=".45"/>`; break;
      case 'waistSeam': top += `<path d="M${100 - halfW(180) - 1} 180 Q100 183 ${100 + halfW(180) + 1} 180" stroke="${dk}" stroke-width=".8" fill="none"/>`; break;
      case 'waistTie': top += `<path d="M${100 - halfW(182) - 3} 181 Q100 184 ${100 + halfW(182) + 3} 181 L${100 + halfW(186) + 3} 186 Q100 189 ${100 - halfW(186) - 3} 186 Z" fill="${dk}"/><path d="M108 184 q6 -6 9 0 q-3 5 -9 0 M108 184 q-2 10 -6 14 M108 184 q2 10 6 14" stroke="${dk}" stroke-width="1.6" fill="${dk}"/>`; break;
      case 'wrap': top += `<path d="M91 105 Q104 150 120 186" stroke="${dk}" stroke-width="1" fill="none"/><path d="M120 186 q7 -6 10 0 q-3 5 -10 0 M120 186 q0 10 -3 16 M120 186 q4 9 7 14" stroke="${o.c}" stroke-width="2" fill="${o.c}"/>`; break;
      case 'tie': top += `<path d="M100 ${hem - 2} q-8 -6 -10 0 q2 5 10 0 q8 -6 10 0 q-2 5 -10 0 M100 ${hem - 2} l-5 11 M100 ${hem - 2} l5 11" stroke="${dk}" stroke-width="1.4" fill="${o.c}"/>`; break;
      case 'knot': top += `<ellipse cx="100" cy="${hem - 3}" rx="4.6" ry="3.6" fill="${o.c}" stroke="${dk}" stroke-width=".8"/><path d="M93 ${hem - 12} Q97 ${hem - 6} 96 ${hem - 3} M107 ${hem - 12} Q103 ${hem - 6} 104 ${hem - 3}" stroke="${dk}" stroke-width=".7" fill="none"/>`; break;
      case 'hood': top += `<path d="M79 107 Q83 94 100 96 Q117 94 121 107 Q111 113.5 100 111.5 Q89 113.5 79 107 Z" fill="${shade(o.c, -.12)}" stroke="${dk}" stroke-width=".8"/><path d="M95 112 Q94 124 94 134 M105 112 Q106 124 106 134" stroke="#fff" stroke-width="1.1" fill="none"/><circle cx="94" cy="135" r="1.1" fill="#fff"/><circle cx="106" cy="135" r="1.1" fill="#fff"/>`; break;
      case 'kangaroo': top += `<path d="M84 ${hem - 30} H116 L120 ${hem - 12} H80 Z" fill="none" stroke="${dk}" stroke-width=".9"/>`; break;
      case 'ribHem': { const hs = sideHalf(o, hem); top += `<path d="M${100 - hs} ${hem - 7} H${100 + hs} L${100 + hs} ${hem} Q100 ${hem + 1.6} ${100 - hs} ${hem} Z" fill="${shade(o.c, -.08)}"/><path d="M${100 - hs} ${hem - 7} H${100 + hs} L${100 + hs} ${hem} Q100 ${hem + 1.6} ${100 - hs} ${hem} Z" fill="url(#pat-rib)"/>`; break; }
      case 'ribNeck': top += `<path d="M90.5 104.8 Q92.8 109.8 100 111.8 Q107.2 109.8 109.5 104.8" stroke="${shade(o.c, -.14)}" stroke-width="3" fill="none"/>`; break;
      case 'cowl': top += `<path d="M90 106 Q100 122 110 106 M88.5 109 Q100 131 111.5 109" stroke="${dk}" stroke-width=".8" fill="none" opacity=".7"/>`; break;
      case 'cowlDrape': top += `<path d="M89 128 Q100 138 111 128 M91 131 Q100 142 109 131" stroke="${dk}" stroke-width=".7" fill="none" opacity=".6"/>`; break;
      case 'turtle': top += `<path d="M90.6 108 L90.6 90 Q100 86.5 109.4 90 L109.4 108 Q100 111 90.6 108 Z" fill="${shade(o.c, -.05)}" stroke="${dk}" stroke-width=".8"/><path d="M90.6 99 Q100 102 109.4 99" stroke="${dk}" stroke-width=".8" fill="none"/><path d="M90.6 90 L90.6 108 L109.4 108 L109.4 90 Z" fill="url(#pat-rib)"/>`; break;
      case 'mock': top += `<path d="M91.6 108 L91.6 96 Q100 93.5 108.4 96 L108.4 108 Q100 111 91.6 108 Z" fill="${shade(o.c, .06)}" stroke="${dk}" stroke-width=".8"/>`; break;
      case 'cutout': top += `<path d="M85 128 Q96 118 111 130 Q98 126 85 128 Z" fill="url(#skinGrad)" stroke="${dk}" stroke-width=".6"/>`; break;
      case 'scallop': { const hs = sideHalf(o, hem); for (let sx = 100 - hs + 3; sx <= 100 + hs - 2; sx += 5) top += `<circle cx="${f1(sx)}" cy="${hem + .5}" r="2.4" fill="${o.c}" stroke="${dk}" stroke-width=".4"/>`; break; }
      case 'halterTie': top += `<path d="M100 94 V128" stroke="${dk}" stroke-width=".7" opacity=".5"/>`; break;
      case 'ruffle': { for (let i = 0; i < 12; i++) { const rx = 64 + i * 6.2; over += `<path d="M${f1(rx)} 124 q3.1 7 6.2 0" fill="${o.c}" stroke="${dk}" stroke-width=".6"/>`; } over += `<path d="M62 118 Q100 114 138 118 L138 124 Q100 121 62 124 Z" fill="${o.c}" stroke="${dk}" stroke-width=".6"/>`; break; }
      case 'slit': top += `<path d="M100 111.6 V124" stroke="${dk}" stroke-width=".9"/>`; break;
    }
  });
  return { top, over };
}

/* things worn underneath (sheer tops, open layers) */
const UNDER = {
  braBlack: `<path d="M77.5 129 Q88 124 99.4 132 Q98 141 88 142.5 Q79 141 77.5 129 Z M122.5 129 Q112 124 100.6 132 Q102 141 112 142.5 Q121 141 122.5 129 Z" fill="#1a141d"/><path d="M77 139 Q100 146 123 139 L123 143 Q100 150 77 143 Z" fill="#1a141d"/>`,
  camiWhite: null, camiBlack: null,     // filled in below (they reuse makeTop)
};

/* outer layers: kimono · poncho · cape · shrug · bolero (drawn over the arms) */
function outerSVG(o) {
  const L = { ...o, sheer: false }, d = shade(o.c, -.3);
  const pair = pts => [pts, mirrorPts(pts)].map(p => fabric(smoothPath(p), L)).join('');
  switch (o.outer) {
    case 'kimono': {
      const panel = [[91, 103], [79, 106.5], [68, 112], [66.5, 150], [69.5, 226], [88, 226], [89.5, 170], [90, 130]];
      const fringe = [[69.5, 88], [111.5, 130]].map(([a, b]) => { let s = ''; for (let fx = a; fx <= b; fx += 2.4) if (fx < 88.5 || fx > 111.5) s += `M${f1(fx)} 226 v5 `; return s; }).join('');
      const sl = { ...L, sleeve: 'three', sl: 'wide' };
      const sleeves = [sleeveOutline(sl), mirrorPts(sleeveOutline(sl))].map(p => fabric(smoothPath(p), L)).join('');
      return pair(panel) + sleeves + `<path d="${fringe}" stroke="${d}" stroke-width=".8"/>`;
    }
    case 'poncho': {
      const p = [[88, 100], [100, 106], [112, 100], [128, 104], [150, 172], [140, 204], [100, 214], [60, 204], [50, 172], [72, 104]];
      let fr = ''; for (let fx = 58; fx <= 142; fx += 2.6) { const fy = fx < 100 ? 204 + (fx - 58) / 42 * 10 : 214 - (fx - 100) / 42 * 10; fr += `M${f1(fx)} ${f1(fy)} v6 `; }
      return fabric(smoothPath(p), L) + `<path d="${fr}" stroke="${d}" stroke-width=".9"/><path d="M100 106 L100 140" stroke="${d}" stroke-width=".8"/><path d="M70 160 Q100 178 130 160" stroke="${d}" stroke-width=".8" fill="none" stroke-dasharray="2 2"/>`;
    }
    case 'cape': {
      const p = [[88, 100], [100, 106], [112, 100], [126, 104], [143, 152], [100, 162], [57, 152], [74, 104]];
      return fabric(smoothPath(p), L) + `<path d="M88 100 Q100 110 112 100 Q108 96 100 97 Q92 96 88 100 Z" fill="${shade(o.c, -.1)}"/>${button(100, 118, d)}${button(100, 130, d)}${button(100, 142, d)}`;
    }
    case 'shrug': {
      const s = { ...L, sleeve: 'long', sl: 'fitted' };
      const band = [[92, 104], [80, 106], [68.5, 112], [71, 128], [78, 131], [85, 118]];
      return pair(band) + [sleeveOutline(s), mirrorPts(sleeveOutline(s))].map(p => fabric(smoothPath(p), L)).join('') + cuffBand(s, d) + cuffBand(s, d).replace(/(\d+(\.\d+)?) (\d+(\.\d+)?)/g, (m, a, _, b) => `${f1(200 - a)} ${b}`);
    }
    case 'bolero': {
      const s = { ...L, sleeve: 'short', sl: 'puff' };
      const panel = [[91.5, 103.5], [79, 106.5], [68.6, 112.5], [73.5, 142], [84, 143], [89, 132], [90, 116]];
      return pair(panel) + [sleeveOutline(s), mirrorPts(sleeveOutline(s))].map(p => fabric(smoothPath(p), L)).join('');
    }
  }
  return '';
}

/** Build a whole top. */
function makeTop(o) {
  let top = '', over = '';
  if (o.under) top += UNDER[o.under] || '';
  if (o.outer) {                                   // layers: cami underneath + outer garment over the arms
    return { top: top + (UNDER[o.under] ? '' : ''), over: outerSVG(o) };
  }
  if (o.style === 'bra') {
    const cup = [[77.5, 136], [89, 119], [99.2, 134]];
    top += [cup, mirrorPts(cup)].map(p => fabric(smoothPath(p, true, .08), o)).join('');
    top += `<path d="M76 134 Q100 140 124 134 L124 141 Q100 147 76 141 Z" fill="${o.c}" stroke="${shade(o.c, .3)}" stroke-width=".6"/>`;
    top += `<path d="M89 119.5 L89.5 104.5 M111 119.5 L110.5 104.5" stroke="${o.c}" stroke-width="1.1"/>`;
    top += `<path d="M77.5 136 L89 119 L99.2 134 M122.5 136 L111 119 L100.8 134" stroke="${shade(o.c, .45)}" stroke-width="1.6" stroke-dasharray=".1 2" stroke-linecap="round" fill="none"/>`;
    return { top, over };
  }
  const d = smoothPath(torsoOutline(o));
  top += fabric(d, o);
  if (o.style === 'straps') {
    const sw = o.strapW || 1, y0 = (BUST_NECK[o.neck] || BUST_NECK.straight)[0][1];
    top += `<path d="M88.4 ${y0 + .5} L89.4 104.6 M111.6 ${y0 + .5} L110.6 104.6" stroke="${o.strapC || shade(o.c, -.05)}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  const ex = extrasSVG(o);
  top += ex.top;
  if (o.sleeve) {
    const both = o.style === 'asym' ? [sleeveOutline(o)] : [sleeveOutline(o), mirrorPts(sleeveOutline(o))];
    both.forEach(p => { over += fabric(smoothPath(p), o, { shadeIt: false }); });
    if (o.cuff) {
      const band = cuffBand(o, shade(o.c, -.1));
      over += band + (o.style === 'asym' ? '' : band.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, a, b) => `${f1(200 - a)} ${b}`));
    }
    if (o.sl === 'roll') { const t = SLEEVE_END[o.sleeve]; const { p } = armAt(t); over += `<ellipse cx="${f1(p[0])}" cy="${f1(p[1] - 1)}" rx="8.5" ry="3" fill="${shade(o.c, -.08)}" stroke="${shade(o.c, -.3)}" stroke-width=".6"/><ellipse cx="${f1(200 - p[0])}" cy="${f1(p[1] - 1)}" rx="8.5" ry="3" fill="${shade(o.c, -.08)}" stroke="${shade(o.c, -.3)}" stroke-width=".6"/>`; }
  }
  over += ex.over;
  return { top, over };
}
UNDER.camiWhite = makeTop({ style: 'straps', neck: 'straight', c: '#ffffff', hem: 204, fit: 1.4 }).top;
UNDER.camiBlack = makeTop({ style: 'straps', neck: 'straight', c: '#1d1a20', hem: 204, fit: 1.4 }).top;

/* ---------- 7d. JEANS GENERATOR ----------
   makeJeans(o) → bottom layer.  o.fit : skinny | straight | slim | baggy | wide | flare | boot | mom | boyfriend | barrel | cargo
   o.rise: low | mid | high     o.len: full | ankle | crop     o.wash: [top colour, bottom colour]
   o.x: details (rips, studs, rhinestones, flowers, stars, butterflies, patchwork, cargo, pleats, belt, chain,
        split, cuff, fringe, acid, whiskers, pinkStitch, kneeCut, bow)                                        */
const LEG_FIT = {
  skinny: [16, 8.4, 6.4], slim: [16, 10, 9.4], straight: [16.4, 12, 12], baggy: [19, 18.6, 20], wide: [18, 21.5, 27],
  flare: [16, 9.4, 21], boot: [16, 10, 16], mom: [17, 12.6, 9], boyfriend: [17.4, 14, 11.6], barrel: [17, 22, 11.8], cargo: [18.4, 17, 16.4],
};
const legC = y => lerpTable([[236, 88], [316, 89], [404, 92], [430, 92.6]], y);
function makeJeans(o) {
  const W = { low: 212, mid: 198, high: 184 }[o.rise || 'mid'];
  const roomy = ['baggy', 'wide', 'cargo', 'barrel', 'boyfriend'].includes(o.fit);
  const hem = { full: roomy || o.fit === 'flare' || o.fit === 'wide' ? 423 : 416, ankle: 398, crop: 384 }[o.len || 'full'];
  const hip = y => halfW(y) + 1.4 + (roomy ? 2.2 : 0);
  const [a, b, c] = LEG_FIT[o.fit] || LEG_FIT.straight;
  const hw = y => y <= 316 ? a + (b - a) * (y - 236) / 80 : b + (c - b) * (y - 316) / (hem - 316);
  const outerL = y => { const leg = legC(y) - hw(y); if (y < 272) { const k = (y - 236) / 36; return (100 - hip(236)) * (1 - k) + leg * k; } return leg; };
  const innerL = y => Math.min(legC(y) + hw(y), 100 - (.4 + (y - 240) * .012));
  const L = [];
  L.push([100 - hip(W), W]);
  for (let y = W + 5; y < 236; y += 5) L.push([100 - hip(y), y]);
  for (let y = 236; y < hem; y += 7) L.push([outerL(y), y]);
  L.push([outerL(hem), hem], [innerL(hem), hem + .4]);
  for (let y = hem - 7; y > 246; y -= 7) L.push([innerL(y), y]);
  const R = mirrorPts(L).reverse();
  const pts = [...L, [100, 240.5], ...R, [100, W + 1]];
  const d = smoothPath(pts, true, .12);
  const id = 'wash-' + o.id;
  let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.wash[0]}"/><stop offset="1" stop-color="${o.wash[1]}"/></linearGradient></defs>`;
  const x = o.x || [], dk = shade(o.wash[1], -.35), lt = shade(o.wash[0], .45);
  const stitch = x.includes('pinkStitch') ? '#ff8db4' : '#e0ad4c';
  s += `<path d="${d}" fill="url(#${id})"/><path d="${d}" fill="url(#pat-${x.includes('acid') ? 'acid' : 'twill'})"/>`;
  // knee fade + side shading
  s += [88, 112].map(kx => `<ellipse cx="${kx}" cy="296" rx="${f1(hw(296) * .5)}" ry="26" fill="#fff" opacity=".12"/>`).join('');
  s += `<path d="${d}" fill="url(#clothShade)"/><path d="${d}" fill="none" stroke="${dk}" stroke-width=".9"/>`;
  // inner-leg seam gap + fly + waistband + pockets + outer seam
  s += `<path d="M100 241 V${hem - 2}" stroke="${dk}" stroke-width=".6" opacity=".25"/>`;
  const wb = [[100 - hip(W), W], [100 + hip(W), W], [100 + hip(W + 7), W + 7], [100 - hip(W + 7), W + 7]];
  s += `<path d="${linePath(wb, true)}" fill="${shade(o.wash[0], -.12)}" stroke="${dk}" stroke-width=".6"/>`;
  [-1, 1].forEach(sd => { [.45, .85].forEach(k => { const lx = 100 + sd * hip(W) * k; s += `<rect x="${f1(lx - .9)}" y="${W - .5}" width="1.8" height="8.5" rx=".6" fill="${shade(o.wash[0], -.2)}"/>`; }); });
  s += `<circle cx="100" cy="${W + 3.5}" r="1.9" fill="#d8b25a" stroke="#8a6a2a" stroke-width=".5"/>`;
  s += `<path d="M101.5 ${W + 7} V${W + 30} Q101.5 ${W + 36} 107 ${W + 34}" stroke="${stitch}" stroke-width=".7" fill="none" stroke-dasharray="1.4 1.1"/>`;
  s += [-1, 1].map(sd => `<path d="M${f1(100 + sd * (hip(W + 8) - 1.5))} ${W + 8} Q${f1(100 + sd * (hip(W + 8) - 10))} ${W + 11} ${f1(100 + sd * (hip(W + 8) - 13))} ${W + 8}" stroke="${stitch}" stroke-width=".7" fill="none" stroke-dasharray="1.4 1.1"/>`).join('');
  const seamL = [], seamR = [];
  for (let y = W + 10; y < hem - 2; y += 8) { const ox = y < 236 ? 100 - hip(y) : outerL(y); seamL.push([ox + 2, y]); seamR.push([200 - ox - 2, y]); }
  s += `<path d="${linePath(seamL)} ${linePath(seamR)}" stroke="${stitch}" stroke-width=".6" fill="none" stroke-dasharray="1.4 1.1" opacity=".8"/>`;
  // hem stitch
  s += `<path d="M${f1(outerL(hem) + 1)} ${hem - 3} L${f1(innerL(hem) - .5)} ${hem - 3} M${f1(200 - innerL(hem) + .5)} ${hem - 3} L${f1(200 - outerL(hem) - 1)} ${hem - 3}" stroke="${stitch}" stroke-width=".6" stroke-dasharray="1.4 1.1"/>`;
  const legBoth = (fn) => [0, 1].map(i => fn(i === 0 ? v => v : v => 200 - v)).join('');
  x.forEach(e => {
    switch (e) {
      case 'whiskers': s += legBoth(m => `<path d="M${m(84)} ${W + 26} q6 2 12 -1 M${m(85)} ${W + 31} q5 2 10 -1" stroke="#fff" stroke-width="1" opacity=".35" fill="none"/>`); break;
      case 'rips': s += legBoth(m => `<path d="M${m(82)} 300 q7 -3 14 0 q-7 4 -14 0z M${m(83)} 312 q6 -2 12 1 q-6 3 -12 -1z M${m(84)} 262 q5 -2 10 0 q-5 3 -10 0z" fill="${SKIN}"/><path d="M${m(81)} 300 h15 M${m(82)} 303 h13 M${m(82)} 312 h13" stroke="#fff" stroke-width=".7" opacity=".85"/>`); break;
      case 'kneeCut': s += legBoth(m => `<path d="M${m(82.5)} 304 Q${m(89)} 297 ${m(95.5)} 305 Q${m(89)} 311 ${m(82.5)} 304 Z" fill="${SKIN}"/><path d="M${m(82.5)} 302 h13 M${m(82.5)} 306 h13" stroke="#e8eefc" stroke-width=".7"/>`); break;
      case 'studs': { for (let i = 0; i < 13; i++) s += `<circle cx="${f1(100 - hip(W + 10) + 3 + i * (2 * hip(W + 10) - 6) / 12)}" cy="${W + 10.5}" r="1.2" fill="#f1c75b"/>`; break; }
      case 'rhinestones': { let r = 0; for (let y = W + 18; y < hem - 6; y += 9) for (const sd of [-1, 1]) { r++; const cx = legC(Math.max(y, 236)); const xx = 100 + sd * (100 - cx) + ((r * 37) % 11 - 5) * .9 * (y < 236 ? .6 : 1); s += `<circle cx="${f1(sd < 0 ? 200 - xx : xx)}" cy="${y + (r % 3)}" r="${r % 4 ? .8 : 1.3}" fill="#fff" opacity=".9"/>`; } s += legBoth(m => `<path d="M${m(84)} 380 l1 -3 1 3 3 1 -3 1 -1 3 -1 -3 -3 -1z" fill="#fff"/>`); break; }
      case 'flowers': s += legBoth(m => [[86, 270, '#ff8db4'], [92, 330, '#ffd54a'], [87, 372, '#ff8db4'], [95, 296, '#fff']].map(([fx, fy, fc]) => `<g transform="translate(${m(fx)} ${fy})" fill="${fc}"><circle cx="0" cy="-2" r="1.6"/><circle cx="2" cy="0" r="1.6"/><circle cx="0" cy="2" r="1.6"/><circle cx="-2" cy="0" r="1.6"/><circle r="1" fill="#e8a53a"/></g>`).join('')); break;
      case 'stars': s += `<path d="${d}" fill="url(#pat-stars)" opacity=".85"/>`; break;
      case 'butterflies': s += legBoth(m => [[87, 282], [91, 350]].map(([bx, by]) => `<g transform="translate(${m(bx)} ${by})"><path d="M0 0 q-6 -7 -8 -1 q2 4 8 1 q-5 6 -5 7 q3 1 5 -7 q6 -7 8 -1 q-2 4 -8 1 q5 6 5 7 q-3 1 -5 -7z" fill="#ff8db4" stroke="#fff" stroke-width=".5"/></g>`).join('')); break;
      case 'patchwork': s += legBoth(m => [[83, 262, 10, 14, .18], [88, 318, 9, 12, -.15], [84, 356, 11, 10, .12]].map(([px, py, pw, ph, k]) => `<rect x="${Math.min(m(px), m(px + pw))}" y="${py}" width="${pw}" height="${ph}" fill="${k > 0 ? '#fff' : '#000'}" opacity="${Math.abs(k)}" stroke="${stitch}" stroke-width=".6" stroke-dasharray="1.2 1"/>`).join('')); break;
      case 'cargo': s += legBoth(m => `<rect x="${Math.min(m(outerL(270) + 1), m(outerL(270) + 13))}" y="266" width="12" height="16" rx="1.5" fill="${shade(o.wash[0], -.08)}" stroke="${dk}" stroke-width=".7"/><path d="M${m(outerL(270) + 1)} 266 h${m(0) === 0 ? 12 : -12} v4 h${m(0) === 0 ? -12 : 12} z" fill="${shade(o.wash[0], -.18)}"/>`); break;
      case 'pleats': s += legBoth(m => `<path d="M${m(90)} ${W + 7} Q${m(89)} 270 ${m(legC(360))} ${hem - 4}" stroke="${dk}" stroke-width=".8" fill="none" opacity=".6"/>`); break;
      case 'belt': s += `<path d="${linePath(wb, true)}" fill="#3a2418"/><rect x="95.5" y="${W + .5}" width="9" height="6" rx="1" fill="none" stroke="#d8b25a" stroke-width="1.4"/>`; break;
      case 'sparkBelt': s += `<path d="${linePath(wb, true)}" fill="#f7eef8"/>${Array.from({ length: 16 }, (_, i) => `<circle cx="${f1(100 - hip(W) + 2 + i * (hip(W) * 2 - 4) / 15)}" cy="${W + 3.5}" r="1.3" fill="#fff" stroke="#c9b0d8" stroke-width=".4"/>`).join('')}`; break;
      case 'chain': s += `<path d="M${f1(100 + hip(W) * .85)} ${W + 7} Q${f1(100 + hip(W) + 4)} ${W + 30} ${f1(100 + hip(W) - 2)} ${W + 36}" stroke="#d9d9e3" stroke-width="1.6" stroke-dasharray="2 1" fill="none"/>`; break;
      case 'split': s += legBoth(m => `<path d="M${m(legC(hem) - 1)} ${hem} L${m(legC(hem) + 1)} ${hem - 14} L${m(legC(hem) + 3)} ${hem}" fill="${SKIN}" stroke="${dk}" stroke-width=".6"/>`); break;
      case 'cuff': s += legBoth(m => `<path d="M${m(outerL(hem) - 1)} ${hem - 8} L${m(innerL(hem) + .6)} ${hem - 8} L${m(innerL(hem) + .6)} ${hem} L${m(outerL(hem) - 1)} ${hem} Z" fill="${lt}" stroke="${dk}" stroke-width=".6"/>`); break;
      case 'fringe': { let fr = ''; [[outerL(hem), innerL(hem)]].forEach(([p, q]) => { for (let fx = p; fx < q; fx += 1.6) fr += `M${f1(fx)} ${hem} v2.4 M${f1(200 - fx)} ${hem} v2.4 `; }); s += `<path d="${fr}" stroke="${lt}" stroke-width=".7"/>`; break; }
      case 'bow': s += `<path d="M100 ${W + 3} q-6 -5 -8 0 q2 5 8 0 q6 -5 8 0 q-2 5 -8 0" fill="#ff8db4" stroke="#e0467f" stroke-width=".6"/>`; break;
    }
  });
  return s;
}

/* ---------- 7e. THE WARDROBE ----------
   Tops follow the "Types of Tops" chart. Groups drive the filter chips.
   🖼️ Want your own PNG instead? add  img: 'PLACEHOLDER_MY_TOP.png'  to any item
   (transparent, same 200×460 canvas as the character, e.g. 400×920 px).          */
const T = (id, label, group, o) => ({ id, label, category: 'tops', group, o });
const TOPS = [
  T('tshirt', 'T-Shirt', 'Tees & Tanks', { style: 'sleeved', neck: 'crew', sleeve: 'short', sl: 'relaxed', hem: 208, fit: 3, c: '#ffffff', x: ['ribNeck', 'heartPrint'] }),
  T('tank', 'Tank Top', 'Tees & Tanks', { style: 'tank', neck: 'scoop', hem: 206, fit: 1.5, c: '#efe6ea', pat: 'rib' }),
  T('camisole', 'Camisole', 'Tees & Tanks', { style: 'straps', neck: 'v', hem: 204, fit: 2, c: '#f6efe2', x: ['laceTrim'] }),
  T('spaghetti', 'Spaghetti Strap Top', 'Tees & Tanks', { style: 'straps', neck: 'straight', hem: 178, fit: 1, c: '#c9989a', strapW: .8 }),
  T('croptop', 'Crop Top', 'Tees & Tanks', { style: 'tank', neck: 'scoop', hem: 162, fit: 1.2, c: '#ffffff', pat: 'rib' }),
  T('bustier', 'Bustier', 'Glam & Party', { style: 'strapless', neck: 'sweetheart', hem: 176, fit: .8, c: '#eadbc0', pat: 'floral', x: ['cups', 'boning'] }),
  T('tube', 'Tube Top', 'Glam & Party', { style: 'strapless', neck: 'straight', hem: 172, fit: .8, c: '#1d1a20', x: ['shine'] }),
  T('bandeau', 'Bandeau Top', 'Tees & Tanks', { style: 'strapless', neck: 'straight', hem: 152, fit: .6, c: '#ffffff', x: ['gathered'] }),
  T('halter', 'Halter Top', 'Glam & Party', { style: 'halter', hem: 192, fit: 1.4, c: '#9e1f2a', x: ['halterTie'] }),
  T('offshoulder', 'Off Shoulder Top', 'Blouses', { style: 'off', sleeve: 'short', sl: 'offpuff', sleeveStart: .1, hem: 178, fit: 1.5, c: '#ffffff', x: ['elastic'] }),
  T('oneshoulder', 'One Shoulder Top', 'Blouses', { style: 'one', hem: 200, fit: 1.2, c: '#efe3d3' }),
  T('coldshoulder', 'Cold Shoulder Top', 'Blouses', { style: 'tank', neck: 'crew', sleeve: 'long', sl: 'cold', hem: 208, fit: 2.4, c: '#f3eadc', x: ['buttons'], cuff: true }),
  T('puffsleeve', 'Puff Sleeve Top', 'Blouses', { style: 'sleeved', neck: 'square', sleeve: 'short', sl: 'puff', hem: 178, fit: 1.2, c: '#f4e9d8', x: ['gathered'] }),
  T('bishop', 'Bishop Sleeve Top', 'Blouses', { style: 'sleeved', neck: 'v', sleeve: 'long', sl: 'bishop', hem: 192, fit: 1.6, c: '#ead9c2', cuff: true, x: ['waistSeam'] }),
  T('balloon', 'Balloon Sleeve Top', 'Blouses', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'balloon', hem: 202, fit: 2, c: '#f6c3b4', cuff: true }),
  T('peplum', 'Peplum Top', 'Blouses', { style: 'sleeved', neck: 'v', sleeve: 'short', sl: 'flutter', hem: 206, fit: 1.2, c: '#f1e6d6', x: ['peplum', 'waistSeam'] }),
  T('wrap', 'Wrap Top', 'Blouses', { style: 'sleeved', neck: 'deepv', sleeve: 'elbow', sl: 'relaxed', hem: 200, fit: 1.6, c: '#23305a', x: ['wrap'] }),
  T('tiefront', 'Tie Front Top', 'Blouses', { style: 'sleeved', neck: 'v', sleeve: 'short', sl: 'puff', hem: 176, fit: 1.2, c: '#efdcc6', x: ['tie'] }),
  T('knotfront', 'Knot Front Top', 'Blouses', { style: 'tank', neck: 'v', hem: 170, fit: 1.4, c: '#fbf6ef', x: ['knot'] }),
  T('buttondown', 'Button Down Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 214, fit: 3, c: '#ffffff', cuff: true, x: ['collar', 'buttons'] }),
  T('fittedshirt', 'Fitted Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'fitted', hem: 206, fit: 1.2, c: '#f7f5f2', cuff: true, x: ['collar', 'buttons', 'darts'] }),
  T('oversizedshirt', 'Oversized Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 226, fit: 7, c: '#ece7f6', cuff: true, x: ['collar', 'buttons'] }),
  T('boyfriendshirt', 'Boyfriend Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'elbow', sl: 'roll', hem: 214, fit: 4.5, c: '#fdfdfd', x: ['collar', 'buttons', 'pocket'] }),
  T('tunic', 'Tunic Top', 'Blouses', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'relaxed', hem: 232, fit: 3.6, c: '#f3ecdf', x: ['slit'] }),
  T('kaftan', 'Kaftan Top', 'Blouses', { style: 'sleeved', neck: 'deepv', sleeve: 'elbow', sl: 'wide', hem: 212, fit: 4, c: '#e7cfa0', pat: 'floralGold', x: ['waistTie'] }),
  T('polo', 'Polo Shirt', 'Tees & Tanks', { style: 'sleeved', neck: 'crew', sleeve: 'short', sl: 'fitted', hem: 204, fit: 2, c: '#f4efe4', x: ['polo'] }),
  T('rugby', 'Rugby Shirt', 'Cozy Knits', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'relaxed', hem: 212, fit: 3, c: '#ffffff', pat: 'rugby', cuff: true, x: ['polo', 'whiteCollar'], c2: '#ffffff' }),
  T('henley', 'Henley Top', 'Cozy Knits', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'fitted', hem: 206, fit: 2, c: '#d9c6ad', pat: 'rib', x: ['henley'] }),
  T('hoodie', 'Hoodie', 'Cozy Knits', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'relaxed', hem: 214, fit: 5, c: '#b9bbc2', cuff: true, x: ['hood', 'kangaroo', 'ribHem'] }),
  T('sweatshirt', 'Sweatshirt', 'Cozy Knits', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'relaxed', hem: 210, fit: 4.5, c: '#f2cfd8', cuff: true, x: ['ribNeck', 'ribHem'] }),
  T('crewsweat', 'Crewneck Sweatshirt', 'Cozy Knits', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'relaxed', hem: 210, fit: 4.5, c: '#f4ecdf', cuff: true, x: ['ribNeck', 'ribHem', 'embroHeart'] }),
  T('cowlneck', 'Cowl Neck Top', 'Cozy Knits', { style: 'sleeved', neck: 'scoop', sleeve: 'long', sl: 'fitted', hem: 204, fit: 1.6, c: '#b7a594', x: ['cowl'] }),
  T('turtleneck', 'Turtleneck Top', 'Cozy Knits', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'fitted', hem: 204, fit: 1.4, c: '#f1ead9', pat: 'rib', x: ['turtle'] }),
  T('mockneck', 'Mock Neck Top', 'Tees & Tanks', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'fitted', hem: 204, fit: 1.2, c: '#17151a', x: ['mock'] }),
  T('vneck', 'V-Neck Top', 'Tees & Tanks', { style: 'sleeved', neck: 'v', sleeve: 'long', sl: 'fitted', hem: 204, fit: 1.6, c: '#e5d0b8' }),
  T('scoopneck', 'Scoop Neck Top', 'Tees & Tanks', { style: 'sleeved', neck: 'scoop', sleeve: 'long', sl: 'fitted', hem: 204, fit: 1.3, c: '#c99097' }),
  T('squareneck', 'Square Neck Top', 'Tees & Tanks', { style: 'sleeved', neck: 'square', sleeve: 'long', sl: 'fitted', hem: 200, fit: 1.2, c: '#f7f3ec', x: ['buttons'], btn: '#e8dcc8' }),
  T('sweetheart', 'Sweetheart Neck Top', 'Blouses', { style: 'sleeved', neck: 'sweet', sleeve: 'short', sl: 'puff', hem: 178, fit: 1, c: '#d7a77c', x: ['gathered'] }),
  T('offruffle', 'Off Shoulder Ruffle Top', 'Blouses', { style: 'off', sleeve: 'short', sl: 'offpuff', sleeveStart: .1, hem: 184, fit: 2, c: '#f07c96', x: ['ruffle', 'peplum'] }),
  T('asym', 'Asymmetrical Top', 'Blouses', { style: 'asym', sleeve: 'long', sl: 'fitted', hem: 200, fit: 1.3, c: '#a8806a' }),
  T('highneck', 'High Neck Top', 'Tees & Tanks', { style: 'high', hem: 204, fit: 1.2, c: '#3a3a3f', pat: 'rib' }),
  T('sleeveless', 'Sleeveless Top', 'Tees & Tanks', { style: 'tank', neck: 'crew', hem: 204, fit: 1.5, c: '#dcb99c' }),
  T('muscletee', 'Muscle Tee', 'Tees & Tanks', { style: 'muscle', neck: 'crew', hem: 208, fit: 3, c: '#ffffff', x: ['ribNeck'] }),
  T('cutout', 'Cutout Top', 'Glam & Party', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'fitted', hem: 202, fit: 1.2, c: '#6f6d52', x: ['cutout'] }),
  T('lace', 'Lace Top', 'Glam & Party', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'fitted', hem: 202, fit: 1.5, c: '#fbf8f3', pat: 'lace', x: ['scallop'] }),
  T('mesh', 'Mesh Top', 'Glam & Party', { style: 'sleeved', neck: 'crew', sleeve: 'long', sl: 'fitted', hem: 204, fit: 1.4, c: '#2a2030', pat: 'mesh', sheer: true, under: 'braBlack' }),
  T('sheer', 'Sheer Top', 'Glam & Party', { style: 'sleeved', neck: 'crew', sleeve: 'short', sl: 'relaxed', hem: 198, fit: 2.4, c: '#8f8f96', pat: 'dots', sheer: true, under: 'braBlack' }),
  T('sequin', 'Sequin Top', 'Glam & Party', { style: 'sleeved', neck: 'crew', sleeve: 'short', sl: 'fitted', hem: 200, fit: 2.4, c: '#c9a24a', pat: 'sequin', shine: true }),
  T('satin', 'Satin Top', 'Glam & Party', { style: 'straps', neck: 'cowl', hem: 202, fit: 2, c: '#e3c9a4', shine: true, x: ['cowlDrape'] }),
  T('velvet', 'Velvet Top', 'Glam & Party', { style: 'sleeved', neck: 'boat', sleeve: 'short', sl: 'fitted', hem: 176, fit: 1, c: '#1b1420', velvet: true }),
  T('corduroy', 'Corduroy Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 214, fit: 4, c: '#a0703f', pat: 'cord', cuff: true, x: ['collar', 'buttons', 'pockets2'] }),
  T('denimshirt', 'Denim Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 214, fit: 4, c: '#5f87b8', pat: 'denim', cuff: true, x: ['collar', 'buttons', 'pockets2', 'goldStitch'] }),
  T('chambray', 'Chambray Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 212, fit: 3.4, c: '#a9c3e0', pat: 'chambray', cuff: true, x: ['collar', 'buttons', 'pocket'] }),
  T('flannel', 'Flannel Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 216, fit: 4, c: '#b3312f', pat: 'plaidRed', cuff: true, x: ['collar', 'buttons', 'pockets2'] }),
  T('plaid', 'Plaid Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 214, fit: 3.6, c: '#f2f2f2', pat: 'plaidBW', cuff: true, x: ['collar', 'buttons', 'pockets2'] }),
  T('silk', 'Silk Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 210, fit: 3, c: '#a9c8ea', shine: true, cuff: true, x: ['collar', 'buttons'] }),
  T('linen', 'Linen Shirt', 'Shirts', { style: 'sleeved', neck: 'collar', sleeve: 'long', sl: 'relaxed', hem: 214, fit: 4.2, c: '#efe6d4', pat: 'linen', cuff: true, x: ['collar', 'buttons', 'pocket'] }),
  T('kimono', 'Kimono Top', 'Layers', { outer: 'kimono', under: 'camiBlack', c: '#f1e7d6', pat: 'floral' }),
  T('poncho', 'Poncho Top', 'Layers', { outer: 'poncho', under: 'camiWhite', c: '#e2c9a6', pat: 'rib' }),
  T('cape', 'Cape Top', 'Layers', { outer: 'cape', under: 'camiWhite', c: '#dcd6d2' }),
  T('shrug', 'Shrug', 'Layers', { outer: 'shrug', under: 'camiWhite', c: '#f1e8da', pat: 'rib' }),
  T('bolero', 'Bolero', 'Layers', { outer: 'bolero', under: 'camiBlack', c: '#e2cdb1' }),
  T('bralette', 'Bralette', 'Glam & Party', { style: 'bra', c: '#17151a' }),
  T('corset', 'Corset Top', 'Glam & Party', { style: 'strapless', neck: 'sweetheart', sleeve: 'short', sl: 'offpuff', sleeveStart: .1, hem: 186, fit: .8, c: '#f7f4ee', x: ['boning', 'lacing', 'cups'] }),
  T('tankini', 'Tankini Top', 'Tees & Tanks', { style: 'straps', neck: 'scoop', hem: 198, fit: 1, c: '#e2378c', strapW: 1.8 }),
];

const J = (id, label, o) => ({ id, label, category: 'bottoms', group: 'Designer Jeans', o: { id, ...o } });
const JEANS = [
  J('baggy', 'Baggy Jeans', { fit: 'baggy', rise: 'mid', wash: ['#9dbbe0', '#5f84b4'], x: ['whiskers'] }),
  J('designer', 'Gold Stud Designer Jeans', { fit: 'straight', rise: 'mid', wash: ['#3a4a76', '#1f2748'], x: ['studs', 'kneeCut', 'bow'] }),
  J('straight', 'Classic Straight Jeans', { fit: 'straight', rise: 'mid', wash: ['#7ea0cc', '#4d6f9f'], x: ['whiskers'] }),
  J('skinny', 'Dark Skinny Jeans', { fit: 'skinny', rise: 'high', wash: ['#2e3b63', '#1c2444'] }),
  J('flare', 'High-Rise Flares', { fit: 'flare', rise: 'high', wash: ['#8aa9d4', '#5779aa'], x: ['whiskers'] }),
  J('bootcut', 'Bootcut Jeans', { fit: 'boot', rise: 'mid', wash: ['#5d7fb0', '#3b5a8a'] }),
  J('wideleg', 'Wide-Leg Palazzo Denim', { fit: 'wide', rise: 'high', wash: ['#b4cbe8', '#7d9ccb'], x: ['pleats', 'belt'] }),
  J('mom', 'Mom Jeans', { fit: 'mom', rise: 'high', len: 'ankle', wash: ['#a9c2e2', '#7596c4'], x: ['cuff', 'whiskers'] }),
  J('boyfriend', 'Ripped Boyfriend Jeans', { fit: 'boyfriend', rise: 'mid', len: 'ankle', wash: ['#8fb0dc', '#5a7cae'], x: ['rips', 'cuff'] }),
  J('barrel', 'Barrel Jeans', { fit: 'barrel', rise: 'high', len: 'ankle', wash: ['#6d8fbd', '#48699a'], x: ['whiskers'] }),
  J('y2k', 'Y2K Low-Rise Flares', { fit: 'flare', rise: 'low', wash: ['#94b4dc', '#6385b8'], x: ['sparkBelt', 'whiskers'] }),
  J('cargojeans', 'Cargo Jeans', { fit: 'cargo', rise: 'mid', wash: ['#7d8ca3', '#56647a'], x: ['cargo', 'chain'] }),
  J('blackripped', 'Black Distressed Jeans', { fit: 'skinny', rise: 'high', wash: ['#3a3a42', '#1e1e24'], x: ['rips', 'fringe'] }),
  J('white', 'White Straight Jeans', { fit: 'straight', rise: 'high', wash: ['#fbfbfb', '#e6e6ec'], x: [] }),
  J('acid', 'Acid Wash Jeans', { fit: 'slim', rise: 'high', wash: ['#8faed6', '#5d7eae'], x: ['acid'] }),
  J('rhinestone', 'Rhinestone Flares', { fit: 'flare', rise: 'mid', wash: ['#344774', '#1f2a4c'], x: ['rhinestones'] }),
  J('floral', 'Embroidered Floral Jeans', { fit: 'straight', rise: 'high', wash: ['#b0c8e6', '#86a4cf'], x: ['flowers'] }),
  J('patchwork', 'Patchwork Jeans', { fit: 'wide', rise: 'mid', wash: ['#7c9dca', '#4f70a0'], x: ['patchwork'] }),
  J('splithem', 'Split-Hem Jeans', { fit: 'slim', rise: 'high', len: 'ankle', wash: ['#6f90c0', '#4a6b9c'], x: ['split'] }),
  J('starpatch', 'Star Patch Jeans', { fit: 'baggy', rise: 'mid', wash: ['#a3bfe3', '#6e90c2'], x: ['stars', 'pinkStitch'] }),
  J('butterfly', 'Butterfly Denim', { fit: 'flare', rise: 'low', wash: ['#9fbde3', '#6b8dc0'], x: ['butterflies', 'pinkStitch'] }),
];

const SAREES = [
  /* base = main fabric · shade = pleat lines · border = zari border · blouse · motif colour · motifType: dots | diamond | buti | sequin */
  { id: 'chanderi',   category: 'sarees', label: 'Blush Chanderi',     vibe: 'Soft & dreamy 🌸',        base: '#f7b9cd', shade: '#e08aa8', border: '#d9a441', blouse: '#e9799d', motif: '#e7b85a', motifType: 'dots',    sheer: true },
  { id: 'banarasi',   category: 'sarees', label: 'Red Banarasi',       vibe: 'Bridal-level glam ❤️',    base: '#b3203c', shade: '#7e1128', border: '#e2b045', blouse: '#e2b045', motif: '#e7bd5a', motifType: 'buti' },
  { id: 'kanjivaram', category: 'sarees', label: 'Emerald Kanjivaram', vibe: 'Temple-gold royalty 👑',  base: '#0f6b4b', shade: '#08452f', border: '#d8a93a', blouse: '#b3124a', motif: '#d8a93a', motifType: 'diamond' },
  { id: 'organza',    category: 'sarees', label: 'Lavender Organza',   vibe: 'Floating on clouds 💜',   base: '#cbb4f0', shade: '#a58ad8', border: '#f5f0ff', blouse: '#a88be0', motif: '#ffffff', motifType: 'buti',    sheer: true },
  { id: 'blacksequin', category: 'sarees', label: 'Black Sequin',       vibe: 'Red-carpet rich girl ✨', base: '#1d1822', shade: '#000000', border: '#c9c6d8', blouse: '#1d1822', motif: '#d9d6ea', motifType: 'sequin' },
  { id: 'chikankari', category: 'sarees', label: 'White Chikankari',   vibe: 'Elegant & effortless 🤍', base: '#fbf6f1', shade: '#e6d6cc', border: '#f3b9cc', blouse: '#f7c6d6', motif: '#f0a8c0', motifType: 'buti' },
];

const GROUP_VIBES = {
  'Tees & Tanks': ['Effortlessly cute 🎀', 'Off-duty model energy 🖤', 'Clean girl aesthetic 🤍', 'Casual but make it iconic ✨'],
  'Blouses': ['Cottagecore princess 🌷', 'Soft & dreamy 🌸', 'Brunch in Paris 🥐', 'Pinterest board come to life 📌'],
  'Shirts': ['CEO of looking good 💼', 'Old-money vibes 🤍', 'Boyfriend-shirt chic 😌', 'Smart, sharp & gorgeous ✨'],
  'Cozy Knits': ['Cozy but make it cute ☕', 'Ghibli marathon mode 🎬', 'Autumn in a sweater 🍂', 'Warm hug in fabric 🤗'],
  'Glam & Party': ['Red-carpet ready ✨', 'Main character energy 💃', 'Rich girl era 💸', 'Vogue is calling 📸'],
  'Layers': ['Layered like a pro 🧥', 'Boho goddess 🌙', 'Fashion week energy 👠', 'Effortlessly layered ✨'],
  'Designer Jeans': ['Street-style queen 👖', 'Luxury denim, darling 💎', 'Y2K icon 🦋', 'Denim diva 💙'],
};
const WARDROBE = [...TOPS, ...JEANS, ...SAREES];
(() => { const seen = new Set(); WARDROBE.forEach(w => { if (seen.has(w.id)) console.warn('Duplicate wardrobe id:', w.id); seen.add(w.id); }); })();
const COMPLIMENTS = ['Slay 💅', 'Main character energy ✨', 'Vogue is calling 📸', 'Illegal levels of pretty 🚨', 'Runway ready 👠', 'Obsessed. 💗'];

/** Woven motif pattern for each saree (added once to the SVG <defs>). */
function motifPattern(s) {
  const m = s.motif;
  const shapes = {
    dots:    `<circle cx="3" cy="3" r=".9" fill="${m}"/><circle cx="9" cy="9" r=".9" fill="${m}"/>`,
    diamond: `<path d="M6 2 L9 6 L6 10 L3 6 Z" fill="none" stroke="${m}" stroke-width=".8"/>`,
    buti:    `<g fill="${m}"><circle cx="6" cy="4.6" r="1"/><circle cx="7.4" cy="6" r="1"/><circle cx="6" cy="7.4" r="1"/><circle cx="4.6" cy="6" r="1"/></g><circle cx="6" cy="6" r=".6" fill="${s.shade}"/>`,
    sequin:  `<circle cx="2" cy="2" r="1" fill="${m}"/><circle cx="8" cy="3" r=".8" fill="${m}" opacity=".7"/><circle cx="5" cy="7" r="1" fill="${m}" opacity=".9"/><circle cx="10" cy="9" r=".8" fill="${m}"/><circle cx="2" cy="10" r=".7" fill="${m}" opacity=".6"/>`,
  }[s.motifType] || '';
  return `<pattern id="motif-${s.id}" patternUnits="userSpaceOnUse" width="12" height="12">${shapes}</pattern>`;
}

/** Saree: skirt + pleats, fitted blouse, pallu over the shoulder. */
function sareeParts(s) {
  const op = s.sheer ? 0.84 : 1;
  const SKIRT = 'M79 188 L121 188 Q128 300 141 424 L59 424 Q72 300 79 188 Z';
  const PALLU = 'M72 200 Q92 168 112 120 Q118 106 128 102 L140 110 Q132 140 116 170 Q100 196 86 214 Z';
  const DRAPE = 'M128 102 L143 108 L158 300 L140 296 Z';
  const blouse = makeTop({ style: 'sleeved', neck: 'scoop', sleeve: 'short', sl: 'fitted', hem: 160, fit: 1, c: s.blouse });
  return {
    bottom: `<path d="${SKIRT}" fill="${s.base}" opacity="${op}"/>
             <path d="${SKIRT}" fill="url(#motif-${s.id})" opacity="${op}"/>
             <path d="${SKIRT}" fill="url(#clothShade)"/>
             <g stroke="${s.shade}" stroke-width="1.2" opacity=".5" fill="none">
               <path d="M92 214 L84 424"/><path d="M97 214 L92 424"/><path d="M102 214 L100 424"/><path d="M107 214 L108 424"/>
             </g>
             <path d="M61 404 L139 404 L141 424 L59 424 Z" fill="${s.border}"/>
             <path d="M61 409 L139 409" stroke="${s.shade}" stroke-width="1" stroke-dasharray="3 3"/>`,
    top: blouse.top,
    over:   blouse.over + `
             <path d="${PALLU}" fill="${s.base}" opacity="${op}"/>
             <path d="${PALLU}" fill="url(#motif-${s.id})" opacity="${op}"/>
             <path d="M86 214 Q100 196 116 170 Q132 140 140 110" stroke="${s.border}" stroke-width="5" fill="none"/>
             <path d="${DRAPE}" fill="${s.base}" opacity="${op}"/>
             <path d="${DRAPE}" fill="url(#motif-${s.id})" opacity="${op}"/>
             <path d="M143 108 L158 300 M140 296 L158 300" stroke="${s.border}" stroke-width="5" fill="none"/>`,
  };
}

/** Every item → { bottom, top, over } SVG strings (cached). */
const partsCache = new Map();
function partsOf(item) {
  if (partsCache.has(item.id)) return partsCache.get(item.id);
  let p;
  if (item.category === 'sarees') p = sareeParts(item);
  else if (item.category === 'tops') { const t = makeTop(item.o); p = { bottom: '', top: t.top, over: t.over }; }
  else p = { bottom: makeJeans(item.o), top: '', over: '' };
  partsCache.set(item.id, p);
  return p;
}
const vibeOf = item => item.vibe || pick(GROUP_VIBES[item.group] || GROUP_VIBES['Glam & Party']);

const Wardrobe = (() => {
  const layers = { bottom: $('#layer-bottom'), top: $('#layer-top'), over: $('#layer-over') };
  const baseTop = $('#base-top'), baseBottom = $('#base-bottom');
  const imgLayer = $('#cloth-img-layer');
  const stage = $('#character-stage');
  const sparkles = $('#stage-sparkles');
  const nameEl = $('#outfit-name');
  const itemsEl = $('#closet-items');
  const filtersEl = $('#closet-filters');
  const state = { top: null, bottom: null, saree: null };
  const listeners = [];
  let currentTab = 'tops', currentGroup = 'All';

  const getItem = id => WARDROBE.find(w => w.id === id);

  // fabric patterns + saree motifs into the SVG <defs> once
  $('#char-defs').insertAdjacentHTML('beforeend', FABRIC_DEFS + SAREES.map(motifPattern).join(''));

  // default outfit: white cami + pink shorts
  baseTop.innerHTML = makeTop({ style: 'straps', neck: 'sweetheart', c: '#fff8fb', hem: 200, fit: 1.4, strapC: '#ffc2d6', x: ['laceTrim'] }).top;
  baseBottom.innerHTML = (() => {
    const pts = [[100 - halfW(200) - 1.4, 200], [100 - halfW(214) - 1.6, 214], [100 - halfW(232) - 2, 232], [72.5, 250], [98.5, 250], [100, 238], [101.5, 250], [127.5, 250], [100 + halfW(232) + 2, 232], [100 + halfW(214) + 1.6, 214], [100 + halfW(200) + 1.4, 200]];
    const d = smoothPath(pts, true, .1);
    return `<path d="${d}" fill="#f7a8c4"/><path d="${d}" fill="url(#clothShade)"/><path d="${d}" fill="none" stroke="#e0789f" stroke-width=".8"/><path d="M${f1(100 - halfW(200) - 1.4)} 205 H${f1(100 + halfW(200) + 1.4)}" stroke="#fff" stroke-width="1.2" stroke-dasharray="2 1.5"/>`;
  })();

  // Show her real portrait if her_portrait.webp exists (otherwise keep the drawn head + hair)
  const probe = new Image();
  const showPortrait = () => {
    $$('.her-portrait').forEach(im => { im.style.display = ''; });
    $('#hair-back-drawn').style.display = 'none';
    $('#head-drawn').style.display = 'none';
    $('#hair-clip').style.display = 'none';      // her portrait already wears the pink flower
  };
  const portraitSrc = $('.her-portrait').getAttribute('href');
  probe.onload = showPortrait;
  probe.onerror = () => {                        // viewer blocked the file → fetch it instead
    if (!window.rescueAsset) return;
    rescueAsset(portraitSrc).then(b => { $$('.her-portrait').forEach(im => im.setAttribute('href', b)); showPortrait(); }).catch(() => {});
  };
  probe.src = portraitSrc;

  /** Little preview drawing for the closet buttons (dress-form + the item). */
  const FORM = `<g fill="#f8dce6"><path d="M93.5 84 L106.5 84 L107 100 C109 104 114 105 120 106 C127 107 131 110 131.5 116 C132 122 128 126 126 130 C125 140 124.5 150 123.5 158 C122 168 119 174 118.5 180 C118 188 121 196 124 204 C126.5 212 127 222 127 232 L127 240 L73 240 L73 232 C73 222 73.5 212 76 204 C79 196 82 188 81.5 180 C81 174 78 168 76.5 158 C75.5 150 75 140 74 130 C72 126 68 122 68.5 116 C69 110 73 107 80 106 C86 105 91 104 93 100 Z"/>
    <path d="M73 232 C71 256 74 284 79 306 C81 316 82.5 322 82.5 330 C82 352 85 378 87.5 406 L96 406 C96.5 382 97.5 356 97 334 C96.8 326 97 320 98 312 C100 290 100 262 100 240 Z M127 232 C129 256 126 284 121 306 C119 316 117.5 322 117.5 330 C118 352 115 378 112.5 406 L104 406 C103.5 382 102.5 356 103 334 C103.2 326 103 320 102 312 C100 290 100 262 100 240 Z"/>
    <path d="M69 110 C63 116 62.5 128 63 140 C63.5 152 62 164 61.5 172 C60.5 190 58.5 206 57 222 L64.5 223 C66.5 206 69 190 70.5 173 C71.5 162 74 150 75.5 138 C76.5 128 76 118 74 113 Z M131 110 C137 116 137.5 128 137 140 C136.5 152 138 164 138.5 172 C139.5 190 141.5 206 143 222 L135.5 223 C133.5 206 131 190 129.5 173 C128.5 162 126 150 124.5 138 C123.5 128 124 118 126 113 Z"/></g>`;
  function thumbnail(item) {
    if (item.img) return `<img src="${item.img}" alt="">`;
    const p = partsOf(item);
    const vb = { tops: '42 86 116 160', bottoms: '48 176 104 256', sarees: '46 96 118 334' }[item.category];
    return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${FORM}${p.bottom}${p.top}${p.over}</svg>`;
  }

  function renderFilters() {
    const groups = [...new Set(WARDROBE.filter(w => w.category === currentTab).map(w => w.group).filter(Boolean))];
    if (groups.length < 2) { filtersEl.innerHTML = ''; filtersEl.hidden = true; return; }
    filtersEl.hidden = false;
    filtersEl.innerHTML = ['All', ...groups].map(g => `<button class="closet-chip${g === currentGroup ? ' active' : ''}" data-group="${g}">${g}</button>`).join('');
  }
  filtersEl.addEventListener('click', e => {
    const b = e.target.closest('.closet-chip'); if (!b) return;
    currentGroup = b.dataset.group; renderFilters(); renderCloset();
  });

  function renderCloset() {
    itemsEl.innerHTML = '';
    const list = WARDROBE.filter(w => w.category === currentTab && (currentGroup === 'All' || w.group === currentGroup));
    const frag = document.createDocumentFragment();
    list.forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'closet-item';
      b.dataset.id = item.id;
      b.style.setProperty('--i', Math.min(i, 16));
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="thumb">${thumbnail(item)}</span><span class="label">${item.label}</span>`;
      b.addEventListener('click', () => select(item.id));
      frag.appendChild(b);
    });
    itemsEl.appendChild(frag);
    itemsEl.scrollTop = 0;
    syncButtons();
  }

  function syncButtons() {
    const worn = new Set(Object.values(state).filter(Boolean));
    $$('.closet-item', itemsEl).forEach(b => b.setAttribute('aria-pressed', String(worn.has(b.dataset.id))));
  }

  /** Paint the current outfit onto the character. */
  function render() {
    const out = { bottom: '', top: '', over: '' };
    imgLayer.innerHTML = '';
    [state.saree, state.bottom, state.top].filter(Boolean).map(getItem).forEach(item => {
      if (item.img) {
        const im = document.createElement('img');
        im.src = item.img; im.alt = '';
        imgLayer.appendChild(im);
      } else {
        const p = partsOf(item);
        out.bottom += p.bottom; out.top += p.top; out.over += p.over;
      }
    });
    layers.bottom.innerHTML = out.bottom;
    layers.top.innerHTML = out.top;
    layers.over.innerHTML = out.over;
    baseTop.style.display    = (state.top || state.saree) ? 'none' : '';
    baseBottom.style.display = (state.bottom || state.saree) ? 'none' : '';

    const worn = [state.saree, state.top, state.bottom].filter(Boolean).map(getItem);
    nameEl.textContent = worn.length
      ? `${worn.map(w => w.label).join(' + ')} — ${vibeOf(pick(worn))}`
      : 'Pick a look, gorgeous ✨';

    syncButtons();
    listeners.forEach(fn => fn(isDressed()));
  }

  function celebrate() {
    replayClass(stage, 'snap', 700);
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('span');
      s.textContent = pick(['✦', '✧', '♡']);
      s.style.left = rand(5, 90) + '%';
      s.style.top = rand(5, 85) + '%';
      s.style.animationDelay = rand(0, .25) + 's';
      sparkles.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  }

  /** Put on / take off an item. */
  function select(id) {
    const item = getItem(id);
    if (item.category === 'sarees') {
      state.saree = state.saree === id ? null : id;
      if (state.saree) { state.top = null; state.bottom = null; }
    } else {
      const slot = item.category === 'tops' ? 'top' : 'bottom';
      state[slot] = state[slot] === id ? null : id;
      if (state[slot]) state.saree = null;
    }
    render();
    celebrate();
    if (isDressed() && Math.random() < .35) showToast(pick(COMPLIMENTS), 1600);
  }

  function surprise() {
    if (Math.random() < .25) Object.assign(state, { top: null, bottom: null, saree: pick(SAREES).id });
    else Object.assign(state, { saree: null, top: pick(TOPS).id, bottom: pick(JEANS).id });
    render(); celebrate();
  }

  function reset() { Object.assign(state, { top: null, bottom: null, saree: null }); render(); }

  const isDressed = () => Boolean(state.top || state.bottom || state.saree);

  // tabs
  $$('.closet-tab').forEach(tab => tab.addEventListener('click', () => {
    currentTab = tab.dataset.tab; currentGroup = 'All';
    $$('.closet-tab').forEach(t => { t.classList.toggle('active', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
    renderFilters(); renderCloset();
  }));
  $('#surprise-btn').addEventListener('click', surprise);
  $('#reset-btn').addEventListener('click', reset);

  renderFilters();
  renderCloset();
  render();

  return { isDressed, onChange: fn => listeners.push(fn) };
})();



/* ==========================================================================
   8. MAGIC DOOR — glows once she's dressed, then warps to the drive
   ========================================================================== */
function initDoor() {
  const door = $('#magic-door');
  const hint = $('#door-hint');
  const warp = $('#warp');
  let busy = false;

  Wardrobe.onChange(dressed => {
    door.classList.toggle('ready', dressed);
    hint.innerHTML = dressed
      ? 'Looking unreal. Now step through the <b>Magic Door</b> ✨'
      : 'Dress up first… then the <b>Magic Door</b> will glow 🚪✨';
  });

  door.addEventListener('click', () => {
    if (!Wardrobe.isDressed()) {
      replayClass(door, 'shake', 600);
      showToast('Pick an outfit first, gorgeous 💅');
      return;
    }
    if (busy) return;
    busy = true;
    door.classList.add('open');
    setTimeout(() => replayClass(warp, 'go'), 700);
    // jump to the car while the screen is fully white
    setTimeout(() => window.scrollTo({ top: $('#drive').offsetTop, behavior: 'instant' }), 700 + 750);
    setTimeout(() => { warp.classList.remove('go'); door.classList.remove('open'); busy = false; }, 700 + 1800);
  });
}


/* ==========================================================================
   9. SECTION 3 · MIDNIGHT DRIVE
   The section is 460vh tall with a sticky 100vh view inside. Scroll
   progress (0 → 1) picks which of the 4 sceneries is showing.
   ========================================================================== */
/* ==========================================================================
   9a. MIDNIGHT DRIVE — WORLD TOUR DESTINATIONS
   --------------------------------------------------------------------------
   Every stop is built from one entry in DESTINATIONS:
     sky     : 3 colours, top → horizon
     orb     : 'sun' | 'moon' | null, plus where it sits
     far     : distant backdrop (skyline / hills / none)
     landmark: the drawing in the middle (400 × 240 box, ground at y = 200;
                the box extends to x = -200 … 600 so wide screens stay filled)
     near    : what whizzes past the window ('palms' | 'pines' | 'lamps' | 'cypress' | 'none')
     fx      : little particles ('snow' | 'petals' | 'sand' | 'stars' | 'rain' | 'sparkle' | 'fireflies')
   The ORDER of the whole trip is DRIVE_SCENES (just below).
   ========================================================================== */
const DRIVE_SCENES = [
  { key: 'city',       step: 'Our City',   title: 'Blurry City Lights 🌃',          sub: 'just you, me & a playlist' },
  { key: 'taj',        step: 'Taj Mahal',  title: 'The Taj Mahal 🕌',               sub: 'a whole monument for love — but mine is for you' },
  { key: 'hyderabad',  step: 'Hyderabad',  title: 'Charminar, Hyderabad 🌙',        sub: 'biryani stop? obviously 🍛' },
  { key: 'goa',        step: 'Goa',        title: 'Sunset in Goa 🏖️',               sub: 'sea breeze, your hair everywhere, perfect' },
  { key: 'trivandrum', step: 'Thiruvananthapuram', title: 'Thiruvananthapuram 🌴',  sub: "God's own country, with my own angel" },
  { key: 'manali',     step: 'Manali',     title: 'Snowy Manali ❄️',                sub: 'cold hands, warm heart — hold mine' },
  { key: 'aurora',     step: 'Norway',     title: 'The Northern Lights 🌌',         sub: 'the sky is dancing — for you' },
  { key: 'london',     step: 'London',     title: 'Hello, London 💂',               sub: 'tea for two, rain for free' },
  { key: 'manchester', step: 'Manchester', title: 'Manchester Nights ⚽',            sub: 'you’re my forever home team' },
  { key: 'paris',      step: 'Paris',      title: 'The Streets of Paris 🗼',        sub: 'bonjour, ma chérie' },
  { key: 'germany',    step: 'Germany',    title: 'A Fairytale Castle, Germany 🏰', sub: 'every princess needs a castle' },
  { key: 'italy',      step: 'Italy',      title: 'Ciao, Italia 🍕',                sub: 'pasta, gelato & you (in that order… kidding, you first)' },
  { key: 'barcelona',  step: 'Barcelona',  title: 'Barcelona Sunshine 🇪🇸',          sub: 'tapas, sangria vibes & the prettiest girl in Spain' },
  { key: 'egypt',      step: 'Egypt',      title: 'The Pyramids of Egypt 🐫',       sub: 'ancient wonders, but you’re the real one' },
  { key: 'tokyo',      step: 'Tokyo',      title: 'Tokyo in Bloom 🌸',              sub: 'sakura season — Ghibli would be proud' },
  { key: 'seoul',      step: 'Seoul',      title: 'Seoul at Night 🇰🇷',             sub: 'our own K-drama, episode forever' },
  { key: 'bali',       step: 'Bali',       title: 'Bali Paradise 🌺',               sub: 'rice terraces, sunsets & slow love' },
  { key: 'la',         step: 'Los Angeles', title: 'Los Angeles 🌴',                sub: 'palm trees & movie-star energy (that’s you)' },
  { key: 'vegas',      step: 'Las Vegas',  title: 'Viva Las Vegas 🎰',              sub: 'I already hit the jackpot — it’s you' },
  { key: 'nyc',        step: 'NYC',        title: 'Times Square, Baby 🗽',          sub: 'your name in lights (rich-girl era loading 💸)' },
];

/* ---- roadside things that whizz past (1000 × 300 strips) ---- */
function palmsSVG(c = '#1f3a2a') {
  const palm = x => `<g transform="translate(${x} 300)"><path d="M0 0 Q-6 -90 8 -170" stroke="${c}" stroke-width="7" fill="none"/>
    ${[-150, -110, -60, -20, 25].map(a => `<path d="M8 -170 q${Math.cos(a * Math.PI / 180) * 40} ${Math.sin(a * Math.PI / 180) * 30 - 5} ${Math.cos(a * Math.PI / 180) * 70} ${Math.sin(a * Math.PI / 180) * 30 + 28}" stroke="${c}" stroke-width="6" fill="none" stroke-linecap="round"/>`).join('')}</g>`;
  return `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${[90, 420, 760].map(palm).join('')}</svg>`;
}
function pinesSVG(c = '#1b3a32', snow = false) {
  const pine = (x, s) => `<g transform="translate(${x} 300) scale(${s})"><rect x="-4" y="-20" width="8" height="20" fill="#3b2a22"/>
    <path d="M0 -150 L-34 -70 L-18 -70 L-44 -20 L44 -20 L18 -70 L34 -70 Z" fill="${c}"/>${snow ? '<path d="M0 -150 L-14 -118 L14 -118 Z M-24 -72 L-16 -70 L0 -84 L16 -70 L24 -72 L18 -76 L0 -92 L-18 -76 Z" fill="#f4fbff"/>' : ''}</g>`;
  return `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${[[70, 1], [230, .8], [520, 1.1], [700, .85], [900, 1]].map(([x, s]) => pine(x, s)).join('')}</svg>`;
}
function cypressSVG(c = '#2f4a2a') {
  const cy = x => `<path transform="translate(${x} 300)" d="M0 0 Q-16 -60 -10 -120 Q-4 -180 0 -200 Q4 -180 10 -120 Q16 -60 0 0 Z" fill="${c}"/>`;
  return `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${[120, 170, 560, 610, 880].map(cy).join('')}</svg>`;
}
function hillsSVG(c1, c2) {
  return `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="M0 300 L0 190 Q120 120 260 180 Q400 110 540 170 Q700 100 840 175 Q930 140 1000 170 L1000 300 Z" fill="${c1}"/>
    <path d="M0 300 L0 240 Q160 190 320 235 Q500 185 680 230 Q840 195 1000 225 L1000 300 Z" fill="${c2}"/></svg>`;
}
const NEAR = { palms: palmsSVG, pines: pinesSVG, cypress: cypressSVG, lamps: () => lampsSVG(), none: () => '' };

/* ---- the landmarks (400 × 240, ground line y = 200) ---- */
const tiers = (cx, y0, y1, w0, w1, n, fill, line) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const ya = y0 - (y0 - y1) * i / n, yb = y0 - (y0 - y1) * (i + 1) / n;
    const wa = w0 - (w0 - w1) * i / n, wb = w0 - (w0 - w1) * (i + 1) / n;
    s += `<path d="M${cx - wa / 2} ${ya} L${cx - wb / 2} ${yb + 2} L${cx + wb / 2} ${yb + 2} L${cx + wa / 2} ${ya} Z" fill="${fill}" stroke="${line}" stroke-width="1"/>`;
    s += `<path d="M${cx - wa / 2 + 3} ${ya - 3} H${cx + wa / 2 - 3}" stroke="${line}" stroke-width="1.4" stroke-dasharray="3 3"/>`;
  }
  return s;
};
const arches = (x0, x1, y, h, n, fill) => { let s = ''; const w = (x1 - x0) / n; for (let i = 0; i < n; i++) { const x = x0 + i * w; s += `<path d="M${x + w * .2} ${y} V${y - h * .55} Q${x + w / 2} ${y - h} ${x + w * .8} ${y - h * .55} V${y} Z" fill="${fill}"/>`; } return s; };
const palm = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 Q-4 -40 6 -80" stroke="${c}" stroke-width="4" fill="none"/>${[-160, -120, -70, -25, 20].map(a => `<path d="M6 -80 q${Math.cos(a * Math.PI / 180) * 18} ${Math.sin(a * Math.PI / 180) * 14 - 2} ${Math.cos(a * Math.PI / 180) * 34} ${Math.sin(a * Math.PI / 180) * 14 + 14}" stroke="${c}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`).join('')}</g>`;

const DESTINATIONS = {
  taj: { sky: ['#ffd1dc', '#ffe3c8', '#fff4e0'], orb: 'sun', orbPos: [18, 22], far: hillsSVG('#f2c9b8', '#e8b9a6'), near: 'cypress', fx: 'fireflies',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#8cc28a"/><rect x="186" y="200" width="28" height="40" fill="#bfe4f2"/>
      <g opacity=".35" transform="translate(0 400) scale(1 -1)"><path d="M186 200 H214 V195 Q214 160 200 150 Q186 160 186 195 Z" fill="#fff"/></g>
      <rect x="110" y="182" width="180" height="18" fill="#f1e8dc"/>
      ${[122, 278].map(x => `<rect x="${x - 4}" y="92" width="8" height="90" fill="#fbf6ee" stroke="#e3d3c3"/><path d="M${x - 4} 120 h8 M${x - 4} 150 h8" stroke="#e3d3c3"/><path d="M${x - 7} 94 Q${x} 76 ${x + 7} 94 Z" fill="#fbf6ee" stroke="#e3d3c3"/><path d="M${x} 76 v-6" stroke="#d9b56a" stroke-width="1.5"/>`).join('')}
      <rect x="150" y="122" width="100" height="60" fill="#fbf6ee" stroke="#e3d3c3"/>
      <path d="M186 182 V148 Q200 128 214 148 V182 Z" fill="#e6d8c8"/>${arches(152, 184, 180, 26, 2, '#ece0d2')}${arches(216, 248, 180, 26, 2, '#ece0d2')}
      ${[165, 235].map(x => `<path d="M${x - 10} 122 Q${x - 10} 104 ${x} 100 Q${x + 10} 104 ${x + 10} 122 Z" fill="#fffaf2" stroke="#e3d3c3"/><path d="M${x} 100 v-6" stroke="#d9b56a" stroke-width="1.4"/>`).join('')}
      <rect x="182" y="112" width="36" height="12" fill="#fbf6ee" stroke="#e3d3c3"/>
      <path d="M170 114 Q166 70 200 58 Q234 70 230 114 Z" fill="#fffaf2" stroke="#e3d3c3"/><path d="M200 58 V38" stroke="#d9b56a" stroke-width="2"/><circle cx="200" cy="44" r="2.5" fill="#d9b56a"/>` },

  hyderabad: { sky: ['#3b2a6a', '#b0548a', '#ffb08a'], orb: 'moon', orbPos: [78, 16], far: `SKY:${JSON.stringify({ fill: '#5a3a6a', windows: ['#ffd98a'], minH: 60, maxH: 130, winChance: .35 })}`, near: 'lamps', fx: 'stars',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#6a4a5a"/>
      <rect x="140" y="110" width="120" height="90" fill="#e3bf94"/><path d="M174 200 V150 Q200 116 226 150 V200 Z" fill="#6a3a3a"/>
      <rect x="140" y="98" width="120" height="14" fill="#d8ae80"/>${arches(146, 254, 98, 14, 9, '#8a5a4a')}
      <path d="M186 98 Q186 84 200 80 Q214 84 214 98 Z" fill="#e8c9a0"/>
      ${[140, 260].map(x => `<rect x="${x - 8}" y="40" width="16" height="160" fill="#e8c69c" stroke="#c99a6a"/>${[110, 80, 56].map(y => `<rect x="${x - 11}" y="${y}" width="22" height="5" rx="2" fill="#c99a6a"/>`).join('')}<path d="M${x - 8} 42 Q${x} 26 ${x + 8} 42 Z" fill="#e8c69c" stroke="#c99a6a"/><path d="M${x} 26 v-6" stroke="#c99a6a" stroke-width="1.5"/>`).join('')}
      ${[60, 330].map(x => `<rect x="${x}" y="178" width="30" height="22" fill="#ff8db4"/><path d="M${x - 4} 178 L${x + 15} 166 L${x + 34} 178 Z" fill="#ffc928"/>`).join('')}` },

  goa: { sky: ['#ff7aa2', '#ffb27a', '#ffe0a8'], orb: 'sun', orbPos: [50, 52], orbBig: true, far: '', near: 'palms', fx: 'sparkle',
    landmark: `<rect x="-200" y="150" width="800" height="55" fill="#4a8fc4"/><path d="M-200 162 H600 M-200 176 H600 M-200 190 H600" stroke="#fff" stroke-width="1.4" stroke-dasharray="14 18" opacity=".5"/>
      <path d="M175 150 H225 L235 205 H165 Z" fill="#ffd28a" opacity=".45"/>
      <path d="M-200 198 Q100 190 200 198 Q300 206 600 196 V240 H-200 Z" fill="#f7d9a3"/>
      ${palm(70, 210, 1.3, '#3a2a2a')}${palm(330, 214, 1.1, '#3a2a2a')}
      <g transform="translate(250 196)"><path d="M0 0 V-34" stroke="#fff" stroke-width="2"/><path d="M-26 -30 Q0 -52 26 -30 Z" fill="#ff5f9a"/><path d="M-26 -30 Q-13 -36 0 -30 Q13 -36 26 -30" fill="#fff" opacity=".5"/></g>
      <path d="M110 142 q6 -5 12 0 q6 -5 12 0 M150 128 q5 -4 10 0 q5 -4 10 0" stroke="#3a2a3a" stroke-width="1.6" fill="none"/>` },

  trivandrum: { sky: ['#8fd3e8', '#c6ecd8', '#fff3cf'], orb: 'sun', orbPos: [80, 18], far: hillsSVG('#6db38a', '#4f9a6e'), near: 'palms', fx: 'fireflies',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#3f8f6a"/><rect x="-200" y="206" width="800" height="34" fill="#5fa8b8"/>
      ${tiers(200, 196, 52, 110, 46, 7, '#e8c9a0', '#b8865a')}
      <rect x="182" y="170" width="36" height="30" fill="#6a3a2a"/><path d="M182 170 Q200 156 218 170" fill="#6a3a2a"/>
      ${[184, 200, 216].map(x => `<path d="M${x} 52 v-10" stroke="#d9a53a" stroke-width="3" stroke-linecap="round"/><circle cx="${x}" cy="40" r="3" fill="#e9b949"/>`).join('')}
      <path d="M150 52 H250" stroke="#b8865a" stroke-width="3"/>
      <g transform="translate(40 214)"><path d="M0 0 Q40 12 80 0 L74 -8 H6 Z" fill="#7a4a2a"/><path d="M12 -8 Q40 -30 68 -8 Z" fill="#c99a5a"/><path d="M20 -8 V-18 M40 -8 V-22 M60 -8 V-18" stroke="#7a4a2a"/></g>
      ${palm(330, 204, 1.4, '#2a4a2a')}${palm(365, 206, 1.1, '#2a4a2a')}` },

  manali: { sky: ['#6fb3ea', '#b8def7', '#eef8ff'], orb: 'sun', orbPos: [16, 16], far: `MOUNT`, near: 'pines', nearSnow: true, fx: 'snow',
    landmark: `<path d="M-200 200 L-200 130 L-120 70 L-50 115 L0 100 L70 40 L120 90 L190 20 L260 95 L320 50 L400 120 L470 60 L540 110 L600 90 L600 200 Z" fill="#8aa3c4"/><path d="M-120 70 L-134 86 L-112 84 Z M470 60 L456 78 L478 76 Z" fill="#fff"/>
      <path d="M70 40 L52 58 L66 60 L76 52 L88 60 Z M190 20 L166 50 L182 48 L192 40 L206 50 L216 44 Z M320 50 L302 68 L316 68 L326 60 L338 66 Z" fill="#fff"/>
      <path d="M-200 190 Q-100 170 0 188 Q100 160 200 184 Q300 164 400 180 Q500 168 600 186 V240 H-200 Z" fill="#f4fbff"/>
      <g transform="translate(260 196)"><rect x="-30" y="-32" width="60" height="32" fill="#8a5a3a"/><path d="M-38 -30 L0 -58 L38 -30 Z" fill="#6a3a2a"/><path d="M-38 -30 L0 -58 L38 -30 L32 -34 L0 -52 L-32 -34 Z" fill="#fff"/>
        <rect x="-18" y="-24" width="12" height="12" fill="#ffd27a"/><rect x="8" y="-20" width="12" height="20" fill="#5a3a2a"/><rect x="14" y="-66" width="8" height="20" fill="#5a3a2a"/>
        <path class="smoke" d="M18 -70 q-6 -8 0 -16 q6 -8 0 -16" stroke="#fff" stroke-width="4" fill="none" opacity=".8" stroke-linecap="round"/></g>` },

  london: { sky: ['#4a5b8a', '#8a8fb8', '#e8c4d0'], orb: 'moon', orbPos: [14, 16], far: `SKY:${JSON.stringify({ fill: '#5a5f7a', windows: ['#ffe2a8'], minH: 60, maxH: 150, winChance: .3 })}`, near: 'lamps', fx: 'rain',
    landmark: `<rect x="-200" y="188" width="800" height="52" fill="#5a7a9a"/><path d="M-200 200 H600 M-200 214 H600" stroke="#fff" stroke-width="1" stroke-dasharray="10 16" opacity=".35"/>
      <g transform="translate(90 150)"><circle r="62" fill="none" stroke="#e8eef8" stroke-width="3"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path d="M0 0 L${(Math.cos(a) * 62).toFixed(1)} ${(Math.sin(a) * 62).toFixed(1)}" stroke="#e8eef8" stroke-width="1"/><ellipse cx="${(Math.cos(a) * 62).toFixed(1)}" cy="${(Math.sin(a) * 62).toFixed(1)}" rx="4" ry="3" fill="#bfe0ff"/>`; }).join('')}<path d="M0 0 L-24 58 M0 0 L24 58" stroke="#e8eef8" stroke-width="3"/></g>
      <rect x="276" y="60" width="30" height="130" fill="#c9a86a"/><path d="M276 60 L291 20 L306 60 Z" fill="#6a5a3a"/><path d="M291 20 V8" stroke="#c9a86a" stroke-width="2"/>
      <circle cx="291" cy="80" r="11" fill="#fff6d8" stroke="#6a5a3a" stroke-width="2"/><path d="M291 80 V73 M291 80 L296 82" stroke="#3a2a2a" stroke-width="1.5"/>
      ${[100, 120, 140, 160].map(y => `<path d="M280 ${y} h22" stroke="#9a7a4a"/>`).join('')}
      <rect x="310" y="120" width="70" height="70" fill="#b8985a"/>${arches(312, 378, 188, 20, 5, '#8a6a3a')}
      <g transform="translate(160 184)"><rect x="0" y="-26" width="54" height="26" rx="4" fill="#e2242c"/><rect x="0" y="-38" width="54" height="13" rx="4" fill="#e2242c"/><path d="M4 -34 h46 M4 -20 h46" stroke="#bfe0ff" stroke-width="5" stroke-dasharray="8 3"/><circle cx="12" cy="1" r="4" fill="#222"/><circle cx="42" cy="1" r="4" fill="#222"/></g>` },

  manchester: { sky: ['#2a2350', '#5a3a6a', '#c96a6a'], orb: 'moon', orbPos: [84, 14], far: `SKY:${JSON.stringify({ fill: '#7a3a30', windows: ['#ffd27a', '#ffb07a'], minH: 70, maxH: 160, winChance: .45 })}`, near: 'lamps', fx: 'stars',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#3a4a3a"/>
      <g class="beams" opacity=".35"><path d="M110 60 L60 200 L160 200 Z M290 60 L240 200 L340 200 Z" fill="#fff6c8"/></g>
      <path d="M90 200 L100 120 Q200 96 300 120 L310 200 Z" fill="#c8c8d8"/><path d="M104 130 Q200 108 296 130 L300 150 Q200 128 100 150 Z" fill="#c92a2a"/>
      <path d="M100 150 Q200 128 300 150" stroke="#fff" stroke-width="2" fill="none"/>${arches(112, 288, 200, 30, 11, '#8a8aa0')}
      <path d="M90 120 L200 92 L310 120" stroke="#8a8aa0" stroke-width="4" fill="none"/>
      ${[110, 290].map(x => `<rect x="${x - 2}" y="56" width="4" height="70" fill="#9a9ab0"/><rect x="${x - 14}" y="48" width="28" height="12" fill="#fff6c8"/>`).join('')}
      <rect x="20" y="130" width="14" height="70" fill="#8a3a2a"/><rect x="18" y="126" width="18" height="6" fill="#6a2a1a"/>
      <g transform="translate(360 160)"><ellipse cx="0" cy="0" rx="9" ry="12" fill="#ffc928"/><path d="M-9 -3 H9 M-8 4 H8" stroke="#2a2a2a" stroke-width="3"/><ellipse cx="-9" cy="-10" rx="8" ry="5" fill="#fff" opacity=".8"/><ellipse cx="9" cy="-10" rx="8" ry="5" fill="#fff" opacity=".8"/></g>` },

  germany: { sky: ['#a8c8f0', '#f3d6ec', '#fff0e0'], orb: 'sun', orbPos: [82, 20], far: hillsSVG('#7aa87a', '#5a8a62'), near: 'pines', fx: 'fireflies',
    landmark: `<path d="M-200 200 Q-60 150 60 170 Q130 120 200 140 Q300 120 360 160 Q480 140 600 200 Z" fill="#4f8a5a"/><rect x="-200" y="200" width="800" height="40" fill="#3f7a4a"/>
      <rect x="150" y="90" width="110" height="60" fill="#f7f4ee" stroke="#d8d0c8"/>${arches(154, 256, 128, 16, 7, '#9ab8d8')}
      ${[[150, 56, 14], [260, 70, 12], [205, 40, 16], [230, 80, 10]].map(([x, top, w]) => `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${150 - top}" fill="#f7f4ee" stroke="#d8d0c8"/><path d="M${x - w / 2 - 3} ${top} L${x} ${top - 30} L${x + w / 2 + 3} ${top} Z" fill="#4a6ab8"/><rect x="${x - 2}" y="${top + 12}" width="4" height="8" fill="#9ab8d8"/>`).join('')}
      <path d="M140 90 L205 62 L270 90 Z" fill="#4a6ab8"/><path d="M180 150 V130 Q205 114 230 130 V150 Z" fill="#8a6a4a"/>` },

  italy: { sky: ['#ffc98a', '#ffe0b0', '#fff4dc'], orb: 'sun', orbPos: [14, 24], far: hillsSVG('#d9b88a', '#c9a070'), near: 'cypress', fx: 'sparkle',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#c9a070"/>
      <path d="M40 200 V110 Q150 80 260 110 L250 130 Q240 118 240 140 V200 Z" fill="#e0b98a"/>
      ${[118, 148, 176].map((y, r) => arches(48, 236 - r * 4, y + 22, 22, 9, '#9a6a4a')).join('')}
      <path d="M40 132 H240 M40 160 H240 M40 188 H240" stroke="#c99a6a" stroke-width="2"/>
      <g transform="rotate(5 320 200)"><rect x="300" y="60" width="40" height="140" fill="#f7f1e6" stroke="#d8ccb8"/>${[80, 100, 120, 140, 160, 180].map(y => `<path d="M300 ${y} H340" stroke="#d8ccb8"/>${arches(302, 338, y, 14, 4, '#c9b89a')}`).join('')}<rect x="304" y="44" width="32" height="16" fill="#f7f1e6" stroke="#d8ccb8"/></g>` },

  barcelona: { sky: ['#6ab0f0', '#a8d8f8', '#fff0d0'], orb: 'sun', orbPos: [80, 16], far: `SKY:${JSON.stringify({ fill: '#e8c0a0', windows: ['#fff6e0'], minH: 50, maxH: 110, winChance: .5 })}`, near: 'palms', fx: 'sparkle',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#d8b89a"/>
      <rect x="120" y="120" width="160" height="80" fill="#c8a47a"/>${arches(126, 274, 196, 44, 5, '#8a6a4a')}
      ${[[140, 50], [168, 26], [196, 10], [204, 12], [232, 26], [260, 50]].map(([x, top]) => `<path d="M${x - 11} 124 L${x - 9} ${top + 30} Q${x} ${top} ${x + 9} ${top + 30} L${x + 11} 124 Z" fill="#d9b48a" stroke="#a8845a"/>${[top + 44, top + 64, top + 84].filter(y => y < 118).map(y => `<ellipse cx="${x}" cy="${y}" rx="3" ry="5" fill="#8a6a4a"/>`).join('')}<circle cx="${x}" cy="${top + 4}" r="4" fill="#e8543f"/>`).join('')}
      <path d="M200 60 v-26" stroke="#a8845a" stroke-width="2"/><path d="M194 40 h12" stroke="#a8845a" stroke-width="2"/>` },

  egypt: { sky: ['#ff9a5a', '#ffc27a', '#ffe6b0'], orb: 'sun', orbPos: [74, 30], orbBig: true, far: '', near: 'none', fx: 'sand',
    landmark: `<path d="M-200 200 Q200 184 600 200 V240 H-200 Z" fill="#e8b86a"/>
      <path d="M60 200 L150 80 L240 200 Z" fill="#e0a85a"/><path d="M150 80 L240 200 L180 200 Z" fill="#c98a42"/>
      <path d="M200 200 L270 110 L340 200 Z" fill="#e6b066"/><path d="M270 110 L340 200 L290 200 Z" fill="#c98a42"/>
      <path d="M320 200 L360 150 L400 200 Z" fill="#dca05a"/>
      <g transform="translate(60 196)"><path d="M0 0 H40 V-10 Q40 -20 30 -20 H10 V-30 Q10 -40 0 -40 Q-10 -40 -10 -30 V-8 Q-10 0 0 0 Z" fill="#c9924a"/><path d="M-10 -30 L-16 -18 H-4 Z" fill="#b8843a"/></g>
      <g transform="translate(280 214)"><path d="M0 0 V-14 Q0 -24 10 -26 Q16 -36 24 -26 Q32 -30 34 -20 L40 -34 Q44 -38 46 -32 L42 -18 V0" stroke="#7a4a2a" stroke-width="4" fill="none"/><path d="M4 -16 Q18 -30 34 -18" fill="#9a6a3a"/></g>` },

  tokyo: { sky: ['#2a2350', '#8a4a8a', '#ffb0c8'], orb: 'moon', orbPos: [16, 14], far: `SKY:${JSON.stringify({ fill: '#3a2a5a', windows: ['#ff7ac8', '#7af3ff', '#fff3a8'], minH: 70, maxH: 170, winChance: .45 })}`, near: 'lamps', fx: 'petals',
    landmark: `<path d="M40 200 L150 90 Q160 84 170 90 L280 200 Z" fill="#7a8ab8" opacity=".75"/><path d="M150 90 Q160 84 170 90 L190 110 L176 106 L166 114 L154 106 L140 110 Z" fill="#fff"/>
      <rect x="-200" y="200" width="800" height="40" fill="#3a2a4a"/>
      <g transform="translate(300 200)"><path d="M-40 0 L-6 -150 L6 -150 L40 0 Z" fill="none" stroke="#e8432a" stroke-width="4"/>
        ${[-30, -60, -95, -125].map((y, i) => `<path d="M${-40 + (i + 1) * 7} ${y} H${40 - (i + 1) * 7}" stroke="${i % 2 ? '#fff' : '#e8432a'}" stroke-width="5"/>`).join('')}
        <path d="M-34 -20 L28 -80 M34 -20 L-28 -80 M-22 -80 L18 -130 M22 -80 L-18 -130" stroke="#e8432a" stroke-width="2"/><path d="M0 -150 V-186" stroke="#fff" stroke-width="3"/><rect x="-12" y="-104" width="24" height="10" fill="#ffd27a"/></g>
      ${[[70, 180], [150, 190]].map(([x, y]) => `<g transform="translate(${x} ${y})"><path d="M0 12 V-10" stroke="#5a3a3a" stroke-width="4"/>${[[-14, -18, 16], [8, -22, 18], [-2, -32, 14], [16, -10, 12], [-18, -6, 11]].map(([dx, dy, r]) => `<circle cx="${dx}" cy="${dy}" r="${r}" fill="#ffb3cf"/>`).join('')}</g>`).join('')}` },

  seoul: { sky: ['#1a1a4a', '#4a3a7a', '#a86a9a'], orb: 'moon', orbPos: [14, 16], far: `SKY:${JSON.stringify({ fill: '#2a2a5a', windows: ['#7af3ff', '#ffd98a', '#ff9ec4'], minH: 80, maxH: 200, winChance: .45 })}`, near: 'lamps', fx: 'petals',
    landmark: `<path d="M220 200 Q300 100 400 200 Z" fill="#2a4a3a"/><rect x="-200" y="200" width="800" height="40" fill="#2a2a3a"/>
      <g transform="translate(310 140)"><rect x="-3" y="-80" width="6" height="80" fill="#e8eef8"/><ellipse cx="0" cy="-84" rx="16" ry="8" fill="#e8eef8"/><rect x="-12" y="-94" width="24" height="10" rx="3" fill="#bfe0ff"/><path d="M0 -94 V-130" stroke="#e8eef8" stroke-width="2"/><circle cx="0" cy="-130" r="2.5" fill="#ff5f9a"/></g>
      <g transform="translate(120 200)"><rect x="-70" y="-40" width="140" height="40" fill="#b8423a"/>${arches(-60, 60, 0, 30, 3, '#3a2020')}
        <path d="M-96 -40 Q-80 -52 -60 -56 H60 Q80 -52 96 -40 Q70 -46 60 -46 H-60 Q-70 -46 -96 -40 Z" fill="#3a4a4a"/><path d="M-80 -58 Q-60 -80 0 -82 Q60 -80 80 -58 Z" fill="#4a5a5a"/>
        <path d="M-60 -56 H60" stroke="#6ab08a" stroke-width="4"/></g>
      ${[40, 80, 160, 200].map((x, i) => `<g transform="translate(${x} ${60 + (i % 2) * 8})"><path d="M0 -12 V0" stroke="#fff" stroke-width=".8"/><ellipse rx="7" ry="9" fill="${['#ff5f9a', '#ffc928', '#45c1ff', '#b56cff'][i]}" opacity=".9"/></g>`).join('')}
      <path d="M20 48 Q120 70 220 48" stroke="#fff" stroke-width=".8" fill="none"/>` },

  bali: { sky: ['#ff8a7a', '#ffb88a', '#ffe0a0'], orb: 'sun', orbPos: [50, 40], orbBig: true, far: '', near: 'palms', fx: 'fireflies',
    landmark: `${[[150, '#6ab04a'], [165, '#5aa03e'], [180, '#4a9036'], [195, '#3f802e']].map(([y, c]) => `<path d="M-200 ${y} Q-100 ${y + 14} 0 ${y} Q100 ${y - 14} 200 ${y} Q300 ${y + 14} 400 ${y} Q500 ${y - 14} 600 ${y} V240 H-200 Z" fill="${c}"/><path d="M-200 ${y + 3} Q-100 ${y + 17} 0 ${y + 3} Q100 ${y - 11} 200 ${y + 3} Q300 ${y + 17} 400 ${y + 3} Q500 ${y - 11} 600 ${y + 3}" stroke="#9ad06a" stroke-width="1.4" fill="none"/>`).join('')}
      ${[[150, 1], [250, -1]].map(([x, d]) => `<g transform="translate(${x} 200) scale(${d} 1)">${tiers(0, 0, -150, 64, 12, 8, '#6a5a52', '#3a302a')}<path d="M32 0 V-150 L${6} -150 V0 Z" fill="#6a5a52"/><path d="M32 0 L32 -150" stroke="#3a302a" stroke-width="2"/></g>`).join('')}
      ${palm(60, 190, 1.4, '#2a3a2a')}${palm(345, 192, 1.2, '#2a3a2a')}
      <g fill="#fff"><circle cx="186" cy="200" r="3"/><circle cx="214" cy="200" r="3"/></g><g fill="#ffd54a"><circle cx="186" cy="200" r="1.2"/><circle cx="214" cy="200" r="1.2"/></g>` },

  la: { sky: ['#7a4aa8', '#ff7a9a', '#ffc27a'], orb: 'sun', orbPos: [80, 40], far: hillsSVG('#8a5a7a', '#6a4a6a'), near: 'palms', fx: 'sparkle',
    landmark: `<path d="M-200 200 L-200 130 Q-100 96 0 110 Q80 60 170 96 Q260 50 400 110 Q500 100 600 130 V200 Z" fill="#9a6a7a"/>
      <g font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="24" fill="#fff">${'LOS ANGELES'.split('').map((ch, i) => `<text x="${60 + i * 26}" y="${104 - Math.sin(i / 10 * Math.PI) * 18}" transform="rotate(-3 ${60 + i * 26} 100)">${ch}</text>`).join('')}</g>
      <rect x="-200" y="200" width="800" height="40" fill="#3a2a4a"/><path d="M-200 214 H600" stroke="#ffd27a" stroke-width="2" stroke-dasharray="16 12"/>
      ${[40, 110, 300, 370].map(x => `<g transform="translate(${x} 200)"><path d="M0 0 Q-2 -70 4 -130" stroke="#2a1a2a" stroke-width="3" fill="none"/>${[-160, -110, -60, -20, 20].map(a => `<path d="M4 -130 q${Math.cos(a * Math.PI / 180) * 12} ${Math.sin(a * Math.PI / 180) * 8} ${Math.cos(a * Math.PI / 180) * 22} ${Math.sin(a * Math.PI / 180) * 8 + 10}" stroke="#2a1a2a" stroke-width="2.4" fill="none"/>`).join('')}</g>`).join('')}` },

  vegas: { sky: ['#12082a', '#2a1446', '#6a2a7a'], orb: null, far: `SKY:${JSON.stringify({ fill: '#1a0f33', windows: ['#ff7ac8', '#7af3ff', '#ffe27a'], minH: 120, maxH: 260, winChance: .55 })}`, near: 'lamps', fx: 'sparkle',
    landmark: `<rect x="-200" y="200" width="800" height="40" fill="#1a1024"/>
      <g transform="translate(330 200)"><rect x="-4" y="-160" width="8" height="160" fill="#c9c6d8"/><ellipse cx="0" cy="-160" rx="20" ry="9" fill="#c9c6d8"/><rect x="-16" y="-176" width="32" height="12" rx="4" fill="#7af3ff"/><path d="M0 -176 V-210" stroke="#c9c6d8" stroke-width="2"/></g>
      <g transform="translate(215 200)"><rect x="-4" y="-46" width="8" height="46" fill="#c9c6d8"/>
        <path d="M-92 -104 L0 -156 L92 -104 L0 -44 Z" fill="#fff" stroke="#e2242c" stroke-width="3"/>
        ${Array.from({ length: 18 }, (_, i) => { const t = i / 18 * Math.PI * 2; const x = Math.cos(t) * 84, y = -100 + Math.sin(t) * 50; return `<circle class="bulb-v" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="#ffd27a"/>`; }).join('')}
        <text x="0" y="-122" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#e2242c">WELCOME TO</text>
        <text x="0" y="-104" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="11" fill="#2a5ac9">Fabulous</text>
        <text x="0" y="-84" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="13" font-weight="900" fill="#e2242c">LAS VEGAS</text>
        <path d="M-7 -66 l7 -6 7 6" fill="#e2242c"/></g>` },
};

/** Build the DOM for every destination in DESTINATIONS (inserted before the glass glare). */
function buildDestinations() {
  const frame = $('#window-frame'), glare = $('.window-glare', frame);
  Object.entries(DESTINATIONS).forEach(([key, d]) => {
    const el = document.createElement('div');
    el.className = 'scenery dest';
    el.dataset.scene = key;
    let far = '';
    if (d.far === 'MOUNT') far = `<div class="track track-far" style="--speed:110s">${mountainsSVG() + mountainsSVG()}</div>`;
    else if (typeof d.far === 'string' && d.far.startsWith('SKY:')) { const s = skylineSVG(JSON.parse(d.far.slice(4))); far = `<div class="track track-far" style="--speed:90s">${s + s}</div>`; }
    else if (d.far) far = `<div class="track track-far" style="--speed:100s">${d.far + d.far}</div>`;
    const nearSvg = d.near === 'pines' ? pinesSVG('#1b3a32', !!d.nearSnow) : (NEAR[d.near] || NEAR.none)();
    const night = /^#(1|2|3|4)/.test(d.sky[0]);
    el.innerHTML = `
      <div class="sc-sky" style="background:linear-gradient(180deg, ${d.sky[0]} 0%, ${d.sky[1]} 55%, ${d.sky[2]} 100%)"></div>
      ${night ? '<div class="dest-stars"></div>' : ''}
      ${d.orb ? `<div class="dest-orb orb-${d.orb}${d.orbBig ? ' big' : ''}" style="left:${d.orbPos[0]}%;top:${d.orbPos[1]}%"></div>` : ''}
      ${far}
      <svg class="landmark" viewBox="-200 0 800 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${d.landmark}</svg>
      ${nearSvg ? `<div class="track track-near" style="--speed:9s">${nearSvg + nearSvg}</div>` : ''}
      <div class="dest-fx fx-${d.fx || 'none'}"></div>`;
    frame.insertBefore(el, glare);
    // particles
    const fx = $('.dest-fx', el), n = { snow: 34, petals: 22, sand: 30, stars: 30, rain: 40, sparkle: 18, fireflies: 16 }[d.fx] || 0;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = rand(0, 105) + '%';
      p.style.top = d.fx === 'stars' || d.fx === 'sparkle' || d.fx === 'fireflies' ? rand(4, 80) + '%' : '-6%';
      p.style.setProperty('--d', rand(d.fx === 'rain' ? .8 : 5, d.fx === 'rain' ? 1.4 : 11).toFixed(2) + 's');
      p.style.animationDelay = -rand(0, 11).toFixed(2) + 's';
      fx.appendChild(p);
    }
    if (night) { const st = $('.dest-stars', el); for (let i = 0; i < 40; i++) { const s = document.createElement('span'); s.className = 'star'; s.style.left = rand(0, 100) + '%'; s.style.top = rand(0, 55) + '%'; s.style.setProperty('--t', rand(1.5, 4) + 's'); st.appendChild(s); } }
  });
}


/** Random building silhouettes with lit windows, as an SVG string. */
function skylineSVG({ fill, windows, minH, maxH, roof = 'flat', roofFill = fill, winChance = .45 }) {
  const W = 1000, H = 300;
  let x = 0, out = '';
  while (x < W) {
    const w = randInt(46, 92), h = randInt(minH, maxH), y = H - h;
    out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
    if (roof === 'mansard') out += `<path d="M${x - 2} ${y} L${x + 7} ${y - 14} L${x + w - 7} ${y - 14} L${x + w + 2} ${y} Z" fill="${roofFill}"/>`;
    if (roof === 'antenna' && Math.random() < .35) out += `<rect x="${x + w / 2 - 1}" y="${y - 26}" width="2" height="26" fill="${fill}"/>`;
    for (let wy = y + 10; wy < H - 12; wy += 20) {
      for (let wx = x + 7; wx < x + w - 10; wx += 14) {
        if (Math.random() < winChance) out += `<rect x="${wx}" y="${wy}" width="6" height="9" rx="1" fill="${pick(windows)}" opacity="${rand(.45, 1).toFixed(2)}"/>`;
      }
    }
    x += w + randInt(0, 5);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${out}</svg>`;
}

function mountainsSVG() {
  const peaks = [[80, 120], [220, 90], [380, 110], [540, 100], [720, 120], [880, 130]];
  const caps = peaks.map(([x, y]) => `<path d="M${x - 18} ${y + 22} L${x} ${y} L${x + 18} ${y + 22} L${x + 8} ${y + 17} L${x} ${y + 24} L${x - 8} ${y + 17} Z" fill="#eaf6ff"/>`).join('');
  return `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="M0 300 L0 200 L80 120 L140 170 L220 90 L300 180 L380 110 L460 190 L540 100 L640 180 L720 120 L800 190 L880 130 L1000 200 L1000 300 Z" fill="#0d2436"/>
    ${caps}
    <path d="M0 300 L0 250 L120 200 L260 245 L400 205 L560 250 L700 210 L860 250 L1000 220 L1000 300 Z" fill="#081826"/>
  </svg>`;
}

function lampsSVG() {
  const lamp = x => `<g><circle cx="${x}" cy="118" r="30" fill="rgba(255,220,150,.28)"/><rect x="${x - 2}" y="120" width="4" height="180" fill="#3b2140"/>
    <path d="M${x - 10} 112 L${x + 10} 112 L${x + 6} 126 L${x - 6} 126 Z" fill="#3b2140"/><circle cx="${x}" cy="120" r="5" fill="#ffe7a8"/></g>`;
  return `<svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    ${[120, 370, 620, 870].map(lamp).join('')}
    <rect x="0" y="286" width="1000" height="14" fill="#3b2140"/></svg>`;
}

/** Put two identical copies in a track so it can loop seamlessly. */
const fillTrack = (track, html) => { track.innerHTML = html + html; };

function initDrive() {
  const section = $('#drive');
  buildDestinations();                                   // adds all the world-tour stops
  const sceneryEls = $$('.scenery', section);
  section.style.height = (DRIVE_SCENES.length * 70 + 100) + 'vh';   // ~70vh of scrolling per stop
  const kicker = $('.drive-caption .kicker', section);
  const caption = $('.drive-caption', section);
  const titleEl = $('#drive-title'), subEl = $('#drive-sub');
  const stepsEl = $('#drive-steps');
  const hint = $('#drive-hint');

  // --- optional photo backgrounds from CONFIG ---
  sceneryEls.forEach(el => {
    const src = CONFIG.SCENERY_IMAGES[el.dataset.scene];
    if (src) { el.style.backgroundImage = `url("${src}")`; el.classList.add('has-photo'); }
  });

  // --- build scenery ---
  fillTrack($('[data-skyline="city-far"]'), skylineSVG({ fill: '#2a1f4d', windows: ['#ffd98a', '#ffb0cb'], minH: 120, maxH: 280, roof: 'antenna', winChance: .3 }));
  fillTrack($('[data-skyline="city-mid"]'), skylineSVG({ fill: '#1a1233', windows: ['#ffd98a', '#ff9ec4', '#9fe6ff'], minH: 70, maxH: 220, winChance: .5 }));
  fillTrack($('[data-mountains]'), mountainsSVG());
  fillTrack($('[data-skyline="paris"]'), skylineSVG({ fill: '#7b4a7d', roofFill: '#5b2d57', windows: ['#ffe2a8', '#ffc9d9'], minH: 90, maxH: 170, roof: 'mansard', winChance: .6 }));
  fillTrack($('[data-lamps]'), lampsSVG());
  fillTrack($('[data-skyline="nyc"]'), skylineSVG({ fill: '#140f2e', windows: ['#7af3ff', '#ff7ac8', '#fff3a8'], minH: 160, maxH: 300, roof: 'antenna', winChance: .4 }));

  // city bokeh
  const bokeh = $('#city-bokeh');
  for (let i = 0; i < 26; i++) {
    const b = document.createElement('span');
    const size = rand(14, 60);
    const c = pick(['255,200,120', '255,140,190', '140,220,255', '255,240,200']);
    b.className = 'bokeh';
    Object.assign(b.style, { width: size + 'px', height: size + 'px', left: rand(0, 130) + '%', top: rand(20, 90) + '%',
      background: `radial-gradient(circle, rgba(${c},.95), rgba(${c},0) 70%)` });
    b.style.setProperty('--b', rand(3, 9) + 'px');
    b.style.setProperty('--d', rand(6, 14) + 's');
    b.style.animationDelay = -rand(0, 14) + 's';
    bokeh.appendChild(b);
  }
  // aurora stars + snow
  const stars = $('#aurora-stars');
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('span');
    s.className = 'star';
    Object.assign(s.style, { left: rand(0, 100) + '%', top: rand(0, 70) + '%' });
    s.style.setProperty('--t', rand(1.5, 4) + 's');
    s.style.animationDelay = -rand(0, 4) + 's';
    stars.appendChild(s);
  }
  const snow = $('#aurora-snow');
  for (let i = 0; i < 30; i++) {
    const f = document.createElement('span');
    f.className = 'snowflake';
    f.style.left = rand(0, 110) + '%';
    f.style.setProperty('--d', rand(6, 12) + 's');
    f.style.animationDelay = -rand(0, 12) + 's';
    snow.appendChild(f);
  }
  // paris hearts
  const hearts = $('#paris-hearts');
  for (let i = 0; i < 8; i++) {
    const h = document.createElement('span');
    h.textContent = '♥';
    h.style.left = rand(5, 95) + '%';
    h.style.fontSize = rand(10, 20) + 'px';
    h.style.setProperty('--d', rand(7, 12) + 's');
    h.style.animationDelay = -rand(0, 12) + 's';
    hearts.appendChild(h);
  }
  // NYC billboards (left/top/width/height in %, neon colours, text)
  const BOARDS = [
    { l: 3,  t: 8,  w: 24, h: 22, bg: 'linear-gradient(135deg,#ff2d95,#ff9ec4)', text: 'HAPPY<br>BIRTHDAY ♡', fs: 1.1 },
    { l: 30, t: 4,  w: 30, h: 14, bg: '#1b1b3a', text: `<span>★ ${CONFIG.HER_NAME.toUpperCase()} ★ SOLD OUT WORLD TOUR ★ ${CONFIG.HER_NAME.toUpperCase()} ★ SOLD OUT WORLD TOUR ★</span>`, fs: .9, cls: 'marquee', color: '#7af3ff' },
    { l: 64, t: 6,  w: 20, h: 26, bg: 'linear-gradient(160deg,#ffd000,#ff8a00)', text: '$$$<br>RICH GIRL<br>ERA', fs: .9, color: '#3a1a00' },
    { l: 86, t: 12, w: 12, h: 30, bg: 'linear-gradient(180deg,#00e0ff,#7a5cff)', text: 'VOGUE<br>COVER<br>STAR', fs: .7 },
    { l: 32, t: 22, w: 18, h: 18, bg: 'linear-gradient(135deg,#b400ff,#ff4fd8)', text: '24/7<br>PRETTY', fs: .95 },
    { l: 53, t: 36, w: 22, h: 14, bg: '#ff3b3b', text: 'SHE\'S THE MOMENT', fs: .75 },
    { l: 6,  t: 36, w: 20, h: 16, bg: 'linear-gradient(135deg,#00ffa3,#00b3ff)', text: 'MILLIONAIRE<br>MINDSET', fs: .7, color: '#022' },
    { l: 78, t: 46, w: 18, h: 12, bg: '#ff7ac8', text: 'I ♥ YOU', fs: .9 },
  ];
  $('#nyc-billboards').innerHTML = BOARDS.map(b =>
    `<div class="billboard ${b.cls || ''}" style="left:${b.l}%;top:${b.t}%;width:${b.w}%;height:${b.h}%;background:${b.bg};color:${b.color || '#fff'};
       font-size:clamp(.45rem, ${b.fs}vw + .15rem, ${b.fs * 1.1}rem);box-shadow:0 0 18px ${b.color || 'rgba(255,255,255,.5)'};--f:${rand(3, 6).toFixed(1)}s">${b.text}</div>`
  ).join('');

  // --- progress steps (click to jump) ---
  stepsEl.innerHTML = DRIVE_SCENES.map((s, i) => `<button class="drive-step" data-i="${i}">${s.step}</button>`).join('');
  $$('.drive-step', stepsEl).forEach(btn => btn.addEventListener('click', () => {
    const total = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: section.offsetTop + ((+btn.dataset.i + .5) / DRIVE_SCENES.length) * total, behavior: 'smooth' });
  }));

  // --- scroll → scene ---
  let current = -1, ticking = false;
  function update() {
    ticking = false;
    const total = section.offsetHeight - window.innerHeight;
    const p = clamp(-section.getBoundingClientRect().top / total, 0, 1);
    section.style.setProperty('--p', p.toFixed(3));
    hint.classList.toggle('hide', p > .04);
    const idx = Math.min(DRIVE_SCENES.length - 1, Math.floor(p * DRIVE_SCENES.length));
    section.style.setProperty('--lp', clamp(p * DRIVE_SCENES.length - idx, 0, 1).toFixed(3));   // progress within this stop
    if (idx === current) return;
    current = idx;
    sceneryEls.forEach(el => el.classList.toggle('active', el.dataset.scene === DRIVE_SCENES[idx].key));
    $$('.drive-step', stepsEl).forEach((b, i) => b.classList.toggle('active', i === idx));
    const chip = $$('.drive-step', stepsEl)[idx];
    if (chip) stepsEl.scrollTo({ left: chip.offsetLeft - stepsEl.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' });
    if (kicker) kicker.textContent = `Chapter 3 · Midnight Drive · stop ${idx + 1} of ${DRIVE_SCENES.length}`;
    titleEl.textContent = DRIVE_SCENES[idx].title;
    subEl.textContent = DRIVE_SCENES[idx].sub;
    replayClass(caption, 'swap', 800);
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}


/* ==========================================================================
   10. SECTION 4 · SUGARLESS CAFÉ
   --------------------------------------------------------------------------
   • MENU_TABS  = the category chips above the menu.
   • MENU       = every dish. `cat` must match a tab id. Add/remove freely.
   • Drawings are built from the small "kitchen" helpers below (burger(),
     bowl(), glass()…) so a new dish usually needs just one line of art.
   ========================================================================== */
const MENU_TABS = [
  { id: 'all',     label: 'All Mains' },
  { id: 'desi',    label: 'Desi 🍛' },
  { id: 'fast',    label: 'Fast Food 🍔' },
  { id: 'asian',   label: 'Asian 🥢' },
  { id: 'italian', label: 'Italian 🍝' },
  { id: 'dessert', label: 'Sugar-Free Desserts ✿', dessert: true },
];

/* ---------- kitchen helpers (all drawings use a 100×100 box) ---------- */
const STEAM = `<g class="steam"><path d="M36 30 Q32 22 36 14 Q40 6 36 0"/><path d="M50 26 Q46 18 50 10 Q54 2 50 -4"/><path d="M64 30 Q60 22 64 14 Q68 6 64 0"/></g>`;
const face = (x, y, c = '#4b2440') =>
  `<circle cx="${x - 4}" cy="${y}" r="1.4" fill="${c}"/><circle cx="${x + 4}" cy="${y}" r="1.4" fill="${c}"/>` +
  `<path d="M${x - 2} ${y + 3} Q${x} ${y + 5} ${x + 2} ${y + 3}" stroke="${c}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
  `<ellipse cx="${x - 7}" cy="${y + 3}" rx="2" ry="1.2" fill="#ff8db4" opacity=".7"/><ellipse cx="${x + 7}" cy="${y + 3}" rx="2" ry="1.2" fill="#ff8db4" opacity=".7"/>`;
const PLATE = `<ellipse cx="50" cy="68" rx="46" ry="22" fill="#fff" stroke="#ffd0e0" stroke-width="2.5"/><ellipse cx="50" cy="66" rx="35" ry="15" fill="#fff6f9"/>`;
const BOWL = (band = '#ff8db4') =>
  `<path d="M10 50 Q12 86 50 88 Q88 86 90 50 Z" fill="#fff" stroke="#ffb0cb" stroke-width="2.5"/>
   <path d="M16 64 Q50 74 84 64" stroke="${band}" stroke-width="3" fill="none"/>
   <path d="M50 78 c-2 -3 -6 0 -3 3 l3 3 3 -3 c3 -3 -1 -6 -3 -3z" fill="${band}"/>
   <rect x="38" y="86" width="24" height="5" rx="2" fill="#ffd0e0"/>`;
const KATORI = (x, y, fill, extra = '') =>
  `<ellipse cx="${x}" cy="${y}" rx="13" ry="7" fill="#f3f3f7" stroke="#d9d9e3" stroke-width="1.5"/><ellipse cx="${x}" cy="${y - 1}" rx="10" ry="4.5" fill="${fill}"/>${extra}`;
/** scatter little shapes: pts = [[x,y],…] */
const dots = (pts, fill, r = 1.6) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('');
const grains = (pts, fill) => pts.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="1.1" fill="${fill}" transform="rotate(${(i * 47) % 180 - 90} ${x} ${y})"/>`).join('');
const RICE_PTS = [[26,48],[32,42],[38,36],[44,32],[50,30],[56,32],[62,36],[68,42],[74,48],[30,50],[36,46],[42,40],[48,36],[54,38],[60,42],[66,46],[40,48],[46,44],[52,44],[58,48],[34,52],[64,52],[50,50],[44,50],[56,52]];

function burger({ bun = '#f2b25c', patty = '#8a4b2a', crispy = false, cheese = null, lettuce = '#7cc28a', sauce = null, onion = false }) {
  return `<ellipse cx="50" cy="88" rx="36" ry="4" fill="rgba(75,36,64,.08)"/>
    <path d="M16 72 Q16 86 50 86 Q84 86 84 72 Z" fill="${bun}"/>
    <rect x="13" y="60" width="74" height="13" rx="6.5" fill="${patty}" ${crispy ? 'stroke="#b8651f" stroke-width="2" stroke-dasharray="3 2"' : ''}/>
    ${crispy ? dots([[22, 66], [34, 64], [46, 67], [58, 64], [70, 66], [80, 65]], '#f6c46a', 1.3) : ''}
    ${cheese ? `<path d="M16 60 L84 60 L78 68 L70 62 L60 69 L50 62 L40 69 L30 62 L22 68 Z" fill="${cheese}"/>` : ''}
    ${onion ? `<path d="M24 60 q8 -6 16 0 M52 60 q8 -6 16 0" stroke="#c77ab8" stroke-width="2.5" fill="none"/>` : ''}
    <path d="M13 58 q6 -6 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 L87 62 L13 62 Z" fill="${lettuce}"/>
    ${sauce ? `<path d="M20 57 Q30 63 40 57 Q50 63 60 57 Q70 63 80 57" stroke="${sauce}" stroke-width="3" fill="none" stroke-linecap="round"/>` : ''}
    <path d="M14 56 Q14 22 50 22 Q86 22 86 56 Z" fill="${bun}"/>
    <path d="M24 44 Q30 30 44 27" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".45"/>
    ${[[36, 32], [50, 28], [62, 34], [70, 42], [30, 42]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="1.1" fill="#fff5dc"/>`).join('')}
    ${face(50, 44)}`;
}

function glass({ liquid, liquid2 = null, cream = true, ice = false, straw = '#ff8db4', garnish = '', drizzle = null }) {
  return `<rect x="58" y="2" width="7" height="42" rx="3" fill="${straw}" transform="rotate(14 61 24)"/>
    <path d="M26 28 L74 28 L68 92 Q50 96 32 92 Z" fill="rgba(255,255,255,.7)" stroke="#ffd0e0" stroke-width="2"/>
    <path d="M28 36 L72 36 L67.5 90 Q50 94 32.5 90 Z" fill="${liquid}"/>
    ${liquid2 ? `<path d="M31 70 L69 70 L67.5 90 Q50 94 32.5 90 Z" fill="${liquid2}"/>` : ''}
    ${drizzle ? `<path d="M30 40 L34 58 L38 40 M62 40 L66 56 L70 40" stroke="${drizzle}" stroke-width="2.5" fill="none" stroke-linecap="round"/>` : ''}
    ${ice ? `<g fill="rgba(255,255,255,.6)" stroke="#fff" stroke-width="1"><rect x="34" y="40" width="12" height="12" rx="2" transform="rotate(-12 40 46)"/><rect x="52" y="46" width="12" height="12" rx="2" transform="rotate(10 58 52)"/><rect x="40" y="58" width="11" height="11" rx="2" transform="rotate(20 45 63)"/></g>` : ''}
    ${cream ? `<g fill="#fffaf5" stroke="#f3e0d0" stroke-width="1"><circle cx="34" cy="30" r="7"/><circle cx="46" cy="25" r="9"/><circle cx="58" cy="27" r="8"/><circle cx="68" cy="31" r="6"/></g>` : ''}
    ${garnish}
    <path d="M33 42 L36 86" stroke="#fff" stroke-width="3" opacity=".55" stroke-linecap="round"/>
    ${face(50, 76)}`;
}

const MENU = [
  /* ---------------- DESI ---------------- */
  { id: 'bidyani', cat: 'desi', name: 'Bidyani', desc: 'fragrant, spicy, legendary', msg: 'Bidyani served! 🍛 (yes, Bidyani)',
    svg: `${STEAM}<path d="M16 52 Q50 14 84 52 Z" fill="#f7dc93"/>${grains(RICE_PTS, '#fffaf0')}${grains(RICE_PTS.filter((_, i) => i % 3 === 0), '#f5a623')}
      <ellipse cx="40" cy="42" rx="7" ry="5" fill="#fff"/><ellipse cx="40" cy="42" rx="3.2" ry="2.6" fill="#ffb627"/>
      ${dots([[58, 36], [64, 44], [50, 40]], '#8a4b2a', 2.2)}<path d="M62 32 q3 -4 6 -1 M54 46 q3 -4 6 -1" stroke="#5aa86b" stroke-width="2" fill="none"/>${BOWL('#f5a623')}` },
  { id: 'daltadka', cat: 'desi', name: "Chulbul Dhaba's Dal Tadka Rice", desc: 'dhaba-style comfort', msg: 'Dal tadka + rice, dhaba style 🔥',
    svg: `${PLATE}<path d="M16 66 Q30 44 48 66 Z" fill="#fffaf0"/>${grains([[24,62],[30,56],[36,54],[42,60],[32,62],[38,62]], '#f1e6d0')}
      ${KATORI(66, 60, '#f2b53a', dots([[62, 58], [66, 60], [70, 58]], '#b8321f', 1.4) + dots([[64, 57], [68, 59]], '#5aa86b', 1))}${face(66, 57, '#7a3b10')}` },
  { id: 'bhindi', cat: 'desi', name: 'Bhindi ki Sabzi Roti', desc: 'ghar ka khaana ♡', msg: 'Bhindi + roti, just like home 🏡',
    svg: `${PLATE}<circle cx="34" cy="60" r="17" fill="#e9c58f"/><circle cx="40" cy="64" r="17" fill="#f0d19d" stroke="#e0b777"/>
      ${dots([[34, 58], [42, 66], [46, 60], [36, 70]], '#b5793a', 1.6)}
      ${KATORI(70, 58, '#5f9e4a', [[66, 56], [70, 58], [74, 56], [69, 55]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#8cc56f" stroke="#3f7a32" stroke-width=".8"/>`).join(''))}${face(40, 64, '#8a5a2a')}` },
  { id: 'dalbati', cat: 'desi', name: 'Dal Bati Chokha', desc: 'rustic, smoky, ghee-rich', msg: 'Dal bati chokha — pure desi love 🧈',
    svg: `${PLATE}${[[28, 64], [40, 58], [42, 72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#c98a4a"/><path d="M${x - 4} ${y - 3} l4 3 l3 -4" stroke="#8a5424" stroke-width="1.2" fill="none"/><ellipse cx="${x - 3}" cy="${y - 4}" rx="3" ry="1.5" fill="#fff3c4" opacity=".7"/>`).join('')}
      ${KATORI(70, 56, '#f2b53a')}<path d="M58 76 Q68 64 80 76 Z" fill="#c77a3a"/>${dots([[64, 73], [70, 71], [75, 74]], '#5aa86b', 1.2)}${face(40, 58, '#5a2e10')}` },
  { id: 'tawapulao', cat: 'desi', name: 'Tawa Pulao', desc: 'Mumbai street-style', msg: 'Tawa pulao straight off the tawa 🔥',
    svg: `${STEAM}<rect x="2" y="60" width="14" height="5" rx="2.5" fill="#3a2a2a"/><rect x="84" y="60" width="14" height="5" rx="2.5" fill="#3a2a2a"/>
      <ellipse cx="50" cy="64" rx="38" ry="18" fill="#2f2528"/><ellipse cx="50" cy="61" rx="32" ry="13" fill="#e8793c"/>
      ${grains([[30,58],[38,54],[46,52],[54,52],[62,54],[70,58],[34,64],[44,62],[56,62],[66,64],[50,68],[40,68],[60,68]], '#ffd2a8')}
      ${dots([[36, 60], [52, 57], [64, 62], [44, 66]], '#6dbb5a', 2)}${dots([[58, 58], [40, 57]], '#d93a2a', 1.8)}${face(50, 60, '#5a1e08')}` },
  { id: 'vegroll', cat: 'desi', name: 'Mix Veg Roll (Rolls Mania)', desc: 'wrapped & rolled', msg: 'Mix veg roll from Rolls Mania 🌯',
    svg: `<g transform="rotate(-28 50 55)"><rect x="30" y="14" width="40" height="80" rx="20" fill="#eac48a"/>
      <ellipse cx="50" cy="18" rx="18" ry="8" fill="#6dbb5a"/>${dots([[44, 17], [52, 15], [56, 19]], '#e84a3a', 2.2)}${dots([[48, 20], [58, 16]], '#ffb627', 1.8)}
      <path d="M30 56 L70 56 L70 76 Q70 94 50 94 Q30 94 30 76 Z" fill="#ffe0ec"/>
      <path d="M36 56 L36 92 M46 56 L46 94 M56 56 L56 94 M66 56 L66 90" stroke="#ff8db4" stroke-width="3"/>
      ${face(50, 38, '#7a4a1a')}</g>` },
  { id: 'soyarice', cat: 'desi', name: "EatFit's Soya Rice", desc: 'protein-packed & light', msg: 'Soya rice — healthy AND tasty 💪',
    svg: `<path d="M16 52 Q50 20 84 52 Z" fill="#d9b88a"/>${grains(RICE_PTS, '#f4e6cc')}
      ${[[34, 42], [50, 36], [62, 44], [44, 48], [58, 50]].map(([x, y]) => `<path d="M${x - 4} ${y} q4 -5 8 0 q-4 5 -8 0z" fill="#9a5a2a"/>`).join('')}
      ${dots([[40, 38], [66, 48], [30, 48]], '#6dbb5a', 2)}${BOWL('#6dbb5a')}` },

  /* ---------------- FAST FOOD ---------------- */
  { id: 'kfc', cat: 'fast', name: 'KFC Chicken Burger', desc: 'extra crispy, extra happy', msg: 'KFC chicken burger 🍔 crunch crunch!',
    svg: burger({ bun: '#f0a94c', patty: '#d88b35', crispy: true, sauce: '#fff4d6' }) },
  { id: 'burgersingh', cat: 'fast', name: 'Bunty Pappe Da Aloo Burger (Burger Singh)', desc: 'desi aloo tikki magic', msg: 'Bunty Pappe da burger, balle balle! 🍔',
    svg: burger({ bun: '#e8a04a', patty: '#d9a441', sauce: '#6dbb5a', onion: true }) },
  { id: 'subway', cat: 'fast', name: "Subway's Aloo Patty Sandwich", desc: 'toasted, all the veggies', msg: 'Aloo patty sub, toasted ✨',
    svg: `<ellipse cx="50" cy="80" rx="44" ry="5" fill="rgba(75,36,64,.08)"/><rect x="6" y="58" width="88" height="18" rx="9" fill="#e5a45a"/>
      <rect x="8" y="52" width="84" height="8" rx="4" fill="#d9a441"/>
      <path d="M8 52 q5 -5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 L92 55 L8 55 Z" fill="#7cc28a"/>
      ${[16, 32, 48, 64, 80].map(x => `<ellipse cx="${x}" cy="50" rx="6" ry="3" fill="#e84a3a"/>`).join('')}
      <path d="M6 50 Q8 30 50 30 Q92 30 94 50 Z" fill="#eeb56a"/>${[[24, 40], [40, 36], [56, 36], [72, 40]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="1" fill="#fff5dc"/>`).join('')}${face(50, 42)}` },
  { id: 'onionrings', cat: 'fast', name: 'Onion Rings', desc: 'golden & crunchy', msg: 'Onion rings, ring ring 💍',
    svg: `${PLATE}${[[34, 62], [58, 60], [46, 52], [66, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#e0a257" stroke-width="7"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="#f6c46a" stroke-width="2.5" stroke-dasharray="2 3"/>`).join('')}
      <ellipse cx="80" cy="50" rx="9" ry="5" fill="#fff" stroke="#ffb0cb" stroke-width="1.5"/><ellipse cx="80" cy="50" rx="6" ry="3" fill="#e84a3a"/>${face(46, 50)}` },
  { id: 'truffle', cat: 'fast', name: 'Truffle Fries', desc: 'fancy fries, darling', msg: 'Truffle fries — fancy era 🍟✨',
    svg: `${[26, 34, 42, 50, 58, 66, 74].map((x, i) => `<rect x="${x - 3}" y="${14 + (i % 3) * 5}" width="7" height="44" rx="2" fill="#ffd36e" stroke="#e8b23e" transform="rotate(${(i - 3) * 5} ${x} 58)"/>`).join('')}
      ${dots([[32, 24], [48, 20], [62, 26], [40, 30], [70, 22]], '#2a2020', 1.2)}${dots([[36, 20], [54, 24], [66, 30]], '#fffaf0', 1.5)}
      <path d="M22 44 L78 44 L70 92 L30 92 Z" fill="#ff8db4"/><path d="M22 44 Q50 56 78 44" fill="#ffb0cb"/>
      <path d="M50 66 c-3 -5 -10 0 -5 5 l5 5 5 -5 c5 -5 -2 -10 -5 -5z" fill="#fff"/>${face(50, 80, '#fff')}` },
  { id: 'taco', cat: 'fast', name: 'Chicken Taco', desc: 'crunchy shell, juicy filling', msg: 'Chicken taco time 🌮',
    svg: `<path d="M16 46 q6 -10 12 -2 q6 -10 12 -2 q6 -10 12 -2 q6 -10 12 -2 q6 -10 12 -2 L84 50 L16 50 Z" fill="#7cc28a"/>
      ${dots([[26, 42], [42, 40], [58, 40], [72, 42]], '#e84a3a', 3)}${dots([[34, 44], [50, 42], [66, 44]], '#b8672f', 3.2)}
      <path d="M22 44 l3 -6 M46 42 l2 -6 M62 43 l3 -6" stroke="#ffd54a" stroke-width="2"/>
      <path d="M12 46 A38 38 0 0 0 88 46 Z" fill="#f2c366" stroke="#e0a257" stroke-width="2"/>
      ${dots([[30, 60], [52, 70], [70, 58], [42, 76]], '#e0a257', 1.4)}${face(50, 60, '#8a5424')}` },

  /* ---------------- ASIAN ---------------- */
  {
    id: 'momos', cat: 'asian', name: 'Bamboo Basket Momos', desc: 'steamy & dumpling-y', msg: 'Momos served! 🥟 extra chutney, obviously',
    svg: `${STEAM}
      <path d="M12 58 L12 74 Q50 90 88 74 L88 58 Z" fill="#d9a766"/>
      <g stroke="#b7823f" stroke-width="1.4">${[20, 30, 40, 50, 60, 70, 80].map(x => `<path d="M${x} 62 V${x === 50 ? 84 : 80}"/>`).join('')}</g>
      <ellipse cx="50" cy="58" rx="38" ry="11" fill="#e9c38a"/><ellipse cx="50" cy="58" rx="33" ry="8" fill="#c9965a"/>
      <g fill="#fffaf2" stroke="#efd9c3" stroke-width="1.2">
        <path d="M20 60 Q18 42 31 40 Q44 42 42 60 Q31 64 20 60 Z"/><path d="M58 60 Q56 42 69 40 Q82 42 80 60 Q69 64 58 60 Z"/>
        <path d="M38 62 Q36 40 50 37 Q64 40 62 62 Q50 67 38 62 Z"/></g>
      <g stroke="#e6cbb0" stroke-width="1.1" fill="none"><path d="M31 41 L27 49 M31 41 L31 50 M31 41 L35 49 M69 41 L65 49 M69 41 L69 50 M69 41 L73 49 M50 38 L46 46 M50 38 L54 46"/></g>
      ${face(50, 54)}`,
  },
  { id: 'dumplings', cat: 'asian', name: 'Dumplings', desc: 'pan-fried crescents', msg: 'Dumplings! Tiny pockets of joy 🥟',
    svg: `${STEAM}${PLATE}${[[30, 62], [50, 58], [70, 62], [40, 72], [60, 72]].map(([x, y]) => `<path d="M${x - 11} ${y} Q${x} ${y - 14} ${x + 11} ${y} Q${x} ${y + 5} ${x - 11} ${y} Z" fill="#fff6e6" stroke="#e8c9a0" stroke-width="1.2"/><path d="M${x - 10} ${y} Q${x} ${y + 5} ${x + 10} ${y}" stroke="#e0a257" stroke-width="2" fill="none"/><path d="M${x - 5} ${y - 6} l1 3 M${x} ${y - 7} l0 3 M${x + 5} ${y - 6} l-1 3" stroke="#e8c9a0" stroke-width="1"/>`).join('')}
      <ellipse cx="84" cy="48" rx="9" ry="5" fill="#fff" stroke="#ffb0cb" stroke-width="1.5"/><ellipse cx="84" cy="48" rx="6" ry="3" fill="#7a2e14"/>${face(50, 56)}` },
  {
    id: 'ramen', cat: 'asian', name: 'Ramen + Kimchi', desc: 'slurpy, spicy, soul-warming', msg: 'Ramen with kimchi, just like the dramas 🍜',
    svg: `${STEAM}
      <g stroke="#c98a55" stroke-width="3" stroke-linecap="round"><path d="M72 4 L46 50"/><path d="M82 8 L52 52"/></g>
      <ellipse cx="50" cy="50" rx="40" ry="11" fill="#f2b56c"/>
      <g stroke="#ffe8a3" stroke-width="2.4" fill="none"><path d="M20 49 q5 -5 10 0 t10 0 t10 0 t10 0 t10 0 t10 0"/><path d="M26 53 q5 -4 10 0 t10 0 t10 0 t10 0 t10 0"/></g>
      <ellipse cx="34" cy="45" rx="9" ry="6" fill="#fff"/><circle cx="34" cy="45" r="3.6" fill="#ffae33"/>
      <rect x="58" y="34" width="12" height="14" rx="1.5" fill="#1f3b2e" transform="rotate(10 64 41)"/>
      <path d="M44 42 q4 -7 10 -1 q3 4 -2 6 q-5 2 -8 -5z M52 46 q3 -4 6 0 q-3 3 -6 0z" fill="#e8543f"/>
      <circle cx="68" cy="50" r="1.6" fill="#7cc28a"/><circle cx="24" cy="50" r="1.6" fill="#7cc28a"/>${BOWL()}`,
  },
  { id: 'sushi', cat: 'asian', name: 'Chicken Sushi', desc: 'rolled with love', msg: 'Chicken sushi, itadakimasu 🍣',
    svg: `<rect x="6" y="56" width="88" height="22" rx="4" fill="#d9a766"/><rect x="6" y="74" width="88" height="6" rx="3" fill="#b7823f"/>
      ${[[26, 58], [50, 56], [74, 58]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="13" ry="11" fill="#1f3b2e"/><ellipse cx="${x}" cy="${y - 2}" rx="11" ry="8.5" fill="#fffaf0"/><ellipse cx="${x}" cy="${y - 2}" rx="5" ry="4" fill="#f4a47c"/><circle cx="${x + 2}" cy="${y - 3}" r="1.6" fill="#7cc28a"/>`).join('')}
      <path d="M84 44 q6 -6 10 2 q-6 4 -10 -2z" fill="#9bd66b"/><path d="M8 44 q6 -8 12 -2 q-4 6 -12 2z" fill="#ffb3c6"/>${face(50, 52)}` },
  { id: 'udon', cat: 'asian', name: 'Udon Noodles', desc: 'thick, bouncy, cozy', msg: 'Udon noodles — slurp away 🍜',
    svg: `${STEAM}<ellipse cx="50" cy="50" rx="40" ry="11" fill="#e8c28a"/>
      <g stroke="#fff6e0" stroke-width="4.5" fill="none" stroke-linecap="round"><path d="M22 50 q8 -6 16 0 t16 0 t16 0"/><path d="M30 54 q8 -5 16 0 t16 0 t12 0"/></g>
      <circle cx="66" cy="44" r="6" fill="#fff"/><path d="M62 44 q4 -4 6 0 q-2 3 -4 0" stroke="#ff8db4" stroke-width="1.5" fill="none"/>
      <path d="M26 42 q8 -8 16 -2 l-3 5 q-6 -3 -12 1z" fill="#f2b53a"/>${dots([[46, 44], [54, 42], [38, 48]], '#6dbb5a', 1.8)}${BOWL()}` },
  { id: 'vegcrispy', cat: 'asian', name: 'Veg Crispy', desc: 'Indo-Chinese crunch', msg: 'Veg crispy, maximum crunch 🌶️',
    svg: `${PLATE}${[[30, 62, 10], [46, 56, 20], [60, 64, -15], [42, 70, 35], [66, 56, 5], [54, 72, -30]].map(([x, y, r]) => `<rect x="${x - 7}" y="${y - 4}" width="14" height="8" rx="3" fill="#d99337" stroke="#b8651f" stroke-width="1" transform="rotate(${r} ${x} ${y})"/>`).join('')}
      ${dots([[36, 58], [58, 60], [48, 66]], '#e84a3a', 2)}${dots([[40, 62], [62, 70], [52, 58]], '#6dbb5a', 2)}${dots([[34, 66], [50, 62], [64, 60], [44, 58]], '#fffaf0', .9)}${face(46, 53)}` },

  /* ---------------- ITALIAN ---------------- */
  {
    id: 'pizza', cat: 'italian', name: 'Thin-Crust Mushroom Pizza', desc: 'veggies · mushrooms · cheese pull', msg: 'One slice of thin-crust heaven 🍕',
    svg: `<path d="M50 92 L14 24 Q50 8 86 24 Z" fill="#ffd978" stroke="#f0a84a" stroke-width="2"/>
      <path d="M12 22 Q50 4 88 22 L85 29 Q50 13 15 29 Z" fill="#e0a257"/>
      ${[[38, 40], [58, 48], [46, 64]].map(([x, y]) => `<path d="M${x - 7} ${y} a7 5 0 0 1 14 0 Z" fill="#c9a07a"/><rect x="${x - 2}" y="${y}" width="4" height="5" rx="1" fill="#efdcc4"/>`).join('')}
      <path d="M60 32 q5 -4 9 1 M28 36 q4 -3 8 1" stroke="#5fb36a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M52 76 q4 -3 7 1 M34 52 q4 -3 7 1" stroke="#e2524a" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="68" cy="40" r="2.6" fill="none" stroke="#3a2a2a" stroke-width="1.6"/><circle cx="44" cy="30" r="2.6" fill="none" stroke="#3a2a2a" stroke-width="1.6"/>
      <path d="M50 90 Q48 96 50 99 Q52 96 50 90" fill="#ffd978"/>`,
  },
  { id: 'pasta', cat: 'italian', name: "Pizza Hut's White Sauce Pasta", desc: 'creamy, cheesy, dreamy', msg: 'White sauce pasta, extra cheesy 🍝',
    svg: `${STEAM}${PLATE}<ellipse cx="50" cy="62" rx="30" ry="12" fill="#fff4dc"/>
      ${[[32, 60, 20], [42, 54, -30], [54, 58, 40], [64, 62, -15], [46, 66, 10], [58, 52, 70], [38, 64, -60]].map(([x, y, r]) => `<rect x="${x - 7}" y="${y - 3}" width="14" height="6" rx="2" fill="#f7d98a" stroke="#e0b24a" stroke-width="1" transform="rotate(${r} ${x} ${y})"/>`).join('')}
      ${dots([[36, 56], [60, 66], [50, 60], [44, 60]], '#5aa86b', 1.3)}${dots([[56, 56], [40, 68]], '#e84a3a', 1.8)}${face(50, 58)}` },

  /* ---------------- SUGAR-FREE DESSERTS ---------------- */
  {
    id: 'cupcake', cat: 'dessert', name: 'Heart Cupcake', desc: 'sugar-free, still sweet (like you)', msg: 'Heart cupcake! 0g sugar, 100% love 🧁',
    svg: `<line x1="64" y1="6" x2="64" y2="30" stroke="#c98a55" stroke-width="1.5"/><path d="M64 6 L78 10 L64 14 Z" fill="#fff" stroke="#ff8db4"/>
      <path d="M26 56 L74 56 L66 92 L34 92 Z" fill="#ff9ec1"/>
      <g stroke="#fff" stroke-width="2.5" opacity=".7"><path d="M36 56 L39 92 M46 56 L47 92 M56 56 L55 92 M66 56 L63 92"/></g>
      <path d="M22 58 Q50 44 78 58 Q50 64 22 58 Z" fill="#e8b27a"/>
      <path d="M50 64 C26 50 24 22 42 22 C47 22 50 26 50 30 C50 26 53 22 58 22 C76 22 74 50 50 64 Z" fill="#ffd0e0" stroke="#ff8db4" stroke-width="2"/>
      <path d="M38 30 Q36 36 39 42" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>`,
  },
  {
    id: 'boba', cat: 'dessert', name: 'Boba Tea', desc: 'chewy pearls, no sugar syrup', msg: 'Boba time! 🧋 (the pearls are the best part)',
    svg: `<rect x="54" y="2" width="8" height="40" rx="3" fill="#ff8db4" transform="rotate(12 58 22)"/>
      <path d="M26 30 Q50 12 74 30 Z" fill="rgba(255,255,255,.75)" stroke="#ffd0e0" stroke-width="2"/>
      <path d="M28 35 L72 35 L66 92 Q50 96 34 92 Z" fill="#f1d3b3" stroke="#ffd0e0" stroke-width="2"/>
      <path d="M29 38 L71 38 L70 46 L30 46 Z" fill="#f8e5d0"/>
      <rect x="24" y="29" width="52" height="6" rx="3" fill="#fff" stroke="#ffd0e0"/>
      ${dots([[38, 86], [46, 88], [54, 88], [62, 86], [42, 81], [50, 82], [58, 81], [46, 76], [55, 77]], '#3a2330', 3.2)}
      ${face(50, 58)}<path d="M34 42 L37 86" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>`,
  },
  {
    id: 'popcorn', cat: 'dessert', name: 'Popcorn Bowl', desc: 'for movie night, obviously', msg: 'Popcorn secured 🍿 — movie night is ON',
    svg: `<g fill="#fffaf0" stroke="#f5dfb8" stroke-width="1.5">${[[28, 40, 8], [38, 32, 9], [50, 28, 10], [62, 32, 9], [72, 40, 8], [44, 42, 8], [58, 42, 8], [50, 16, 7], [36, 20, 6], [64, 20, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
      <path d="M24 44 L76 44 L68 94 L32 94 Z" fill="#fff" stroke="#ffb0cb" stroke-width="2"/>
      <g fill="#ff8db4"><path d="M31 44 L39 44 L40 94 L35 94 Z"/><path d="M47 44 L53 44 L52.5 94 L47.5 94 Z"/><path d="M61 44 L69 44 L65 94 L60 94 Z"/></g>
      <circle cx="50" cy="66" r="9" fill="#fff" stroke="#ffb0cb" stroke-width="2"/>
      <path d="M50 64 c-2 -3 -6 0 -3 3 l3 3 3 -3 c3 -3 -1 -6 -3 -3z" fill="#ff5f9a"/>`,
  },
  { id: 'chocolava', cat: 'dessert', name: 'EatClub ka Chocolava', desc: 'molten middle, gooey heart', msg: 'Chocolava! Molten happiness 🍫',
    svg: `${PLATE}<ellipse cx="50" cy="72" rx="26" ry="6" fill="#3a170c"/>
      <path d="M26 70 Q24 36 50 34 Q76 36 74 70 Q50 76 26 70 Z" fill="#6b3421"/>
      <ellipse cx="50" cy="38" rx="14" ry="5" fill="#3a170c"/>
      <path d="M44 38 Q42 52 45 60 Q47 66 44 72 L56 72 Q53 64 56 56 Q58 46 56 38 Z" fill="#3a170c"/>
      <path d="M34 46 Q36 40 42 38" stroke="#8a4a32" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${dots([[32, 50], [66, 46], [68, 60], [30, 62]], '#fff', 1.2)}${face(64, 56, '#ffd0e0')}` },
  { id: 'biscoff', cat: 'dessert', name: 'Biscoff Shake', desc: 'caramel-cookie dream', msg: 'Biscoff shake — cookie butter heaven 🥤',
    svg: glass({ liquid: '#d9a06a', liquid2: '#c98a52', drizzle: '#9a5a2a', garnish: `<rect x="62" y="12" width="18" height="12" rx="2" fill="#b8651f" transform="rotate(25 71 18)"/><g stroke="#8a4a1a" stroke-width=".8" transform="rotate(25 71 18)"><path d="M64 16 h14 M64 20 h14"/></g>` }) },
  { id: 'hotchoc', cat: 'dessert', name: 'Hot Chocolate', desc: 'marshmallow hug in a mug', msg: 'Hot chocolate — warm hugs only ☕',
    svg: `${STEAM}<path d="M72 46 q16 0 16 14 q0 14 -16 14" stroke="#ff8db4" stroke-width="6" fill="none"/>
      <rect x="20" y="34" width="54" height="54" rx="10" fill="#ff9ec1"/><ellipse cx="47" cy="36" rx="27" ry="6" fill="#6b3421"/>
      ${[[36, 34], [48, 32], [58, 35]].map(([x, y]) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="7" rx="2" fill="#fff" stroke="#ffd0e0"/>`).join('')}
      <path d="M47 58 c-3 -5 -10 0 -5 5 l5 5 5 -5 c5 -5 -2 -10 -5 -5z" fill="#fff"/>${face(47, 76, '#fff')}` },
  { id: 'caramel', cat: 'dessert', name: 'Caramel Coffee', desc: 'latte art, caramel swirl', msg: 'Caramel coffee with a latte heart ☕💗',
    svg: `${STEAM}<ellipse cx="50" cy="82" rx="38" ry="8" fill="#fff" stroke="#ffd0e0" stroke-width="2"/>
      <path d="M78 50 q12 0 12 10 q0 10 -12 10" stroke="#fff" stroke-width="5" fill="none"/><path d="M78 50 q12 0 12 10 q0 10 -12 10" stroke="#ffd0e0" stroke-width="1.5" fill="none"/>
      <path d="M20 44 Q22 80 50 80 Q78 80 80 44 Z" fill="#fff" stroke="#ffd0e0" stroke-width="2"/>
      <ellipse cx="50" cy="44" rx="30" ry="7" fill="#c98b52"/><path d="M50 49 c-4 -6 -12 -1 -7 4 l7 5 7 -5 c5 -5 -3 -10 -7 -4z" fill="#fff1dc"/>
      <path d="M26 44 l6 -3 l6 3 l6 -3 l6 3 l6 -3 l6 3 l6 -3 l6 3" stroke="#e0a13a" stroke-width="1.8" fill="none"/>${face(50, 64)}` },
  { id: 'coldcoffee', cat: 'dessert', name: 'Cold Coffee', desc: 'chilled & creamy', msg: 'Cold coffee, ice ice baby 🧊',
    svg: glass({ liquid: '#c9955f', ice: true, straw: '#fff', cream: true }) },
  { id: 'rasmalai', cat: 'dessert', name: 'Rasmalai', desc: 'soft, saffron-kissed', msg: 'Rasmalai — so soft, like your heart 🤍',
    svg: `<ellipse cx="50" cy="50" rx="40" ry="11" fill="#fbe7b8"/>${[[34, 48], [52, 45], [66, 50]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="6" fill="#fffaf0" stroke="#f0dcb0"/>`).join('')}
      <path d="M30 46 l4 -2 M50 43 l5 -2 M64 48 l4 -2" stroke="#6dbb5a" stroke-width="2" stroke-linecap="round"/><path d="M40 50 l3 1 M58 47 l3 1 M70 51 l2 1" stroke="#f08a1c" stroke-width="1.2"/>
      ${face(52, 45)}${BOWL('#e9b949')}` },
  { id: 'kajukatli', cat: 'dessert', name: 'Kaju Katli', desc: 'silver-kissed diamonds', msg: 'Kaju katli — diamonds you can eat 💎',
    svg: `${PLATE}${[[32, 62], [50, 58], [68, 62], [41, 70], [59, 70], [50, 50]].map(([x, y]) => `<path d="M${x} ${y - 8} L${x + 12} ${y} L${x} ${y + 8} L${x - 12} ${y} Z" fill="#f3e3c3" stroke="#e3cfa3" stroke-width="1"/><path d="M${x - 6} ${y - 2} L${x} ${y - 6} L${x + 6} ${y - 2}" stroke="#fff" stroke-width="1.5" fill="none" opacity=".9"/>`).join('')}${face(50, 50)}` },
  { id: 'aamras', cat: 'dessert', name: "Bhau Kaka's Aamras", desc: 'pure mango sunshine', msg: "Bhau Kaka's aamras 🥭 summer in a bowl",
    svg: `<ellipse cx="50" cy="50" rx="40" ry="11" fill="#ffb627"/><path d="M26 50 Q40 44 50 50 Q60 56 74 50" stroke="#ffd36e" stroke-width="3" fill="none"/>
      <path d="M62 38 q8 -8 16 0 q-2 8 -10 8 q-6 -2 -6 -8z" fill="#ff9f1c" stroke="#f08a1c"/><path d="M70 30 q2 -4 6 -4" stroke="#5aa86b" stroke-width="2" fill="none"/>
      ${face(44, 48, '#8a4a0a')}${BOWL('#ffb627')}` },
  { id: 'waffle', cat: 'dessert', name: 'Belgian Waffle', desc: 'crisp squares, berry crown', msg: 'Belgian waffle with berries 🧇🍓',
    svg: `${PLATE}<rect x="26" y="42" width="48" height="36" rx="6" fill="#e9b25c" stroke="#c98a3a" stroke-width="2"/>
      <g stroke="#c98a3a" stroke-width="2">${[38, 50, 62].map(x => `<path d="M${x} 42 V78"/>`).join('')}${[54, 66].map(y => `<path d="M26 ${y} H74"/>`).join('')}</g>
      <path d="M28 50 Q40 58 50 48 Q60 58 72 50" stroke="#5a2e1e" stroke-width="2.5" fill="none"/>
      ${[[36, 42], [60, 40]].map(([x, y]) => `<path d="M${x - 5} ${y} Q${x} ${y + 10} ${x + 5} ${y} Q${x} ${y - 4} ${x - 5} ${y}z" fill="#e84a5f"/><path d="M${x - 3} ${y - 2} l3 -3 l3 3" stroke="#5aa86b" stroke-width="1.5" fill="none"/>`).join('')}${face(50, 64, '#6b3a10')}` },
  { id: 'churros', cat: 'dessert', name: 'Chocolate Churros', desc: 'dunk, bite, repeat', msg: 'Churros + chocolate dip 🍫 dunk away',
    svg: `${PLATE}${[[30, 20], [42, 10], [54, 16]].map(([x, r]) => `<rect x="${x - 4}" y="22" width="9" height="50" rx="4" fill="#d99337" transform="rotate(${r - 15} ${x} 72)"/><path d="M${x - 1} 26 V68 M${x + 2} 26 V68" stroke="#b8651f" stroke-width="1" transform="rotate(${r - 15} ${x} 72)"/>`).join('')}
      <ellipse cx="72" cy="64" rx="13" ry="7" fill="#fff" stroke="#ffb0cb" stroke-width="1.5"/><ellipse cx="72" cy="63" rx="10" ry="4.5" fill="#4a2214"/>${face(72, 61, '#ffd0e0')}` },
];

const Cafe = (() => {
  const plateItems = $('#plate-items');
  const plate = $('#her-plate');
  const countEl = $('#served-count');
  const grid = $('#menu-grid');
  const scroller = $('#menu-scroll');
  const tabsEl = $('#menu-tabs');
  const banner = $('#dessert-banner');
  const menuCount = $('#menu-count');
  const served = new Map();   // id → how many times served
  const MAX_ON_PLATE = 9;      // plate shows the latest 9 dishes

  buildFairyLights($('#cafe-lights'), 18);

  // build every dish button once; tabs just show/hide them
  MENU.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'food-item';
    btn.dataset.cat = item.cat;
    btn.innerHTML = `<svg class="food-svg" viewBox="0 0 100 100" aria-hidden="true">${item.svg}</svg>
      <span class="food-name">${item.name}</span><span class="food-desc">${item.desc}</span><span class="serve-pill">+ serve</span>`;
    btn.addEventListener('click', () => serve(item, btn));
    grid.appendChild(btn);
  });

  function showTab(id) {
    const tab = MENU_TABS.find(t => t.id === id);
    let shown = 0;
    $$('.food-item', grid).forEach(b => {
      const on = id === 'all' ? b.dataset.cat !== 'dessert' : b.dataset.cat === id;
      b.hidden = !on;
      if (on) shown++;
    });
    banner.hidden = !tab.dessert;
    scroller.classList.toggle('dessert-mode', !!tab.dessert);
    scroller.scrollTop = 0;
    $$('.menu-tab', tabsEl).forEach(t => { t.classList.toggle('active', t.dataset.tab === id); t.setAttribute('aria-selected', String(t.dataset.tab === id)); });
    menuCount.textContent = `${shown} dishes`;
  }

  tabsEl.innerHTML = MENU_TABS.map(t => `<button class="menu-tab${t.dessert ? ' dessert' : ''}" role="tab" data-tab="${t.id}">${t.label}</button>`).join('');
  $$('.menu-tab', tabsEl).forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  showTab('all');

  /** Fly a copy of the dish onto her plate. */
  function serve(item, btn) {
    const from = $('.food-svg', btn).getBoundingClientRect();
    const to = plate.getBoundingClientRect();
    const flyer = $('.food-svg', btn).cloneNode(true);
    flyer.classList.add('flyer');
    Object.assign(flyer.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
    document.body.appendChild(flyer);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const anim = flyer.animate(
      [{ transform: 'translate(0,0) scale(1) rotate(0)' },
       { transform: `translate(${dx * .5}px, ${dy * .5 - 120}px) scale(.8) rotate(-15deg)`, offset: .5 },
       { transform: `translate(${dx}px, ${dy}px) scale(.45) rotate(10deg)` }],
      { duration: REDUCED_MOTION ? 1 : 750, easing: 'ease-in-out' });
    anim.onfinish = () => { flyer.remove(); addToPlate(item); };
    replayClass(btn, 'served-flash', 500);
  }

  function addToPlate(item) {
    const n = (served.get(item.id) || 0) + 1;
    served.set(item.id, n);
    let el = plateItems.querySelector(`[data-id="${item.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'plate-food';
      el.dataset.id = item.id;
      el.innerHTML = `<svg viewBox="0 0 100 100">${item.svg}</svg><span class="qty" hidden></span>`;
    }
    plateItems.appendChild(el);                       // newest dish moves to the end
    while (plateItems.children.length > MAX_ON_PLATE) plateItems.firstElementChild.remove();
    replayClass(el, 'plate-food');
    const qty = $('.qty', el);
    qty.hidden = n < 2;
    qty.textContent = '×' + n;

    showToast(item.msg);
    const kinds = served.size;
    countEl.textContent = kinds === MENU.length
      ? '🎉 You tried EVERYTHING. Queen of the café 💗'
      : `${kinds} of ${MENU.length} dishes tried ♡`;
    if (kinds === MENU.length && n === 1) confettiBurst(80);
  }
})();

/* --- Touch-me-not (chui-mui) plant: folds its leaves when touched --- */
function initTouchMeNot() {
  const wrap = $('#touch-me-not');
  const svg = $('#tmn-svg');

  // Each branch: [attach x, attach y, angle (deg), droop when shy (deg), length]
  const BRANCHES = [[60, 98, -58, -26, 34], [60, 88, 52, 24, 36], [60, 74, -24, -30, 34], [60, 66, 22, 30, 32], [60, 56, 0, 18, 26]];

  let html = `<g class="pot">
      <path d="M36 112 L84 112 L78 146 L42 146 Z" fill="#ffb0cb"/>
      <rect x="32" y="106" width="56" height="10" rx="4" fill="#ffd0e0"/>
      <g class="pot-face">
        <g class="calm-face"><circle cx="52" cy="126" r="1.8" fill="#4b2440"/><circle cx="68" cy="126" r="1.8" fill="#4b2440"/><path d="M56 131 Q60 135 64 131" stroke="#4b2440" stroke-width="1.5" fill="none"/></g>
        <g class="shy-face"><path d="M49 124 L54 126 L49 128 M71 124 L66 126 L71 128" stroke="#4b2440" stroke-width="1.5" fill="none"/><path d="M57 132 Q60 130 63 132" stroke="#4b2440" stroke-width="1.5" fill="none"/></g>
        <ellipse cx="47" cy="131" rx="3.5" ry="2" fill="#ff8db4" opacity=".7"/><ellipse cx="73" cy="131" rx="3.5" ry="2" fill="#ff8db4" opacity=".7"/>
      </g></g>
    <path d="M60 108 Q57 84 60 52" stroke="#5aa86b" stroke-width="2.4" fill="none"/>`;

  BRANCHES.forEach(([x, y, r, d, len]) => {
    let leaves = '';
    let i = 0;
    for (let ly = -6; ly >= -len + 2; ly -= 4, i++) {
      leaves += `<ellipse class="leaflet l" style="--i:${i}" cx="-4.6" cy="${ly}" rx="4.6" ry="1.9" fill="#7cc28a" stroke="#5aa86b" stroke-width=".4"/>
                 <ellipse class="leaflet r" style="--i:${i}" cx="4.6" cy="${ly}" rx="4.6" ry="1.9" fill="#7cc28a" stroke="#5aa86b" stroke-width=".4"/>`;
    }
    html += `<g transform="translate(${x} ${y})"><g class="tmn-branch-inner" style="--r:${r}deg;--d:${d}deg">
      <path d="M0 0 L0 ${-len}" stroke="#5aa86b" stroke-width="1.2"/>${leaves}</g></g>`;
  });
  // fluffy pink mimosa flowers
  html += [[52, 48], [68, 54]].map(([x, y]) =>
    `<g transform="translate(${x} ${y})">${Array.from({ length: 12 }, (_, k) => `<path d="M0 0 L0 -6" stroke="#ff8db4" stroke-width="1.2" transform="rotate(${k * 30})"/>`).join('')}<circle r="2.4" fill="#ffb0cb"/></g>`
  ).join('');
  svg.innerHTML = html;

  // behaviour: hover / touch → shy; reopens after a moment
  let reopen;
  const close = () => { clearTimeout(reopen); wrap.classList.add('shy'); };
  const open = (delay) => { clearTimeout(reopen); reopen = setTimeout(() => wrap.classList.remove('shy'), delay); };
  wrap.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') close(); });
  wrap.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') open(1600); });
  wrap.addEventListener('pointerdown', () => { close(); open(2600); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); open(2600); } });
}


/* ==========================================================================
   11. SECTION 5 · COZY LOUNGE — LED TV channels, popup notes + treasure chest
   --------------------------------------------------------------------------
   ✏️ CHANNELS: one entry per channel, in remote order (1–6).
      name  → shown on the channel guide + TV badge
      title → heading of the popup note
      note  → YOUR message that pops up when the channel starts
   The clip for each channel is the matching .channel block in index.html
   (ch_*.mp4). Each channel's room lighting is set in style.css → CHANNEL MOODS.
   Playing a channel ducks the music automatically (AudioManager.watchVideo).
   ========================================================================== */
const CHANNELS = [
  { name: 'Vampire Diaries', emoji: '🦇', title: 'The Vampire Diaries 🦇',
    note: 'The multi-star cast, thrilling series that you love to watch again and again… and so do I.' },
  { name: 'Ginny & Georgia', emoji: '💅', title: 'Ginny & Georgia 💅',
    note: 'The sassiest girl you ever liked.' },
  { name: 'Jodhaa Akbar', emoji: '👑', title: 'Jodhaa Akbar 👑',
    note: 'Ek screen ke andar Malika-e-Aliya hai, aur ek screen ke bahar… par meri wali asli Jodhaa Begum hai.' },
  { name: 'Laila Majnu', emoji: '🌙', title: 'Laila Majnu 🌙',
    note: 'As I always say: tu Laila, aur main Majnu.' },
  { name: 'Jab We Met', emoji: '🚂', title: 'Jab We Met 🚂',
    note: "It's really Jab We Met. I mean the jab-WE-(us)-met wali movie. I love that day we spent together." },
  { name: 'Before Sunrise', emoji: '🌅', title: 'Before Sunrise 🌅',
    note: 'The only movie we both liked together, back when we were in a long-distance relationship.' },
];
const NOTE_SECONDS = 9;      // how long a popup note stays up (she can also close it)
const RICH_LINES = ['Manifestation unlocked: Rich Girl Era 💸👑', 'Future crorepati spotted 💰', 'Diamonds? Obviously. 💎', 'Money flows to you, always ✨', 'Loading: private jet ✈️💗'];

function initLounge() {
  const section = $('#lounge');
  const screen = $('#tv-screen');
  const badge = $('#tv-badge');
  const remote = $('#remote');
  const guide = $('#channel-guide');
  const note = $('#tv-note');
  const channels = $$('.channel', screen);
  const videos = $$('.channel-video', screen);
  let current = 0, switchTimer, noteTimer;

  buildFairyLights($('#fairy-lights'), 16);
  watchImage($('#us-photo'), img => img.closest('.wall-frame').classList.add('img-missing'));

  // channel guide buttons
  guide.innerHTML = CHANNELS.map((c, i) => `<button class="guide-btn" data-ch="${i + 1}"><b>${i + 1}</b>${c.name} ${c.emoji}</button>`).join('');

  videos.forEach(v => {
    const ch = v.closest('.channel');
    watchVideoSource(v, () => ch.classList.add('no-video'), () => ch.classList.remove('no-video'));
    v.addEventListener('playing', () => { const t = $('#tv-tap'); if (t) t.hidden = true; });
    AudioManager.watchVideo(v, 'tv-channel-' + ch.dataset.ch);      // ← ducking hook
  });

  const stopAll = () => videos.forEach(v => { if (!v.paused) v.pause(); });

  function hideNote() { clearTimeout(noteTimer); note.classList.remove('show'); }
  function showNote(n) {
    const c = CHANNELS[n - 1];
    $('#tv-note-title').textContent = c.title;
    $('#tv-note-text').textContent = c.note;
    note.classList.remove('show'); void note.offsetWidth; note.classList.add('show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(hideNote, NOTE_SECONDS * 1000);
  }
  $('#tv-note-close').addEventListener('click', e => { e.stopPropagation(); hideNote(); });

  const tapToPlay = $('#tv-tap');
  /** Start a clip. Called straight from the tap, because iPhones only allow
   *  sound when play() happens inside the tap itself. */
  function playClip(v) {
    tapToPlay.hidden = true;
    v.muted = false;
    try { v.currentTime = 0; } catch (e) { /* not loaded yet */ }
    const p = v.play();
    if (p && p.catch) p.catch(() => { if (v.paused) tapToPlay.hidden = false; });   // blocked → big ▶ on the TV
  }
  tapToPlay.addEventListener('click', e => {
    e.stopPropagation();
    const ch = channels.find(c => +c.dataset.ch === current);
    const v = ch && $('video', ch);
    if (v) playClip(v);
  });

  /** Tune to channel n (0 = TV off / idle screen). */
  function setChannel(n) {
    current = n;
    stopAll();
    hideNote();
    tapToPlay.hidden = true;
    clearTimeout(switchTimer);
    screen.classList.add('switching');                  // quick static between channels
    section.dataset.channel = String(n);                // room mood (style.css)
    badge.textContent = n ? `CH ${n} · ${CHANNELS[n - 1].name}` : '';
    badge.classList.toggle('show', !!n);
    $$('.rbtn[data-ch]', remote).forEach(b => b.classList.toggle('active', +b.dataset.ch === n));
    $$('.guide-btn', guide).forEach(b => b.classList.toggle('active', +b.dataset.ch === n));
    replayClass(remote, 'clicked', 400);
    remote.classList.add('used');

    const ch = n ? channels.find(c => +c.dataset.ch === n) : null;
    const v = ch && $('video', ch);
    if (v) playClip(v);                                 // ← inside the tap, not after a timer

    switchTimer = setTimeout(() => {
      screen.classList.remove('switching');
      channels.forEach(c => c.classList.toggle('active', +c.dataset.ch === n));
      if (n) showNote(n);
    }, REDUCED_MOTION ? 0 : 420);
  }

  const total = CHANNELS.length;
  remote.addEventListener('click', e => {
    const btn = e.target.closest('.rbtn');
    if (!btn) return setChannel(current % total + 1);                  // tap remote body → next channel
    if (btn.dataset.action === 'power') return setChannel(current ? 0 : 1);
    setChannel(+btn.dataset.ch);
  });
  guide.addEventListener('click', e => {
    const btn = e.target.closest('.guide-btn');
    if (btn) setChannel(+btn.dataset.ch === current ? 0 : +btn.dataset.ch);   // tap the playing one again = off
  });

  // pause the TV when she scrolls away (music comes back up)
  new IntersectionObserver(([en]) => { if (!en.isIntersecting) { stopAll(); hideNote(); } }, { threshold: 0.1 }).observe($('#room'));

  /* --- 💰 treasure chest easter egg --- */
  const room = $('#room');
  const chest = $('#chest');
  const burst = $('#chest-burst');
  const msg = $('#rich-msg');
  let msgTimer, opens = 0;

  chest.addEventListener('click', () => {
    chest.classList.add('open');
    const rr = room.getBoundingClientRect(), cr = chest.getBoundingClientRect();
    const x = cr.left - rr.left + cr.width / 2, y = cr.top - rr.top + cr.height * .3;
    for (let i = 0; i < 38; i++) {
      const isCoin = Math.random() < .65;
      const p = document.createElement('span');
      p.className = isCoin ? 'coin' : 'gem';
      if (isCoin) p.textContent = '₹';
      else p.style.setProperty('--c', pick(['#7fe0ff', '#ff7ac8', '#b56cff', '#5dffb0', '#ff5f5f']));
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.setProperty('--dx', rand(-40, 320) + 'px');
      p.style.setProperty('--dy', rand(-260, -90) + 'px');
      p.style.setProperty('--rot', rand(-540, 540) + 'deg');
      p.style.setProperty('--dur', rand(1.1, 1.9) + 's');
      burst.appendChild(p);
      p.addEventListener('animationend', () => p.remove());
    }
    msg.textContent = RICH_LINES[opens++ % RICH_LINES.length];
    msg.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msg.classList.remove('show'); chest.classList.remove('open'); }, 3200);
  });
}


/* ==========================================================================
   11½. SECTION 6 · OUR FIRST ALBUM
   --------------------------------------------------------------------------
   ✏️ ALBUM: one entry per memory, in the order they appear.
      title · date (shown small) · text (your caption)
      media: the files in the /album folder. Several files = a little photo
      stack; tap through them in the viewer.  { video: 'x.mp4', poster: 'x.jpg' }
      is a video (music lowers automatically while it plays).
   To add a new memory later: drop the photo in /album and add one line here.
   ========================================================================== */
const A = name => ({ src: `album/${name}.jpg`, thumb: `album/${name}_thumb.jpg` });
const ALBUM = [
  { title: 'First Picture',   date: 'Feb 2024', media: [A('first_picture'), A('first_picture_2')],
    text: 'The one memorable moment I want to live forever.' },
  { title: 'First Movie',     date: 'Feb 2024', media: [A('first_movie')],
    text: 'Our first movie together — the best part of it was you. 🍿' },
  { title: 'First Flower',    date: 'Mar 2024', media: [A('first_flower')],
    text: 'The first rose I ever gave you. 🌹' },
  { title: 'First Dance',     date: '',         media: [{ video: 'album/first_dance.mp4', thumb: 'album/first_dance_thumb.jpg' }],
    text: "Love isn't in the air — it's in you, sparkling as you dance with me. ✨" },
  { title: 'First (Virtual) Marriage', date: '', media: [A('first_virtual_marriage')],
    text: 'Finally, we got married… virtually! 💍' },
  { title: 'First Game',      date: 'Mar 2024', media: [A('first_game')],
    text: 'I took you to my favourite gaming spot, and you loved the cheese Maggi, fries, Coke and sandwich. 🎮' },
  { title: 'First Zoo',       date: 'Mar 2024', media: [A('first_zoo')],
    text: 'Our first visit to the zoo. 🦒' },
  { title: 'First Gift',      date: 'Jul 2024', media: [A('first_gift')],
    text: 'The very first gift from you — still kept in my heart, and in a safe place at home. 🎁' },
  { title: 'Desi Europe',     date: 'Aug 2024', media: [A('desi_europe')],
    text: 'The place where we can spend the whole day, from shopping to eating. 🛍️' },
  { title: 'First Fight',     date: 'Dec 2024', media: [A('first_fight')],
    text: 'See how much your precious smile means to me — proof that I can still win you back after every fight 🤣 (please forgive me 🥲)' },
  { title: 'First Haircut',   date: 'Oct 2024', media: [A('first_haircut'), A('first_haircut_2')],
    text: 'Your first haircut at a fancy salon. ✂️' },
  { title: 'First Garba',     date: 'Oct 2024', media: [A('first_garba'), A('first_garba_2')],
    text: "We finally went to a garba night! I still can't forget it — we looked so cute (we still do). 💃" },
  { title: 'We Got Caught',   date: '',         media: [A('we_got_caught')],
    text: 'The picture where we got caught… and I still hate it 😭' },
  { title: 'First Ramen',     date: 'Aug 2024', media: [A('first_ramen')],
    text: 'The first delicious bowl of ramen we shared. 🍜' },
  { title: 'First Date Night', date: 'Feb 2025', media: [A('first_date')],
    text: 'Candlelight, a little table, and you. 🕯️' },
  { title: 'First Holi',      date: 'Mar 2025', media: [A('first_holi')],
    text: 'Our first Holi together — soaked, messy and so happy. 🎨' },
  { title: 'First Trek',      date: 'Jul 2025', media: [A('trek_1'), A('trek2'), A('trek_3')],
    text: 'Our first insane trek — but it was so much fun! ⛰️' },
  { title: 'Gorgeous',        date: 'Sep 2025', media: [A('gorgeous')],
    text: 'The picture I keep talking about — “Main ye picture dekh ke pighal jaata hoon 💖 Pari ho ekdum, pari.”' },
  { title: 'First Birthday Post', date: 'Oct 2025', media: [A('first_post_bday')],
    text: 'Time changes, but your beauty never fades. P.S. I still love you. 💗' },
];

function initAlbum() {
  const grid = $('#album-grid');
  const lb = $('#lightbox'), lbMedia = $('#lb-media');
  // flat list of every photo/video so the viewer can step through all of them
  const flat = [];
  ALBUM.forEach((m, mi) => m.media.forEach((item, ii) => flat.push({ m, mi, item, ii })));
  let pos = 0, lastFocus = null;

  grid.innerHTML = ALBUM.map((m, mi) => {
    const first = m.media[0], n = m.media.length, isVideo = !!first.video;
    return `<button class="memory${n > 1 ? ' stack' : ''}" data-mi="${mi}" aria-label="Open ${m.title}">
      <span class="tape" aria-hidden="true"></span>
      <span class="memory-photo">
        <img src="${first.thumb}" alt="${m.title}" loading="lazy" decoding="async" />
        ${isVideo ? '<span class="memory-play" aria-hidden="true">▶</span>' : ''}
        ${n > 1 ? `<span class="memory-badge">${n} photos</span>` : ''}
      </span>
      ${m.date ? `<span class="memory-date">${m.date}</span>` : ''}
      <span class="memory-title">${m.title}</span>
      <span class="memory-text">${m.text}</span>
    </button>`;
  }).join('') + `<div class="memory still-going" aria-label="And still going on">
      <span class="still-heart">♥</span><span class="still-text">And still going on…</span><span class="still-sub">(a lot more firsts to come)</span>
    </div>`;

  function stopVideo() {
    const v = $('video', lbMedia);
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    AudioManager.release('album-video');                            // music back up
  }

  /** Show flat[i]. Called from taps, so a video can start with sound straight away. */
  function show(i) {
    stopVideo();
    pos = (i + flat.length) % flat.length;
    const { m, item, ii } = flat[pos];
    if (item.video) {
      lbMedia.innerHTML = `<video controls playsinline preload="auto" poster="${item.thumb}"><source src="${item.video}" type="video/mp4" /></video>`;
      const v = $('video', lbMedia);
      AudioManager.watchVideo(v, 'album-video');                      // ← music ducks while it plays
      watchVideoSource(v, () => {}, () => {});
      const p = v.play(); if (p && p.catch) p.catch(() => { /* blocked → the play button on the player works */ });
    } else {
      lbMedia.innerHTML = `<img src="${item.src}" alt="${m.title}" />`;
    }
    $('#lb-title').textContent = m.title;
    $('#lb-text').textContent = m.text;
    $('#lb-date').textContent = m.date;
    $('#lb-count').textContent = m.media.length > 1 ? `${ii + 1} / ${m.media.length}` : '';
    // preload the neighbours so swiping feels instant
    [pos + 1, pos - 1].forEach(k => { const it = flat[(k + flat.length) % flat.length].item; if (it.src) new Image().src = it.src; });
  }
  function open(mi) {
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.classList.add('lb-open');
    show(flat.findIndex(f => f.mi === mi));
    $('#lb-close').focus();
  }
  function close() {
    stopVideo();
    AudioManager.release('album-video');
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    if (lastFocus) lastFocus.focus();
  }

  grid.addEventListener('click', e => { const card = e.target.closest('.memory[data-mi]'); if (card) open(+card.dataset.mi); });
  $('#lb-close').addEventListener('click', close);
  $('#lb-prev').addEventListener('click', () => show(pos - 1));
  $('#lb-next').addEventListener('click', () => show(pos + 1));
  lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('lb-figure')) close(); });
  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(pos + 1);
    if (e.key === 'ArrowLeft') show(pos - 1);
  });
  // swipe left / right on phones
  let x0 = null;
  lb.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50 && !e.target.closest('video')) show(pos + (dx < 0 ? 1 : -1));
  });
}


/* ==========================================================================
   11¾. SECTION 7 · OUR STORY ON THE BIG SCREEN
   --------------------------------------------------------------------------
   ✏️ BIG_SCREEN: the playlist, in order (oldest → newest, "best times" last).
      P('name', 'Mon YYYY') = a photo  → nostalgia/name.jpg
      V('name', 'Mon YYYY') = a video  → nostalgia/name.mp4 (+ name.jpg poster)
   Photos stay up for PHOTO_SECONDS; videos play to the end.
   Videos start MUTED (browsers only allow silent autoplay). Tapping 🔊 turns
   sound on for every video after that, and the music ducks while they play.
   ========================================================================== */
const P = (name, date) => ({ type: 'photo', src: `nostalgia/${name}.jpg`, date });
const V = (name, date) => ({ type: 'video', src: `nostalgia/${name}.mp4`, poster: `nostalgia/${name}.jpg`, date });
const BIG_SCREEN = [
  P('p20240211_032632702_portrait', 'Feb 2024'),
  P('p20240211_071523182', 'Feb 2024'),
  P('p20240211_091137703_portrait', 'Feb 2024'),
  V('v_20240223', 'Feb 2024'),
  P('p20240305_121641003', 'Mar 2024'),
  P('p20240306_114720173', 'Mar 2024'),
  P('p20240316_102011306', 'Mar 2024'),
  P('p20240317_131457181', 'Mar 2024'),
  P('p20240321_042450366', 'Mar 2024'),
  V('v_20240404', 'Apr 2024'),
  P('p20240412_075457618', 'Apr 2024'),
  P('p20240412_081816459', 'Apr 2024'),
  P('p20240505_093728147_portrait_collage', 'May 2024'),
  P('p20240505_093732194_portrait', 'May 2024'),
  P('p20240506_052445846', 'May 2024'),
  P('p20240515_131444475', 'May 2024'),
  P('p20240521_124649343_portrait', 'May 2024'),
  P('p20240522_133812770_mp', 'May 2024'),
  P('p20240522_135412031_night', 'May 2024'),
  P('p20240711_114220559', 'Jul 2024'),
  P('p20240717_155959873_portrait', 'Jul 2024'),
  P('p20241010_102026293', 'Oct 2024'),
  P('p20241011_135930500', 'Oct 2024'),
  P('p20241011_143545569', 'Oct 2024'),
  P('p20241117_114322454_portrait', 'Nov 2024'),
  P('p20241129_122447292', 'Nov 2024'),
  P('p20241129_130222785', 'Nov 2024'),
  P('p20250101_054143764', 'Jan 2025'),
  P('p20250108_134406389', 'Jan 2025'),
  P('p20250127_172323550_mp', 'Jan 2025'),
  P('p20250207_162316767', 'Feb 2025'),
  P('p20250214_142514585_mp', 'Feb 2025'),
  P('p20250228_141555287', 'Feb 2025'),
  P('p20250312_142056187_mp', 'Mar 2025'),
  P('p20250312_171653520_mp', 'Mar 2025'),
  P('p20250710_162400950_mp', 'Jul 2025'),
  P('p20250928_144927724_mp', 'Sep 2025'),
  P('p20251109_133054039', 'Nov 2025'),
  P('p20260126_084736196_mp', 'Jan 2026'),
  P('p20260127_151409547_mp', 'Jan 2026'),
  P('snapchat_1144805873', ''),
  P('snapchat_1663609903', ''),
  P('snapchat_1665416254', ''),
  P('snapchat_1698215718', ''),
  P('snapchat_1774597674', ''),
  P('snapchat_1978668917', ''),
  P('snapchat_248272193', ''),
  P('snapchat_378185517', ''),
  P('snapchat_472854104', ''),
  P('snapchat_800916884', ''),
  P('sleep', ''),
  V('v_mimicking', ''),
  V('v_best_times', ''),
];
const PHOTO_SECONDS = 3.6;
const CROWD_LINES = ['Awww 🥹', 'So cute!! 😍', 'Couple goals 💕', 'Wooo! 🎉', 'Omg 😭💖', 'Encore! 👏', 'Made for each other ✨', 'Aww my heart 💗', 'Cuties!! 🥰', 'Iconic 💅'];
const LAUGH_LINES = ['HAHAHA 😂', 'LMAOOO 🤣', 'I can’t 😭😂', 'Stop it 😂', 'Hahaha so cute 🤭'];

function initBigScreen() {
  const city = $('#city');
  const layers = $$('.bb-slide', city);
  const dateEl = $('#bb-date'), countEl = $('#bb-count'), bar = $('#bb-progress');
  const soundBtn = $('#bb-sound'), playBtn = $('#bb-play');
  let idx = -1, front = 0, timer = null, raf = null, playing = true, inView = false, soundOn = false, video = null;

  /* ---- scenery: stars, skyline, taxis, crowd ---- */
  const stars = $('#city-stars');
  for (let i = 0; i < 50; i++) { const s = document.createElement('span'); s.style.left = rand(0, 100) + '%'; s.style.top = rand(0, 100) + '%'; s.style.setProperty('--t', rand(1.5, 4) + 's'); s.style.animationDelay = -rand(0, 4) + 's'; stars.appendChild(s); }
  $('#city-skyline').innerHTML = skylineSVG({ fill: '#1c1236', windows: ['#ffd98a', '#ff9ec4', '#9fe6ff'], minH: 120, maxH: 290, roof: 'antenna', winChance: .35 });
  const taxiSVG = c => `<svg viewBox="0 0 60 26"><path d="M4 18 Q4 11 11 10 L17 4 Q19 2 23 2 L37 2 Q41 2 43 5 L48 10 Q56 11 56 17 L56 19 Q56 21 54 21 L6 21 Q4 21 4 19 Z" fill="${c}"/><path d="M19 5 L37 5 L41 10 L16 10 Z" fill="#cfe9ff"/><rect x="26" y="0" width="8" height="3" rx="1" fill="#222"/><path d="M4 14 H56" stroke="#222" stroke-width="1.2" stroke-dasharray="3 2"/><circle cx="15" cy="21" r="4.5" fill="#222"/><circle cx="45" cy="21" r="4.5" fill="#222"/><circle cx="55" cy="15" r="1.6" fill="#fff6c8"/></svg>`;
  $('#taxis').innerHTML = [
    { c: '#ffc928', top: 8, d: 8, delay: 0 }, { c: '#ffc928', top: 8, d: 8, delay: -4 }, { c: '#ff8db4', top: 8, d: 10, delay: -7 },
    { c: '#ffc928', top: 52, d: 9, delay: -2, rev: true }, { c: '#8ad4ff', top: 52, d: 11, delay: -6, rev: true },
  ].map(t => `<div class="taxi${t.rev ? ' rev' : ''}" style="top:${t.top}%;--d:${t.d}s;--delay:${t.delay}s">${taxiSVG(t.c)}</div>`).join('');

  const SKINS = ['#f2c2a0', '#e0a57e', '#c98b64', '#a46a45', '#f7d2b6', '#8a5a3a'];
  const HAIR = ['#1d1717', '#3a2418', '#5a3a22', '#2a2020', '#b8864a', '#1a1a1a'];
  const CLOTHES = ['#ff5f9a', '#45c1ff', '#ffc928', '#7cc28a', '#b56cff', '#ff7a5c', '#ffffff', '#2a2f4a', '#f7a8c4', '#5ad6c1'];
  let people = '';
  [[34, 118, .82], [22, 142, 1]].forEach(([n0, baseY, sc]) => {
    for (let i = 0; i < n0; i++) {
      const x = 14 + i * (970 / n0) + rand(-6, 6), s = sc * rand(.9, 1.1), y = baseY;
      const kind = pick(['cheer', 'cheer', 'phone', 'jump', 'laugh', 'idle']);
      const skin = pick(SKINS), hair = pick(HAIR), top = pick(CLOTHES), dl = rand(0, .8).toFixed(2);
      const arms = kind === 'cheer' || kind === 'jump'
        ? `<g class="arms"><path d="M-7 -30 L-13 -46 M7 -30 L13 -46" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/></g>`
        : kind === 'phone'
          ? `<path d="M6 -30 L10 -44" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/><rect x="7" y="-53" width="7" height="10" rx="1.5" fill="#222"/><circle class="flash" cx="10.5" cy="-49" r="6" fill="#fff" style="--fl:${rand(2.5, 5).toFixed(1)}s"/><path d="M-7 -30 L-9 -16" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/>`
          : `<path d="M-7 -30 L-9 -16 M7 -30 L9 -16" stroke="${skin}" stroke-width="3.4" stroke-linecap="round"/>`;
      people += `<g transform="translate(${x.toFixed(1)} ${y}) scale(${s.toFixed(2)})"><g class="p ${kind}" style="--dl:${dl}s">
        <rect x="-5" y="-14" width="4" height="14" rx="2" fill="#2a2436"/><rect x="1" y="-14" width="4" height="14" rx="2" fill="#2a2436"/>
        <path d="M-9 -12 Q-10 -34 0 -34 Q10 -34 9 -12 Z" fill="${top}"/>${arms}
        <circle cx="0" cy="-41" r="7.5" fill="${skin}"/><path d="M-7.5 -42 Q-7 -51 0 -50 Q7 -51 7.5 -42 Q4 -46 0 -45 Q-4 -46 -7.5 -42 Z" fill="${hair}"/>
        ${kind === 'laugh' ? '<path d="M-3 -39 Q0 -35 3 -39 Z" fill="#7a2a2a"/>' : ''}
      </g></g>`;
    }
  });
  $('#crowd').innerHTML = people;

  /* ---- reactions: the crowd hops, laughs at videos, speech bubbles pop up ---- */
  const bubbles = $('#bubbles');
  let reactTimer;
  function react(laugh) {
    clearTimeout(reactTimer);
    city.classList.remove('react', 'laughing'); void city.offsetWidth;
    city.classList.add('react'); if (laugh) city.classList.add('laughing');
    reactTimer = setTimeout(() => city.classList.remove('react', 'laughing'), 1800);
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) setTimeout(() => {
      const b = document.createElement('span');
      b.className = 'bubble';
      b.textContent = pick(laugh ? LAUGH_LINES : CROWD_LINES);
      b.style.left = rand(4, 78) + '%';
      b.style.top = rand(10, 60) + '%';
      bubbles.appendChild(b);
      b.addEventListener('animationend', () => b.remove());
    }, i * 350);
  }

  /* ---- sound + music ducking (only while a video plays WITH sound) ---- */
  function syncDuck() {
    if (video && !video.paused && !video.muted) AudioManager.duck('bigscreen');
    else AudioManager.release('bigscreen');
  }
  function stopVideo() {
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; }
    soundBtn.hidden = true;
    syncDuck();
  }
  soundBtn.addEventListener('click', () => {
    soundOn = true;
    soundBtn.hidden = true;
    if (video) {
      video.muted = false;
      video.play().catch(() => { if (!video) return; video.muted = true; soundOn = false; soundBtn.hidden = false; video.play().catch(() => {}); });
    }
    syncDuck();
  });

  /* ---- slideshow ---- */
  function progress(start, dur) {
    cancelAnimationFrame(raf);
    const tick = () => {
      const k = video ? (video.currentTime / (video.duration || 1)) : Math.min(1, (performance.now() - start) / dur);
      bar.style.width = (k * 100).toFixed(1) + '%';
      raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function schedule() {
    clearTimeout(timer);
    if (!playing || !inView || idx < 0) return;
    if (BIG_SCREEN[idx].type === 'photo') timer = setTimeout(() => show(idx + 1), PHOTO_SECONDS * 1000);
  }
  function show(i) {
    stopVideo();
    idx = (i + BIG_SCREEN.length) % BIG_SCREEN.length;
    const item = BIG_SCREEN[idx];
    front = 1 - front;
    const el = layers[front], old = layers[1 - front];
    if (item.type === 'photo') {
      el.innerHTML = `<img class="bg" src="${item.src}" alt="" aria-hidden="true"><img class="fg kb" src="${item.src}" alt="A memory of us">`;
    } else {
      el.innerHTML = `<video playsinline preload="auto" poster="${item.poster}"><source src="${item.src}" type="video/mp4"></video>`;
      const v = video = $('video', el);
      v.muted = !soundOn;
      soundBtn.hidden = soundOn;
      watchVideoSource(v, () => { if (video === v) show(idx + 1); });      // a clip that can't load is skipped
      ['play', 'pause', 'ended', 'volumechange'].forEach(ev => v.addEventListener(ev, syncDuck));
      v.addEventListener('ended', () => { if (video === v && playing) show(idx + 1); });
      if (playing && inView) {
        const p = v.play();
        if (p && p.catch) p.catch(() => { if (video !== v) return; v.muted = true; soundOn = false; soundBtn.hidden = false; v.play().catch(() => {}); });
      }
    }
    el.classList.add('on'); old.classList.remove('on');
    setTimeout(() => { if (!old.classList.contains('on')) old.innerHTML = ''; }, 1000);
    dateEl.textContent = item.date;
    countEl.textContent = `${idx + 1} / ${BIG_SCREEN.length}`;
    progress(performance.now(), PHOTO_SECONDS * 1000);
    react(item.type === 'video');
    schedule();
    const nx = BIG_SCREEN[(idx + 1) % BIG_SCREEN.length]; if (nx.type === 'photo') new Image().src = nx.src;   // warm up the next photo
  }
  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (video) { if (on && inView) video.play().catch(() => {}); else video.pause(); }
    schedule();
  }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  $('#bb-next').addEventListener('click', () => show(idx + 1));
  $('#bb-prev').addEventListener('click', () => show(idx - 1));

  // only run while the city is on screen
  new IntersectionObserver(([en]) => {
    inView = en.isIntersecting;
    if (inView) { if (idx < 0) show(0); else { if (video && playing) video.play().catch(() => {}); schedule(); } }
    else { clearTimeout(timer); if (video) video.pause(); }
  }, { threshold: 0.35 }).observe(city);
}


/* ==========================================================================
   11⅞. SECTION 8 · HER NEW CHAPTER (new job at EY)
   --------------------------------------------------------------------------
   ✏️ CAREER.charms   → the 4 flip cards (tap to reveal a wish)
      CAREER.hurdles  → what comes flying at her on the hurdle run
      CAREER.shield   → what "I" say every time I knock one away
      CAREER.promise  → the letter at the bottom (one string per paragraph)
   ========================================================================== */
const CAREER = {
  charms: [
    { emo: '💸', name: 'Money', c1: '#e9b949', c2: '#c9922a',
      wish: 'May your salary slips keep glowing up and your bank balance never stop growing. Rich-girl era: officially loading.' },
    { emo: '🍀', name: 'Luck', c1: '#5ab47a', c2: '#2f8a53',
      wish: 'May every door open for you, every meeting go your way, and every lucky break find you first.' },
    { emo: '💗', name: 'Love', c1: '#ff8db4', c2: '#e0467f',
      wish: 'May you be surrounded by people who value you — and come home every day to someone who adores you (hi, it’s me).' },
    { emo: '🚀', name: 'Success', c1: '#6f8ee8', c2: '#23305a',
      wish: 'From new joinee to the one everyone looks up to. Promotions, appraisals, big wins — they’re all coming.' },
  ],
  hurdles: ['Deadlines', 'Long Mondays', 'Tough meetings', 'Late nights', 'Self-doubt', 'Office politics', 'Too many emails', 'Bad days', 'Tricky clients', 'Monday blues'],
  shield: ['By hook or crook, I’ve got you 💪', 'Not today, problem 🙅', 'Handled. Keep shining ✨', 'I’m right here, always ♡', 'Sorted — go be brilliant 💼', 'Nothing stops my girl 👑'],
  promise: [
    'I am so, so proud of you. Starting this new chapter at EY is a big deal, and you earned every bit of it.',
    'I wish you all the success and prosperity in the world — more money, more luck, more love, and the kind of growth that makes everyone say “she did that.”',
    'And whatever comes your way — deadlines, doubts, tough days, or problems that feel too big — by hook or by crook, I will always be right beside you, helping you clear every hurdle, every concern, every worry.',
    'Go conquer that office, my love. I’ll be cheering the loudest.',
  ],
};

function initCareer() {
  const charmsEl = $('#charms');
  charmsEl.innerHTML = CAREER.charms.map((c, i) => `
    <button class="lucky" data-i="${i}" aria-label="${c.name} charm — tap to reveal a wish" style="--c1:${c.c1};--c2:${c.c2}">
      <span class="charm-inner">
        <span class="charm-face charm-front"><span class="emo">${c.emo}</span><b>${c.name}</b><small>tap me</small></span>
        <span class="charm-face charm-back"><span class="emo">${c.emo}</span><p>${c.wish}</p></span>
      </span>
    </button>`).join('');
  charmsEl.addEventListener('click', e => {
    const card = e.target.closest('.lucky'); if (!card) return;
    card.classList.toggle('open');
    if (!card.classList.contains('open')) return;
    const c = CAREER.charms[+card.dataset.i], r = card.getBoundingClientRect();
    for (let k = 0; k < 12; k++) {
      const p = document.createElement('span');
      p.className = 'pop'; p.textContent = c.emo;
      p.style.left = r.left + r.width / 2 + 'px'; p.style.top = r.top + r.height / 2 + 'px';
      const a = rand(0, Math.PI * 2), dist = rand(70, 170);
      p.style.setProperty('--dx', Math.cos(a) * dist + 'px'); p.style.setProperty('--dy', Math.sin(a) * dist + 'px');
      document.body.appendChild(p); p.addEventListener('animationend', () => p.remove());
    }
  });

  $('#promise-text').innerHTML = CAREER.promise.map(t => `<p>${t}</p>`).join('');

  /* ---- hurdle run: hurdles roll in; tap to knock them away — or I do it for you ---- */
  const track = $('#track'), shield = $('#shield'), msg = $('#track-msg'), countEl = $('#track-count');
  let cleared = 0, spawnTimer = null, running = false, msgTimer, hIndex = 0;
  function clear(h, byTap) {
    if (h.classList.contains('smashed')) return;
    h.classList.add('smashed');
    cleared++;
    countEl.textContent = `hurdles cleared together: ${cleared}`;
    shield.classList.remove('show'); void shield.offsetWidth; shield.classList.add('show');
    setTimeout(() => shield.classList.remove('show'), 900);
    msg.textContent = byTap ? pick(CAREER.shield) : 'Saw that one coming — handled it for you 😌';
    msg.classList.add('show');
    clearTimeout(msgTimer); msgTimer = setTimeout(() => msg.classList.remove('show'), 1800);
    setTimeout(() => h.remove(), 750);
  }
  function spawn() {
    const h = document.createElement('button');
    h.className = 'hurdle';
    h.setAttribute('aria-label', 'Knock away this hurdle');
    h.innerHTML = `<span class="tag">${CAREER.hurdles[hIndex++ % CAREER.hurdles.length]}</span><span class="bar"></span>`;
    h.style.setProperty('--sp', rand(4.4, 5.6).toFixed(2) + 's');
    h.addEventListener('click', () => clear(h, true));
    h.addEventListener('animationend', e => { if (e.animationName === 'hurdleMove') clear(h, false); });
    track.appendChild(h);
  }
  function start() { if (running) return; running = true; spawn(); spawnTimer = setInterval(spawn, 2600); }
  function stop() { running = false; clearInterval(spawnTimer); $$('.hurdle', track).forEach(h => h.remove()); }
  new IntersectionObserver(([en]) => (en.isIntersecting ? start() : stop()), { threshold: .4 }).observe(track);
}


/* ==========================================================================
   12a. DAYA'S AARTI — little scene next to the finale video
   --------------------------------------------------------------------------
   Plays by itself when the Jethalal video ends, or when she taps ▶.
   Steps: Daya sings → Daya speeds up → Jethalal walks in and calms her →
   Jethalal sings it slowly → all three laugh.
   • The lines appear as captions (no spoken voice).
   • The aarti bell is synthesised live (no sound file needed).
   ✏️ Edit the name / words / timings in AARTI below.
   ========================================================================== */
const AARTI = {
  name: 'Khushi',
  steps: [
    { cls: 'st-sing',  who: 'Daya',     text: n => `🎶 Janamdin mubarak ${n} behen ji… janamdin mubarak ${n} behen ji… 🎶`,
      bell: 620, ms: 4600 },
    { cls: 'st-fast',  who: 'Daya (faster!!)', text: n => `🎶 janamdinmubarak${n.toLowerCase()}behenji-janamdinmubarak${n.toLowerCase()}behenji-janamdin… 🎶`, fast: true,
      bell: 170, ms: 3800 },
    { cls: 'st-jetha', who: 'Jethalal', text: () => 'Arre Daya… dheere, dheere! 🙏',
      ms: 2600 },
    { cls: 'st-slow',  who: 'Jethalal', text: n => `Janamdin mubarak ${n} behen jiiiiiii 🎉`, slow: true,
      ms: 4200 },
    { cls: 'st-laugh', who: 'All three', text: () => 'HAHAHAHA 😂😂😂',
      ms: 3200, confetti: true },
  ],
};

function initAarti() {
  const card = $('#aarti'), say = $('#a-say'), playBtn = $('#a-play');
  let running = false, timers = [], bellTimer = null, ctx = null, runId = 0;

  /* temple-bell "ting" made with the Web Audio API */
  function ding() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = ctx.currentTime, g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 1.1);
      g.connect(ctx.destination);
      [1318, 2637, 3951].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = ctx.createGain(); og.gain.value = [1, .45, .2][i]; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.15); });
    } catch (e) { /* no audio — fine */ }
  }

  function stop() {
    runId++;
    timers.forEach(clearTimeout); timers = [];
    clearInterval(bellTimer);
    AARTI.steps.forEach(s => card.classList.remove(s.cls));
    running = false;
    playBtn.textContent = '▶ Daya\'s aarti';
    AudioManager.release('aarti');
  }

  function play() {
    stop();
    const id = runId;
    running = true;
    playBtn.textContent = '■ stop';
    AudioManager.duck('aarti');                                    // ← music ducks while they sing
    const fv = $('#finale-video'); if (fv && !fv.paused) fv.pause();
    let t = 0;
    AARTI.steps.forEach((step, i) => {
      timers.push(setTimeout(() => {
        if (id !== runId) return;
        AARTI.steps.forEach(s => card.classList.remove(s.cls));
        card.classList.add(step.cls);
        say.className = 'a-say' + (step.fast ? ' fast' : '') + (step.slow ? ' slow' : '');
        say.innerHTML = `<span><span class="who">${step.who}</span><span class="txt">${step.text(AARTI.name)}</span></span>`;
        clearInterval(bellTimer);
        if (step.bell) { ding(); bellTimer = setInterval(ding, step.bell); }
            if (step.confetti) { confettiBurst(60); heartBurst(card, 10); }
      }, t));
      t += step.ms;
    });
    timers.push(setTimeout(() => {
      if (id !== runId) return;
      stop();
      say.className = 'a-say';
      say.innerHTML = `<span><span class="who">🪔 Happy birthday, ${AARTI.name}!</span><span class="txt">Tap ▶ to watch Daya’s aarti again</span></span>`;
    }, t));
  }

  playBtn.addEventListener('click', () => (running ? stop() : play()));
  say.innerHTML = `<span><span class="who">🪔 Daya's aarti</span><span class="txt">Starts after Jethalal's video — or tap ▶</span></span>`;

  // start by itself once the Jethalal video finishes
  const fv = $('#finale-video');
  if (fv) {
    fv.addEventListener('ended', () => setTimeout(play, 900));
    fv.addEventListener('play', () => { if (running) stop(); });
  }
  // stop if she scrolls away
  new IntersectionObserver(([en]) => { if (!en.isIntersecting && running) stop(); }, { threshold: .1 }).observe(card);
}


/* ==========================================================================
   12. SECTION 9 · FINALE
   When the video frame is at least half on screen:
     → music ducks to AUDIO.DUCKED_VOLUME (even before the video starts)
     → the video tries to autoplay (FINALE_AUTOPLAY)
   When she scrolls away: video pauses, music fades back up.
   ========================================================================== */
function initFinale() {
  const frame = $('#finale-frame');
  const video = $('#finale-video');
  const playBtn = $('#finale-play');
  let userPaused = false;          // if she pauses it herself, don't auto-restart it

  $$('[data-her-name]').forEach(el => { el.textContent = CONFIG.HER_NAME; });

  watchVideoSource(video, () => frame.classList.add('no-video'), () => frame.classList.remove('no-video'));
  AudioManager.watchVideo(video, 'finale-video');                     // ← ducking hook

  video.addEventListener('play', () => {
    frame.classList.add('playing');
    video.controls = true;         // native controls appear only once it's running
  });
  video.addEventListener('pause', () => frame.classList.remove('playing'));
  video.addEventListener('ended', () => { frame.classList.remove('playing'); confettiBurst(120); });

  /**
   * Start the video from a tap. If the browser refuses to start it with
   * sound, start it muted and switch the sound on straight away (still
   * inside the same tap, which browsers allow).
   */
  async function playFromTap() {
    userPaused = false;
    if (video.ended) video.currentTime = 0;
    try {
      await video.play();
    } catch (err) {
      try {
        video.muted = true;
        await video.play();
        video.muted = false;
      } catch (err2) {
        video.load();
        video.play().catch(() => showToast('The video could not start. Try the ▶ in the player bar.', 3500));
      }
    }
  }

  playBtn.addEventListener('click', playFromTap);
  // Before the native controls exist, a tap on the video itself also plays it
  video.addEventListener('click', () => { if (!video.controls && video.paused) playFromTap(); });
  // Remember when SHE pauses it (so scrolling back doesn't restart it on her)
  video.addEventListener('pause', () => { if (frame.dataset.inView === '1' && !video.ended) userPaused = true; });

  new IntersectionObserver(([en]) => {
    frame.dataset.inView = en.isIntersecting ? '1' : '0';
    if (en.isIntersecting) {
      AudioManager.duck('finale-section');                          // ← ducking hook
      const canAutoplay = CONFIG.FINALE_AUTOPLAY && !userPaused && !frame.classList.contains('no-video');
      if (canAutoplay && video.paused && !video.ended) {
        video.play().catch(() => { /* browser blocked autoplay → the big ▶ button stays visible */ });
      }
    } else {
      AudioManager.release('finale-section');
      if (!video.paused) video.pause();
    }
  }, { threshold: 0.5 }).observe(frame);

  $('#wish-btn').addEventListener('click', e => {
    confettiBurst(150);
    heartBurst(e.currentTarget, 16);
    showToast('Wish made. The universe heard you ✨🎂', 3200);
  });
}


/* ==========================================================================
   13. BOOT
   ========================================================================== */
initGift();
initCountdown();
initFloaties();
initCursorSparkles();
initReveal();
initDoor();
initDrive();
initTouchMeNot();
initLounge();
initAlbum();
initBigScreen();
initCareer();
initAarti();
initFinale();
