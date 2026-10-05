// Conferences. Area and CORE filters for the whole page, four views, local-time countdowns, calendar export.
(() => {
  const root = document.querySelector('[data-confx]');
  const dataEl = document.getElementById('conf-data');
  if (!root || !dataEl) return;
  const DATA = JSON.parse(dataEl.textContent);
  const { areas: AREAS, groups: GROUPS, editions, journals } = DATA;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const store = {
    get: () => { try { return JSON.parse(localStorage.getItem('conf:prefs') || 'null'); } catch { return null; } },
    set: (v) => { try { localStorage.setItem('conf:prefs', JSON.stringify(v)); } catch {} },
  };

  // ---------- time ----------
  // A deadline closes at 23:59:59 on its day in its time zone. "Anywhere on earth" is UTC-12.
  // US and European zones follow daylight saving (roughly, by month), which matters for deadlines given in local time.
  const FIXED = { AoE: -12, UTC: 0, GMT: 0, PST: -8, PDT: -7, EST: -5, EDT: -4, CEST: 2, JST: 9, KST: 9, AEST: 10 };
  const summer = (iso) => { const m = +iso.slice(5, 7); return m > 3 && m < 11; };
  const offset = (tz, iso) => tz in FIXED ? FIXED[tz] : tz === 'PT' ? (summer(iso) ? -7 : -8) : tz === 'ET' ? (summer(iso) ? -4 : -5) : tz === 'CT' ? (summer(iso) ? -5 : -6) : tz === 'CET' ? (summer(iso) ? 2 : 1) : -12;
  const closes = (d) => {
    const [h, m] = (d.time || '23:59').split(':').map(Number);
    return Date.UTC(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10), h, m, 59) - offset(d.tz, d.date) * 3600e3;
  };
  const NOW = Date.now();
  const DAY = 86400e3;
  const fmt = (t, o) => new Date(t).toLocaleString('en-US', o);
  const dayLabel = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const span = (a, b) => {
    if (!a) return '';
    if (!b || a === b) return new Date(a + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    return `${dayLabel(a)}–${sameMonth ? +b.slice(8, 10) : dayLabel(b)}, ${b.slice(0, 4)}`;
  };
  const countdown = (t) => {
    const ms = t - NOW;
    if (ms < 0) return 'closed';
    const d = Math.floor(ms / DAY);
    if (d === 0) { const h = Math.max(1, Math.round(ms / 3600e3)); return `${h} hour${h === 1 ? '' : 's'} left`; }
    if (d === 1) return 'tomorrow';
    if (d < 60) return `in ${d} days`;
    return `in ${Math.round(d / 30.4)} months`;
  };

  // ---------- derived rows ----------
  for (const e of editions) {
    e.dls = (e.deadlines || []).map((d) => ({ ...d, t: closes(d) })).sort((a, b) => a.t - b.t);
    e.upcoming = e.dls.filter((d) => d.t >= NOW);
    e.next = e.upcoming.find((d) => d.primary) || null;
    e.text = [e.name, e.full, e.edition, e.location, ...(e.areas || []).map((a) => AREAS[a]?.label)].join(' ').toLowerCase();
  }
  const series = new Map();
  for (const e of editions) {
    const s = series.get(e.name) || { name: e.name, full: e.full, areas: e.areas, core: e.core, since: e.since, type: e.type, isNew: e.isNew, url: e.url, editions: [], text: e.text };
    s.editions.push(e);
    series.set(e.name, s);
  }
  for (const s of series.values()) {
    const withNext = s.editions.filter((e) => e.next).sort((a, b) => a.next.t - b.next.t);
    s.nextEdition = withNext[0] || null;
    s.nextMeeting = s.editions.filter((e) => e.start && (e.end || e.start) >= new Date(NOW).toISOString().slice(0, 10)).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
  }
  for (const j of journals) j.text = [j.name, j.full, j.publisher, ...(j.areas || []).map((a) => AREAS[a]?.label)].join(' ').toLowerCase();

  // ---------- state ----------
  const ALL_AREAS = Object.keys(AREAS);
  const CORE = ['A*', 'A', 'B', 'C', 'none'];
  const VIEWS = ['deadlines', 'calendar', 'venues', 'journals'];
  const saved = store.get() || {};
  const params = new URLSearchParams(location.search);
  const listParam = (k) => (params.has(k) ? params.get(k).split(',').filter(Boolean) : null);
  const state = {
    view: VIEWS.includes(params.get('view')) ? params.get('view') : saved.view || 'deadlines',
    areas: new Set(listParam('areas') || saved.areas || ALL_AREAS),
    core: new Set(listParam('core') || saved.core || CORE),
    q: params.get('q') || '',
    est: saved.est ?? true,
    events: saved.events ?? false,
    sort: saved.sort || { key: 'next', dir: 1 },
  };
  const save = () => {
    store.set({ view: state.view, areas: [...state.areas], core: [...state.core], est: state.est, events: state.events, sort: state.sort });
    const u = new URL(location.href);
    u.searchParams.set('view', state.view);
    state.areas.size === ALL_AREAS.length ? u.searchParams.delete('areas') : u.searchParams.set('areas', [...state.areas].join(','));
    state.core.size === CORE.length ? u.searchParams.delete('core') : u.searchParams.set('core', [...state.core].join(','));
    state.q ? u.searchParams.set('q', state.q) : u.searchParams.delete('q');
    history.replaceState(null, '', u);
  };

  const coreOk = (c) => state.core.has(c || 'none');
  const areaOk = (as) => (as || []).some((a) => state.areas.has(a));
  const qOk = (text) => !state.q || state.q.toLowerCase().split(/\s+/).every((w) => text.includes(w));
  const editionOk = (e) => areaOk(e.areas) && coreOk(e.core) && qOk(e.text) && (state.est || e.confirmed) && (state.events || e.type !== 'event');
  const seriesOk = (s) => areaOk(s.areas) && coreOk(s.core) && qOk(s.text) && (state.events || s.type !== 'event');
  const journalOk = (j) => areaOk(j.areas) && coreOk(j.core) && qOk(j.text);

  // ---------- small renderers ----------
  const coreBadge = (c) => c ? `<span class="core core--${c === 'A*' ? 'astar' : c.toLowerCase()}" title="CORE rank ${esc(c)}">${esc(c)}</span>` : '';
  const areaTags = (as) => `<span class="atags">${(as || []).map((a) => esc(AREAS[a]?.short || a)).join(' · ')}</span>`;
  const estMark = (e) => e.confirmed ? '' : '<abbr class="est" title="Not announced yet. Estimated from past editions.">est.</abbr>';
  const label = (l) => l.replace(/\s*deadline$/i, '');

  // ---------- views ----------
  function viewDeadlines() {
    const rows = editions.filter((e) => e.next && editionOk(e)).sort((a, b) => a.next.t - b.next.t);
    if (!rows.length) return empty();
    let month = '';
    const out = [];
    rows.forEach((e, i) => {
      const m = fmt(e.next.t, { month: 'long', year: 'numeric' });
      if (m !== month) { month = m; out.push(`<li class="dl-month">${esc(m)}</li>`); }
      const prim = e.upcoming.filter((d) => d.primary);
      const other = e.upcoming.filter((d) => !d.primary);
      out.push(`<li class="dl${i === 0 ? ' is-first' : ''}${e.confirmed ? '' : ' is-est'}">
        <details>
          <summary>
            <span class="dl__when">
              <span class="dl__date">${esc(fmt(e.next.t, { month: 'short', day: 'numeric' }))}</span>
              <span class="dl__local" title="Closes ${esc(e.next.date)} ${esc(e.next.tz)}, shown in your time zone">${esc(fmt(e.next.t, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span>
              <span class="dl__cd">${esc(countdown(e.next.t))}</span>
            </span>
            <span class="dl__venue">
              <span class="dl__name"><b>${esc(e.edition || e.name)}</b>${coreBadge(e.core)}${e.isNew ? '<span class="kd">new</span>' : ''}${e.type === 'event' ? '<span class="kd">event</span>' : ''}${estMark(e)}</span>
              <span class="dl__full">${esc(e.full || '')}</span>
              ${areaTags(e.areas)}
            </span>
            <span class="dl__steps">${prim.slice(0, 3).map((d) => `<span class="${d === e.next ? 'is-next' : ''}" title="Closes ${esc(d.date)} ${esc(d.tz)}">${esc(label(d.label))} <time>${esc(fmt(d.t, { month: 'short', day: 'numeric' }))}</time></span>`).join('')}${prim.length > 3 ? `<span>+${prim.length - 3} more</span>` : ''}</span>
            <span class="dl__meet">${e.start ? `<span>${esc(span(e.start, e.end))}</span>` : ''}${e.location ? `<span class="dl__loc">${esc(e.location)}</span>` : ''}</span>
          </summary>
          <div class="dl__more">
            ${e.note ? `<p>${esc(e.note)}</p>` : ''}
            ${prim.length > 3 ? `<p class="dl__other">${prim.slice(3).map((d) => `${esc(label(d.label))} ${esc(fmt(d.t, { month: 'short', day: 'numeric' }))}`).join(' · ')}</p>` : ''}
            ${other.length ? `<p class="dl__other">${other.map((d) => `${esc(label(d.label))} ${esc(fmt(d.t, { month: 'short', day: 'numeric' }))}`).join(' · ')}</p>` : ''}
            ${e.notification ? `<p class="dl__other">notification ${esc(dayLabel(e.notification))}</p>` : ''}
            ${e.origin && e.isNew ? `<p class="dl__origin">${esc(e.origin)}</p>` : ''}
            <p class="dl__links"><a href="${esc(e.url)}" rel="noopener">website</a>${e.source && e.source !== e.url ? ` <a href="${esc(e.source)}" rel="noopener">call for papers</a>` : ''} <button type="button" data-ics="${esc(e.id)}">add to calendar</button></p>
          </div>
        </details>
      </li>`);
    });
    return `<ol class="dls">${out.join('')}</ol>`;
  }

  function viewCalendar() {
    const items = [];
    for (const e of editions) {
      if (!editionOk(e)) continue;
      for (const d of e.upcoming) if (d.primary) items.push({ e, type: 'dl', day: new Date(d.t).toLocaleDateString('en-CA'), what: label(d.label) });
      if (e.start && (e.end || e.start) >= new Date(NOW).toISOString().slice(0, 10)) items.push({ e, type: 'ev', day: e.start, end: e.end || e.start, what: e.location || 'meeting' });
    }
    const months = [];
    const start = new Date(NOW);
    for (let i = 0; i < 15; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      months.push(d.toISOString().slice(0, 7));
    }
    const todayIso = new Date(NOW).toLocaleDateString('en-CA');
    return `<div class="calv">${months.map((m) => {
      const its = items.filter((it) => it.day.startsWith(m) || (it.type === 'ev' && it.day <= m + '-31' && it.end >= m + '-01')).sort((a, b) => a.day.localeCompare(b.day));
      const first = new Date(m + '-01T12:00:00Z');
      const lead = (first.getUTCDay() + 6) % 7;
      const nDays = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      const dl = new Set(its.filter((i) => i.type === 'dl').map((i) => i.day));
      const ev = new Set();
      its.filter((i) => i.type === 'ev').forEach((i) => { for (let d = 1; d <= nDays; d++) { const iso = `${m}-${String(d).padStart(2, '0')}`; if (iso >= i.day && iso <= i.end) ev.add(iso); } });
      const cells = Array.from({ length: nDays }, (_, k) => { const iso = `${m}-${String(k + 1).padStart(2, '0')}`; return `<span class="d${iso < todayIso ? ' is-past' : ''}${iso === todayIso ? ' is-today' : ''}${dl.has(iso) ? ' has-dl' : ''}${ev.has(iso) ? ' has-ev' : ''}">${k + 1}</span>`; }).join('');
      return `<section class="calm${its.length ? '' : ' is-empty'}">
        <h3>${esc(first.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }))} <span>${m.slice(0, 4)}</span></h3>
        <div class="mini">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w) => `<span class="w">${w}</span>`).join('')}${'<span></span>'.repeat(lead)}${cells}</div>
        <ol class="agenda">${its.map((it) => `<li class="ag ag--${it.type}"><span class="ag__day">${it.type === 'ev' && it.end !== it.day ? `${+it.day.slice(8)}–${it.end.slice(0, 7) === it.day.slice(0, 7) ? +it.end.slice(8) : dayLabel(it.end)}` : +it.day.slice(8)}</span><span class="ag__body"><a href="${esc(it.e.url)}" rel="noopener"><span class="ag__name">${esc(it.e.edition || it.e.name)}</span></a>${coreBadge(it.e.core)} <span class="ag__what">${esc(it.what)}</span>${estMark(it.e)}</span></li>`).join('')}</ol>
      </section>`;
    }).join('')}</div>`;
  }

  const SORTS = {
    name: (a, b) => a.name.localeCompare(b.name),
    core: (a, b) => CORE.indexOf(a.core || 'none') - CORE.indexOf(b.core || 'none') || a.name.localeCompare(b.name),
    since: (a, b) => (a.since || 9999) - (b.since || 9999),
    next: (a, b) => (a.nextEdition?.next.t ?? Infinity) - (b.nextEdition?.next.t ?? Infinity) || a.name.localeCompare(b.name),
    meet: (a, b) => (a.nextMeeting?.start || '9999').localeCompare(b.nextMeeting?.start || '9999'),
    area: (a, b) => (AREAS[a.areas?.[0]]?.label || '').localeCompare(AREAS[b.areas?.[0]]?.label || '') || a.name.localeCompare(b.name),
  };
  function viewVenues() {
    const rows = [...series.values()].filter(seriesOk).sort((a, b) => SORTS[state.sort.key](a, b) * state.sort.dir);
    if (!rows.length) return empty();
    const th = (k, l) => `<th><button type="button" data-sort="${k}" class="${state.sort.key === k ? (state.sort.dir > 0 ? 'is-asc' : 'is-desc') : ''}">${l}</button></th>`;
    return `<div class="tbl"><table>
      <thead><tr>${th('name', 'venue')}${th('core', 'core')}${th('area', 'area')}${th('next', 'next deadline')}${th('meet', 'next meeting')}${th('since', 'since')}</tr></thead>
      <tbody>${rows.map((s) => `<tr>
        <td><a href="${esc(s.url)}" rel="noopener"><b>${esc(s.name)}</b></a>${s.isNew ? '<span class="kd">new</span>' : ''}${s.type === 'event' ? '<span class="kd">event</span>' : ''}<span class="tfull">${esc(s.full || '')}</span></td>
        <td>${coreBadge(s.core) || '<span class="muted">·</span>'}</td>
        <td>${areaTags(s.areas)}</td>
        <td>${s.nextEdition ? `${esc(fmt(s.nextEdition.next.t, { month: 'short', day: 'numeric', year: 'numeric' }))}${estMark(s.nextEdition)}<span class="tsub">${esc(label(s.nextEdition.next.label))}, ${esc(countdown(s.nextEdition.next.t))}</span>` : '<span class="muted">none open</span>'}</td>
        <td>${s.nextMeeting ? `${esc(span(s.nextMeeting.start, s.nextMeeting.end))}<span class="tsub">${esc(s.nextMeeting.location || '')}</span>` : '<span class="muted">·</span>'}</td>
        <td class="num">${s.since || ''}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function viewJournals() {
    const rows = journals.filter(journalOk).sort((a, b) => CORE.indexOf(a.core || 'none') - CORE.indexOf(b.core || 'none') || a.name.localeCompare(b.name));
    if (!rows.length) return empty();
    return `<ol class="jrn">${rows.map((j) => `<li>
      <div class="jrn__head"><a href="${esc(j.url)}" rel="noopener"><b>${esc(j.name)}</b></a>${coreBadge(j.core)}${j.openAccess ? '<span class="kd">open access</span>' : ''}</div>
      <div class="jrn__full">${esc(j.full)}${j.publisher ? `, ${esc(j.publisher)}` : ''}${j.since ? `, since ${j.since}` : ''}</div>
      ${areaTags(j.areas)}
      <p>${esc(j.note || '')}</p>
      <p class="jrn__meta">${[j.submission && `submission ${j.submission}`, j.turnaround, j.conferenceTrack].filter(Boolean).map(esc).join(' · ')}</p>
    </li>`).join('')}</ol>`;
  }

  const empty = () => '<p class="empty">Nothing matches these filters.</p>';

  // ---------- panel ----------
  const panel = $('[data-panel]', root);
  const stage = $('[data-stage]', root);
  function counts() {
    const c = {};
    for (const s of series.values()) if (coreOk(s.core) && (state.events || s.type !== 'event')) (s.areas || []).forEach((a) => (c[a] = (c[a] || 0) + 1));
    for (const j of journals) if (state.view === 'journals' && coreOk(j.core)) (j.areas || []).forEach((a) => (c[a] = (c[a] || 0) + 1));
    return c;
  }
  function renderPanel() {
    const c = counts();
    panel.innerHTML = `
      <label class="px-search">
        <input type="search" placeholder="Search venues" value="${esc(state.q)}" data-q aria-label="Search venues">
      </label>
      <div class="px-views" role="tablist">${VIEWS.map((v) => `<button type="button" role="tab" aria-selected="${state.view === v}" data-view="${v}">${v}</button>`).join('')}</div>
      <div class="px-sec">
        <div class="px-h">core rank</div>
        <div class="px-core">${CORE.map((k) => `<label class="px-chk"><input type="checkbox" data-core="${k}" ${state.core.has(k) ? 'checked' : ''}><span>${k === 'none' ? 'unranked' : k}</span></label>`).join('')}</div>
      </div>
      ${GROUPS.map((g) => {
        const keys = Object.keys(AREAS).filter((a) => AREAS[a].group === g);
        const on = keys.filter((k) => state.areas.has(k)).length;
        return `<div class="px-sec">
          <div class="px-h">${esc(g)} <span class="px-all"><button type="button" data-group="${esc(g)}" data-set="1" ${on === keys.length ? 'disabled' : ''}>all</button><button type="button" data-group="${esc(g)}" data-set="0" ${on === 0 ? 'disabled' : ''}>none</button></span></div>
          ${keys.map((k) => `<label class="px-chk"><input type="checkbox" data-area="${k}" ${state.areas.has(k) ? 'checked' : ''}><span>${esc(AREAS[k].label)}</span><small>${c[k] || ''}</small></label>`).join('')}
        </div>`;
      }).join('')}
      <div class="px-sec">
        <div class="px-h">show</div>
        <label class="px-chk"><input type="checkbox" data-opt="est" ${state.est ? 'checked' : ''}><span>estimated dates</span></label>
        <label class="px-chk"><input type="checkbox" data-opt="events" ${state.events ? 'checked' : ''}><span>industry events</span></label>
      </div>
      <div class="px-actions">
        <button type="button" data-ics-all>add these deadlines to my calendar</button>
        <button type="button" data-reset>reset filters</button>
      </div>`;
  }
  function renderStage() {
    stage.innerHTML = ({ deadlines: viewDeadlines, calendar: viewCalendar, venues: viewVenues, journals: viewJournals })[state.view]();
    const n = state.view === 'journals' ? journals.filter(journalOk).length : state.view === 'venues' ? [...series.values()].filter(seriesOk).length : editions.filter((e) => e.next && editionOk(e)).length;
    $('[data-count]', root).textContent = `${n} ${state.view === 'journals' ? 'journal' : state.view === 'venues' ? 'venue' : 'open deadline'}${n === 1 ? '' : 's'}`;
  }
  const render = () => { renderPanel(); renderStage(); save(); };

  panel.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-q]')) { state.q = t.value; renderStage(); save(); return; }
  });
  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.area) t.checked ? state.areas.add(t.dataset.area) : state.areas.delete(t.dataset.area);
    else if (t.dataset.core) t.checked ? state.core.add(t.dataset.core) : state.core.delete(t.dataset.core);
    else if (t.dataset.opt) state[t.dataset.opt] = t.checked;
    else return;
    const q = $('[data-q]', panel).value;
    render();
    $('[data-q]', panel).value = q;
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.view) { state.view = b.dataset.view; render(); }
    else if (b.dataset.group) {
      Object.keys(AREAS).filter((a) => AREAS[a].group === b.dataset.group).forEach((a) => (b.dataset.set === '1' ? state.areas.add(a) : state.areas.delete(a)));
      render();
    } else if (b.matches('[data-reset]')) {
      state.areas = new Set(ALL_AREAS); state.core = new Set(CORE); state.q = ''; state.est = true; state.events = false; render();
    } else if (b.matches('[data-ics-all]')) {
      downloadIcs(editions.filter((e) => e.next && editionOk(e)), 'deadlines.ics');
    }
  });
  stage.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) { state.sort = { key: s.dataset.sort, dir: state.sort.key === s.dataset.sort ? -state.sort.dir : 1 }; renderStage(); save(); return; }
    const ics = e.target.closest('[data-ics]');
    if (ics) { const ed = editions.find((x) => x.id === ics.dataset.ics); if (ed) downloadIcs([ed], `${ed.id}.ics`); }
  });

  // ---------- calendar export ----------
  function downloadIcs(list, filename) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const z = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Persistence of Reason//Conferences//EN', 'CALSCALE:GREGORIAN'];
    for (const e of list) for (const d of e.upcoming.filter((x) => x.primary)) {
      lines.push('BEGIN:VEVENT', `UID:${e.id}-${d.label.replace(/\W+/g, '-')}-${d.date}@persistenceofreason.com`, `DTSTAMP:${stamp}`,
        `DTSTART:${z(d.t - 3600e3)}`, `DTEND:${z(d.t)}`, `SUMMARY:${(e.edition || e.name)} ${label(d.label)} deadline${e.confirmed ? '' : ' (estimated)'}`,
        `DESCRIPTION:Closes ${d.date} ${d.tz}. ${e.url}`, `URL:${e.url}`,
        'BEGIN:VALARM', 'TRIGGER:-P7D', 'ACTION:DISPLAY', 'DESCRIPTION:Deadline in a week', 'END:VALARM',
        'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Deadline tomorrow', 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' })), download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    window.__toast?.('Calendar file downloaded');
  }

  // mobile: the panel folds away behind a button
  $('[data-panel-toggle]', root)?.addEventListener('click', () => root.classList.toggle('panel-open'));

  render();
})();
