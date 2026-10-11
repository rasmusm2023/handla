const $ = (sel, root = document) => root.querySelector(sel);

const app = {
  report: null,
  weeks: [],
  sample: false,
  storeFilter: 'all',
  list: emptyList(),
};

const CATEGORY_EMOJI = { meat: '🥩', poultry: '🍗', fish: '🐟', dairy: '🧀', produce: '🥦', pantry: '🥫', frozen: '🧊', bread: '🍞', coffee: '☕', drinks: '🥤', snacks: '🍿', household: '🧻', other: '🛒' };
const STORE_COLORS = { 'ica maxi': '#E13205', willys: '#8E1B2E', lidl: '#0050AA', 'city gross': '#E0A800', dollarstore: '#1E8A4C' };
const SECTIONS = [
  { key: 'list', title: "Grok's picks", hint: 'Worth buying this week' },
  { key: 'mention', title: 'Honorable mentions', hint: 'Just missed the threshold' },
  { key: 'drink', title: 'Drinks', hint: 'Best price per litre' },
  { key: 'bonus', title: 'Bonus deals', hint: "Great savings that don't fit the meals" },
];

/* ---------- formatting ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kr = (n) => (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2).replace('.', ','));
const qtyText = (n) => String(n).replace('.', ',');
const parseDay = (iso) => (iso ? new Date(iso + 'T12:00:00') : null);
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function priceTag(deal) {
  const whole = Math.floor(deal.price + 1e-9);
  const ore = Math.round((deal.price - whole) * 100);
  return `<div class="tag"><span class="tag-kr">${whole}</span>${ore ? `<sup>${String(ore).padStart(2, '0')}</sup>` : '<sup>:-</sup>'}<small>/${esc(deal.unit || 'st')}</small></div>`;
}

function validity(deal) {
  const to = parseDay(deal.validTo);
  if (!to) return { text: '', expired: false, short: false };
  const today = parseDay(isoDay(new Date()));
  const daysLeft = Math.round((to - today) / 86400000);
  const from = parseDay(deal.validFrom);
  const short = from ? Math.round((to - from) / 86400000) <= 3 : false;
  if (daysLeft < 0) return { text: `Ended ${shortFmt.format(to)}`, expired: true, short };
  if (daysLeft === 0) return { text: 'Ends today', expired: false, short, urgent: true };
  const starts = from && from > today ? `${dayFmt.format(from)} – ` : 'until ';
  return { text: `${starts}${dayFmt.format(to)}`, expired: false, short };
}

const storeKey = (d) => (d.location ? `${d.store} · ${d.location}` : d.store);
const storeColor = (name) => STORE_COLORS[String(name).toLowerCase()] || '#6B7268';
const storeDot = (name) => `<i class="dot" style="background:${storeColor(name)}"></i>`;
const saving = (d) => (d.regularPrice && d.regularPrice > d.price ? d.regularPrice - d.price : 0);
const savingPct = (d) => (saving(d) ? Math.round((1 - d.price / d.regularPrice) * 100) : 0);

/* ---------- shopping-list state ---------- */

function emptyList() {
  return { entries: {}, custom: [], updatedAt: 0 };
}
const listKey = () => `dh_list_${app.sample ? 'sample' : app.report.week}`;
const entry = (d) => app.list.entries[d.id] || {};
const inList = (d) => entry(d).in ?? d.section === 'list';
const qtyOf = (d) => entry(d).qty ?? d.qty ?? 1;
const isChecked = (d) => Boolean(entry(d).checked);
const listDeals = () => app.report.deals.filter(inList);

function patchEntry(id, patch) {
  app.list.entries[id] = { ...app.list.entries[id], ...patch };
  commitList();
}

let saveTimer;
function commitList() {
  app.list.updatedAt = Date.now();
  try {
    localStorage.setItem(listKey(), JSON.stringify(app.list));
  } catch {}
  render();
  if (app.sample) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushList, 500);
}

async function pushList() {
  try {
    await fetch(`/api/list?week=${app.report.week}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(app.list) });
  } catch {
    toast('Offline – list saved on this device only');
  }
}

async function loadList() {
  let local = null;
  try {
    local = JSON.parse(localStorage.getItem(listKey()));
  } catch {}
  app.list = local?.entries ? local : emptyList();
  if (app.sample) return;
  try {
    const res = await fetch(`/api/list?week=${app.report.week}`);
    const { state } = await res.json();
    if (state && state.updatedAt > app.list.updatedAt) app.list = state;
    else if (app.list.updatedAt > (state?.updatedAt || 0)) pushList();
  } catch {}
}

/* ---------- data loading ---------- */

async function loadSample() {
  const data = await (await fetch('/sample.json')).json();
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const offset = (n) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + n);
    return isoDay(d);
  };
  for (const d of data.deals) {
    d.validFrom = offset(d.dayFrom);
    d.validTo = offset(d.dayTo);
  }
  return { ...data, week: 'Sample', generatedAt: new Date().toISOString() };
}

async function load(week = '') {
  let payload = null;
  let problem = '';
  try {
    const res = await fetch(`/api/report${week ? `?week=${week}` : ''}`);
    payload = await res.json();
    if (!payload.ok) problem = payload.error;
  } catch {
    problem = 'Could not reach the server.';
  }
  app.weeks = payload?.weeks || [];
  app.run = payload?.run || null;
  app.sample = !payload?.report;
  app.report = payload?.report || (await loadSample());
  app.problem = problem;
  app.storeFilter = 'all';
  await loadList();
  render();
}

/* ---------- rendering ---------- */

function render() {
  renderChrome();
  renderHero();
  renderDeals();
  renderDishes();
  renderList();
}

function renderChrome() {
  const select = $('#weekSelect');
  select.hidden = app.weeks.length < 2;
  select.innerHTML = app.weeks.map((w) => `<option value="${w}" ${w === app.report.week ? 'selected' : ''}>Week ${Number(w.slice(-2))}, ${w.slice(0, 4)}</option>`).join('');

  const notes = [];
  if (app.problem) notes.push(`<div class="banner warn">⚠️ ${esc(app.problem)}</div>`);
  if (app.run?.status === 'error') notes.push(`<div class="banner warn">⚠️ Grok's last run (${dayFmt.format(new Date(app.run.finishedAt))}) failed: ${esc(app.run.message)} <button class="link" data-act="open-import">Try again</button></div>`);
  if (app.sample) notes.push(`<div class="banner">Showing <b>sample data</b> – made-up prices so you can see the layout. Grok's first Monday run replaces it. <button class="link" data-act="open-import">Run Grok now</button></div>`);
  for (const s of app.report.missingStores || []) notes.push(`<div class="banner quiet">Couldn't find offers: ${esc(s)}</div>`);
  $('#banner').innerHTML = notes.join('');

  const count = listDeals().length + app.list.custom.length;
  $('#listBadge').textContent = count || '';
}

function renderHero() {
  const deals = listDeals();
  const total = deals.reduce((sum, d) => sum + d.price * qtyOf(d), 0);
  const saved = deals.reduce((sum, d) => sum + saving(d) * qtyOf(d), 0);
  const stores = new Set(deals.map(storeKey));
  const dates = app.report.deals.flatMap((d) => [d.validFrom, d.validTo]).filter(Boolean).sort();
  const range = dates.length ? `${shortFmt.format(parseDay(dates[0]))} – ${shortFmt.format(parseDay(dates.at(-1)))}` : '';
  const weekLabel = /W\d{2}$/.test(app.report.week) ? `Week ${Number(app.report.week.slice(-2))}` : 'Sample week';
  const updated = app.sample ? '' : `Updated ${dayFmt.format(new Date(app.report.receivedAt || app.report.generatedAt))}`;

  $('#hero').innerHTML = `
    <div class="hero-head">
      <span class="eyebrow">${weekLabel}${range ? ` · ${range}` : ''}</span>
      <span class="eyebrow dim">${updated}</span>
    </div>
    <div class="hero-main">
      <div class="hero-save">
        <span class="hero-label">Your list saves</span>
        <span class="hero-num">${kr(Math.round(saved))}<small>kr</small></span>
      </div>
      <dl class="hero-stats">
        <div><dt>List total</dt><dd>${kr(Math.round(total))} kr</dd></div>
        <div><dt>Items</dt><dd>${deals.length + app.list.custom.length}</dd></div>
        <div><dt>Stores</dt><dd>${stores.size}</dd></div>
      </dl>
    </div>`;
}

function chips(deal, { showStore }) {
  const v = validity(deal);
  const out = [];
  if (showStore) out.push(`<span class="chip store">${storeDot(deal.store)}${esc(storeKey(deal))}</span>`);
  if (deal.section === 'drink' && deal.pricePerLitre) out.push(`<span class="chip strong">${kr(deal.pricePerLitre)} kr/l</span>`);
  if (savingPct(deal)) out.push(`<span class="chip save">−${savingPct(deal)}% · save ${kr(saving(deal))} kr</span>`);
  if (deal.comparePrice) out.push(`<span class="chip">${kr(deal.comparePrice)} ${esc(deal.compareUnit || 'kr/kg')}</span>`);
  if (deal.multiBuy) out.push(`<span class="chip">${esc(deal.multiBuy)}</span>`);
  if (deal.membersOnly) out.push(`<span class="chip member">Members${deal.memberProgram ? ` · ${esc(deal.memberProgram)}` : ''}</span>`);
  if (deal.stockUp) out.push('<span class="chip star">⭐ Stock up</span>');
  if (deal.staple) out.push('<span class="chip">Staple</span>');
  if (v.text) out.push(`<span class="chip ${v.short || v.urgent ? 'clock' : 'date'}">${v.short || v.urgent ? '⏰ ' : ''}${v.text}</span>`);
  return out.join('');
}

function dealCard(deal, opts) {
  const on = inList(deal);
  const v = validity(deal);
  const sub = [deal.brand, deal.packSize, `buy ${qtyText(deal.qty)}`].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="deal ${on ? 'on' : ''} ${v.expired ? 'expired' : ''}" data-id="${esc(deal.id)}">
      <div class="deal-ico" aria-hidden="true">${esc(deal.emoji) || CATEGORY_EMOJI[deal.category] || '🛒'}</div>
      <div class="deal-main">
        <h4>${esc(deal.name)}</h4>
        <p class="deal-sub">${sub}</p>
        <div class="chips">${chips(deal, opts)}</div>
        ${deal.note ? `<p class="deal-note">${esc(deal.note)}</p>` : ''}
      </div>
      <div class="deal-side">
        ${priceTag(deal)}
        ${deal.regularPrice ? `<s>${kr(deal.regularPrice)} kr</s>` : ''}
        <button class="toggle" data-act="toggle" aria-pressed="${on}">${on ? '✓ On list' : '+ Add'}</button>
      </div>
    </article>`;
}

function renderDeals() {
  const all = app.report.deals;
  const stores = [...new Set(all.map(storeKey))];
  const visible = all.filter((d) => app.storeFilter === 'all' || storeKey(d) === app.storeFilter);

  const filter = `
    <div class="filters" role="group" aria-label="Filter by store">
      <button class="pill ${app.storeFilter === 'all' ? 'active' : ''}" data-act="filter" data-store="all">All <b>${all.length}</b></button>
      ${stores.map((s) => `<button class="pill ${app.storeFilter === s ? 'active' : ''}" data-act="filter" data-store="${esc(s)}">${storeDot(s.split(' · ')[0])}${esc(s)} <b>${all.filter((d) => storeKey(d) === s).length}</b></button>`).join('')}
    </div>`;

  const sections = SECTIONS.map(({ key, title, hint }) => {
    const deals = visible.filter((d) => d.section === key);
    if (!deals.length) return '';
    let body;
    if (key === 'list') {
      const groups = [...new Set(deals.map(storeKey))];
      body = groups
        .map((g) => {
          const inGroup = deals.filter((d) => storeKey(d) === g);
          return `<h3 class="store-head">${storeDot(inGroup[0].store)}${esc(g)}<span>${inGroup.length} deals</span></h3><div class="cards">${inGroup.map((d) => dealCard(d, { showStore: false })).join('')}</div>`;
        })
        .join('');
    } else {
      const sorted = key === 'drink' ? [...deals].sort((a, b) => (a.pricePerLitre || 1e9) - (b.pricePerLitre || 1e9)) : deals;
      body = `<div class="cards">${sorted.map((d) => dealCard(d, { showStore: true })).join('')}</div>`;
    }
    return `<section class="block"><header class="block-head"><h2>${title}</h2><p>${hint}</p></header>${body}</section>`;
  }).join('');

  $('#view-deals').innerHTML = filter + (sections || '<p class="empty">No deals for this store.</p>');
}

function renderDishes() {
  const byId = new Map(app.report.deals.map((d) => [d.id, d]));
  const cards = (app.report.dishes || []).map((dish, i) => {
    const uses = dish.uses.map((u) => {
      const deal = byId.get(u.id);
      if (!deal) return `<span class="ing plain">${esc(u.label)}</span>`;
      const on = inList(deal);
      return `<button class="ing ${on ? 'on' : ''}" data-act="toggle" data-id="${esc(deal.id)}" aria-pressed="${on}">${CATEGORY_EMOJI[deal.category] || ''} ${esc(deal.name)}<i>${on ? '✓' : '+'}</i></button>`;
    }).join('');
    const missing = dish.uses.filter((u) => byId.has(u.id) && !inList(byId.get(u.id))).length;
    return `
      <article class="dish">
        <div class="dish-top"><span class="dish-ico">${esc(dish.emoji) || '🍽️'}</span><h3>${esc(dish.name)}</h3></div>
        ${dish.why ? `<p class="dish-why">${esc(dish.why)}</p>` : ''}
        <h5>From this week's deals</h5>
        <div class="ings">${uses}</div>
        ${dish.fromHome?.length ? `<h5>From home</h5><p class="home">${dish.fromHome.map(esc).join(' · ')}</p>` : ''}
        <button class="btn ${missing ? 'primary' : 'ghost'} wide" data-act="add-dish" data-dish="${i}" ${missing ? '' : 'disabled'}>${missing ? `Add ${missing} missing to list` : 'Everything is on your list'}</button>
      </article>`;
  });
  $('#view-dishes').innerHTML = cards.length
    ? `<header class="block-head"><h2>Dish ideas</h2><p>Built from this week's deals</p></header><div class="dishes">${cards.join('')}</div>`
    : '<p class="empty">No dish ideas in this report.</p>';
}

function listRow(item, custom) {
  const checked = custom ? item.checked : isChecked(item);
  const qty = custom ? item.qty : qtyOf(item);
  const sub = custom ? 'Added by you' : [esc(item.packSize), `<b>${kr(Math.round(item.price * qty))} kr</b>`].filter(Boolean).join(' · ');
  return `
    <li class="row ${checked ? 'done' : ''}" data-id="${esc(item.id)}" ${custom ? 'data-custom="1"' : ''}>
      <button class="check" data-act="check" aria-pressed="${Boolean(checked)}" aria-label="Mark ${esc(item.name)} as bought"></button>
      <div class="row-main"><span class="row-name">${esc(item.name)}</span><span class="row-sub">${sub}</span></div>
      <div class="stepper"><button data-act="dec" aria-label="Fewer">−</button><span>${qtyText(qty)}</span><button data-act="inc" aria-label="More">+</button></div>
      <button class="x" data-act="remove" aria-label="Remove ${esc(item.name)}">×</button>
    </li>`;
}

function renderList() {
  const deals = listDeals();
  const groups = [...new Set(deals.map(storeKey))];
  const total = deals.reduce((sum, d) => sum + d.price * qtyOf(d), 0);
  const saved = deals.reduce((sum, d) => sum + saving(d) * qtyOf(d), 0);
  const left = deals.filter((d) => !isChecked(d)).length + app.list.custom.filter((c) => !c.checked).length;
  const count = deals.length + app.list.custom.length;

  const body = groups
    .map((g) => {
      const inGroup = deals.filter((d) => storeKey(d) === g);
      const sum = inGroup.reduce((s, d) => s + d.price * qtyOf(d), 0);
      return `<h3 class="store-head">${storeDot(inGroup[0].store)}${esc(g)}<span>${kr(Math.round(sum))} kr</span></h3><ul class="rows">${inGroup.map((d) => listRow(d, false)).join('')}</ul>`;
    })
    .join('');
  const custom = app.list.custom.length ? `<h3 class="store-head"><i class="dot"></i>Other<span></span></h3><ul class="rows">${app.list.custom.map((c) => listRow(c, true)).join('')}</ul>` : '';

  $('#view-list').innerHTML = `
    <header class="block-head list-head"><h2>My list</h2><p>${count ? `${left} of ${count} left to grab` : 'Nothing here yet'}</p></header>
    ${body}${custom}
    ${count ? '' : '<p class="empty">Add deals with the <b>+ Add</b> button, or type your own item below.</p>'}
    <form class="add" id="addForm"><input id="addInput" placeholder="Add something else…" aria-label="Add your own item" autocomplete="off" maxlength="80"><button class="btn ghost" type="submit">Add</button></form>
    <div class="totals">
      <div><span>Total</span><b>${kr(Math.round(total))} kr</b></div>
      <div class="good"><span>You save</span><b>${kr(Math.round(saved))} kr</b></div>
    </div>
    <div class="list-actions">
      <button class="btn primary" data-act="copy">Copy list</button>
      <button class="btn ghost" data-act="reset">Reset to Grok's picks</button>
    </div>`;
}

/* ---------- actions ---------- */

function listAsText() {
  const lines = [];
  const deals = listDeals();
  for (const g of new Set(deals.map(storeKey))) {
    lines.push(g.toUpperCase());
    for (const d of deals.filter((x) => storeKey(x) === g)) lines.push(`☐ ${qtyText(qtyOf(d))} × ${d.name}${d.packSize ? ` (${d.packSize})` : ''} – ${kr(d.price)} kr${d.membersOnly ? ' [member]' : ''}`);
    lines.push('');
  }
  if (app.list.custom.length) {
    lines.push('OTHER');
    for (const c of app.list.custom) lines.push(`☐ ${qtyText(c.qty)} × ${c.name}`);
  }
  return lines.join('\n').trim();
}

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

const actions = {
  toggle(id) {
    const deal = app.report.deals.find((d) => d.id === id);
    patchEntry(id, { in: !inList(deal), checked: false });
  },
  remove(id, row) {
    if (row.dataset.custom) {
      app.list.custom = app.list.custom.filter((c) => c.id !== id);
      return commitList();
    }
    patchEntry(id, { in: false, checked: false });
  },
  check(id, row) {
    const custom = row.dataset.custom && app.list.custom.find((c) => c.id === id);
    if (custom) {
      custom.checked = !custom.checked;
      return commitList();
    }
    patchEntry(id, { checked: !app.list.entries[id]?.checked });
  },
  step(id, row, dir) {
    const custom = row.dataset.custom && app.list.custom.find((c) => c.id === id);
    const deal = app.report.deals.find((d) => d.id === id);
    const size = !custom && deal.unit === 'kg' ? 0.5 : 1;
    const next = Math.max(size, (custom ? custom.qty : qtyOf(deal)) + dir * size);
    if (custom) {
      custom.qty = next;
      return commitList();
    }
    patchEntry(id, { qty: next });
  },
  inc: (id, row) => actions.step(id, row, 1),
  dec: (id, row) => actions.step(id, row, -1),
  filter(_, el) {
    app.storeFilter = el.dataset.store;
    renderDeals();
  },
  'add-dish'(_, el) {
    const dish = app.report.dishes[Number(el.dataset.dish)];
    for (const u of dish.uses) if (u.id) app.list.entries[u.id] = { ...app.list.entries[u.id], in: true };
    commitList();
    toast('Added to your list');
  },
  async copy() {
    try {
      await navigator.clipboard.writeText(listAsText());
      toast('List copied');
    } catch {
      toast('Copy not allowed in this browser');
    }
  },
  reset() {
    if (!confirm("Reset your list to Grok's picks? Your changes for this week are discarded.")) return;
    app.list = emptyList();
    commitList();
  },
  'open-import'() {
    $('#importKey').value = localStorage.getItem('dh_key') || '';
    $('#importMsg').textContent = '';
    $('#importDialog').showModal();
  },
  'close-import': () => $('#importDialog').close(),
  async hunt(_, el) {
    const msg = $('#importMsg');
    const key = $('#importKey').value.trim();
    el.disabled = true;
    msg.textContent = 'Grok is checking the stores… this can take a few minutes. Keep this open.';
    try {
      const res = await fetch('/api/hunt', { headers: { Authorization: `Bearer ${key}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      localStorage.setItem('dh_key', key);
      $('#importDialog').close();
      toast(`Grok found ${data.deals} deals for ${data.week}`);
      await load(data.week);
    } catch (err) {
      msg.textContent = err.message || 'Run failed.';
    } finally {
      el.disabled = false;
    }
  },
  async paste() {
    try {
      $('#importText').value = await navigator.clipboard.readText();
    } catch {
      $('#importMsg').textContent = 'Clipboard access was blocked – paste manually instead.';
    }
  },
};

document.addEventListener('click', (event) => {
  const tab = event.target.closest('.tabs [data-tab]');
  if (tab) {
    document.body.dataset.tab = tab.dataset.tab;
    window.scrollTo({ top: 0 });
    return;
  }
  const el = event.target.closest('[data-act]');
  if (!el) return;
  const row = el.closest('[data-id]');
  actions[el.dataset.act]?.(el.dataset.id || row?.dataset.id, row || el);
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'addForm') {
    event.preventDefault();
    const name = $('#addInput').value.trim();
    if (!name) return;
    app.list.custom.push({ id: `c${Date.now()}`, name, qty: 1, checked: false });
    commitList();
    $('#addInput').focus();
  }
  if (event.target.id === 'importForm') {
    event.preventDefault();
    const msg = $('#importMsg');
    const key = $('#importKey').value.trim();
    msg.textContent = 'Importing…';
    try {
      const res = await fetch('/api/report', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'text/plain' }, body: $('#importText').value });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      localStorage.setItem('dh_key', key);
      $('#importDialog').close();
      $('#importText').value = '';
      toast(`Imported ${data.deals} deals for ${data.week}`);
      await load(data.week);
    } catch (err) {
      msg.textContent = err.message || 'Import failed.';
    }
  }
});

$('#weekSelect').addEventListener('change', (event) => load(event.target.value));

// Pick up a fresh report or list changes from another device when the app is reopened.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#importDialog').open) load($('#weekSelect').hidden ? '' : app.report.week === app.weeks[0] ? '' : app.report.week);
});

load();
