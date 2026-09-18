'use strict';

// ─── Data imports (Vite resolves these at build time from /data/*.json) ───────
import opportunities from '../data/opportunities.json'
import signals from '../data/signals.json'
import matchesRaw from '../data/matches.json'

// ─── Config injected at build time via vite.config.js define ─────────────────
const PROXY_URL = __PROXY_URL__

// ─── Security helpers ─────────────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div')
  d.textContent = String(str || '')
  return d.innerHTML
}
function sanitizeInput(str, maxLen) {
  return String(str || '').replace(/[<>'"]/g, '').trim().slice(0, maxLen || 500)
}

// ─── Static data (frozen after import) ───────────────────────────────────────
const CAUSES = Object.freeze([
  { slug: 'affordable-housing', name: 'Affordable Housing' },
  { slug: 'global-health',      name: 'Global Health' },
  { slug: 'food-security',      name: 'Food Security' },
  { slug: 'tech-for-good',      name: 'Tech for Good' },
  { slug: 'mental-health',      name: 'Mental Health' },
  { slug: 'education',          name: 'Education' },
  { slug: 'arts-culture',       name: 'Arts & Culture' }
])

const DEMO_USERS = Object.freeze([
  { email: 'admin@philanthropyconnect.org', pass: 'connect2026', name: 'Admin', role: 'Platform admin' },
  { email: 'grants@hopeclinic.org',         pass: 'hope2026',    name: 'HopeClinic Team', role: 'Member org' }
])

// ─── Auth ─────────────────────────────────────────────────────────────────────
let SESSION = null

function handleLogin() {
  const email = sanitizeInput(document.getElementById('auth-email').value, 100).toLowerCase()
  const pass  = document.getElementById('auth-pass').value
  const errEl = document.getElementById('auth-error')
  errEl.textContent = ''
  const user = DEMO_USERS.find(u => u.email === email && u.pass === pass)
  if (!user) { errEl.textContent = 'Email or password is incorrect.'; return }
  SESSION = { name: user.name, role: user.role, email: user.email }
  document.getElementById('auth-screen').classList.add('hidden')
  document.getElementById('app').classList.add('visible')
  document.getElementById('user-name').textContent = user.name
  document.getElementById('user-role').textContent = user.role
  document.getElementById('user-avatar').textContent = user.name[0].toUpperCase()
  showHero()
}

function handleLogout() {
  SESSION = null
  document.getElementById('auth-screen').classList.remove('hidden')
  document.getElementById('app').classList.remove('visible')
  document.getElementById('auth-email').value = ''
  document.getElementById('auth-pass').value = ''
  document.getElementById('auth-error').textContent = ''
}

document.getElementById('auth-pass').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleLogin()
})
document.getElementById('login-btn').addEventListener('click', handleLogin)
document.getElementById('logout-btn').addEventListener('click', handleLogout)

// ─── Sidebar ──────────────────────────────────────────────────────────────────
let sidebarCollapsed = false
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  sidebarCollapsed = !sidebarCollapsed
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed)
  document.getElementById('sidebar-toggle').textContent = sidebarCollapsed ? '⟩' : '⟨'
})

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAmt(a) {
  if (!a) return ''
  if (a >= 1e9) return '$' + (a / 1e9).toFixed(1) + 'B'
  if (a >= 1e6) return '$' + (a / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return '$' + Math.round(a / 1e3) + 'K'
  return '$' + a
}
function causeName(slug) {
  return CAUSES.find(c => c.slug === slug)?.name || slug
}
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2800)
}

// ─── State ────────────────────────────────────────────────────────────────────
let state = { cause: '', signalWindow: 'open', matchFilter: 'new', tone: 'Formal', selectedOpp: '', selectedDonor: '' }
let currentPage = 'home'
let searchQuery = ''
let searchDebounceTimer = null
let currentLetter = ''

// ─── Cause pills ─────────────────────────────────────────────────────────────
function renderCausePills() {
  const el = document.getElementById('cause-filter-pills')
  const all = [{ slug: '', name: 'All' }, ...CAUSES]
  el.innerHTML = ''
  all.forEach(c => {
    const btn = document.createElement('button')
    btn.className = 'cause-pill' + (state.cause === c.slug ? ' active' : '')
    btn.textContent = c.name
    btn.addEventListener('click', () => { state.cause = c.slug; renderCausePills(); renderCurrentPage() })
    el.appendChild(btn)
  })
}

// ─── Page router ─────────────────────────────────────────────────────────────
const pageConfig = {
  home:     { title: 'Welcome to PhilanthropyConnect', sub: 'Funding intelligence for grant-seekers', showPills: false },
  opps:     { title: 'Open Opportunities', sub: `${opportunities.length} open funding opportunities across 7 cause areas`, showPills: true },
  signals:  { title: 'Donor Signals', sub: 'Open RFPs, pledges, and active giving windows', showPills: true },
  matches:  { title: 'Matches', sub: `${matchesRaw.filter(m => m.isNew).length} new donor↔opportunity matches with evidence`, showPills: true },
  outreach: { title: 'Draft Outreach', sub: 'Generate a tailored letter for any pairing', showPills: false },
  requests: { title: 'Submit a Request', sub: 'Request a custom match report or introduction', showPills: false }
}

function showPage(page) {
  currentPage = page
  searchQuery = ''
  document.getElementById('global-search').value = ''
  document.getElementById('search-clear').style.display = 'none'
  const cfg = pageConfig[page]
  document.getElementById('page-title').textContent = cfg.title
  document.getElementById('page-sub').textContent = cfg.sub
  document.getElementById('cause-filter-pills').style.display = cfg.showPills ? 'flex' : 'none'
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('nav-' + page)?.classList.add('active')
  renderCausePills()
  renderCurrentPage()
}

function renderCurrentPage() {
  const el = document.getElementById('content-area')
  el.innerHTML = ''
  if (searchQuery) { renderSearchResults(); return }
  switch (currentPage) {
    case 'home':     showHero(); break
    case 'opps':     renderOpps(el); break
    case 'signals':  renderSignals(el); break
    case 'matches':  renderMatches(el); break
    case 'outreach': renderOutreach(el); break
    case 'requests': renderRequests(el); break
  }
}

// Wire nav buttons
;['opps','signals','matches','outreach','requests'].forEach(p => {
  document.getElementById('nav-' + p)?.addEventListener('click', () => showPage(p))
})
document.getElementById('nav-home')?.addEventListener('click', showHero)

// ─── Hero ─────────────────────────────────────────────────────────────────────
function showHero() {
  currentPage = 'home'
  document.getElementById('page-title').textContent = pageConfig.home.title
  document.getElementById('page-sub').textContent = pageConfig.home.sub
  document.getElementById('cause-filter-pills').style.display = 'none'
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('nav-home')?.classList.add('active')
  const el = document.getElementById('content-area')
  el.innerHTML = ''

  const hero = document.createElement('div')
  hero.style.cssText = 'max-width:680px;margin:0 auto;padding:20px 0 40px'
  hero.innerHTML = `
    <div style="background:#fff;border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);margin-bottom:28px">
      <div style="padding:32px 40px 36px">
        <h1 style="font-family:var(--serif);font-size:28px;color:var(--ink);line-height:1.25;margin-bottom:12px">
          Philanthropy intelligence,<br>built for grant-seekers.
        </h1>
        <p style="font-size:14px;color:var(--muted);line-height:1.7;max-width:480px;margin-bottom:24px">
          Browse ${opportunities.length} open funding opportunities, track ${signals.filter(s => s.window === 'open').length} live donor signals, and surface new matches — then generate a tailored outreach letter in seconds.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="hero-opps" style="font-size:14px;padding:10px 22px">🎯 Browse opportunities</button>
          <button class="btn" id="hero-signals" style="font-size:14px;padding:10px 22px">⚡ View donor signals</button>
          <button class="btn" id="hero-matches" style="font-size:14px;padding:10px 22px">🔗 See matches</button>
        </div>
      </div>
    </div>
    <div class="stats-strip">
      <div class="stat-card"><div class="stat-num green">${opportunities.length}</div><div class="stat-label">Open opportunities</div></div>
      <div class="stat-card"><div class="stat-num amber">${signals.filter(s => s.window === 'open').length}</div><div class="stat-label">Apply-now signals</div></div>
      <div class="stat-card"><div class="stat-num green">${matchesRaw.filter(m => m.isNew).length}</div><div class="stat-label">New matches</div></div>
      <div class="stat-card"><div class="stat-num">$1.7B+</div><div class="stat-label">Tracked giving</div></div>
    </div>`
  el.appendChild(hero)
  document.getElementById('hero-opps').addEventListener('click', () => showPage('opps'))
  document.getElementById('hero-signals').addEventListener('click', () => showPage('signals'))
  document.getElementById('hero-matches').addEventListener('click', () => showPage('matches'))
}

// ─── Opportunities ────────────────────────────────────────────────────────────
function renderOpps(el) {
  const items = opportunities.filter(o => !state.cause || o.cause === state.cause)
  const statsDiv = document.createElement('div')
  statsDiv.className = 'stats-strip'
  statsDiv.innerHTML = `
    <div class="stat-card"><div class="stat-num green">${items.length}</div><div class="stat-label">Showing</div></div>
    <div class="stat-card"><div class="stat-num">${fmtAmt(items.reduce((s,o) => s+(o.amount||0),0))}</div><div class="stat-label">Total funding</div></div>
    <div class="stat-card"><div class="stat-num amber">${items.filter(o=>o.type==='capital_campaign').length}</div><div class="stat-label">Capital campaigns</div></div>
    <div class="stat-card"><div class="stat-num">${[...new Set(items.map(o=>o.cause))].length}</div><div class="stat-label">Cause areas</div></div>`
  el.appendChild(statsDiv)
  const list = document.createElement('div')
  list.className = 'card-list'
  if (!items.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div>No opportunities match this filter.</div>' }
  items.forEach(o => {
    const card = document.createElement('div')
    card.className = 'opp-card'
    card.innerHTML = `
      <div class="card-header">
        <div><div class="card-title">${esc(o.title)}</div><div class="card-org">${esc(o.org)}</div></div>
        ${o.amount ? `<div class="amount-badge ml-auto">${fmtAmt(o.amount)}</div>` : ''}
      </div>
      <div class="card-desc">${esc(o.desc)}</div>
      <div class="card-footer">
        <span class="pill pill-cause">${esc(causeName(o.cause))}</span>
        <span class="pill pill-type">${esc(o.type.replace(/_/g,' '))}</span>
        <span style="font-size:11px;color:var(--muted)">📍 ${esc(o.location)}</span>
        <a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" class="link-btn ml-auto">Apply / RFP ↗</a>
        <button class="btn btn-sm btn-primary draft-btn" data-opp="${esc(o.title)}">Draft outreach</button>
      </div>`
    list.appendChild(card)
  })
  el.appendChild(list)
  el.querySelectorAll('.draft-btn').forEach(btn => {
    btn.addEventListener('click', () => prefillOutreach(btn.dataset.opp))
  })
}

// ─── Signals ──────────────────────────────────────────────────────────────────
function renderSignals(el) {
  const filterRow = document.createElement('div')
  filterRow.className = 'filter-bar'
  filterRow.style.marginBottom = '16px'
  const windowSel = document.createElement('select')
  windowSel.className = 'filter-select'
  ;[['open','⚡ Open (apply now)'],['announced','📢 Announced'],['all','All windows']].forEach(([v,l]) => {
    const opt = document.createElement('option')
    opt.value = v; opt.textContent = l; opt.selected = state.signalWindow === v
    windowSel.appendChild(opt)
  })
  windowSel.addEventListener('change', () => { state.signalWindow = windowSel.value; renderCurrentPage() })
  filterRow.appendChild(windowSel)
  el.appendChild(filterRow)

  const items = signals.filter(s =>
    (!state.cause || s.cause === state.cause) &&
    (state.signalWindow === 'all' || s.window === state.signalWindow)
  )
  const statsDiv = document.createElement('div')
  statsDiv.className = 'stats-strip'
  statsDiv.innerHTML = `
    <div class="stat-card"><div class="stat-num green">${signals.filter(s=>s.window==='open').length}</div><div class="stat-label">Apply-now windows</div></div>
    <div class="stat-card"><div class="stat-num">${items.length}</div><div class="stat-label">Showing</div></div>
    <div class="stat-card"><div class="stat-num amber">${items.filter(s=>s.strength==='high').length}</div><div class="stat-label">High strength</div></div>
    <div class="stat-card"><div class="stat-num">${[...new Set(items.map(s=>s.donor))].length}</div><div class="stat-label">Unique donors</div></div>`
  el.appendChild(statsDiv)

  const list = document.createElement('div')
  list.className = 'card-list'
  items.forEach(s => {
    const card = document.createElement('div')
    card.className = 'opp-card sig-card' + (s.window === 'announced' ? ' announced' : '')
    const winPill = s.window === 'open'
      ? '<span class="pill pill-open">⚡ Apply now</span>'
      : '<span class="pill pill-ann">📢 Announced</span>'
    card.innerHTML = `
      <div class="card-header">
        <div style="flex:1"><div class="card-title">${esc(s.title)}</div><div class="card-org">${esc(s.donor)}</div></div>
        ${winPill}
      </div>
      <div class="card-desc">${esc(s.desc)}</div>
      <div class="card-footer">
        <span class="pill pill-cause">${esc(causeName(s.cause))}</span>
        <span class="pill pill-type">${esc(s.type.replace(/_/g,' '))}</span>
        <span style="font-size:11px;color:var(--muted);font-family:var(--mono)">${esc(s.date)}</span>
        <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="link-btn ml-auto">Evidence ↗</a>
        <button class="btn btn-sm btn-primary donor-btn" data-donor="${esc(s.donor)}">Draft outreach</button>
      </div>`
    list.appendChild(card)
  })
  el.appendChild(list)
  el.querySelectorAll('.donor-btn').forEach(btn => {
    btn.addEventListener('click', () => prefillOutreachDonor(btn.dataset.donor))
  })
}

// ─── Matches ──────────────────────────────────────────────────────────────────
function renderMatches(el) {
  const filterRow = document.createElement('div')
  filterRow.className = 'filter-bar'
  filterRow.style.marginBottom = '16px'
  const matchSel = document.createElement('select')
  matchSel.className = 'filter-select'
  ;[['new','✨ New matches only'],['all','All matches']].forEach(([v,l]) => {
    const opt = document.createElement('option'); opt.value = v; opt.textContent = l; opt.selected = state.matchFilter === v; matchSel.appendChild(opt)
  })
  matchSel.addEventListener('change', () => { state.matchFilter = matchSel.value; renderCurrentPage() })
  filterRow.appendChild(matchSel)
  el.appendChild(filterRow)

  const items = matchesRaw.filter(m => (!state.cause || m.cause === state.cause) && (state.matchFilter === 'all' || m.isNew))
  const statsDiv = document.createElement('div')
  statsDiv.className = 'stats-strip'
  statsDiv.innerHTML = `
    <div class="stat-card"><div class="stat-num green">${matchesRaw.filter(m=>m.isNew).length}</div><div class="stat-label">New matches</div></div>
    <div class="stat-card"><div class="stat-num">${matchesRaw.length}</div><div class="stat-label">Total matches</div></div>
    <div class="stat-card"><div class="stat-num">${items.length}</div><div class="stat-label">Showing</div></div>
    <div class="stat-card"><div class="stat-num amber">${items.filter(m=>m.score>=0.9).length}</div><div class="stat-label">Score ≥ 0.9</div></div>`
  el.appendChild(statsDiv)

  const list = document.createElement('div')
  list.className = 'card-list'
  items.forEach(m => {
    const card = document.createElement('div')
    card.className = 'match-card ' + (m.isNew ? 'new-match' : 'hist-match')
    card.innerHTML = `
      <div class="match-flow">
        <span>${esc(m.donor)}</span><span class="match-arrow">→</span><span>${esc(m.opp)}</span>
        ${m.isNew ? '<span class="pill pill-open" style="margin-left:auto">✨ New match</span>' : '<span class="pill pill-hist" style="margin-left:auto">Historical</span>'}
      </div>
      <div class="match-rationale">${esc(m.rationale)}</div>
      <div class="card-footer">
        <span class="pill pill-cause">${esc(causeName(m.cause))}</span>
        ${m.amount ? `<span class="amount-badge">${fmtAmt(m.amount)}</span>` : ''}
        <button class="btn btn-sm btn-primary ml-auto match-draft-btn" data-donor="${esc(m.donor)}" data-opp="${esc(m.opp)}">Draft outreach ↗</button>
      </div>`
    list.appendChild(card)
  })
  el.appendChild(list)
  el.querySelectorAll('.match-draft-btn').forEach(btn => {
    btn.addEventListener('click', () => prefillOutreachMatch(btn.dataset.donor, btn.dataset.opp))
  })
}

// ─── Outreach ─────────────────────────────────────────────────────────────────
function renderOutreach(el) {
  el.innerHTML = `
    <div>
      <div class="outreach-grid">
        <div>
          <div class="field-label">Opportunity</div>
          <select class="field-select" id="out-opp">
            <option value="">— Select opportunity —</option>
            ${opportunities.map(o => `<option value="${esc(o.title)}" ${state.selectedOpp===o.title?'selected':''}>${esc(o.title.slice(0,60))}${o.title.length>60?'…':''}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="field-label">Donor / Funder</div>
          <select class="field-select" id="out-donor">
            <option value="">— Select donor —</option>
            ${[...new Set(signals.map(s=>s.donor))].sort().map(d=>`<option value="${esc(d)}" ${state.selectedDonor===d?'selected':''}>${esc(d)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div class="field-label">Tone</div>
        <div class="tone-row" id="tone-row">
          ${['Formal','Warm & specific','Bold & compelling','Concise'].map(t=>`<button class="tone-btn ${state.tone===t?'active':''}" data-tone="${t}">${t}</button>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:14px">
        <div class="field-label">Additional context <span style="text-transform:none;font-weight:400;color:var(--muted)">(optional)</span></div>
        <textarea class="field-textarea" id="out-context" rows="2" maxlength="400" placeholder="e.g. We have a board meeting August 5 and need lead donors committed before then…"></textarea>
        <div class="char-count">0/400</div>
      </div>
      <button class="btn btn-primary" id="gen-btn">✦ Generate letter</button>
      <div id="letter-area"></div>
    </div>`
  document.getElementById('out-context').addEventListener('input', function() {
    this.nextElementSibling.textContent = this.value.length + '/400'
  })
  document.getElementById('tone-row').querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tone = btn.dataset.tone
      document.querySelectorAll('.tone-btn').forEach(b => b.classList.toggle('active', b.dataset.tone === state.tone))
    })
  })
  document.getElementById('gen-btn').addEventListener('click', generateLetter)
}

function prefillOutreach(oppTitle) { state.selectedOpp = oppTitle; showPage('outreach') }
function prefillOutreachDonor(donor) { state.selectedDonor = donor; showPage('outreach') }
function prefillOutreachMatch(donor, opp) { state.selectedDonor = donor; state.selectedOpp = opp; showPage('outreach') }

async function generateLetter() {
  const opp   = document.getElementById('out-opp')?.value
  const donor = document.getElementById('out-donor')?.value
  if (!opp || !donor) { showToast('Please select an opportunity and a donor first.'); return }
  const ctx     = sanitizeInput(document.getElementById('out-context')?.value || '', 400)
  const oppObj  = opportunities.find(o => o.title === opp)
  const sigObj  = signals.find(s => s.donor === donor)
  const matchObj = matchesRaw.find(m => m.donor === donor && m.opp === opp)

  const prompt = [
    `You are a philanthropy outreach specialist. Write a ${state.tone.toLowerCase()} outreach letter.`,
    `Donor: ${donor}`,
    sigObj  ? `Donor signal: ${sigObj.title} — ${sigObj.desc}` : '',
    matchObj ? `Match rationale: ${matchObj.rationale}` : '',
    `Opportunity: ${opp}`,
    oppObj   ? `Organization: ${oppObj.org}. Description: ${oppObj.desc}. Amount: ${oppObj.amount ? fmtAmt(oppObj.amount) : 'unspecified'}. Location: ${oppObj.location}. URL: ${oppObj.url}` : '',
    `Cause: ${causeName(oppObj ? oppObj.cause : '')}`,
    ctx      ? `Additional context: ${ctx}` : '',
    'Rules: Address the donor by name. Reference their specific signal. Explain the match concisely. CTA under 200 words. Sign off: "The Philanthropy Connect Team". Output the letter only.'
  ].filter(Boolean).join('\n')

  const btn  = document.getElementById('gen-btn')
  const area = document.getElementById('letter-area')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Writing…'
  area.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:13px"><span class="spinner spinner-dark"></span> Generating…</div>'

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'You are a professional philanthropy outreach writer. You write tailored, specific, concise outreach letters. Output only the letter text.',
        messages: [{ role: 'user', content: prompt }]
      })
    })
    if (!res.ok) throw new Error('API error ' + res.status)
    const data = await res.json()
    currentLetter = (data.content || []).map(b => b.text || '').join('')
    area.innerHTML = `
      <div class="letter-box" id="letter-text"></div>
      <div class="letter-actions">
        <button class="btn btn-sm" id="copy-btn">⎘ Copy letter</button>
        <button class="btn btn-sm" id="regen-btn">↺ Regenerate</button>
        ${oppObj?.url ? `<a href="${esc(oppObj.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm ml-auto">Apply / RFP ↗</a>` : ''}
      </div>`
    document.getElementById('letter-text').textContent = currentLetter
    document.getElementById('copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(currentLetter).then(() => showToast('Letter copied to clipboard.'))
    })
    document.getElementById('regen-btn').addEventListener('click', generateLetter)
  } catch(e) {
    area.innerHTML = `<div style="padding:12px;color:var(--danger);font-size:13px">Failed to generate letter. Please try again.</div>`
  } finally {
    btn.disabled = false
    btn.innerHTML = '✦ Generate letter'
  }
}

// ─── Requests ─────────────────────────────────────────────────────────────────
function renderRequests(el) {
  el.innerHTML = `
    <div class="req-form">
      <h3>Submit a request</h3>
      <p>Ask our team for a custom match report, a warm introduction, or a curated shortlist for your organization.</p>
      <div class="form-row"><div class="field-label">Your organization</div><input class="field-input" id="req-org" type="text" maxlength="120" placeholder="Organization name"></div>
      <div class="form-row">
        <div class="field-label">Request type</div>
        <select class="field-select" id="req-type">
          <option value="">— Select type —</option>
          <option>Custom match report</option>
          <option>Warm introduction to a donor</option>
          <option>Curated shortlist by cause</option>
          <option>RFP deadline tracker</option>
          <option>Other</option>
        </select>
      </div>
      <div class="form-row">
        <div class="field-label">Cause area</div>
        <select class="field-select" id="req-cause">
          <option value="">— Select cause —</option>
          ${CAUSES.map(c=>`<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="field-label">Details</div>
        <textarea class="field-textarea" id="req-details" rows="4" maxlength="800" placeholder="Describe what you need…"></textarea>
        <div class="char-count">0/800</div>
      </div>
      <div class="form-row"><div class="field-label">Contact email</div><input class="field-input" id="req-email" type="email" maxlength="120" placeholder="you@organization.org"></div>
      <button class="btn btn-primary" id="submit-req-btn">Submit request</button>
      <div class="success-banner" id="req-success">✓ Request received. We'll follow up within 2 business days.</div>
    </div>`
  document.getElementById('req-details').addEventListener('input', function() {
    this.nextElementSibling.textContent = this.value.length + '/800'
  })
  document.getElementById('submit-req-btn').addEventListener('click', () => {
    const org     = sanitizeInput(document.getElementById('req-org').value, 120)
    const type    = sanitizeInput(document.getElementById('req-type').value, 80)
    const details = sanitizeInput(document.getElementById('req-details').value, 800)
    const email   = sanitizeInput(document.getElementById('req-email').value, 120)
    if (!org)                         { showToast('Please enter your organization name.'); return }
    if (!type)                        { showToast('Please select a request type.'); return }
    if (!details || details.length<10){ showToast('Please add more detail about your request.'); return }
    if (!email || !email.includes('@')){ showToast('Please enter a valid email address.'); return }
    // In production POST to your backend API
    console.info('[PhilConnect] Request:', { org, type, details, email, user: SESSION?.email })
    document.getElementById('req-success').style.display = 'block'
    showToast('Request submitted!')
  })
}

// ─── Search ───────────────────────────────────────────────────────────────────
function scoreItem(fields, query) {
  const tokens = query.split(/\s+/).filter(Boolean)
  let score = 0
  for (const token of tokens) {
    let hit = false
    for (const val of fields) {
      if (!val) continue
      const s = String(val).toLowerCase()
      if (s.includes(token)) { score += s.startsWith(token) ? 2 : 1; hit = true }
    }
    if (!hit) return 0
  }
  return score
}

function highlight(text, query) {
  if (!query || !text) return esc(text)
  const tokens = query.split(/\s+/).filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp('(' + tokens.join('|') + ')', 'gi')
  return esc(text).replace(re, '<mark>$1</mark>')
}

function handleSearch(raw) {
  const q = sanitizeInput(raw, 120)
  document.getElementById('search-clear').style.display = q ? 'block' : 'none'
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    searchQuery = q.toLowerCase().trim()
    if (!searchQuery) {
      showPage(currentPage)
    } else {
      document.getElementById('page-title').textContent = 'Search results'
      document.getElementById('cause-filter-pills').style.display = 'none'
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
      renderSearchResults()
    }
  }, 220)
}

function renderSearchResults() {
  const el = document.getElementById('content-area')
  el.innerHTML = ''
  const q = searchQuery
  const oppHits = opportunities.map(o => ({ item: o, score: scoreItem([o.title,o.org,o.desc,o.location,causeName(o.cause)],q) })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
  const sigHits = signals.map(s => ({ item: s, score: scoreItem([s.title,s.donor,s.desc,causeName(s.cause),s.type,s.window],q) })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
  const matchHits = matchesRaw.map(m => ({ item: m, score: scoreItem([m.donor,m.opp,m.rationale,causeName(m.cause)],q) })).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
  const total = oppHits.length + sigHits.length + matchHits.length
  document.getElementById('page-sub').textContent = total === 0 ? `No results for "${q}"` : `${total} result${total===1?'':'s'} for "${q}"`
  const wrap = document.createElement('div')
  if (!total) { wrap.innerHTML = `<div class="empty" style="padding-top:60px"><div class="empty-icon">🔍</div><div>No results for <strong>"${esc(q)}"</strong></div></div>`; el.appendChild(wrap); return }

  if (oppHits.length) {
    const h = document.createElement('div'); h.className='search-section-head'; h.textContent=`Opportunities (${oppHits.length})`; wrap.appendChild(h)
    const list = document.createElement('div'); list.className='card-list'
    oppHits.forEach(({item:o}) => {
      const card = document.createElement('div'); card.className='opp-card'
      card.innerHTML=`<div class="card-header"><div><div class="card-title">${highlight(o.title,q)}</div><div class="card-org">${highlight(o.org,q)}</div></div>${o.amount?`<div class="amount-badge ml-auto">${fmtAmt(o.amount)}</div>`:''}</div><div class="card-desc">${highlight(o.desc,q)}</div><div class="card-footer"><span class="pill pill-cause">${esc(causeName(o.cause))}</span><span class="pill pill-type">${esc(o.type.replace(/_/g,' '))}</span><a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer" class="link-btn ml-auto">Apply ↗</a><button class="btn btn-sm btn-primary draft-btn" data-opp="${esc(o.title)}">Draft outreach</button></div>`
      list.appendChild(card)
    })
    list.querySelectorAll('.draft-btn').forEach(btn => btn.addEventListener('click', () => prefillOutreach(btn.dataset.opp)))
    wrap.appendChild(list)
  }
  if (sigHits.length) {
    const h = document.createElement('div'); h.className='search-section-head'; h.textContent=`Donor Signals (${sigHits.length})`; wrap.appendChild(h)
    const list = document.createElement('div'); list.className='card-list'
    sigHits.forEach(({item:s}) => {
      const card = document.createElement('div'); card.className='opp-card sig-card'+(s.window==='announced'?' announced':'')
      card.innerHTML=`<div class="card-header"><div style="flex:1"><div class="card-title">${highlight(s.title,q)}</div><div class="card-org">${highlight(s.donor,q)}</div></div>${s.window==='open'?'<span class="pill pill-open">⚡ Apply now</span>':'<span class="pill pill-ann">📢 Announced</span>'}</div><div class="card-desc">${highlight(s.desc,q)}</div><div class="card-footer"><span class="pill pill-cause">${esc(causeName(s.cause))}</span><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="link-btn ml-auto">Evidence ↗</a><button class="btn btn-sm btn-primary donor-btn" data-donor="${esc(s.donor)}">Draft outreach</button></div>`
      list.appendChild(card)
    })
    list.querySelectorAll('.donor-btn').forEach(btn => btn.addEventListener('click', () => prefillOutreachDonor(btn.dataset.donor)))
    wrap.appendChild(list)
  }
  if (matchHits.length) {
    const h = document.createElement('div'); h.className='search-section-head'; h.textContent=`Matches (${matchHits.length})`; wrap.appendChild(h)
    const list = document.createElement('div'); list.className='card-list'
    matchHits.forEach(({item:m}) => {
      const card = document.createElement('div'); card.className='match-card '+(m.isNew?'new-match':'hist-match')
      card.innerHTML=`<div class="match-flow"><span>${highlight(m.donor,q)}</span><span class="match-arrow">→</span><span>${highlight(m.opp,q)}</span>${m.isNew?'<span class="pill pill-open" style="margin-left:auto">✨ New</span>':''}</div><div class="match-rationale">${highlight(m.rationale,q)}</div><div class="card-footer"><span class="pill pill-cause">${esc(causeName(m.cause))}</span>${m.amount?`<span class="amount-badge">${fmtAmt(m.amount)}</span>`:''}<button class="btn btn-sm btn-primary ml-auto match-draft-btn" data-donor="${esc(m.donor)}" data-opp="${esc(m.opp)}">Draft ↗</button></div>`
      list.appendChild(card)
    })
    list.querySelectorAll('.match-draft-btn').forEach(btn => btn.addEventListener('click', () => prefillOutreachMatch(btn.dataset.donor, btn.dataset.opp)))
    wrap.appendChild(list)
  }
  el.appendChild(wrap)
}

// Wire search input
document.getElementById('global-search').addEventListener('input', e => handleSearch(e.target.value))
document.getElementById('global-search').addEventListener('keydown', e => { if (e.key==='Escape') clearSearch() })
document.getElementById('search-clear').addEventListener('click', clearSearch)

function clearSearch() {
  document.getElementById('global-search').value = ''
  document.getElementById('search-clear').style.display = 'none'
  searchQuery = ''
  showPage(currentPage)
  document.getElementById('global-search').focus()
}
