(() => {
  'use strict';

  const TEAM_ALIASES = {
    'United States': 'USA', 'USMNT': 'USA', 'South Korea': 'Korea Republic',
    'Iran': 'IR Iran', 'IR Iran': 'IR Iran', 'Cape Verde': 'Cabo Verde',
    'Czech Republic': 'Czechia', 'Cote d\'Ivoire': "Côte d'Ivoire", 'Côte d’Ivoire': "Côte d'Ivoire",
    'Ivory Coast': "Côte d'Ivoire", 'Curacao': 'Curaçao', 'Turkiye': 'Türkiye', 'Turkey': 'Türkiye',
    'Democratic Republic of Congo': 'Congo DR', 'DR Congo': 'Congo DR', 'DRC': 'Congo DR'
  };
  const TEAM_FLAG_CODES = {
    'Mexico':'mx','South Africa':'za','Korea Republic':'kr','Czechia':'cz','Canada':'ca','Bosnia and Herzegovina':'ba','Qatar':'qa','Switzerland':'ch','Brazil':'br','Morocco':'ma','Haiti':'ht','Scotland':'gb-sct','USA':'us','Paraguay':'py','Australia':'au','Türkiye':'tr','Germany':'de','Curaçao':'cw',"Côte d'Ivoire":'ci','Ecuador':'ec','Netherlands':'nl','Japan':'jp','Sweden':'se','Tunisia':'tn','Belgium':'be','Egypt':'eg','IR Iran':'ir','New Zealand':'nz','Spain':'es','Cabo Verde':'cv','Saudi Arabia':'sa','Uruguay':'uy','France':'fr','Senegal':'sn','Iraq':'iq','Norway':'no','Argentina':'ar','Algeria':'dz','Austria':'at','Jordan':'jo','Portugal':'pt','Congo DR':'cd','Uzbekistan':'uz','Colombia':'co','England':'gb-eng','Croatia':'hr','Ghana':'gh','Panama':'pa'
  };
  const GROUPS = 'ABCDEFGHIJKL'.split('');
  const STAGES = ['Group Stage','Round of 32','Round of 16','Quarter-finals','Semi-finals','Third Place','Final'];
  const BRACKET_STAGES = ['Round of 32','Round of 16','Quarter-finals','Semi-finals','Final'];
  const QUICK_FILTERS = [
    ['all','All'], ['today','Today'], ['tomorrow','Tomorrow'], ['next','Next matchday'],
    ['upcoming','Upcoming only'], ['completed','Completed']
  ];
  const VENUE_ZONES = [
    [/Vancouver/i, 'America/Vancouver'], [/Seattle|Los Angeles|San Francisco|Santa Clara|Bay Area/i, 'America/Los_Angeles'],
    [/Mexico City|Guadalajara/i, 'America/Mexico_City'], [/Monterrey/i, 'America/Monterrey'],
    [/Toronto/i, 'America/Toronto'], [/Dallas|Arlington|Houston|Kansas City/i, 'America/Chicago'],
    [/New York|New Jersey|East Rutherford|Philadelphia|Boston|Foxborough|Miami|Atlanta/i, 'America/New_York']
  ];
  const STATIC_CUTOFF_PT = '2026-07-20T12:00:00-07:00';
  const LIVE_START_MINUTES_BEFORE = 15;
  const LIVE_AFTER_GROUP_MINUTES = 390; // long enough to catch delayed final scores after evening matches
  const LIVE_AFTER_KNOCKOUT_MINUTES = 510;
  const SNAPSHOT_CHECK_MS = 30 * 1000;
  const LIVE_REFRESH_MS = 60 * 1000;

  let WC_DATA = null;
  let EMBEDDED_DATA = null;
  let liveTimer = null;
  let clockTimer = null;
  let lastSnapshotKey = '';
  let lastDataSignature = '';

  const state = {
    quickFilter: localStorage.getItem('wc2026-quick-filter') || 'next',
    stageFilter: 'all',
    groupFilter: 'all',
    dateFilter: 'all',
    search: '',
    activeRound: localStorage.getItem('wc2026-active-round') || 'all',
    timeMode: localStorage.getItem('wc2026-time-mode') || 'pdt',
    hideScores: localStorage.getItem('wc2026-hide-scores') === '1',
    selectedTeam: localStorage.getItem('wc2026-selected-team') || '',
    selectedVenue: 'all'
  };

  function $(id) { return document.getElementById(id); }
  function canonical(name) { return TEAM_ALIASES[String(name || '').trim()] || String(name || '').trim(); }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function parseDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
  function toInt(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function dataSignature(data = WC_DATA) {
    if (!data || !Array.isArray(data.matches)) return '';
    return JSON.stringify({
      snapshotDate: data.snapshotDate,
      lastUpdateIso: data.lastUpdateIso,
      matches: data.matches.map(m => [m.number, m.home, m.away, m.status, m.homeScore, m.awayScore, m.homePenalties, m.awayPenalties])
    });
  }

  function parseEmbeddedData() {
    const node = $('embedded-data');
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch { return null; }
  }
  function normalizeData(candidate) {
    const base = EMBEDDED_DATA || {};
    const incoming = candidate || {};
    const merged = { ...base, ...incoming };
    const teams = {};
    Object.entries(base.teams || {}).forEach(([name, info]) => { teams[name] = { ...info }; });
    Object.entries(incoming.teams || {}).forEach(([name, info]) => { teams[name] = { ...(teams[name] || {}), ...info }; });
    Object.entries(teams).forEach(([name, info]) => {
      if (!info.flagCode && TEAM_FLAG_CODES[name]) info.flagCode = TEAM_FLAG_CODES[name];
      if (!info.display) info.display = name;
    });
    merged.teams = teams;
    merged.matches = (merged.matches || []).slice().sort((a,b) => Number(a.number || 0) - Number(b.number || 0));
    merged.staticAfter = merged.staticAfter || STATIC_CUTOFF_PT;
    merged.validation = validateData(merged);
    return merged;
  }
  function setData(data, source = 'data') {
    WC_DATA = normalizeData(data);
    document.body.classList.toggle('spoilers-hidden', state.hideScores);
    const signature = dataSignature(WC_DATA);
    const changed = signature && signature !== lastDataSignature;
    lastDataSignature = signature;
    renderAll(source);
    return changed;
  }

  function pacificParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  }
  function todayKeyPT(date = new Date()) {
    const p = pacificParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function addDateKey(dateKey, days) {
    const d = new Date(`${dateKey}T12:00:00-07:00`);
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA', { timeZone:'America/Los_Angeles' });
  }
  function snapshotBaseDate(now = new Date()) {
    const p = pacificParts(now);
    let key = `${p.year}-${p.month}-${p.day}`;
    if (Number(p.hour) > 22 || (Number(p.hour) === 22 && Number(p.minute) >= 30)) key = addDateKey(key, 1);
    return key;
  }
  function firstMatchDateOnOrAfter(dateKey, matches = WC_DATA?.matches || []) {
    const dates = [...new Set(matches.map(m => m.pdt?.date).filter(Boolean))].sort();
    return dates.find(d => d >= dateKey) || dates.at(-1) || null;
  }
  function snapshotTargetDate(now = new Date(), matches = WC_DATA?.matches || []) {
    // Important: compute from the browser's PDT clock first. Do not let an old JSON snapshotDate freeze the page.
    return firstMatchDateOnOrAfter(snapshotBaseDate(now), matches) || WC_DATA?.snapshotDate || null;
  }
  function fullDateLabel(dateKey) {
    if (!dateKey) return '—';
    return new Date(`${dateKey}T12:00:00-07:00`).toLocaleDateString('en-US', {
      timeZone:'America/Los_Angeles', weekday:'long', month:'long', day:'numeric', year:'numeric'
    });
  }
  function shortDateLabel(dateKey) {
    if (!dateKey) return '—';
    return new Date(`${dateKey}T12:00:00-07:00`).toLocaleDateString('en-US', {
      timeZone:'America/Los_Angeles', weekday:'short', month:'short', day:'numeric'
    });
  }
  function staticAfterDate() { return parseDate(WC_DATA?.staticAfter || STATIC_CUTOFF_PT); }
  function isStaticNow(now = new Date()) {
    const cutoff = staticAfterDate();
    return Boolean(cutoff && now >= cutoff);
  }
  function minutesWindow(match) { return match.stage === 'Group Stage' ? LIVE_AFTER_GROUP_MINUTES : LIVE_AFTER_KNOCKOUT_MINUTES; }
  function isInMatchWindow(match, now = new Date()) {
    const start = parseDate(match.pdt?.iso);
    if (!start) return false;
    return now >= new Date(start.getTime() - LIVE_START_MINUTES_BEFORE * 60000) && now <= new Date(start.getTime() + minutesWindow(match) * 60000);
  }
  function activeMatchWindows(now = new Date()) {
    if (!WC_DATA?.matches || isStaticNow(now)) return [];
    return WC_DATA.matches.filter(m => isInMatchWindow(m, now));
  }
  function shouldBrowserPoll(now = new Date()) {
    if (isStaticNow(now)) return false;
    if (activeMatchWindows(now).length) return true;
    const p = pacificParts(now);
    const hour = Number(p.hour), minute = Number(p.minute);
    // Keep watching around the nightly snapshot rollover even if GitHub Actions is late.
    return hour === 22 && minute >= 25 || hour === 23 && minute <= 15;
  }

  function teamInfo(name) {
    const key = canonical(name);
    const info = WC_DATA?.teams?.[key];
    if (!info) return { display: name || 'TBD', flag: '◇' };
    return { ...info, display: info.display || key };
  }
  function isCountry(name) { return Boolean(WC_DATA?.teams?.[canonical(name)]); }
  function displayTeamName(name) { return teamInfo(name).display || name || 'TBD'; }
  function flagMarkup(name) {
    const key = canonical(name);
    const info = teamInfo(key);
    if (!isCountry(key)) return '<span class="flag placeholder" aria-hidden="true">◇</span>';
    const code = info.flagCode || TEAM_FLAG_CODES[key];
    const emoji = escapeHtml(info.flag || '◇');
    const label = `${displayTeamName(key)} flag`;
    const img = code ? `<img src="https://flagcdn.com/w40/${escapeAttr(code)}.png" alt="${escapeAttr(label)}" loading="lazy" onerror="this.style.display='none'">` : '';
    return `<span class="flag" title="${escapeAttr(label)}">${img}<span class="flag-emoji">${emoji}</span></span>`;
  }
  function teamButton(name) {
    const label = displayTeamName(name);
    if (!isCountry(name)) return `<span class="team-name placeholder-team">${flagMarkup(name)}<span>${escapeHtml(label)}</span></span>`;
    return `<button class="team-name team-click" data-team="${escapeAttr(canonical(name))}" type="button">${flagMarkup(name)}<span>${escapeHtml(label)}</span></button>`;
  }
  function hasScore(match) { return match.homeScore != null && match.awayScore != null; }
  function statusClass(match) { return match.status === 'final' ? 'final' : (match.status === 'live' ? 'live' : 'scheduled'); }
  function statusLabel(match) { return match.status === 'final' ? 'Final' : (match.status === 'live' ? 'Live' : 'Scheduled'); }
  function scoreValue(match, side) {
    const score = side === 'home' ? match.homeScore : match.awayScore;
    if (score == null) return '—';
    if (state.hideScores && (match.status === 'final' || match.status === 'live')) return '••';
    const pen = side === 'home' ? match.homePenalties : match.awayPenalties;
    return pen != null ? `${score} (${pen})` : String(score);
  }
  function pointsFor(match, side) {
    if (match.stage !== 'Group Stage' || match.status !== 'final' || !hasScore(match)) return '';
    if (match.homeScore === match.awayScore) return '+1 pt';
    const homeWin = Number(match.homeScore) > Number(match.awayScore);
    return (side === 'home' && homeWin) || (side === 'away' && !homeWin) ? '+3 pts' : '+0 pts';
  }
  function winnerSide(match) {
    if (match.status !== 'final' || !hasScore(match)) return null;
    if (Number(match.homeScore) > Number(match.awayScore)) return 'home';
    if (Number(match.awayScore) > Number(match.homeScore)) return 'away';
    if (match.homePenalties != null && match.awayPenalties != null) {
      if (Number(match.homePenalties) > Number(match.awayPenalties)) return 'home';
      if (Number(match.awayPenalties) > Number(match.homePenalties)) return 'away';
    }
    return null;
  }
  function winnerName(match) { const side = winnerSide(match); return side === 'home' ? match.home : side === 'away' ? match.away : null; }
  function loserName(match) { const side = winnerSide(match); return side === 'home' ? match.away : side === 'away' ? match.home : null; }

  function venueTimeZone(venue) {
    const found = VENUE_ZONES.find(([regex]) => regex.test(String(venue || '')));
    return found ? found[1] : 'America/Los_Angeles';
  }
  function formatDateTime(date, timeZone, withDate = true) {
    const options = withDate
      ? { timeZone, weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }
      : { timeZone, hour:'numeric', minute:'2-digit', timeZoneName:'short' };
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
  function formatKickoff(match, compact = false) {
    const date = parseDate(match.pdt?.iso);
    if (!date) return `${match.pdt?.dateLabel || ''} · ${match.pdt?.time || ''}`;
    if (state.timeMode === 'venue') return formatDateTime(date, venueTimeZone(match.venue), !compact);
    if (state.timeMode === 'local') return formatDateTime(date, Intl.DateTimeFormat().resolvedOptions().timeZone, !compact);
    return compact ? `${match.pdt.time}` : `${match.pdt.dateLabel} · ${match.pdt.time}`;
  }
  function sortByKickoff(a,b) { return new Date(a.pdt?.iso || 0) - new Date(b.pdt?.iso || 0) || Number(a.number) - Number(b.number); }

  function groupIsComplete(group, matches = WC_DATA.matches) {
    const groupMatches = matches.filter(m => m.stage === 'Group Stage' && m.group === group);
    return groupMatches.length === 6 && groupMatches.every(m => m.status === 'final' && hasScore(m));
  }
  function computeStandings(matches = WC_DATA.matches) {
    const table = {};
    GROUPS.forEach(g => table[g] = []);
    Object.entries(WC_DATA.teams || {}).forEach(([name, info]) => {
      if (!info.group || !table[info.group]) return;
      table[info.group].push({ name, display: info.display || name, group: info.group, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0, rank:0, complete:false });
    });
    const lookup = {};
    Object.values(table).flat().forEach(t => lookup[t.name] = t);
    matches.filter(m => m.stage === 'Group Stage' && m.status === 'final' && hasScore(m)).forEach(m => {
      const h = lookup[canonical(m.home)], a = lookup[canonical(m.away)];
      if (!h || !a) return;
      const hs = Number(m.homeScore), as = Number(m.awayScore);
      h.P++; a.P++; h.GF += hs; h.GA += as; a.GF += as; a.GA += hs;
      if (hs > as) { h.W++; a.L++; h.Pts += 3; }
      else if (as > hs) { a.W++; h.L++; a.Pts += 3; }
      else { h.D++; a.D++; h.Pts++; a.Pts++; }
    });
    GROUPS.forEach(g => {
      table[g].forEach(t => { t.GD = t.GF - t.GA; });
      table[g].sort((a,b) => b.Pts-a.Pts || b.GD-a.GD || b.GF-a.GF || a.display.localeCompare(b.display));
      const complete = groupIsComplete(g, matches);
      table[g].forEach((t, idx) => { t.rank = idx + 1; t.complete = complete; });
    });
    return table;
  }
  function computeThirdPlaces(standings = computeStandings()) {
    const rows = GROUPS.map(g => standings[g]?.[2]).filter(Boolean).map(t => ({ ...t }));
    rows.sort((a,b) => b.Pts-a.Pts || b.GD-a.GD || b.GF-a.GF || a.display.localeCompare(b.display));
    rows.forEach((t, idx) => {
      t.thirdRank = idx + 1;
      const projected = !t.complete;
      t.status = idx < 8 ? `${projected ? 'Projected ' : ''}Advancing` : `${projected ? 'Projected ' : ''}Outside`;
      t.statusClass = idx < 8 ? (projected ? 'projected' : 'advancing') : (projected ? 'projected' : 'outside');
    });
    return rows;
  }
  function standingsStatus(team, thirdRows) {
    if (!team.complete) {
      if (team.rank <= 2) return ['projected', 'Projected top 2'];
      if (team.rank === 3) return ['projected', 'Projected 3rd race'];
      return ['projected', 'In play'];
    }
    if (team.rank <= 2) return ['qualified', 'Qualified'];
    if (team.rank === 3) {
      const row = thirdRows.find(r => r.name === team.name);
      return row && row.thirdRank <= 8 ? ['advancing', 'Advancing as 3rd'] : ['outside', 'Outside'];
    }
    return ['eliminated', 'Eliminated'];
  }
  function resolvePlaceholder(label, byNumber, standings, thirdRows, usedThirdGroups) {
    const name = String(label || '');
    let m = name.match(/^Winner Group ([A-L])$/);
    if (m && groupIsComplete(m[1])) return { name: standings[m[1]][0]?.name, note: `Auto-filled from ${label}` };
    m = name.match(/^Runner-up Group ([A-L])$/);
    if (m && groupIsComplete(m[1])) return { name: standings[m[1]][1]?.name, note: `Auto-filled from ${label}` };
    m = name.match(/^3rd Group ([A-L](?:\/[A-L])*)$/);
    if (m) {
      const allowed = m[1].split('/');
      const allGroupsComplete = GROUPS.every(g => groupIsComplete(g));
      const qualified = thirdRows.filter(r => allowed.includes(r.group) && r.thirdRank <= 8 && (r.complete || allGroupsComplete) && !usedThirdGroups.has(r.group));
      if (qualified.length) {
        usedThirdGroups.add(qualified[0].group);
        return { name: qualified[0].name, note: `Auto-filled from ${label}` };
      }
      return null;
    }
    m = name.match(/^Winner Match (\d+)$/);
    if (m) { const prior = byNumber.get(Number(m[1])); const winner = prior ? winnerName(prior) : null; return winner ? { name: winner, note: `Auto-filled from ${label}` } : null; }
    m = name.match(/^Loser Match (\d+)$/);
    if (m) { const prior = byNumber.get(Number(m[1])); const loser = prior ? loserName(prior) : null; return loser ? { name: loser, note: `Auto-filled from ${label}` } : null; }
    return null;
  }
  function decoratedMatches() {
    if (!WC_DATA) return [];
    const matches = WC_DATA.matches.map(m => ({ ...m, pdt: { ...(m.pdt || {}) }, originalHome: m.home, originalAway: m.away, autoBadges: [] }));
    const standings = computeStandings(WC_DATA.matches);
    const thirdRows = computeThirdPlaces(standings);
    const byNumber = new Map(matches.map(m => [Number(m.number), m]));
    const usedThirdGroups = new Set();
    matches.sort((a,b) => Number(a.number) - Number(b.number)).forEach(match => {
      ['home','away'].forEach(side => {
        if (isCountry(match[side])) return;
        const resolved = resolvePlaceholder(match[side], byNumber, standings, thirdRows, usedThirdGroups);
        if (resolved?.name) { match[side] = resolved.name; match.autoBadges.push(resolved.note); }
      });
    });
    return matches.sort((a,b) => Number(a.number) - Number(b.number));
  }

  function teamRow(match, side) {
    const name = side === 'home' ? match.home : match.away;
    const score = scoreValue(match, side);
    const winning = winnerSide(match) === side ? ' winner' : '';
    return `<div class="team-row${winning}">${teamButton(name)}<span class="score spoiler-score">${escapeHtml(score)}</span></div>`;
  }
  function matchBadges(match) {
    const badges = [`<span class="badge ${statusClass(match)}">${escapeHtml(statusLabel(match))}</span>`];
    if (match.status === 'final' && match.stage === 'Group Stage') {
      badges.push(`<span class="badge">${escapeHtml(displayTeamName(match.home))} ${pointsFor(match,'home')}</span>`);
      badges.push(`<span class="badge">${escapeHtml(displayTeamName(match.away))} ${pointsFor(match,'away')}</span>`);
    }
    if (match.status === 'final' && winnerName(match) && match.stage !== 'Group Stage') badges.push(`<span class="badge advancing">${escapeHtml(displayTeamName(winnerName(match)))} advances</span>`);
    (match.autoBadges || []).slice(0,2).forEach(note => badges.push(`<span class="badge auto">${escapeHtml(note)}</span>`));
    return badges.join('');
  }
  function matchCard(match, opts = {}) {
    const label = match.group ? `Group ${match.group}` : match.stage;
    return `<article class="match-card ${statusClass(match)} ${match.stage === 'Final' ? 'final-card' : ''}">
      <div class="match-head"><span>M${Number(match.number)} · ${escapeHtml(label)}</span><span>${escapeHtml(statusLabel(match))}</span></div>
      <div class="match-body">${teamRow(match,'home')}${teamRow(match,'away')}
        <div class="kickoff">${escapeHtml(formatKickoff(match, opts.compactTime))}</div>
        <div class="venue">${escapeHtml(match.venue || 'Venue TBD')}</div>
        <div class="badges">${matchBadges(match)}</div>
      </div>
    </article>`;
  }
  function miniMatchCard(match) {
    return `<article class="mini-match ${statusClass(match)}"><div class="mini-top"><span>M${Number(match.number)}</span><span>${escapeHtml(formatKickoff(match, true))}</span></div>${teamRow(match,'home')}${teamRow(match,'away')}<div class="venue">${escapeHtml(match.venue || '')}</div><div class="badges">${matchBadges(match)}</div></article>`;
  }

  function validateData(data) {
    const errors = [], warnings = [];
    const matches = data.matches || [], teams = data.teams || {};
    if (matches.length !== 104) errors.push(`Expected 104 matches, found ${matches.length}.`);
    const seen = new Set();
    for (const match of matches) {
      const n = Number(match.number);
      if (seen.has(n)) errors.push(`Duplicate match number ${n}.`);
      seen.add(n);
      const pdt = match.pdt || {};
      if (!pdt.date || !pdt.iso || !pdt.time) errors.push(`Match ${n} is missing PDT date/time fields.`);
      if (!match.venue) errors.push(`Match ${n} is missing venue.`);
      if (match.status === 'final' && !hasScore(match)) errors.push(`Match ${n} is final but missing a score.`);
      if (match.status === 'scheduled' && hasScore(match)) warnings.push(`Match ${n} is scheduled but already has a score.`);
      ['home','away'].forEach(side => {
        const name = canonical(match[side]);
        if (teams[name] && !teams[name].flag && !teams[name].flagCode) warnings.push(`${name} is missing a flag mapping.`);
      });
    }
    const snapshot = snapshotTargetDate(new Date(), matches);
    if (snapshot && !matches.some(m => m.pdt?.date === snapshot)) warnings.push(`Snapshot date ${snapshot} has no matches.`);
    return { ok: errors.length === 0, errors, warnings, checkedBy: 'browser validation' };
  }

  function renderHero() {
    const matches = decoratedMatches();
    const completed = matches.filter(m => m.status === 'final').length;
    const live = matches.filter(m => m.status === 'live' || isInMatchWindow(m)).length;
    const scheduled = matches.length - completed;
    $('completedStat').textContent = completed;
    $('liveStat').textContent = live;
    $('scheduledStat').textContent = scheduled;
    $('totalStat').textContent = matches.length;
    const p = pacificParts();
    $('pdtClock').textContent = `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} PDT`;
    const cutoff = staticAfterDate();
    $('staticCutoff').textContent = cutoff ? formatDateTime(cutoff, 'America/Los_Angeles') : 'Not set';
    $('dataStatusPill').textContent = WC_DATA?.validation?.ok ? 'Snapshot loaded' : 'Data needs review';
    $('dataStatusPill').className = WC_DATA?.validation?.ok ? 'status-pill ok' : 'status-pill warn';
    $('lastUpdateBox').textContent = WC_DATA?.lastUpdated || WC_DATA?.lastUpdateIso || 'Not available';
    const snapDate = snapshotTargetDate();
    $('snapshotBox').textContent = fullDateLabel(snapDate);
    $('validationBox').textContent = WC_DATA?.validation?.ok ? 'Passed' : 'Review';
    $('activeWindowsBox').textContent = isStaticNow() ? 'Stopped after final cutoff' : `${activeMatchWindows().length} active/recent`; 
    $('deployRuleBox').textContent = WC_DATA?.automation?.deployRule || 'Deploy only when data changes';
    $('snapshotRuleBox').textContent = WC_DATA?.snapshotRule || 'After 10:30 PM PDT, show next PDT matchday';
  }
  function renderSnapshot() {
    const date = snapshotTargetDate();
    const matches = decoratedMatches().filter(m => m.pdt?.date === date).sort(sortByKickoff);
    const groups = [...new Set(matches.map(m => m.group ? `Group ${m.group}` : m.stage))].join(' · ');
    $('snapshotTitle').textContent = fullDateLabel(date);
    $('snapshotMeta').textContent = `${matches.length} matches on this PDT date${groups ? ` · ${groups}` : ''}`;
    $('snapshotList').innerHTML = matches.length ? matches.map(m => matchCard(m, { compactTime:false })).join('') : '<p class="empty">No matches found for this matchday.</p>';
  }
  function renderControls() {
    const teams = Object.entries(WC_DATA.teams || {}).sort((a,b) => displayTeamName(a[0]).localeCompare(displayTeamName(b[0])));
    const teamOptions = `<option value="">All teams</option>` + teams.map(([name]) => `<option value="${escapeAttr(name)}" ${state.selectedTeam === name ? 'selected' : ''}>${escapeHtml(displayTeamName(name))}</option>`).join('');
    if ($('teamFocusSelect').innerHTML !== teamOptions) $('teamFocusSelect').innerHTML = teamOptions;
    const venues = [...new Set(WC_DATA.matches.map(m => m.venue).filter(Boolean))].sort();
    const venueOptions = `<option value="all">All venues</option>` + venues.map(v => `<option value="${escapeAttr(v)}" ${state.selectedVenue === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
    if ($('venueSelect').innerHTML !== venueOptions) $('venueSelect').innerHTML = venueOptions;
    const dates = [...new Set(WC_DATA.matches.map(m => m.pdt?.date).filter(Boolean))].sort();
    const dateOptions = `<option value="all">All dates</option>` + dates.map(d => `<option value="${escapeAttr(d)}" ${state.dateFilter === d ? 'selected' : ''}>${escapeHtml(fullDateLabel(d))}</option>`).join('');
    if ($('dateFilter').innerHTML !== dateOptions) $('dateFilter').innerHTML = dateOptions;
    $('timeMode').value = state.timeMode;
    $('hideScoresBtn').textContent = state.hideScores ? 'Show scores' : 'Hide scores';
  }
  function renderKnockout() {
    const rounds = ['all', ...BRACKET_STAGES];
    $('roundTabs').innerHTML = rounds.map(r => `<button class="tab ${state.activeRound === r ? 'active' : ''}" data-round="${escapeAttr(r)}" type="button">${escapeHtml(r === 'all' ? 'All rounds' : r)}</button>`).join('');
    const matches = decoratedMatches().filter(m => BRACKET_STAGES.includes(m.stage));
    const stages = state.activeRound === 'all' ? BRACKET_STAGES : [state.activeRound];
    $('knockoutBracket').innerHTML = stages.map(stage => `<section class="bracket-round"><h3>${escapeHtml(stage)}</h3><div class="round-stack">${matches.filter(m => m.stage === stage).sort(sortByKickoff).map(matchCard).join('')}</div></section>`).join('');
  }
  function renderGroupFixtures() {
    const matches = decoratedMatches().filter(m => m.stage === 'Group Stage');
    $('groupFixtures').innerHTML = GROUPS.map(g => `<section class="group-fixture"><h3>Group ${g}</h3><div class="mini-grid">${matches.filter(m => m.group === g).sort(sortByKickoff).map(miniMatchCard).join('')}</div></section>`).join('');
  }
  function renderStandings() {
    const standings = computeStandings();
    const thirdRows = computeThirdPlaces(standings);
    $('standingsGrid').innerHTML = GROUPS.map(g => {
      const rows = standings[g].map(team => {
        const [cls, label] = standingsStatus(team, thirdRows);
        return `<tr><td class="team-cell">${teamButton(team.name)}</td><td>${team.P}</td><td>${team.W}</td><td>${team.D}</td><td>${team.L}</td><td>${team.GF}</td><td>${team.GA}</td><td>${team.GD}</td><td><b>${team.Pts}</b></td><td><span class="status-mini ${cls}">${escapeHtml(label)}</span></td></tr>`;
      }).join('');
      return `<section class="standings-card"><h3>Group ${g}</h3><table><thead><tr><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join('');
    $('thirdPlaceTable').innerHTML = `<table><thead><tr><th>Rank</th><th>Team</th><th>Group</th><th>P</th><th>Pts</th><th>GD</th><th>GF</th><th>Status</th></tr></thead><tbody>${thirdRows.map(r => `<tr><td>${r.thirdRank}</td><td class="team-cell">${teamButton(r.name)}</td><td>${r.group}</td><td>${r.P}</td><td><b>${r.Pts}</b></td><td>${r.GD}</td><td>${r.GF}</td><td><span class="status-mini ${r.statusClass}">${escapeHtml(r.status)}</span></td></tr>`).join('')}</tbody></table>`;
  }
  function renderTeamFocus() {
    const teams = Object.keys(WC_DATA.teams || {}).sort((a,b) => displayTeamName(a).localeCompare(displayTeamName(b)));
    if (!state.selectedTeam && teams.length) state.selectedTeam = teams[0];
    $('teamFocusSelect').value = state.selectedTeam || '';
    const team = state.selectedTeam;
    if (!team) { $('teamFocusPanel').innerHTML = '<p class="empty">Choose a team to see its path.</p>'; return; }
    const standings = computeStandings();
    const teamGroup = WC_DATA.teams[team]?.group;
    const tableTeam = teamGroup ? standings[teamGroup].find(t => t.name === team) : null;
    const teamMatches = decoratedMatches().filter(m => canonical(m.home) === team || canonical(m.away) === team || m.originalHome === team || m.originalAway === team).sort(sortByKickoff);
    const possible = decoratedMatches().filter(m => String(m.originalHome || '').includes(`Group ${teamGroup}`) || String(m.originalAway || '').includes(`Group ${teamGroup}`)).sort(sortByKickoff).slice(0,4);
    $('teamFocusPanel').innerHTML = `<div class="focus-head"><h3>${flagMarkup(team)} ${escapeHtml(displayTeamName(team))}</h3><p>Group ${escapeHtml(teamGroup || '—')} · ${tableTeam ? `Rank ${tableTeam.rank} · ${tableTeam.Pts} pts · GD ${tableTeam.GD}` : 'No standings yet'}</p></div><div class="mini-grid">${teamMatches.map(miniMatchCard).join('')}</div><h4>Possible knockout path</h4><div class="mini-grid">${possible.map(miniMatchCard).join('') || '<p class="empty">Knockout path appears after group placement is known.</p>'}</div>`;
  }
  function renderVenueView() {
    const venue = state.selectedVenue;
    const matches = decoratedMatches().filter(m => venue === 'all' || m.venue === venue).sort(sortByKickoff);
    const grouped = groupBy(matches, m => m.venue || 'Venue TBD');
    $('venuePanel').innerHTML = Object.entries(grouped).map(([v, list]) => `<section class="venue-card"><h3>${escapeHtml(v)}</h3><p>${list.length} matches · ${escapeHtml(venueTimeZone(v))}</p><div class="mini-grid">${list.map(miniMatchCard).join('')}</div></section>`).join('');
  }
  function groupBy(items, fn) { return items.reduce((acc, item) => { const key = fn(item); (acc[key] ||= []).push(item); return acc; }, {}); }
  function filterMatches(matches) {
    let rows = matches.slice();
    const today = todayKeyPT();
    const tomorrow = addDateKey(today, 1);
    const next = snapshotTargetDate();
    if (state.quickFilter === 'today') rows = rows.filter(m => m.pdt?.date === today);
    if (state.quickFilter === 'tomorrow') rows = rows.filter(m => m.pdt?.date === tomorrow);
    if (state.quickFilter === 'next') rows = rows.filter(m => m.pdt?.date === next);
    if (state.quickFilter === 'upcoming') rows = rows.filter(m => m.status !== 'final');
    if (state.quickFilter === 'completed') rows = rows.filter(m => m.status === 'final');
    if (state.stageFilter !== 'all') rows = rows.filter(m => m.stage === state.stageFilter);
    if (state.groupFilter !== 'all') rows = rows.filter(m => m.group === state.groupFilter);
    if (state.dateFilter !== 'all') rows = rows.filter(m => m.pdt?.date === state.dateFilter);
    if (state.selectedVenue !== 'all') rows = rows.filter(m => m.venue === state.selectedVenue);
    if (state.selectedTeam) rows = rows.filter(m => canonical(m.home) === state.selectedTeam || canonical(m.away) === state.selectedTeam);
    if (state.search) {
      const s = state.search.toLowerCase();
      rows = rows.filter(m => [m.home, m.away, m.venue, m.stage, m.group, m.number].join(' ').toLowerCase().includes(s));
    }
    return rows.sort(sortByKickoff);
  }
  function renderAllMatches() {
    $('quickFilters').innerHTML = QUICK_FILTERS.map(([key,label]) => `<button class="chip ${state.quickFilter === key ? 'active' : ''}" type="button" data-filter="${key}">${label}</button>`).join('');
    $('stageFilter').innerHTML = `<option value="all">All stages</option>` + STAGES.map(s => `<option value="${escapeAttr(s)}" ${state.stageFilter === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
    $('groupFilter').innerHTML = `<option value="all">All groups</option>` + GROUPS.map(g => `<option value="${g}" ${state.groupFilter === g ? 'selected' : ''}>Group ${g}</option>`).join('');
    $('searchBox').value = state.search;
    const matches = filterMatches(decoratedMatches());
    const grouped = groupBy(matches, m => m.pdt?.date || 'TBD');
    $('allMatches').innerHTML = Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([date, list]) => {
      const groups = [...new Set(list.map(m => m.group ? `Group ${m.group}` : m.stage))].slice(0,5).join(' · ');
      return `<section class="date-section" id="date-${escapeAttr(date)}"><div class="date-header"><h3>${escapeHtml(fullDateLabel(date))}</h3><span>${list.length} matches${groups ? ` · ${escapeHtml(groups)}` : ''}</span></div><div class="match-grid">${list.map(matchCard).join('')}</div></section>`;
    }).join('') || '<p class="empty">No matches match your filters.</p>';
  }
  function renderUpdates() {
    const rows = WC_DATA.changesSinceLastUpdate || [];
    $('changesList').innerHTML = rows.length ? rows.slice(0,12).map(r => `<li><span>${escapeHtml(r.time || '')}</span>${escapeHtml(r.text || r)}</li>`).join('') : '<li>No changes recorded yet. Score/status changes will appear here after live updates.</li>';
    const val = WC_DATA.validation || validateData(WC_DATA);
    $('validationDetails').innerHTML = `<p><b>${val.ok ? 'Passed' : 'Needs review'}</b> · ${val.errors?.length || 0} errors · ${val.warnings?.length || 0} warnings</p>${(val.errors || []).map(e => `<p class="error">${escapeHtml(e)}</p>`).join('')}${(val.warnings || []).slice(0,8).map(w => `<p class="warning">${escapeHtml(w)}</p>`).join('')}`;
    const automation = WC_DATA.automation || {};
    $('automationDetails').innerHTML = `<div class="info-grid"><div><b>Nightly update</b><span>${escapeHtml(automation.nightlyUpdate || '10:30 PM PDT')}</span></div><div><b>Score polling</b><span>${escapeHtml(automation.matchWindowPolling || 'About every 10 minutes during match windows')}</span></div><div><b>Browser refresh</b><span>${escapeHtml(automation.browserRefresh || 'Every 60 seconds during active/recent matches')}</span></div><div><b>Static cutoff</b><span>${escapeHtml(automation.staticCutoff || WC_DATA.staticAfter || STATIC_CUTOFF_PT)}</span></div></div>`;
    $('sourcesGrid').innerHTML = (WC_DATA.sources || []).map(src => `<a class="source-card" href="${escapeAttr(src.url || '#')}" target="_blank" rel="noopener"><b>${escapeHtml(src.label || 'Source')}</b><span>${escapeHtml(src.url || '')}</span></a>`).join('');
  }
  function renderAll(source = '') {
    if (!WC_DATA) return;
    renderHero(); renderSnapshot(); renderControls(); renderKnockout(); renderGroupFixtures(); renderStandings(); renderTeamFocus(); renderVenueView(); renderAllMatches(); renderUpdates();
    lastSnapshotKey = snapshotTargetDate() || '';
    if (source) document.body.dataset.lastRenderSource = source;
  }

  function normalizeApiGame(game) {
    const get = (paths) => {
      for (const path of paths) {
        let cur = game, ok = true;
        for (const part of path.split('.')) {
          if (cur && typeof cur === 'object' && part in cur) cur = cur[part]; else { ok = false; break; }
        }
        if (ok && cur !== null && cur !== undefined && cur !== '') return cur;
      }
      return null;
    };
    const statusRaw = String(get(['status','match_status','state','status.short','status.long']) || '').toLowerCase();
    let status = 'scheduled';
    if (/(finish|final|complete|full time)|^ft$|^aet$|^pen$/.test(statusRaw)) status = 'final';
    else if (/(live|progress|playing|half|extra|penalty)/.test(statusRaw)) status = 'live';
    return {
      number: toInt(get(['number','matchNumber','match_no','gameNumber','id','match_id'])),
      home: canonical(get(['home.name_en','home.name','homeTeam.name','home_team.name','team1.name','homeTeam','home_team','home','team1'])),
      away: canonical(get(['away.name_en','away.name','awayTeam.name','away_team.name','team2.name','awayTeam','away_team','away','team2'])),
      homeScore: toInt(get(['homeScore','home_score','score.home','home.score','goalsHome','team1_score','score1'])),
      awayScore: toInt(get(['awayScore','away_score','score.away','away.score','goalsAway','team2_score','score2'])),
      homePenalties: toInt(get(['homePenalties','home_penalties','penalties.home','home.penalties','score.penalties.home'])),
      awayPenalties: toInt(get(['awayPenalties','away_penalties','penalties.away','away.penalties','score.penalties.away'])),
      status
    };
  }
  function unwrapApiPayload(payload) {
    if (Array.isArray(payload)) return payload.filter(x => x && typeof x === 'object');
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['games','matches','fixtures','results','data']) {
      const value = payload[key];
      if (Array.isArray(value)) return value.filter(x => x && typeof x === 'object');
      const nested = unwrapApiPayload(value);
      if (nested.length) return nested;
    }
    return [];
  }
  function findTargetMatch(game, data = WC_DATA) {
    if (game.number != null) {
      const match = data.matches.find(m => Number(m.number) === Number(game.number));
      if (match) return { match, reversed:false };
    }
    const pair = [game.home, game.away];
    for (const match of data.matches) {
      const mpair = [canonical(match.home), canonical(match.away)];
      if (mpair[0] === pair[0] && mpair[1] === pair[1]) return { match, reversed:false };
      if (mpair[0] === pair[1] && mpair[1] === pair[0]) return { match, reversed:true };
    }
    return null;
  }
  function applyApiGames(games, data = WC_DATA) {
    let changed = 0;
    const records = [];
    for (const raw of games) {
      const game = normalizeApiGame(raw);
      if (!game.home || !game.away) continue;
      const found = findTargetMatch(game, data);
      if (!found) continue;
      const { match, reversed } = found;
      const before = JSON.stringify([match.home, match.away, match.status, match.homeScore, match.awayScore, match.homePenalties, match.awayPenalties]);
      const hs = reversed ? game.awayScore : game.homeScore;
      const as = reversed ? game.homeScore : game.awayScore;
      const hp = reversed ? game.awayPenalties : game.homePenalties;
      const ap = reversed ? game.homePenalties : game.awayPenalties;
      const apiHome = reversed ? game.away : game.home;
      const apiAway = reversed ? game.home : game.away;
      if (!isCountry(match.home) && isCountry(apiHome)) match.home = apiHome;
      if (!isCountry(match.away) && isCountry(apiAway)) match.away = apiAway;
      if (hs != null && as != null) { match.homeScore = hs; match.awayScore = as; match.status = game.status === 'scheduled' ? 'live' : game.status; }
      else if (game.status === 'live' && match.status !== 'final') match.status = 'live';
      if (hp != null) match.homePenalties = hp;
      if (ap != null) match.awayPenalties = ap;
      const after = JSON.stringify([match.home, match.away, match.status, match.homeScore, match.awayScore, match.homePenalties, match.awayPenalties]);
      if (before !== after) { changed++; records.push({ time: formatDateTime(new Date(), 'America/Los_Angeles'), text: `M${match.number}: ${displayTeamName(match.home)} ${match.homeScore ?? '—'}-${match.awayScore ?? '—'} ${displayTeamName(match.away)} (${match.status})` }); }
    }
    if (changed) {
      data.lastUpdated = `${formatDateTime(new Date(), 'America/Los_Angeles')} · browser live refresh`;
      data.lastUpdateIso = new Date().toISOString();
      data.changesSinceLastUpdate = [...records, ...(data.changesSinceLastUpdate || [])].slice(0, 25);
    }
    return changed;
  }
  async function fetchJson(url) {
    const response = await fetch(url, { cache:'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }
  async function tryLiveRefresh(manual = false) {
    if (isStaticNow()) { toast('Refreshes are stopped because the final static cutoff has passed.'); return; }
    let changed = 0;
    let source = 'published JSON';
    // First try the direct live API. If the browser is blocked by CORS, fall back to the GitHub-published JSON.
    if (WC_DATA.apiEndpoint) {
      try {
        const payload = await fetchJson(`${WC_DATA.apiEndpoint}${WC_DATA.apiEndpoint.includes('?') ? '&' : '?'}_=${Date.now()}`);
        const games = unwrapApiPayload(payload);
        if (games.length) { changed = applyApiGames(games, WC_DATA); source = 'direct live API'; }
      } catch (err) {
        if (manual) console.info('Direct live API refresh was not available in this browser:', err);
      }
    }
    try {
      const json = await fetchJson(`worldcup-data.json?_=${Date.now()}`);
      const candidate = normalizeData(json);
      const before = dataSignature(WC_DATA);
      const after = dataSignature(candidate);
      if (after && after !== before) { WC_DATA = candidate; changed++; source = 'published GitHub data'; }
    } catch (err) {
      if (!changed && manual) throw err;
    }
    WC_DATA.validation = validateData(WC_DATA);
    renderAll(source);
    if (manual) toast(changed ? `Refresh complete from ${source}.` : 'Refresh checked sources; no newer scores were found.');
  }
  function setupTimers() {
    clearInterval(clockTimer); clearInterval(liveTimer);
    clockTimer = setInterval(() => {
      const nextSnapshot = snapshotTargetDate();
      if (nextSnapshot !== lastSnapshotKey) renderAll('client snapshot clock');
      else renderHero();
    }, SNAPSHOT_CHECK_MS);
    liveTimer = setInterval(() => {
      if (shouldBrowserPoll()) tryLiveRefresh(false).catch(() => {});
    }, LIVE_REFRESH_MS);
  }
  function toast(message) {
    const node = $('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('show');
    setTimeout(() => node.classList.remove('show'), 4500);
  }
  function copyText(text, label) {
    navigator.clipboard?.writeText(text).then(() => toast(`${label} copied.`)).catch(() => toast('Copy failed.'));
  }
  function snapshotPlainText() {
    const date = snapshotTargetDate();
    const matches = decoratedMatches().filter(m => m.pdt?.date === date).sort(sortByKickoff);
    return [`World Cup matches for ${fullDateLabel(date)}`, '', ...matches.map(m => `${formatKickoff(m)} — ${displayTeamName(m.home)} vs ${displayTeamName(m.away)} — ${m.venue}`)].join('\n');
  }
  function downloadCalendar() {
    const date = snapshotTargetDate();
    const matches = decoratedMatches().filter(m => m.pdt?.date === date).sort(sortByKickoff);
    const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//World Cup 2026 Bracket//EN'];
    for (const m of matches) {
      const start = parseDate(m.pdt?.iso); if (!start) continue;
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      const fmt = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      lines.push('BEGIN:VEVENT', `UID:wc2026-match-${m.number}@jmleong.github.io`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:World Cup M${m.number}: ${displayTeamName(m.home)} vs ${displayTeamName(m.away)}`, `LOCATION:${m.venue || ''}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type:'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `world-cup-${date}.ics`; a.click(); URL.revokeObjectURL(a.href);
  }
  function setPrintMode(mode) {
    document.body.dataset.printMode = mode;
    window.print();
    setTimeout(() => { delete document.body.dataset.printMode; }, 1000);
  }
  function attachEvents() {
    document.addEventListener('click', ev => {
      const team = ev.target.closest('.team-click')?.dataset.team;
      if (team) { state.selectedTeam = team; localStorage.setItem('wc2026-selected-team', team); renderControls(); renderTeamFocus(); renderAllMatches(); location.hash = '#teams'; }
      const round = ev.target.closest('.tab')?.dataset.round;
      if (round) { state.activeRound = round; localStorage.setItem('wc2026-active-round', round); renderKnockout(); }
      const filter = ev.target.closest('.chip')?.dataset.filter;
      if (filter) { state.quickFilter = filter; localStorage.setItem('wc2026-quick-filter', filter); renderAllMatches(); }
    });
    $('timeMode').addEventListener('change', e => { state.timeMode = e.target.value; localStorage.setItem('wc2026-time-mode', state.timeMode); renderAll('time mode'); });
    $('teamFocusSelect').addEventListener('change', e => { state.selectedTeam = e.target.value; localStorage.setItem('wc2026-selected-team', state.selectedTeam); renderTeamFocus(); renderAllMatches(); });
    $('venueSelect').addEventListener('change', e => { state.selectedVenue = e.target.value; renderVenueView(); renderAllMatches(); });
    $('stageFilter').addEventListener('change', e => { state.stageFilter = e.target.value; renderAllMatches(); });
    $('groupFilter').addEventListener('change', e => { state.groupFilter = e.target.value; renderAllMatches(); });
    $('dateFilter').addEventListener('change', e => { state.dateFilter = e.target.value; renderAllMatches(); });
    $('searchBox').addEventListener('input', e => { state.search = e.target.value; renderAllMatches(); });
    $('hideScoresBtn').addEventListener('click', () => { state.hideScores = !state.hideScores; localStorage.setItem('wc2026-hide-scores', state.hideScores ? '1' : '0'); document.body.classList.toggle('spoilers-hidden', state.hideScores); renderAll('spoiler toggle'); });
    $('refreshBtn').addEventListener('click', () => tryLiveRefresh(true).catch(err => toast(`Live refresh failed: ${err.message}`)));
    $('copySnapshotBtn').addEventListener('click', () => copyText(snapshotPlainText(), 'Snapshot'));
    $('copyLinkBtn').addEventListener('click', () => copyText(location.href, 'Page link'));
    $('downloadCalendarBtn').addEventListener('click', downloadCalendar);
    $('printFullBtn').addEventListener('click', () => setPrintMode('full'));
    $('printBracketBtn').addEventListener('click', () => setPrintMode('bracket'));
    $('printSnapshotBtn').addEventListener('click', () => setPrintMode('snapshot'));
    $('printStandingsBtn').addEventListener('click', () => setPrintMode('standings'));
  }

  async function init() {
    EMBEDDED_DATA = parseEmbeddedData() || {};
    setData(EMBEDDED_DATA, 'embedded fallback');
    attachEvents();
    setupTimers();
    try {
      const json = await fetchJson(`worldcup-data.json?_=${Date.now()}`);
      setData(json, 'published JSON');
    } catch (err) {
      toast('Using embedded fallback data because worldcup-data.json could not be loaded.');
    }
    if (shouldBrowserPoll()) tryLiveRefresh(false).catch(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
