/* ============================================================
   Navkar Navratri Utsav — Interaction layer
   Nav, drawer, scroll reveal, parallax, counters, particles,
   background video, gallery + lightbox, and the passes dialog.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ==========================================================
     1 — Hero entrance
     ========================================================== */
  (function hero() {
    var el = $('.hero');
    if (!el) return;
    var img = $('.hero-img', el);
    var ready = function () { el.classList.add('is-ready'); };

    if (!img || img.complete) {
      // give the first paint a beat so the transition is visible
      requestAnimationFrame(function () { setTimeout(ready, 60); });
    } else {
      img.addEventListener('load', ready, { once: true });
      img.addEventListener('error', ready, { once: true });
      setTimeout(ready, 2500); // never leave the hero hidden
    }
  })();

  /* ==========================================================
     2 — Navigation: stuck state, auto-hide, scrollspy
     ========================================================== */
  (function nav() {
    var bar = $('.nav');
    if (!bar) return;
    var last = window.pageYOffset;
    var ticking = false;

    function update() {
      var y = window.pageYOffset;
      bar.classList.toggle('is-stuck', y > 40);

      // hide when scrolling down past the hero, reveal on the way up
      if (!document.body.classList.contains('menu-open')) {
        var down = y > last && y > 420;
        bar.classList.toggle('is-hidden', down);
      }
      last = y;
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();

    /* --- scrollspy --- */
    var links = $$('.nav-links a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = document.getElementById(id);
      if (sec) byId[id] = a;
    });

    // Track the full intersecting set: reacting per-entry can leave two links
    // lit when neighbouring sections both straddle the band.
    var visible = new Set();
    var order = Object.keys(byId);

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      });
      var active = order.filter(function (id) { return visible.has(id); })[0];
      links.forEach(function (a) {
        a.classList.toggle('on', !!active && byId[active] === a);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Object.keys(byId).forEach(function (id) {
      spy.observe(document.getElementById(id));
    });
  })();

  /* ==========================================================
     3 — Mobile drawer
     ========================================================== */
  (function drawer() {
    var burger = $('.burger');
    var panel = $('.drawer');
    if (!burger || !panel) return;

    function close() {
      document.body.classList.remove('menu-open');
      burger.setAttribute('aria-expanded', 'false');
      if (!$('.overlay.open') && !$('.lightbox.open')) document.body.classList.remove('locked');
    }
    function toggle() {
      var open = !document.body.classList.contains('menu-open');
      document.body.classList.toggle('menu-open', open);
      document.body.classList.toggle('locked', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) $('.nav').classList.remove('is-hidden');
    }

    burger.addEventListener('click', toggle);
    $$('.drawer a').forEach(function (a) { a.addEventListener('click', close); });
    $$('.drawer [data-cta]').forEach(function (b) { b.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) close();
    });
  })();

  /* ==========================================================
     4 — Sticky mobile CTA bar (appears once the hero is passed)
     ========================================================== */
  (function mobileBar() {
    var bar = $('.mobile-cta');
    var heroEl = $('.hero');
    if (!bar || !heroEl || !('IntersectionObserver' in window)) return;

    new IntersectionObserver(function (entries) {
      bar.classList.toggle('is-in', !entries[0].isIntersecting);
    }, { rootMargin: '-70% 0px 0px 0px' }).observe(heroEl);
  })();

  /* ==========================================================
     5 — Scroll reveal (+ staggered children, + counters)
     ========================================================== */
  (function reveal() {
    var items = $$('[data-reveal], .reveal-words, [data-count]');
    if (!items.length) return;

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) {
        el.classList.add('is-in');
        if (el.hasAttribute('data-count')) el.textContent = el.getAttribute('data-count');
      });
      return;
    }

    // stagger any group marked with data-stagger
    $$('[data-stagger]').forEach(function (group) {
      var step = parseInt(group.getAttribute('data-stagger'), 10) || 90;
      $$('[data-reveal]', group).forEach(function (child, i) {
        child.style.setProperty('--d', (i * step) + 'ms');
      });
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        if (e.target.hasAttribute('data-count')) countUp(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });

    function countUp(el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1500, t0 = null;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  })();

  /* ==========================================================
     6 — Parallax (writes --py; CSS consumes it)
     ========================================================== */
  (function parallax() {
    var els = $$('[data-parallax]');
    if (!els.length || reduced) return;

    var ticking = false;
    function run() {
      var vh = window.innerHeight;
      els.forEach(function (el) {
        var host = el.closest('[data-parallax-root]') || el.parentElement;
        var r = host.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return; // offscreen: skip
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.12;
        var offset = (r.top + r.height / 2 - vh / 2) * speed;
        el.style.setProperty('--py', offset.toFixed(1) + 'px');
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(run); }
    }, { passive: true });
    window.addEventListener('resize', run);
    run();
  })();

  /* ==========================================================
     7 — Festive light particles
     ========================================================== */
  (function particles() {
    if (reduced) return;
    var tints = ['var(--yellow)', 'var(--marigold)', 'var(--orange)', 'var(--magenta)'];

    $$('.particles').forEach(function (host) {
      var n = parseInt(host.getAttribute('data-count-particles'), 10) || 18;
      if (window.innerWidth < 640) n = Math.round(n * 0.55);
      var frag = document.createDocumentFragment();

      for (var i = 0; i < n; i++) {
        var s = document.createElement('span');
        var size = (3 + Math.random() * 5).toFixed(1);
        s.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
        s.style.setProperty('--s', size + 'px');
        s.style.setProperty('--dx', (Math.random() * 120 - 60).toFixed(0) + 'px');
        s.style.setProperty('--dur', (12 + Math.random() * 14).toFixed(1) + 's');
        s.style.setProperty('--delay', (-Math.random() * 22).toFixed(1) + 's');
        s.style.setProperty('--op', (0.35 + Math.random() * 0.5).toFixed(2));
        s.style.setProperty('--glow', (6 + Math.random() * 12).toFixed(0) + 'px');
        s.style.setProperty('--rise', (70 + Math.random() * 60).toFixed(0) + 'vh');
        s.style.setProperty('--pc', tints[(Math.random() * tints.length) | 0]);
        frag.appendChild(s);
      }
      host.appendChild(frag);
    });
  })();

  /* ==========================================================
     8 — Background video
     Lazy: sources are only attached once the section is near the
     viewport, so the file is never fetched on pages nobody scrolls.
     Any failure leaves the poster photograph in place.
     ========================================================== */
  (function bgVideo() {
    var vids = $$('[data-bg-video]');
    if (!vids.length) return;

    var conn = navigator.connection || {};
    var saveData = conn.saveData === true;
    var slowNet = /^(slow-)?2g$/.test(conn.effectiveType || '');
    // Phones pay the most for this and gain the least — keep the still there.
    var tooSmall = window.matchMedia('(max-width: 768px)').matches;

    if (reduced || saveData || slowNet || tooSmall) return;
    if (!('IntersectionObserver' in window)) return;

    vids.forEach(function (v) {
      var loaded = false;

      function load() {
        if (loaded) return;
        loaded = true;
        $$('source', v).forEach(function (s) {
          var src = s.getAttribute('data-src');
          if (src) s.setAttribute('src', src);
        });
        v.load();
        var p = v.play();
        // Autoplay can still be refused; the poster simply stays.
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }

      v.addEventListener('playing', function () { v.classList.add('is-playing'); });
      v.addEventListener('error', function () { v.classList.remove('is-playing'); }, true);

      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            load();
            if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
          } else if (loaded && !v.paused) {
            v.pause();   // don't burn cycles decoding offscreen
          }
        });
      }, { rootMargin: '200px 0px' }).observe(v);
    });
  })();

  /* ==========================================================
     9 — Gallery
     Entrance stagger, scroll-linked image drift, live counter,
     progress bar, drag with inertia, and the lightbox.
     ========================================================== */
  (function gallery() {
    var section = $('.gallery');
    var track = $('.gal-track');
    if (!track) return;
    var items = $$('.gal-item', track);
    if (!items.length) return;

    /* ---- entrance: stagger each frame in as the section arrives ---- */
    items.forEach(function (it, i) { it.style.setProperty('--i', i); });
    if (section) {
      if (reduced || !('IntersectionObserver' in window)) {
        section.classList.add('is-in');
      } else {
        var io = new IntersectionObserver(function (e) {
          if (e[0].isIntersecting) { section.classList.add('is-in'); io.disconnect(); }
        }, { rootMargin: '0px 0px -18% 0px', threshold: 0.08 });
        io.observe(track);
      }
    }

    /* ---- readouts: counter + progress bar ---- */
    var bar = $('#galBar'), now = $('#galNow'), total = $('#galTotal');
    if (total) total.textContent = String(items.length).padStart(2, '0');

    function maxScroll() { return Math.max(1, track.scrollWidth - track.clientWidth); }

    function readout() {
      var max = maxScroll();
      if (bar) bar.style.width = Math.min(100, (track.scrollLeft / max) * 100) + '%';

      // The strip reads left to right, so "current" is the leading frame —
      // measuring from the centre would show 02 while 01 is still on screen.
      if (now) {
        var lead = track.scrollLeft, best = 0, bestD = Infinity;
        items.forEach(function (it, i) {
          var d = Math.abs(it.offsetLeft - lead);
          if (d < bestD) { bestD = d; best = i; }
        });
        // at the far end the last frame is on screen, so complete the count
        if (lead >= max - 2) best = items.length - 1;
        now.textContent = String(best + 1).padStart(2, '0');
      }
    }

    /* ---- each image drifts inside its frame as the strip moves ---- */
    function drift() {
      if (reduced) return;
      var vw = track.clientWidth, mid = track.scrollLeft + vw / 2;
      items.forEach(function (it) {
        var img = it.firstElementChild;
        if (!img || img.tagName !== 'IMG') return;
        var c = it.offsetLeft + it.offsetWidth / 2;
        // -1 .. 1 across the visible width, clamped
        var t = Math.max(-1, Math.min(1, (c - mid) / vw));
        img.style.setProperty('--gx', (t * 26).toFixed(1) + 'px');
      });
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { readout(); drift(); syncArrows(); ticking = false; });
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    /* ---- arrows ---- */
    var prev = $('.gal-prev'), next = $('.gal-next');
    function step() { return items[0] ? items[0].offsetWidth + 20 : 340; }
    function syncArrows() {
      if (!prev || !next) return;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maxScroll() - 2;
    }
    if (prev) prev.addEventListener('click', function () {
      track.scrollBy({ left: -step(), behavior: reduced ? 'auto' : 'smooth' });
    });
    if (next) next.addEventListener('click', function () {
      track.scrollBy({ left: step(), behavior: reduced ? 'auto' : 'smooth' });
    });

    /* ---- drag, with a little inertia on release ---- */
    var down = false, startX = 0, startScroll = 0, moved = 0;
    var vel = 0, lastX = 0, lastT = 0, glide = 0;

    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;      // native touch scrolling is better
      down = true; moved = 0; vel = 0;
      startX = lastX = e.clientX;
      lastT = performance.now();
      startScroll = track.scrollLeft;
      cancelAnimationFrame(glide);
      track.classList.add('is-dragging');
      track.setPointerCapture(e.pointerId);
    });
    track.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      moved = Math.abs(dx);
      track.scrollLeft = startScroll - dx;

      var t = performance.now(), dt = t - lastT;
      if (dt > 0) vel = (e.clientX - lastX) / dt;   // px per ms
      lastX = e.clientX; lastT = t;
    });
    function endDrag(e) {
      if (!down) return;
      down = false;
      track.classList.remove('is-dragging');
      try { track.releasePointerCapture(e.pointerId); } catch (err) {}

      if (reduced || Math.abs(vel) < 0.15) return;
      // coast to a stop, then let scroll-snap settle it
      var v = vel * 16;
      (function coast() {
        v *= 0.94;
        track.scrollLeft -= v;
        if (Math.abs(v) > 0.4) glide = requestAnimationFrame(coast);
      })();
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', endDrag);

    readout(); drift(); syncArrows();

    /* ---- lightbox ---- */
    var lb = $('.lightbox');
    if (!lb) return;
    var lbImg = $('.lb-stage img', lb);
    var lbCap = $('.lb-cap', lb);
    var idx = 0, lastFocus = null;

    // Reel tiles are cross-origin iframes that play in place, so the lightbox
    // is built from the photo frames only — and sits out entirely if there
    // are none.
    var shots = items.filter(function (it) { return !it.classList.contains('gal-reel'); });
    if (!shots.length) return;

    var slides = shots.map(function (it) {
      var img = $('img', it);
      return {
        src: it.getAttribute('data-full') || (img && img.currentSrc) || (img && img.src),
        alt: (img && img.alt) || '',
        title: it.getAttribute('data-title') || '',
        sub: it.getAttribute('data-sub') || ''
      };
    });

    function esc(s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }
    function show(i) {
      idx = (i + slides.length) % slides.length;
      var s = slides[idx];
      lbImg.src = s.src;
      lbImg.alt = s.alt;
      lbCap.innerHTML = '<b>' + esc(s.title) + '</b> &nbsp;·&nbsp; ' + esc(s.sub) +
                        ' &nbsp;·&nbsp; ' + (idx + 1) + ' / ' + slides.length;
    }
    function open(i) {
      lastFocus = document.activeElement;
      show(i);
      lb.classList.add('open');
      document.body.classList.add('locked');
      var c = $('.lb-close', lb); if (c) c.focus();
    }
    function close() {
      lb.classList.remove('open');
      if (!$('.overlay.open') && !document.body.classList.contains('menu-open')) {
        document.body.classList.remove('locked');
      }
      if (lastFocus) lastFocus.focus();
    }

    shots.forEach(function (it, i) {
      it.addEventListener('click', function () {
        if (moved > 6) return;            // that was a drag, not a click
        open(i);
      });
      it.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });

    var cl = $('.lb-close', lb); if (cl) cl.addEventListener('click', close);
    var lp = $('.lb-prev', lb);  if (lp) lp.addEventListener('click', function () { show(idx - 1); });
    var ln = $('.lb-next', lb);  if (ln) ln.addEventListener('click', function () { show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
    });
  })();


  /* ==========================================================
     10 — Dialogs
     Pass booking (no backend):
       #ov  → date → tickets → Razorpay → Google Sheet
     Manual verification happens in the sheet.
     ========================================================== */
  (function dialogs() {

    function cfg() {
      return window.NAVKAR_CONFIG || {};
    }

    /* Append one row via Google Apps Script web app.
       Uses a readable CORS response so we only confirm after the sheet write succeeds.
       text/plain avoids a CORS preflight on simple deployments. */
    function saveToSheet(payload) {
      var endpoint = cfg().sheetsEndpoint || '';
      if (!endpoint || endpoint.indexOf('REPLACE_ME') !== -1) {
        return Promise.reject(new Error('Google Sheets endpoint is not configured in js/config.js'));
      }
      return fetch(endpoint, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) {
          throw new Error('Could not save your registration to our records.');
        }
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          if (data && data.ok === false) {
            throw new Error(data.error || 'Could not save your registration to our records.');
          }
          /* Some Apps Script deployments return an empty body after redirect;
             treat HTTP 200 as success when JSON is missing. */
          if (data && data.ok === true) return data;
          if (!text || !String(text).trim()) return { ok: true };
          if (data) return data;
          throw new Error('Could not confirm that your registration was saved.');
        });
      }).then(function (data) {
        try {
          console.log('[Navkar sheet]', {
            emailSent: data && data.emailSent,
            emailTo: data && data.emailTo,
            emailError: data && data.emailError,
            version: data && data.version,
            duplicate: data && data.duplicate
          });
        } catch (e) { /* ignore */ }
        return data;
      });
    }

    function sheetSaveSupportMessage(paymentId) {
      var id = paymentId ? String(paymentId) : '';
      return 'Payment was received, but we could not save your registration automatically. ' +
        'Please WhatsApp or call Bookings with your Razorpay Payment ID' +
        (id ? ' (' + id + ')' : '') +
        ': +91 81421 11145 / +91 80191 61198.';
    }

    var PENDING_KEY = 'navkar_pending_booking';

    function stashPending(data) {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    }

    function readPending() {
      try {
        var raw = sessionStorage.getItem(PENDING_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }

    function clearPending() {
      try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
    }

    /* After Razorpay success, open the dedicated thank-you page. */
    function goThankYou(info) {
      try {
        sessionStorage.setItem('navkar_thanks', JSON.stringify({
          paymentId: info.paymentId || '',
          name: info.name || '',
          amount: info.amount,
          passType: info.passType || '',
          email: info.email || '',
          saved: info.saved !== false
        }));
      } catch (e) { /* ignore */ }
      window.location.href = 'thankyou.html';
    }

    function bookingRow(details, paymentId, proof) {
      var row = {
        name: details.name || '',
        phone: details.phone || '',
        email: details.email || '',
        city: details.city || '',
        bookingType: details.bookingType || '',
        passType: details.passType || '',
        quantity: details.quantity,
        amount: details.amount,
        paymentId: paymentId || '',
        paymentStatus: 'Payment Received',
        verificationStatus: 'Pending Review'
      };
      if (proof) {
        row.proofBase64 = proof.proofBase64;
        row.proofName = proof.proofName;
        row.proofMime = proof.proofMime;
      }
      return row;
    }

    var MAX_PROOF_BYTES = 5 * 1024 * 1024;

    function readProofAsBase64(file) {
      return new Promise(function (resolve, reject) {
        if (!file) {
          reject(new Error('Please upload your payment screenshot.'));
          return;
        }
        var okType = /^image\/(png|jpeg|jpg|webp)$/i.test(file.type) ||
                     /\.(png|jpe?g|webp)$/i.test(file.name || '');
        if (!okType) {
          reject(new Error('Please upload an image (PNG, JPG or WEBP).'));
          return;
        }
        if (file.size > MAX_PROOF_BYTES) {
          reject(new Error('Screenshot must be under 5 MB.'));
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          resolve({
            proofBase64: String(reader.result || ''),
            proofName: file.name || 'payment-proof.jpg',
            proofMime: file.type || 'image/jpeg'
          });
        };
        reader.onerror = function () {
          reject(new Error('Could not read that image. Try another file.'));
        };
        reader.readAsDataURL(file);
      });
    }

    function wireProofInput(opts) {
      var input = opts.input;
      var preview = opts.preview;
      var img = opts.img;
      var changeBtn = opts.changeBtn;
      var submitBtn = opts.submitBtn;
      var errEl = opts.errEl;
      var state = { file: null, url: null };

      function clear() {
        if (state.url) {
          try { URL.revokeObjectURL(state.url); } catch (e) { /* ignore */ }
        }
        state.file = null;
        state.url = null;
        if (input) input.value = '';
        if (preview) preview.hidden = true;
        if (img) img.removeAttribute('src');
        if (submitBtn) submitBtn.disabled = true;
        if (errEl) errEl.hidden = true;
      }

      function setFile(file) {
        if (errEl) errEl.hidden = true;
        if (!file) { clear(); return; }
        var okType = /^image\/(png|jpeg|jpg|webp)$/i.test(file.type) ||
                     /\.(png|jpe?g|webp)$/i.test(file.name || '');
        if (!okType) {
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = 'Please upload an image (PNG, JPG or WEBP).';
          }
          if (input) input.value = '';
          return;
        }
        if (file.size > MAX_PROOF_BYTES) {
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = 'Screenshot must be under 5 MB.';
          }
          if (input) input.value = '';
          return;
        }
        if (state.url) {
          try { URL.revokeObjectURL(state.url); } catch (e) { /* ignore */ }
        }
        state.file = file;
        state.url = URL.createObjectURL(file);
        if (img) img.src = state.url;
        if (preview) preview.hidden = false;
        if (submitBtn) submitBtn.disabled = false;
      }

      if (input) {
        input.addEventListener('change', function () {
          setFile(input.files && input.files[0]);
        });
      }
      if (changeBtn && input) {
        changeBtn.addEventListener('click', function () { input.click(); });
      }

      return {
        clear: clear,
        getFile: function () { return state.file; },
        getUrl: function () { return state.url; },
        fail: function (msg) {
          if (errEl) { errEl.hidden = false; errEl.textContent = msg; }
        }
      };
    }

    /* Razorpay Checkout without server order creation (Option 1).
       Amount is in INR rupees; converted to paise here. */
    function payWithRazorpay(opts) {
      return new Promise(function (resolve, reject) {
        var key = cfg().razorpayKey || '';
        if (!key || key.indexOf('REPLACE_ME') !== -1) {
          reject(new Error('Razorpay key is not configured in js/config.js'));
          return;
        }
        if (typeof window.Razorpay !== 'function') {
          reject(new Error('Razorpay Checkout failed to load. Check your connection and retry.'));
          return;
        }
        var paise = Math.round(Number(opts.amount) * 100);
        if (!paise || paise < 100) {
          reject(new Error('Invalid payment amount.'));
          return;
        }
        var rzp = new window.Razorpay({
          key: key,
          amount: paise,
          currency: 'INR',
          name: cfg().merchantName || 'Navkar Navratri Utsav',
          description: opts.description || 'Navkar booking',
          image: cfg().merchantImage || undefined,
          prefill: {
            name: opts.name || '',
            email: opts.email || '',
            contact: (opts.mobile || '').replace(/\D/g, '').slice(-10)
          },
          notes: opts.notes || {},
          theme: { color: '#E30B54' },
          handler: function (response) {
            resolve(response);
          },
          modal: {
            ondismiss: function () {
              reject(new Error('Payment cancelled'));
            }
          }
        });
        rzp.on('payment.failed', function (resp) {
          var msg = (resp && resp.error && resp.error.description) || 'Payment failed';
          reject(new Error(msg));
        });
        rzp.open();
      });
    }

    /* ---- shared open/close plumbing ---- */
    function wire(el, closeBtn) {
      if (!el) return null;
      var lastFocus = null;

      function open() {
        lastFocus = document.activeElement;
        // never leave two dialogs stacked
        $$('.overlay.open').forEach(function (o) { if (o !== el) hideOnly(o); });
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
        document.body.classList.add('locked');
        if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 60);
      }
      function hideOnly(o) {
        o.classList.remove('open');
        o.setAttribute('aria-hidden', 'true');
      }
      function close() {
        hideOnly(el);
        if (!$('.overlay.open') && !$('.lightbox.open') &&
            !document.body.classList.contains('menu-open')) {
          document.body.classList.remove('locked');
        }
        if (lastFocus) lastFocus.focus();
      }

      if (closeBtn) closeBtn.addEventListener('click', close);
      el.addEventListener('click', function (e) { if (e.target === el) close(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && el.classList.contains('open')) close();
      });
      // keep tabbing inside the open dialog
      el.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab' || !el.classList.contains('open')) return;
        var f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', el)
                .filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });

      return { open: open, close: close };
    }

    var passes = wire($('#ov'), $('#mx'));

    /* ---- passes multi-step booking ---- */
    (function passBooking() {
      if (!passes || !$('#bkIntro')) return;

      var MAX = 10;
      var NIGHTS = {
        11: { status: 'avail', label: 'Sun 11 Oct' },
        12: { status: 'avail', label: 'Mon 12 Oct' },
        13: { status: 'fast',  label: 'Tue 13 Oct' },
        14: { status: 'fast',  label: 'Wed 14 Oct' },
        15: { status: 'avail', label: 'Thu 15 Oct' },
        16: { status: 'fast',  label: 'Fri 16 Oct' },
        17: { status: 'avail', label: 'Sat 17 Oct' },
        18: { status: 'avail', label: 'Sun 18 Oct' },
        19: { status: 'avail', label: 'Mon 19 Oct' }
      };

      /* Central date-wise ticket config. Only these tickets render for each
         selected night. 9-Day Navratri Pass is not offered on any date. */
      function gNote(price, admits) {
        return '₹' + Math.round(price / admits).toLocaleString('en-IN') + ' each · one night';
      }

      var DAY_OFFERS = {
        11: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 499, name: 'Single Ticket – Admits 1', note: 'Admits 1 · one night' },
          { id: 'kidsSeason', price: 1500, name: 'Kids Season (3–5 Years)', note: 'Ages 3–5 · all 9 days · food not included' },
          { id: 'g4', price: 1800, name: 'Group of 4', note: gNote(1800, 4) },
          { id: 'season', price: 2000, name: 'Season Pass – 9 Days', note: 'All 9 nights · card + QR' },
          { id: 'g10', price: 4800, name: 'Group of 10 People', note: gNote(4800, 10) }
        ],
        12: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 699, name: 'Single Day Pass', note: 'Admits 1 · one night' },
          { id: 'g4', price: 2600, name: 'Group of 4', note: gNote(2600, 4) },
          { id: 'g10', price: 6500, name: 'Group of 10 People', note: gNote(6500, 10) }
        ],
        13: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 499, name: 'Single Ticket – Admits 1', note: 'Admits 1 · one night' },
          { id: 'g4', price: 1800, name: 'Group of 4', note: gNote(1800, 4) },
          { id: 'g10', price: 4800, name: 'Group of 10 People', note: gNote(4800, 10) }
        ],
        14: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 699, name: 'Single Day Pass', note: 'Admits 1 · one night' },
          { id: 'g4', price: 2600, name: 'Group of 4', note: gNote(2600, 4) },
          { id: 'g10', price: 6500, name: 'Group of 10 People', note: gNote(6500, 10) }
        ],
        15: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 499, name: 'Single Ticket – Admits 1', note: 'Admits 1 · one night' },
          { id: 'g4', price: 1800, name: 'Group of 4', note: gNote(1800, 4) },
          { id: 'g10', price: 4800, name: 'Group of 10 People', note: gNote(4800, 10) }
        ],
        /* Early Bird → Single Day Pass (name only; price unchanged) */
        16: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 599, name: 'Single Day Pass', note: 'Admits 1 · one night' }
        ],
        17: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 799, name: 'Single Day Pass', note: 'Admits 1 · one night' },
          { id: 'g4', price: 2800, name: 'Group of 4', note: gNote(2800, 4) },
          { id: 'g10', price: 7200, name: 'Group of 10 People', note: gNote(7200, 10) }
        ],
        18: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 799, name: 'Single Day Pass', note: 'Admits 1 · one night' },
          { id: 'g4', price: 2800, name: 'Group of 4', note: gNote(2800, 4) },
          { id: 'g10', price: 7200, name: 'Group of 10 People', note: gNote(7200, 10) }
        ],
        /* Early Bird → Single Day Pass (name only; prices unchanged) */
        19: [
          { id: 'kids', price: 299, name: 'Kids Below 3–5 Years', note: 'Single-night entry' },
          { id: 'single', price: 699, name: 'Single Day Pass', note: 'Admits 1 · one night' },
          { id: 'g4', price: 2600, name: 'Group of 4', note: gNote(2600, 4) },
          { id: 'g10', price: 6500, name: 'Group of 10 People', note: gNote(6500, 10) }
        ]
      };

      var PASS_MAP = {
        'Kids 3–5 Years': 'kids',
        'Kids Below 3–5 Years': 'kids',
        'Single Night': 'single',
        'Single Ticket': 'single',
        'Single Ticket – Admits 1': 'single',
        'Single Pass': 'single',
        'Single Day Pass': 'single',
        'Early Bird Pass': 'single',
        'Early Bird – 1 Person': 'single',
        'Group of 4': 'g4',
        'Kids Season Pass': 'kidsSeason',
        'Kids Season (3–5 Years)': 'kidsSeason',
        'Kids Season Pass (3–5 Years)': 'kidsSeason',
        'Season Pass': 'season',
        'Season Pass – 9 Days': 'season',
        'Season Pass (9 Days)': 'season',
        '9-Day Navratri Pass': 'nav9',
        'Group of 10': 'g10',
        'Group of 10 People': 'g10'
      };

      var state = {
        step: 0,
        date: null,
        time: '7:00 PM',
        qty: {},
        prefer: null,
        paymentId: null,
        pending: null
      };

      var back = $('#bkBack');
      var stepper = $('#bkStepper');
      var venueBar = $('#bkVenueBar');
      var dateLabel = $('#bkDateLabel');
      var toTickets = $('#bkToTickets');
      var toReview = $('#bkToReview');
      var subTotal = $('#bkSubTotal');
      var tkErr = $('#bkTkErr');
      var payErr = $('#bkPayErr');
      var payBtn = $('#bkPayBtn');
      var form = $('#bkForm');
      var proofDone = null;
      var proofDoneImg = null;
      var proofOk = $('#bkProofOk');
      var passProof = wireProofInput({
        input: $('#bkProofFile'),
        preview: $('#bkProofPreview'),
        img: $('#bkProofImg'),
        changeBtn: $('#bkProofChange'),
        submitBtn: $('#bkProofSubmit'),
        errEl: $('#bkProofErr')
      });

      function inr(n) {
        return '₹' + Number(n).toLocaleString('en-IN');
      }

      function ticketRows() {
        return $$('#bkTickets .tk');
      }

      function ticketRowsById() {
        var map = {};
        ticketRows().forEach(function (row) {
          map[row.getAttribute('data-id')] = row;
        });
        return map;
      }

      /* Hide every ticket until a valid festival date is selected. */
      function hideAllTickets() {
        ticketRows().forEach(function (row) {
          row.hidden = true;
        });
        state.qty = {};
        renderTicketActs();
      }

      function applyDayTickets(day) {
        var list = $('#bkTickets');
        var offers = DAY_OFFERS[day];
        var rows = ticketRowsById();

        if (!offers) {
          hideAllTickets();
          return;
        }

        var offered = {};
        offers.forEach(function (offer) {
          offered[offer.id] = true;
          var row = rows[offer.id];
          if (!row) return;
          row.hidden = false;
          row.setAttribute('data-price', String(offer.price));
          var nameEl = row.querySelector('.tk-name');
          var priceEl = row.querySelector('.tk-price');
          var noteEl = row.querySelector('.tk-note');
          if (nameEl) nameEl.textContent = offer.name;
          if (priceEl) priceEl.textContent = inr(offer.price);
          if (noteEl) noteEl.textContent = offer.note || '';
          if (list) list.appendChild(row);
        });

        Object.keys(rows).forEach(function (id) {
          if (offered[id]) return;
          rows[id].hidden = true;
          if (state.qty[id]) delete state.qty[id];
        });

        /* Drop any leftover qty keys that are not valid for this date. */
        Object.keys(state.qty).forEach(function (id) {
          if (!offered[id]) delete state.qty[id];
        });

        renderTicketActs();
      }

      function cartLines() {
        return ticketRows().map(function (row) {
          if (row.hidden) return null;
          var id = row.getAttribute('data-id');
          var q = state.qty[id] || 0;
          if (!q) return null;
          return {
            id: id,
            name: row.querySelector('.tk-name').textContent.trim(),
            price: +row.getAttribute('data-price'),
            qty: q,
            kind: row.getAttribute('data-kind')
          };
        }).filter(Boolean);
      }

      function cartCount() {
        return cartLines().reduce(function (s, l) { return s + l.qty; }, 0);
      }

      function cartTotal() {
        return cartLines().reduce(function (s, l) { return s + l.price * l.qty; }, 0);
      }

      function ticketsText() {
        return cartLines().map(function (l) {
          return l.name + ' × ' + l.qty + ' (' + inr(l.price * l.qty) + ')';
        }).join('; ');
      }

      function renderSummary(el) {
        if (!el) return;
        var lines = cartLines();
        var html = '';
        html += '<div><div class="k">Night</div><div class="v">' +
          (state.date ? state.date.label + ' · ' + state.time : '—') + '</div></div>';
        html += '<div><div class="k">Venue</div><div class="v">Jalavihar, Hyderabad</div></div>';
        lines.forEach(function (l) {
          html += '<div><div class="k">' + l.name + ' × ' + l.qty + '</div><div class="v">' +
            inr(l.price * l.qty) + '</div></div>';
        });
        html += '<div class="tot"><div class="k">Total amount</div><div class="v">' +
          inr(cartTotal()) + '</div></div>';
        el.innerHTML = html;
      }

      function updateVenueBar() {
        if (!venueBar) return;
        if (state.step === 0) {
          venueBar.textContent = 'Grand Lawn, Jalavihar · Hyderabad';
        } else if (state.date) {
          venueBar.textContent = 'Grand Lawn, Jalavihar · Hyderabad  ·  ' +
            state.date.label + ' | ' + state.time;
        } else {
          venueBar.textContent = 'Grand Lawn, Jalavihar · Hyderabad';
        }
      }

      function updateStepper() {
        if (!stepper) return;
        var show = state.step >= 1 && state.step <= 3;
        stepper.hidden = !show;
        $$('[data-step-dot]', stepper).forEach(function (li) {
          var n = +li.getAttribute('data-step-dot');
          li.classList.toggle('is-active', n === state.step);
          li.classList.toggle('is-done', n < state.step);
        });
      }

      function go(step) {
        state.step = step;
        $$('.book-pane').forEach(function (p) {
          var n = +p.getAttribute('data-pane');
          var on = n === step;
          p.hidden = !on;
          p.classList.toggle('is-on', on);
        });
        /* After Razorpay succeeds, back is hidden so they cannot re-pay. */
        if (back) back.hidden = step === 0 || step >= 4;
        updateStepper();
        updateVenueBar();
        if (step === 3) {
          renderSummary($('#bkSummary'));
          if (payBtn) {
            payBtn.disabled = false;
            payBtn.textContent = 'Pay ' + inr(cartTotal()) + ' with Razorpay';
          }
        }
        if (step === 4) {
          renderSummary($('#bkDoneSum'));
          if ($('#bkPayId')) $('#bkPayId').textContent = state.paymentId || '—';
        }
        var ov = $('#ov');
        if (ov) ov.scrollTop = 0;
      }

      function buildCalendar() {
        var grid = $('#bkCalGrid');
        if (!grid || grid.childElementCount) return;
        var blanks = 4;
        var daysInMonth = 31;
        for (var i = 0; i < blanks; i++) {
          var empty = document.createElement('button');
          empty.type = 'button';
          empty.disabled = true;
          empty.setAttribute('aria-hidden', 'true');
          grid.appendChild(empty);
        }
        for (var d = 1; d <= daysInMonth; d++) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = String(d);
          btn.setAttribute('data-day', String(d));
          var night = NIGHTS[d];
          if (night) {
            btn.className = 'is-day is-' + night.status;
            btn.setAttribute('aria-label', night.label);
          } else {
            btn.disabled = true;
          }
          grid.appendChild(btn);
        }
        grid.addEventListener('click', function (e) {
          var b = e.target.closest('button.is-day');
          if (!b) return;
          var day = +b.getAttribute('data-day');
          var night = NIGHTS[day];
          if (!night || night.status === 'sold') return;
          /* Date change: drop prior cart so prices/tickets never carry over. */
          state.qty = {};
          state.date = { day: day, label: night.label, status: night.status };
          $$('button.is-day', grid).forEach(function (x) { x.classList.remove('is-on'); });
          b.classList.add('is-on');
          if (dateLabel) {
            dateLabel.hidden = false;
            dateLabel.textContent = 'Date: ' + night.label;
          }
          applyDayTickets(day);
          if (state.prefer) {
            var dayOffers = DAY_OFFERS[day] || [];
            var preferOk = dayOffers.some(function (o) { return o.id === state.prefer; });
            if (preferOk) {
              state.qty[state.prefer] = 1;
              renderTicketActs();
            }
          }
          if (toTickets) toTickets.disabled = !state.date || !state.time;
          updateVenueBar();
        });
      }

      function renderTicketActs() {
        ticketRows().forEach(function (row) {
          var id = row.getAttribute('data-id');
          var q = row.hidden ? 0 : (state.qty[id] || 0);
          if (row.hidden && state.qty[id]) delete state.qty[id];
          var act = row.querySelector('[data-act]');
          row.classList.toggle('is-picked', q > 0);
          if (!act) return;
          if (q === 0) {
            act.innerHTML = '<button type="button" class="tk-add" data-add="' + id + '">Add</button>';
          } else {
            act.innerHTML =
              '<div class="tk-qty">' +
              '<button type="button" data-dec="' + id + '" aria-label="Decrease">−</button>' +
              '<b>' + q + '</b>' +
              '<button type="button" data-inc="' + id + '" aria-label="Increase">+</button>' +
              '</div>';
          }
        });
        if (subTotal) subTotal.textContent = inr(cartTotal());
        if (toReview) toReview.disabled = cartCount() === 0;
        if (tkErr) tkErr.hidden = true;
      }

      function setQty(id, next) {
        var row = ticketRowsById()[id];
        if (!row || row.hidden) return;
        var totalOther = cartCount() - (state.qty[id] || 0);
        next = Math.max(0, Math.min(MAX - totalOther, next));
        if (next === 0) delete state.qty[id];
        else state.qty[id] = next;
        renderTicketActs();
      }

      function resetBooking() {
        state.step = 0;
        state.date = null;
        state.time = '7:00 PM';
        state.qty = {};
        state.paymentId = null;
        state.pending = null;
        passProof.clear();
        clearPending();
        if (proofOk) proofOk.hidden = true;
        if (dateLabel) { dateLabel.hidden = true; dateLabel.textContent = 'Date: —'; }
        if (toTickets) toTickets.disabled = true;
        $$('#bkCalGrid button.is-day').forEach(function (b) { b.classList.remove('is-on'); });
        $$('#bkTimes .time-opt').forEach(function (b) {
          b.classList.toggle('is-on', b.getAttribute('data-time') === '7:00 PM');
        });
        if (form) form.reset();
        if (payErr) payErr.hidden = true;
        if (payBtn) { payBtn.disabled = false; payBtn.textContent = 'Pay with Razorpay'; }
        hideAllTickets();
        go(0);
        /* Prefer is applied only after a date that offers that ticket is chosen. */
      }

      buildCalendar();
      hideAllTickets();

      var start = $('#bkStart');
      if (start) start.addEventListener('click', function () { go(1); });

      if (back) back.addEventListener('click', function () {
        if (state.step === 1) go(0);
        else if (state.step === 2) go(1);
        else if (state.step === 3) go(2);
      });

      if (toTickets) toTickets.addEventListener('click', function () {
        if (!state.date || !state.time) return;
        applyDayTickets(state.date.day);
        go(2);
      });

      $$('#bkTimes .time-opt').forEach(function (b) {
        b.addEventListener('click', function () {
          state.time = b.getAttribute('data-time');
          $$('#bkTimes .time-opt').forEach(function (x) { x.classList.remove('is-on'); });
          b.classList.add('is-on');
          if (toTickets) toTickets.disabled = !state.date || !state.time;
          updateVenueBar();
        });
      });

      var tickets = $('#bkTickets');
      if (tickets) tickets.addEventListener('click', function (e) {
        var add = e.target.closest('[data-add]');
        var inc = e.target.closest('[data-inc]');
        var dec = e.target.closest('[data-dec]');
        if (add) {
          var id = add.getAttribute('data-add');
          if (cartCount() >= MAX) {
            if (tkErr) {
              tkErr.hidden = false;
              tkErr.textContent = 'You can add up to 10 tickets only.';
            }
            return;
          }
          setQty(id, 1);
        } else if (inc) {
          var iid = inc.getAttribute('data-inc');
          if (cartCount() >= MAX) {
            if (tkErr) {
              tkErr.hidden = false;
              tkErr.textContent = 'You can add up to 10 tickets only.';
            }
            return;
          }
          setQty(iid, (state.qty[iid] || 0) + 1);
        } else if (dec) {
          var did = dec.getAttribute('data-dec');
          setQty(did, (state.qty[did] || 0) - 1);
        }
      });

      if (toReview) toReview.addEventListener('click', function () {
        if (!cartCount()) return;
        go(3);
      });

      if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (payErr) payErr.hidden = true;
        var d = new FormData(form);
        var name = (d.get('name') || '').toString().trim();
        var mob = (d.get('mobile') || '').toString().trim();
        var email = (d.get('email') || '').toString().trim();
        var city = (d.get('city') || '').toString().trim();
        var amount = cartTotal();

        function fail(msg, el) {
          if (payErr) { payErr.hidden = false; payErr.textContent = msg; }
          if (el) el.focus();
          if (payBtn) {
            payBtn.disabled = false;
            payBtn.textContent = 'Pay ' + inr(amount || cartTotal()) + ' with Razorpay';
          }
        }

        if (!cartCount()) return fail('Add at least one ticket before paying.');
        if (!state.date) return fail('Pick a night first.');
        if (!name) return fail('Please add your name.', form.elements.name);
        if (mob.replace(/\D/g, '').length < 10) {
          return fail('Please add a valid mobile number.', form.elements.mobile);
        }
        if (!email || email.indexOf('@') < 1) {
          return fail('Please add a valid email.', form.elements.email);
        }

        if (payBtn) {
          payBtn.disabled = true;
          payBtn.textContent = 'Opening Razorpay…';
        }

        state.pending = {
          name: name,
          phone: mob,
          email: email,
          city: city,
          bookingType: 'Pass',
          passType: ticketsText() + ' · ' + state.date.label + ' · ' + state.time,
          quantity: cartCount(),
          amount: amount
        };
        stashPending(state.pending);

        payWithRazorpay({
          amount: amount,
          name: name,
          email: email,
          mobile: mob,
          description: 'Navkar Passes · ' + state.date.label,
          notes: {
            type: 'pass',
            night: state.date.label,
            time: state.time,
            tickets: ticketsText()
          }
        }).then(function (response) {
          state.paymentId = response.razorpay_payment_id || '';
          var details = state.pending || readPending();
          if (!details) {
            fail(sheetSaveSupportMessage(state.paymentId));
            return;
          }
          if (payBtn) payBtn.textContent = 'Saving registration…';

          return saveToSheet(bookingRow(details, state.paymentId)).then(function () {
            clearPending();
            goThankYou({
              paymentId: state.paymentId,
              name: details.name,
              amount: details.amount,
              passType: details.passType,
              email: details.email,
              saved: true
            });
          }).catch(function () {
            goThankYou({
              paymentId: state.paymentId,
              name: details.name,
              amount: details.amount,
              passType: details.passType,
              email: details.email,
              saved: false
            });
          });
        }).catch(function (err) {
          var msg = (err && err.message) || 'Payment could not be completed.';
          if (msg === 'Payment cancelled') {
            fail('Payment was cancelled. You can try again when ready.');
          } else {
            fail(msg);
          }
        });
      });

      var proofSubmit = $('#bkProofSubmit');
      if (proofSubmit) {
        proofSubmit.addEventListener('click', function () {
          var file = passProof.getFile();
          if (!file || !state.paymentId) {
            passProof.fail('Choose a screenshot to attach.');
            return;
          }
          proofSubmit.disabled = true;
          proofSubmit.textContent = 'Uploading…';
          if (proofOk) proofOk.hidden = true;

          readProofAsBase64(file).then(function (proof) {
            return saveToSheet({
              action: 'attachProof',
              paymentId: state.paymentId,
              proofBase64: proof.proofBase64,
              proofName: proof.proofName,
              proofMime: proof.proofMime
            });
          }).then(function () {
            if (proofOk) proofOk.hidden = false;
            proofSubmit.textContent = 'Attached';
            proofSubmit.disabled = true;
          }).catch(function (err) {
            passProof.fail((err && err.message) || 'Could not attach screenshot. Try again.');
            proofSubmit.disabled = false;
            proofSubmit.textContent = 'Attach screenshot';
          });
        });
      }

      var doneClose = $('#bkDoneClose');
      if (doneClose) doneClose.addEventListener('click', function () {
        passes.close();
        resetBooking();
      });

      $$('[data-cta]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          var pref = b.getAttribute('data-pass');
          state.prefer = pref && PASS_MAP[pref] ? PASS_MAP[pref] : null;
          resetBooking();
          passes.open();
        });
      });
    })();

    if (location.hash === '#open' && passes) passes.open();
  })();


  /* ==========================================================
     11 — Smooth anchor scrolling that respects the fixed nav
     ========================================================== */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id === '#' || id === '#open') return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });
})();
