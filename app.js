(() => {
  // Data side of the page: Google search with autocomplete, favourites and a few PC stats.
  // If the local agent from homepage-dashboard (http://127.0.0.1:47800) is running, it
  // provides your favourites (data.json), search suggestions and the stats; without it the
  // page still works and keeps favourites in this browser. ui.js draws everything else.
  const API = 'http://127.0.0.1:47800';
  const IS_WEB = location.protocol === 'https:' || location.protocol === 'http:';
  // ?demo: fictional machine and favourites; no agent, no saving.
  const DEMO = new URLSearchParams(location.search).has('demo');

  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const setText = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };

  // ---------- Search ----------
  const form = $('search'), q = $('q');
  const URL_RE = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i;
  const isUrlish = v => !/\s/.test(v) && URL_RE.test(v);
  const toUrl = v => /^https?:\/\//i.test(v) ? v : 'https://' + v;
  const googleUrl = v => 'https://www.google.com/search?q=' + encodeURIComponent(v);

  // Recent searches stay in this browser only (localStorage).
  const RECENT_KEY = 'terminal-recent';
  const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
  const writeRecent = r => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 50))); } catch {} };
  const remember = v => writeRecent([v, ...readRecent().filter(x => x.toLowerCase() !== v.toLowerCase())]);
  const forget = v => writeRecent(readRecent().filter(x => x !== v));

  form.addEventListener('submit', e => {
    const v = q.value.trim();
    closeSugg();
    if (!v) { e.preventDefault(); return; }
    // Looks like a URL → go there directly instead of searching.
    if (isUrlish(v)) { e.preventDefault(); location.href = toUrl(v); return; }
    remember(v);
  });

  // ---------- Autocomplete ----------
  const sugg = $('sugg');
  const remoteCache = new Map();
  let items = [], sel = -1, typed = '', reqId = 0, timer = 0;
  const ICONS = {
    google: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>',
    recent: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></svg>',
    url: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
  };
  const KIND = { google: 'Google', recent: 'Recent', bookmark: 'Bookmark', url: 'Go to' };

  // Favourites rank first. A prefix match on the name or domain carries `fill`,
  // the text used for inline autofill ("ani" → "anilist").
  const bookmarkMatches = lv => {
    const out = [];
    for (const b of data.bookmarks) {
      const shown = b.name || hostOf(b.url), name = shown.toLowerCase(), host = hostOf(b.url);
      let score = -1, fill = null;
      if (name.startsWith(lv)) { score = 0; fill = shown; }
      else if (host.startsWith(lv)) { score = 1; fill = host; }
      else if (name.split(/\s+/).some(w => w.startsWith(lv))) score = 2;
      else if (host.includes('.' + lv)) score = 3;
      if (score >= 0) out.push({ kind: 'bookmark', text: shown, sub: host, url: b.url, fill, score });
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 3);
  };
  const localMatches = v => {
    const lv = v.toLowerCase();
    const out = bookmarkMatches(lv);
    if (isUrlish(v)) out.push({ kind: 'url', text: v, url: toUrl(v) });
    readRecent().filter(r => r.toLowerCase().startsWith(lv) && r.toLowerCase() !== lv)
      .slice(0, 2).forEach(r => out.push({ kind: 'recent', text: r }));
    return out;
  };
  // The favourite Enter opens when nothing is selected with the arrows.
  const autofill = () => {
    const it = items[0];
    if (sel !== -1 || !it || it.kind !== 'bookmark' || !it.fill) return null;
    if (typed !== typed.trimStart() || typed.trim().length < 2) return null;
    return it.fill.toLowerCase().startsWith(typed.toLowerCase()) ? it : null;
  };
  const merge = (v, remote) => {
    const local = localMatches(v);
    const seen = new Set([v.toLowerCase(), ...local.map(i => i.text.toLowerCase())]);
    const g = remote.filter(s => !seen.has(s.toLowerCase())).map(text => ({ kind: 'google', text }));
    return [...local, ...g].slice(0, 8);
  };

  const ghostRest = () => {
    if (sel !== -1 || !typed.trim() || q.selectionStart !== q.value.length) return '';
    const af = autofill();
    if (af) return af.fill.slice(typed.length);
    const lt = typed.toLowerCase();
    const it = items.find(i => (i.kind === 'google' || i.kind === 'recent')
      && i.text.toLowerCase().startsWith(lt) && i.text.length > typed.length);
    return it ? it.text.slice(typed.length) : '';
  };
  const renderGhost = () => {
    const rest = q.scrollWidth > q.clientWidth ? '' : ghostRest();
    $('ghost-typed').textContent = rest ? q.value : '';
    $('ghost-rest').textContent = rest;
  };
  const mark = () => {
    const af = autofill();
    [...sugg.children].forEach((li, i) => {
      li.setAttribute('aria-selected', i === sel);
      li.classList.toggle('is-default', !!af && i === 0);
    });
    if (sel >= 0) q.setAttribute('aria-activedescendant', 'sugg-' + sel);
    else q.removeAttribute('aria-activedescendant');
  };
  const renderSugg = () => {
    sugg.textContent = '';
    const lv = typed.toLowerCase();
    items.forEach((it, i) => {
      const li = el('li');
      li.id = 'sugg-' + i;
      li.setAttribute('role', 'option');
      const ico = el('span', it.kind === 'bookmark' ? 's-ico mono' : 's-ico');
      if (it.kind === 'bookmark') ico.textContent = it.text.charAt(0);
      else ico.innerHTML = ICONS[it.kind];
      const txt = el('span', 's-text');
      if (it.kind !== 'bookmark' && lv && it.text.toLowerCase().startsWith(lv)) {
        txt.append(el('span', 'typed', it.text.slice(0, typed.length)), it.text.slice(typed.length));
      } else txt.textContent = it.text;
      if (it.sub) txt.append(el('span', 's-sub', it.sub));
      li.append(ico, txt, el('span', 's-kind', KIND[it.kind]));
      li.addEventListener('mousedown', e => { e.preventDefault(); choose(it, e.ctrlKey || e.shiftKey || e.button === 1); });
      li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); renderGhost(); } });
      sugg.append(li);
    });
    sugg.hidden = !items.length;
    q.setAttribute('aria-expanded', items.length > 0);
    mark(); renderGhost();
  };
  function closeSugg() {
    clearTimeout(timer); reqId++;
    items = []; sel = -1;
    renderSugg();
  }

  // Without the agent, fall back to Google Suggest's JSONP mode.
  let jsonpSeq = 0;
  const jsonpSuggest = v => new Promise(resolve => {
    const cb = `__sugg${++jsonpSeq}`, s = document.createElement('script');
    const done = list => { delete window[cb]; s.remove(); clearTimeout(t); resolve(list); };
    const t = setTimeout(() => done([]), 2500);
    window[cb] = d => done(Array.isArray(d && d[1]) ? d[1].filter(x => typeof x === 'string').slice(0, 8) : []);
    s.onerror = () => done([]);
    s.src = 'https://suggestqueries.google.com/complete/search?client=firefox&hl=es&ie=utf-8&oe=utf-8'
      + `&callback=${cb}&q=${encodeURIComponent(v)}`;
    document.head.append(s);
  });
  const fetchRemote = async v => {
    if (remoteCache.has(v)) return remoteCache.get(v);
    let list = null;
    if (agentOk || !IS_WEB) {
      try {
        const r = await fetch(`${API}/api/suggest?q=${encodeURIComponent(v)}`, { cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        if (Array.isArray(j)) list = j;
      } catch {}
    }
    if (!list && IS_WEB) list = await jsonpSuggest(v);
    list = list || [];
    remoteCache.set(v, list);
    return list;
  };
  const update = () => {
    typed = q.value; sel = -1;
    const v = typed.trim();
    if (!v) { closeSugg(); return; }
    items = merge(v, remoteCache.get(v) || []); // local results show instantly
    renderSugg();
    clearTimeout(timer);
    const id = ++reqId;
    timer = setTimeout(async () => {
      const remote = await fetchRemote(v);
      if (id !== reqId) return; // a newer keystroke won
      items = merge(v, remote);
      renderSugg();
    }, 120);
  };
  const choose = (it, newTab) => {
    closeSugg();
    if (it.url) { if (newTab) window.open(it.url, '_blank', 'noopener'); else location.href = it.url; return; }
    q.value = it.text;
    if (newTab) { remember(it.text); window.open(googleUrl(it.text), '_blank', 'noopener'); }
    else form.requestSubmit();
  };

  q.addEventListener('input', update);
  q.addEventListener('focus', () => { if (q.value.trim()) update(); });
  q.addEventListener('blur', closeSugg);
  q.addEventListener('keyup', e => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') renderGhost(); });
  q.addEventListener('click', renderGhost);
  q.addEventListener('keydown', e => {
    const open = items.length > 0;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && open) {
      e.preventDefault();
      const n = items.length;
      sel = e.key === 'ArrowDown' ? (sel + 1 >= n ? -1 : sel + 1) : (sel - 1 < -1 ? n - 1 : sel - 1);
      q.value = sel === -1 || items[sel].kind === 'bookmark' ? typed : items[sel].text;
      mark(); renderGhost();
    } else if (e.key === 'Enter' && (sel >= 0 || autofill())) {
      e.preventDefault();
      choose(sel >= 0 ? items[sel] : autofill(), e.ctrlKey || e.shiftKey);
    } else if (e.key === 'Tab' || (e.key === 'ArrowRight' && q.selectionStart === q.value.length)) {
      const rest = ghostRest();
      if (rest) { e.preventDefault(); q.value += rest; update(); }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); e.stopPropagation();
      q.value = typed;
      closeSugg();
    } else if (e.key === 'Delete' && e.shiftKey && sel >= 0 && items[sel].kind === 'recent') {
      e.preventDefault();
      forget(items[sel].text);
      items.splice(sel, 1); sel = -1; q.value = typed;
      renderSugg();
    }
  });

  // ---------- Shortcuts: / search · 1–9, 0 favourites · F full screen ----------
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = document.activeElement;
    const typing = a && a.tagName === 'INPUT';
    if (e.key === 'Escape' && typing) { if (a === q) q.value = ''; a.blur(); return; }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); q.focus(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
    else if (/^[0-9]$/.test(e.key)) {
      const b = data.bookmarks[e.key === '0' ? 9 : +e.key - 1]; // 1–9, 0 = 10th
      if (b) location.href = b.url;
    }
  });

  // ---------- PC stats (status pill) ----------
  const uptime = s => {
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    return d ? `${d}D ${h}H ${pad(m)}M` : `${h}H ${pad(m)}M`;
  };
  let agentOk = false, demoT = 0;
  const renderStats = s => {
    setText('sys-host', s.host || '—');
    setText('sys-up', uptime(s.uptime));
    setText('sys-ip', s.ip || '—');
    setText('sys-procs', s.procs);
  };
  const poll = async () => {
    clearTimeout(poll.t);
    if (DEMO) {
      agentOk = true;
      renderStats({ host: 'SYSTEM-01', uptime: 3 * 3600 + 42 * 60 + (demoT += 5), ip: '192.168.1.20', procs: 241 });
    } else {
      try {
        const r = await fetch(`${API}/api/stats`, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const s = await r.json();
        agentOk = true;
        if (s.ts) renderStats(s);
        if (pendingSync && !saveTimer) pushRemote(); // edits made while the agent was down
      } catch {
        agentOk = false;
        setText('sys-host', '—'); // hides the status pill
      }
    }
    poll.t = setTimeout(poll, 5000);
  };

  // ---------- Favourites (agent's data.json when it runs, cached in localStorage) ----------
  // data.json also holds homepage-dashboard's tasks: they are kept untouched on every save.
  const LS_KEY = 'terminal-data';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const DEFAULT_MARKS = [
    ['YouTube', 'https://www.youtube.com/'], ['Gmail', 'https://mail.google.com/'], ['GitHub', 'https://github.com/'],
    ['Claude', 'https://claude.ai/'], ['X', 'https://x.com/'], ['Reddit', 'https://www.reddit.com/'],
  ].map(([name, url]) => ({ id: uid(), name, url }));

  let data = { bookmarks: [], todos: [] };
  let pendingSync = false, saveTimer = 0;

  const valid = d => d && Array.isArray(d.bookmarks) && Array.isArray(d.todos);
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; } };
  const writeLocal = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {} };

  const pushRemote = async () => {
    saveTimer = 0;
    try {
      const r = await fetch(`${API}/api/data`, {
        method: 'PUT', headers: { 'X-Home': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      pendingSync = !r.ok;
    } catch { pendingSync = true; }
  };
  const save = () => {
    if (DEMO) return; // demo edits live only on screen
    writeLocal();
    pendingSync = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushRemote, 250);
  };
  let rendered = '';
  const DEMO_DATA = () => ({
    bookmarks: [['YouTube', 'https://www.youtube.com/'], ['GitHub', 'https://github.com/'], ['Gmail', 'https://mail.google.com/'],
      ['Reddit', 'https://www.reddit.com/'], ['Wikipedia', 'https://www.wikipedia.org/'], ['Figma', 'https://www.figma.com/'],
      ['Spotify', 'https://open.spotify.com/'], ['Notion', 'https://www.notion.so/']].map(([name, url]) => ({ id: uid(), name, url })),
    todos: [],
  });
  // Only redraw when something changed, so a periodic refresh never eats a click.
  const show = d => {
    data = d;
    const now = JSON.stringify(data);
    if (now === rendered) return;
    rendered = now;
    renderMarks();
  };
  const loadData = async () => {
    if (DEMO) {
      if (!rendered) show(DEMO_DATA());
      return;
    }
    // Paint the copy cached in this browser straight away: the agent can take a moment to
    // answer, and when it isn't running Windows needs ~2 s to refuse the connection.
    const local = readLocal();
    if (!rendered && valid(local)) show(local);
    let remote = null;
    try {
      const r = await fetch(`${API}/api/data`, { cache: 'no-store' });
      if (r.ok) remote = await r.json();
    } catch {}
    if (valid(remote)) {
      show(remote);
      writeLocal();
      return;
    }
    if (!rendered) show(valid(local) ? local : { bookmarks: DEFAULT_MARKS, todos: [] });
    if (remote) save(); // agent reachable but no data.json yet → seed it
  };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const ICON_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  const delBtn = (cls, label) => {
    const x = el('button', cls);
    x.innerHTML = ICON_X;
    x.setAttribute('aria-label', label);
    x.dataset.act = 'del';
    return x;
  };

  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const normUrl = v => {
    v = v.trim();
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    const u = new URL(v); // throws on garbage
    if (!/^https?:$/.test(u.protocol) || !(u.hostname.includes('.') || u.hostname === 'localhost')) throw new Error('bad url');
    return u.href;
  };
  const nameFrom = url => {
    const parts = hostOf(url).split('.');
    const base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  };
  const renderMarks = () => {
    const list = $('bm-list');
    list.textContent = '';
    data.bookmarks.forEach((b, i) => {
      if (!/^https?:\/\//i.test(b.url)) return;
      const li = el('li');
      li.dataset.id = b.id;
      // Not an <a href>: links make the browser pop its URL status bar on hover.
      const a = el('div', 'bm');
      a.setAttribute('role', 'link');
      a.tabIndex = 0;
      a.dataset.url = b.url;
      const name = b.name || hostOf(b.url);
      const txt = el('span', 'bm-text');
      txt.append(el('span', 'bm-name', name), el('span', 'bm-host', hostOf(b.url)));
      a.append(el('span', 'mono', name.trim().charAt(0) || '•'), txt);
      li.append(a, delBtn('x bm-x', `Borrar ${name}`));
      list.append(li);
    });
    $('bm-empty').hidden = data.bookmarks.length > 0;
  };

  const bmForm = $('bm-form'), bmAdd = $('bm-add');
  const toggleBmForm = open => {
    bmForm.hidden = !open;
    bmAdd.setAttribute('aria-expanded', open);
    setText('bm-msg', '');
    if (open) $('bm-url').focus(); else bmForm.reset();
  };
  bmAdd.addEventListener('click', () => toggleBmForm(bmForm.hidden));
  $('bm-cancel').addEventListener('click', () => toggleBmForm(false));
  bmForm.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); toggleBmForm(false); } });
  bmForm.addEventListener('submit', e => {
    e.preventDefault();
    let url;
    try { url = normUrl($('bm-url').value); } catch { setText('bm-msg', '[url no válida]'); return; }
    data.bookmarks.push({ id: uid(), name: $('bm-name').value.trim() || nameFrom(url), url });
    save(); renderMarks();
    toggleBmForm(false);
  });

  // ui.js edits a favourite in place (name and url; icons are kept by ui.js itself).
  window.homeBookmarks = {
    get: id => { const b = data.bookmarks.find(x => x.id === id); return b ? { ...b } : null; },
    update: (id, patch) => {
      const b = data.bookmarks.find(x => x.id === id);
      if (!b) return false;
      const url = normUrl(patch.url ?? b.url); // throws on garbage
      b.url = url;
      b.name = String(patch.name ?? b.name).trim().slice(0, 80) || nameFrom(url);
      save(); renderMarks();
      return true;
    },
    remove: id => { data.bookmarks = data.bookmarks.filter(x => x.id !== id); save(); renderMarks(); },
  };

  const openMark = (url, newTab) => {
    if (!/^https?:\/\//i.test(url)) return;
    if (newTab) window.open(url, '_blank', 'noopener');
    else location.href = url;
  };
  const bmList = $('bm-list');
  bmList.addEventListener('auxclick', e => {
    const m = e.target.closest('.bm');
    if (m && e.button === 1) { e.preventDefault(); openMark(m.dataset.url, true); }
  });
  // Reorder: Alt+←/→ (or ↑/↓) on a focused favourite.
  const moveMark = (id, delta) => {
    const i = data.bookmarks.findIndex(b => b.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= data.bookmarks.length) return;
    const list = data.bookmarks.slice();
    [list[i], list[j]] = [list[j], list[i]];
    data.bookmarks = list;
    save(); renderMarks();
    bmList.querySelector(`li[data-id="${id}"] .bm`)?.focus();
  };
  bmList.addEventListener('keydown', e => {
    const m = e.target.closest('.bm');
    if (!m) return;
    if (e.key === 'Enter') openMark(m.dataset.url, e.ctrlKey || e.metaKey);
    else if (e.altKey && /^Arrow(Up|Down|Left|Right)$/.test(e.key)) {
      e.preventDefault();
      moveMark(m.closest('li').dataset.id, e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1);
    }
  });

  // Reorder: drag with the mouse across the grid. A 6px threshold keeps plain clicks as
  // clicks; a marker shows where the favourite will land.
  let drag = null, suppressClick = false;
  const endDrag = commit => {
    const d = drag;
    drag = null;
    if (!d || !d.active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    bmList.classList.remove('is-dragging');
    d.li.classList.remove('dragging');
    if (commit && d.marker.parentNode) {
      bmList.insertBefore(d.li, d.marker);
      const order = [...bmList.querySelectorAll('li[data-id]')].map(li => li.dataset.id);
      const byId = new Map(data.bookmarks.map(b => [b.id, b]));
      const next = order.map(id => byId.get(id)).filter(Boolean);
      if (next.length === data.bookmarks.length && next.some((b, i) => b !== data.bookmarks[i])) {
        data.bookmarks = next;
        save();
      }
    }
    d.marker.remove();
    renderMarks();
  };
  bmList.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const li = e.target.closest('li[data-id]');
    if (li) drag = { li, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, active: false };
  });
  bmList.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
      drag.active = true;
      drag.marker = el('li', 'drop-marker');
      drag.marker.setAttribute('aria-hidden', 'true');
      bmList.setPointerCapture(drag.pointerId);
      bmList.classList.add('is-dragging');
      drag.li.classList.add('dragging');
    }
    e.preventDefault();
    // Rows top to bottom, then left to right inside a row.
    const before = [...bmList.querySelectorAll('li[data-id]')].find(li => {
      const r = li.getBoundingClientRect();
      return e.clientY < r.top || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2);
    });
    if (before) { if (drag.marker.nextSibling !== before) bmList.insertBefore(drag.marker, before); }
    else if (bmList.lastChild !== drag.marker) bmList.append(drag.marker);
  });
  bmList.addEventListener('pointerup', () => endDrag(true));
  bmList.addEventListener('pointercancel', () => endDrag(false));
  document.addEventListener('keydown', e => { if (drag && drag.active && e.key === 'Escape') endDrag(false); }, true);

  bmList.addEventListener('click', e => {
    if (suppressClick) return;
    const m = e.target.closest('.bm');
    if (m) { openMark(m.dataset.url, e.ctrlKey || e.metaKey || e.shiftKey); return; }
    const b = e.target.closest('[data-act="del"]');
    if (!b) return;
    const id = b.closest('li').dataset.id;
    data.bookmarks = data.bookmarks.filter(x => x.id !== id);
    save(); renderMarks();
  });

  // Another tab may have changed things → refresh when we come back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !pendingSync) loadData();
  });

  // Switching tabs / windows: leaving releases the search box; coming back puts the caret
  // straight in it — unless you were in another field, which keeps focus.
  let restoreSearch = true;
  const leave = () => {
    if (document.activeElement === q) { restoreSearch = true; q.blur(); }
    else restoreSearch = !document.activeElement || document.activeElement === document.body;
  };
  const enter = () => {
    if (document.visibilityState !== 'visible' || !restoreSearch) return;
    const a = document.activeElement;
    if (!a || a === document.body) q.focus({ preventScroll: true });
  };
  addEventListener('blur', leave);
  addEventListener('focus', enter);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? enter() : leave()));

  // ---------- Start ----------
  loadData();
  q.focus(); // after everything above exists (focus may trigger autocomplete)
  poll();
})();
