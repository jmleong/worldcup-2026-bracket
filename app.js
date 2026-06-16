
(() => {
  'use strict';

  const TEAM_ALIASES = {
    'United States': 'USA', 'USMNT': 'USA', 'South Korea': 'Korea Republic', 'Korea Republic': 'Korea Republic',
    'Iran': 'IR Iran', 'IR Iran': 'IR Iran', 'IR Iran ': 'IR Iran', 'Cape Verde': 'Cabo Verde', 'Czech Republic': 'Czechia',
    'Côte d’Ivoire': "Côte d'Ivoire", 'Cote d\'Ivoire': "Côte d'Ivoire", 'Ivory Coast': "Côte d'Ivoire",
    'Curacao': 'Curaçao', 'Turkiye': 'Türkiye', 'Turkey': 'Türkiye', 'Democratic Republic of Congo':'Congo DR',
    'DR Congo':'Congo DR', 'DRC':'Congo DR'
  };
  const SPECIAL_FLAG_CLASS = { England: 'flag-england', Scotland: 'flag-scotland' };
  const TEAM_FLAG_CODES = {
    'Mexico': 'mx', 'South Africa': 'za', 'Korea Republic': 'kr', 'Czechia': 'cz', 'Canada': 'ca',
    'Bosnia and Herzegovina': 'ba', 'Qatar': 'qa', 'Switzerland': 'ch', 'Brazil': 'br', 'Morocco': 'ma',
    'Haiti': 'ht', 'Scotland': 'gb-sct', 'USA': 'us', 'Paraguay': 'py', 'Australia': 'au', 'Türkiye': 'tr',
    'Germany': 'de', 'Curaçao': 'cw', "Côte d'Ivoire": 'ci', 'Ecuador': 'ec', 'Netherlands': 'nl',
    'Japan': 'jp', 'Sweden': 'se', 'Tunisia': 'tn', 'Belgium': 'be', 'Egypt': 'eg', 'IR Iran': 'ir',
    'New Zealand': 'nz', 'Spain': 'es', 'Cabo Verde': 'cv', 'Saudi Arabia': 'sa', 'Uruguay': 'uy',
    'France': 'fr', 'Senegal': 'sn', 'Iraq': 'iq', 'Norway': 'no', 'Argentina': 'ar', 'Algeria': 'dz',
    'Austria': 'at', 'Jordan': 'jo', 'Portugal': 'pt', 'Congo DR': 'cd', 'Uzbekistan': 'uz',
    'Colombia': 'co', 'England': 'gb-eng', 'Croatia': 'hr', 'Ghana': 'gh', 'Panama': 'pa'
  };
  const STAGES = ['Group Stage','Round of 32','Round of 16','Quarter-finals','Semi-finals','Third Place','Final'];
  const BRACKET_STAGES = ['Round of 32','Round of 16','Quarter-finals','Semi-finals','Final'];
  const HOURGLASS_MATCH_POSITIONS = [
    [74, 120, 95, 'left-r32'], [77, 120, 225, 'left-r32'], [73, 120, 355, 'left-r32'], [75, 120, 485, 'left-r32'],
    [83, 120, 765, 'left-r32'], [84, 120, 895, 'left-r32'], [81, 120, 1025, 'left-r32'], [82, 120, 1155, 'left-r32'],
    [89, 340, 160, 'left-r16'], [90, 340, 420, 'left-r16'], [93, 340, 830, 'left-r16'], [94, 340, 1090, 'left-r16'],
    [97, 550, 290, 'left-qf'], [98, 550, 960, 'left-qf'], [101, 700, 625, 'left-sf'],
    [104, 950, 625, 'final-node'], [103, 950, 835, 'third-node'],
    [102, 1200, 625, 'right-sf'], [99, 1350, 290, 'right-qf'], [100, 1350, 960, 'right-qf'],
    [91, 1560, 160, 'right-r16'], [92, 1560, 420, 'right-r16'], [95, 1560, 830, 'right-r16'], [96, 1560, 1090, 'right-r16'],
    [76, 1780, 95, 'right-r32'], [78, 1780, 225, 'right-r32'], [79, 1780, 355, 'right-r32'], [80, 1780, 485, 'right-r32'],
    [86, 1780, 765, 'right-r32'], [88, 1780, 895, 'right-r32'], [85, 1780, 1025, 'right-r32'], [87, 1780, 1155, 'right-r32']
  ];
  const HOURGLASS_EDGES = [
    [74,89],[77,89],[73,90],[75,90],[89,97],[90,97],
    [83,93],[84,93],[81,94],[82,94],[93,98],[94,98],[97,101],[98,101],[101,104],
    [76,91],[78,91],[79,92],[80,92],[91,99],[92,99],
    [86,95],[88,95],[85,96],[87,96],[95,100],[96,100],[99,102],[100,102],[102,104]
  ];
  const HOURGLASS_DASHED_EDGES = [[101,103],[102,103]];
  const GROUPS = 'ABCDEFGHIJKL'.split('');
  const QUICK_FILTERS = [
    ['all', 'All'], ['today', 'Today'], ['tomorrow', 'Tomorrow'], ['next', 'Next matchday'], ['upcoming', 'Upcoming only'], ['completed', 'Completed']
  ];
  const VENUE_ZONES = [
    [/Vancouver/i, 'America/Vancouver'], [/Seattle|Los Angeles|San Francisco|Santa Clara|Bay Area/i, 'America/Los_Angeles'],
    [/Mexico City|Guadalajara/i, 'America/Mexico_City'], [/Monterrey/i, 'America/Monterrey'],
    [/Toronto/i, 'America/Toronto'], [/Dallas|Arlington|Houston|Kansas City/i, 'America/Chicago'],
    [/New York|New Jersey|East Rutherford|Philadelphia|Boston|Foxborough|Miami|Atlanta/i, 'America/New_York']
  ];

  let WC_DATA = null;
  let EMBEDDED_DATA = null;
  const state = {
    quickFilter: 'all',
    activeRound: localStorage.getItem('wc2026-active-round') || 'all',
    timeMode: localStorage.getItem('wc2026-time-mode') || 'pdt',
    hideScores: localStorage.getItem('wc2026-hide-scores') === '1',
    selectedTeam: localStorage.getItem('wc2026-selected-team') || '',
    matchTeam: 'all',
    selectedVenue: 'all'
  };
  let browserLiveTimer = null;

  function $(id) { return document.getElementById(id); }
  function canonical(name) { return TEAM_ALIASES[String(name || '').trim()] || String(name || '').trim(); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function parseDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
  function toInt(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

  function parseEmbeddedData() {
    const node = $('embedded-data');
    if (!node) return null;
    try { return JSON.parse(node.textContent); } catch { return null; }
  }
  function normalizeData(candidate) {
    const base = EMBEDDED_DATA || {};
    const merged = { ...base, ...candidate };
    const teams = {};
    Object.entries(base.teams || {}).forEach(([name, info]) => { teams[name] = { ...info }; });
    Object.entries(candidate.teams || {}).forEach(([name, info]) => { teams[name] = { ...(teams[name] || {}), ...info }; });
    Object.entries(teams).forEach(([name, info]) => { if (!info.flagCode && TEAM_FLAG_CODES[name]) info.flagCode = TEAM_FLAG_CODES[name]; });
    merged.teams = teams;
    merged.matches = (merged.matches || []).slice().sort((a,b) => Number(a.number || 0) - Number(b.number || 0));
    if (!merged.snapshotDate) merged.snapshotDate = firstMatchDateOnOrAfter(snapshotBaseDate(new Date()), merged.matches);
    return merged;
  }
  function setData(data) {
    WC_DATA = normalizeData(data);
    document.body.classList.toggle('spoilers-hidden', state.hideScores);
  }
  function teamInfo(name) {
    const key = canonical(name);
    const info = WC_DATA?.teams?.[key];
    if (!info) return { flag: '◇', display: name || 'TBD' };
    return { ...info, display: info.display || key };
  }
  function isCountry(name) { return Boolean(WC_DATA?.teams?.[canonical(name)]); }
  function flagMarkup(name) {
    const key = canonical(name);
    const info = teamInfo(key);
    if (!isCountry(key)) return '<span class="flag flag-placeholder" aria-hidden="true">◇</span>';
    if (SPECIAL_FLAG_CLASS[key]) return `<span class="flag flag-drawn ${SPECIAL_FLAG_CLASS[key]}" role="img" aria-label="${escapeAttr(info.display)} flag"></span>`;
    const code = info.flagCode || info.code || TEAM_FLAG_CODES[key];
    const emoji = escapeHtml(info.flag || '◇');
    if (code) return `<span class="flag flag-image" role="img" aria-label="${escapeAttr(info.display)} flag"><img src="https://flagcdn.com/w40/${escapeAttr(code)}.png" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='inline'"><span class="flag-fallback">${emoji}</span></span>`;
    return `<span class="flag" role="img" aria-label="${escapeAttr(info.display)} flag">${emoji}</span>`;
  }
  function displayTeamName(name) { return teamInfo(name).display || name || 'TBD'; }
  function teamButton(name) {
    const label = displayTeamName(name);
    if (!isCountry(name)) return `<span class="team-name">${flagMarkup(name)}<span>${escapeHtml(label)}</span></span>`;
    return `<button class="team-link" type="button" data-team="${escapeAttr(canonical(name))}" title="Show ${escapeAttr(label)} team view">${flagMarkup(name)}<span>${escapeHtml(label)}</span></button>`;
  }

  function hasScore(match) { return match.homeScore != null && match.awayScore != null; }
  function scoreValue(match, side) {
    const score = side === 'home' ? match.homeScore : match.awayScore;
    if (score == null) return '—';
    if (state.hideScores && (match.status === 'final' || match.status === 'live')) return '••';
    const pen = side === 'home' ? match.homePenalties : match.awayPenalties;
    return pen != null ? `${score} (${pen})` : String(score);
  }
  function statusLabel(match) { return match.status === 'final' ? 'Final' : (match.status === 'live' ? 'Live' : 'Scheduled'); }
  function pointsFor(match, side) {
    if (match.stage !== 'Group Stage' || match.status !== 'final' || !hasScore(match)) return '';
    if (match.homeScore === match.awayScore) return '+1 pt';
    const homeWin = match.homeScore > match.awayScore;
    return (side === 'home' && homeWin) || (side === 'away' && !homeWin) ? '+3 pts' : '+0 pts';
  }
  function winnerSide(match) {
    if (match.status !== 'final' || !hasScore(match)) return null;
    if (match.homeScore > match.awayScore) return 'home';
    if (match.awayScore > match.homeScore) return 'away';
    if (match.homePenalties != null && match.awayPenalties != null) {
      if (match.homePenalties > match.awayPenalties) return 'home';
      if (match.awayPenalties > match.homePenalties) return 'away';
    }
    return null;
  }
  function winnerName(match) { const side = winnerSide(match); return side === 'home' ? match.home : side === 'away' ? match.away : null; }
  function loserName(match) { const side = winnerSide(match); return side === 'home' ? match.away : side === 'away' ? match.home : null; }

  function computeStandings(matches = WC_DATA.matches) {
    const table = {};
    GROUPS.forEach(g => table[g] = []);
    Object.entries(WC_DATA.teams || {}).forEach(([name, info]) => {
      if (!info.group || !table[info.group]) return;
      table[info.group].push({ name, display: info.display || name, group: info.group, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0, complete:false, rank:0 });
    });
    const lookup = {};
    Object.values(table).flat().forEach(t => lookup[t.name] = t);
    matches.filter(m => m.stage === 'Group Stage' && m.status === 'final' && hasScore(m)).forEach(m => {
      const h = lookup[canonical(m.home)], a = lookup[canonical(m.away)];
      if (!h || !a) return;
      h.P++; a.P++;
      h.GF += Number(m.homeScore); h.GA += Number(m.awayScore);
      a.GF += Number(m.awayScore); a.GA += Number(m.homeScore);
      if (m.homeScore > m.awayScore) { h.W++; a.L++; h.Pts += 3; }
      else if (m.homeScore < m.awayScore) { a.W++; h.L++; a.Pts += 3; }
      else { h.D++; a.D++; h.Pts++; a.Pts++; }
    });
    Object.values(table).flat().forEach(t => { t.GD = t.GF - t.GA; });
    GROUPS.forEach(g => {
      table[g].sort((a,b) => b.Pts-a.Pts || b.GD-a.GD || b.GF-a.GF || a.display.localeCompare(b.display));
      const complete = groupIsComplete(g, matches);
      table[g].forEach((t, i) => { t.rank = i + 1; t.complete = complete; });
    });
    return table;
  }
  function groupIsComplete(group, matches = WC_DATA.matches) {
    const groupMatches = matches.filter(m => m.stage === 'Group Stage' && m.group === group);
    return groupMatches.length === 6 && groupMatches.every(m => m.status === 'final' && hasScore(m));
  }
  function computeThirdPlaces(standings = computeStandings()) {
    const rows = GROUPS.map(g => standings[g]?.[2]).filter(Boolean).map(t => ({ ...t }));
    rows.sort((a,b) => b.Pts-a.Pts || b.GD-a.GD || b.GF-a.GF || a.display.localeCompare(b.display));
    rows.forEach((t, idx) => {
      t.thirdRank = idx + 1;
      const completeLabel = t.complete ? '' : 'Projected ';
      t.status = idx < 8 ? `${completeLabel}Advancing` : `${completeLabel}Outside`;
      t.statusClass = idx < 8 ? (t.complete ? 'advancing' : 'projected') : (t.complete ? 'outside' : 'projected');
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
      const qualified = thirdRows.filter(r => allowed.includes(r.group) && r.thirdRank <= 8 && r.complete && !usedThirdGroups.has(r.group));
      if (qualified.length === 1) {
        usedThirdGroups.add(qualified[0].group);
        return { name: qualified[0].name, note: `Auto-filled from ${label}` };
      }
      if (qualified.length > 1 && GROUPS.every(g => groupIsComplete(g))) {
        usedThirdGroups.add(qualified[0].group);
        return { name: qualified[0].name, note: `Provisional third-place auto-fill from ${label}` };
      }
      return null;
    }
    m = name.match(/^Winner Match (\d+)$/);
    if (m) {
      const prior = byNumber.get(Number(m[1]));
      const winner = prior ? winnerName(prior) : null;
      return winner ? { name: winner, note: `Auto-filled from ${label}` } : null;
    }
    m = name.match(/^Loser Match (\d+)$/);
    if (m) {
      const prior = byNumber.get(Number(m[1]));
      const loser = prior ? loserName(prior) : null;
      return loser ? { name: loser, note: `Auto-filled from ${label}` } : null;
    }
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
        if (resolved?.name) {
          match[side] = resolved.name;
          match.autoBadges.push(resolved.note);
        }
      });
    });
    return matches.sort((a,b) => Number(a.number) - Number(b.number));
  }

  function venueTimeZone(venue) {
    const text = String(venue || '');
    const found = VENUE_ZONES.find(([regex]) => regex.test(text));
    return found ? found[1] : 'America/Los_Angeles';
  }
  function formatDateTime(date, timeZone, withDate=true) {
    const options = withDate
      ? { timeZone, weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }
      : { timeZone, hour:'numeric', minute:'2-digit', timeZoneName:'short' };
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
  function formatKickoff(match, compact=false) {
    const date = parseDate(match.pdt?.iso);
    if (!date) return `${match.pdt?.dateLabel || ''} · ${match.pdt?.time || ''}`;
    if (state.timeMode === 'venue') return formatDateTime(date, venueTimeZone(match.venue), !compact).replace(/,/g, compact ? '' : ',');
    if (state.timeMode === 'local') return formatDateTime(date, Intl.DateTimeFormat().resolvedOptions().timeZone, !compact).replace(/,/g, compact ? '' : ',');
    return compact ? `${match.pdt.time}` : `${match.pdt.dateLabel} · ${match.pdt.time}`;
  }
  function fullDateLabel(dateKey) {
    if (!dateKey) return '—';
    return new Date(`${dateKey}T12:00:00-07:00`).toLocaleDateString('en-US', { timeZone:'America/Los_Angeles', weekday:'long', month:'long', day:'numeric', year:'numeric' });
  }
  function pacificParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Los_Angeles', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(date);
    return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  }
  function todayKeyPT(date = new Date()) { const p = pacificParts(date); return `${p.year}-${p.month}-${p.day}`; }
  function addDateKey(dateKey, days) { const d = new Date(`${dateKey}T12:00:00-07:00`); d.setDate(d.getDate() + days); return d.toLocaleDateString('en-CA', { timeZone:'America/Los_Angeles' }); }
  function snapshotBaseDate(now = new Date()) { const p = pacificParts(now); let key = `${p.year}-${p.month}-${p.day}`; if (Number(p.hour) > 22 || (Number(p.hour) === 22 && Number(p.minute) >= 30)) key = addDateKey(key, 1); return key; }
  function firstMatchDateOnOrAfter(dateKey, matches = WC_DATA?.matches || []) { const dates = [...new Set(matches.map(m => m.pdt?.date).filter(Boolean))].sort(); return dates.find(d => d >= dateKey) || dates.at(-1) || null; }
  function snapshotTargetDate(now = new Date()) {
    const matches = WC_DATA?.matches || [];
    if (isPastStaticCutoff(now)) {
      const dates = [...new Set(matches.map(m => m.pdt?.date).filter(Boolean))].sort();
      return dates.at(-1) || WC_DATA?.snapshotDate || null;
    }
    return firstMatchDateOnOrAfter(snapshotBaseDate(now), matches) || WC_DATA?.snapshotDate || null;
  }
  function snapshotMatches(now = new Date()) { const date = snapshotTargetDate(now); return { date, matches: decoratedMatches().filter(m => m.pdt?.date === date).sort(sortByKickoff) }; }
  function sortByKickoff(a,b) { return new Date(a.pdt?.iso || 0) - new Date(b.pdt?.iso || 0) || Number(a.number) - Number(b.number); }

  function teamRow(match, side) {
    const name = side === 'home' ? match.home : match.away;
    const win = winnerSide(match) === side;
    const spoilerClass = hasScore(match) && (match.status === 'final' || match.status === 'live') ? 'spoiler-score' : '';
    const penaltyClass = (side === 'home' ? match.homePenalties : match.awayPenalties) != null ? 'penalty' : '';
    return `<div class="team"><div class="team-name">${teamButton(name)}</div><span class="score ${win ? 'win' : ''} ${spoilerClass} ${penaltyClass}">${escapeHtml(scoreValue(match, side))}</span></div>`;
  }
  function matchCard(match, opts={}) {
    const status = statusLabel(match);
    const points = match.status === 'final' && match.stage === 'Group Stage'
      ? `<span class="tiny points-value">${escapeHtml(displayTeamName(match.home))} ${pointsFor(match,'home')}</span><span class="tiny points-value">${escapeHtml(displayTeamName(match.away))} ${pointsFor(match,'away')}</span>`
      : '';
    const auto = (match.autoBadges || []).slice(0,2).map(note => `<span class="tiny projected">${escapeHtml(note)}</span>`).join('');
    const winnerNote = match.status === 'final' && winnerName(match) ? `<span class="tiny qualified">${escapeHtml(displayTeamName(winnerName(match)))} advances</span>` : '';
    const label = match.group ? `Group ${match.group}` : match.stage;
    const klass = `match ${match.stage === 'Final' ? 'final-match' : ''}`;
    return `<article class="${klass}" data-match="${Number(match.number)}" data-stage="${escapeAttr(match.stage)}" data-date="${escapeAttr(match.pdt?.date)}">
      <div class="match-head"><span>M${Number(match.number)} · ${escapeHtml(label)}</span><span>${status}</span></div>
      <div class="teams">${teamRow(match,'home')}${teamRow(match,'away')}</div>
      <div class="meta"><span class="time-label">${escapeHtml(formatKickoff(match, opts.compactTime))}</span><br>${escapeHtml(match.venue || 'Venue TBD')}
        <div class="badge-row"><span class="tiny ${escapeAttr(match.status || 'scheduled')}">${status}</span>${points}${winnerNote}${auto}</div>
      </div>
    </article>`;
  }
  function fixtureMiniCard(match) {
    const points = match.status === 'final' && match.stage === 'Group Stage'
      ? `<span class="tiny points-value">${escapeHtml(displayTeamName(match.home))} ${pointsFor(match,'home')}</span><span class="tiny points-value">${escapeHtml(displayTeamName(match.away))} ${pointsFor(match,'away')}</span>`
      : `<span class="tiny ${escapeAttr(match.status || 'scheduled')}">${statusLabel(match)}</span>`;
    return `<article class="fixture-mini" data-match="${Number(match.number)}">
      <div class="fixture-top"><span>M${Number(match.number)}</span><span>${escapeHtml(formatKickoff(match, true))}</span></div>
      <div class="fixture-teams">${teamRow(match,'home')}${teamRow(match,'away')}</div>
      <div class="fixture-meta">${escapeHtml(match.venue || '')}<div class="badge-row">${points}</div></div>
    </article>`;
  }

  function renderHero() {
    const matches = decoratedMatches();
    const played = matches.filter(m => m.status === 'final').length;
    const active = activeMatchesForNow();
    const live = matches.filter(m => m.status === 'live').length;
    const remaining = matches.filter(m => m.status !== 'final').length;
    $('statPlayed').textContent = String(played);
    $('statLive').textContent = String(Math.max(active.length, live));
    $('statRemaining').textContent = String(remaining);
    const snap = snapshotMatches();
    $('snapshotDate').textContent = snap.date && snap.matches.length
      ? `${fullDateLabel(snap.date)} · ${snap.matches.length} match${snap.matches.length === 1 ? '' : 'es'} on this PDT date`
      : 'No remaining matchday found.';
    $('nextMatch').innerHTML = snap.matches.length ? snap.matches.map(m => matchCard(m, { compactTime:false })).join('') : '<p class="fine-print">No upcoming matches.</p>';
    $('topStatusCards').innerHTML = topStatusCards().join('');
  }
  function topStatusCards() {
    const validation = WC_DATA.validation || validateData(WC_DATA);
    const snapDate = snapshotTargetDate();
    return [
      `<div class="status-card"><b>Last update</b><span>${escapeHtml(WC_DATA.lastSuccessfulUpdate || WC_DATA.lastUpdated || 'Not recorded yet')}</span></div>`,
      `<div class="status-card"><b>Snapshot</b><span>${escapeHtml(snapDate ? fullDateLabel(snapDate) : 'No matchday')}</span></div>`,
      `<div class="status-card"><b>Validation</b><span>${validation.ok ? 'Passed' : `${validation.errors.length} issue(s)`}</span></div>`,
      `<div class="status-card"><b>Static after</b><span>${escapeHtml(formatCutoff())}</span></div>`
    ];
  }
  function renderBracket() {
    const root = $('bracketGrid');
    const tabs = [['all','Full hourglass'], ...BRACKET_STAGES.map(stage => [stage, stage]), ['Third Place','Third place']];
    $('roundTabs').innerHTML = tabs.map(([value,label]) => `<button class="round-tab ${state.activeRound === value ? 'active' : ''}" type="button" data-round="${escapeAttr(value)}">${escapeHtml(label)}</button>`).join('');
    const matches = decoratedMatches();
    const byNumber = new Map(matches.map(m => [Number(m.number), m]));

    if (state.activeRound !== 'all') {
      const selected = matches.filter(m => m.stage === state.activeRound).sort(sortByKickoff);
      root.innerHTML = `<div class="bracket-stage-list"><h3>${escapeHtml(state.activeRound)}</h3><div class="cards">${selected.map(m => matchCard(m)).join('')}</div></div>`;
      return;
    }

    root.innerHTML = renderHourglassBracket(byNumber);
    requestAnimationFrame(drawBracketLines);
  }

  function renderHourglassBracket(byNumber) {
    const nodes = HOURGLASS_MATCH_POSITIONS.map(([number, x, y, klass]) => renderBracketNode(byNumber.get(number), number, x, y, klass)).join('');
    return `<div class="knockout-hourglass" id="knockoutHourglass" aria-label="World Cup knockout bracket hourglass layout">
      <svg class="bracket-line-svg" id="bracketLineSvg" aria-hidden="true"></svg>
      <div class="bracket-region-title title-left">Left branch</div>
      <div class="bracket-region-title title-center">Finals</div>
      <div class="bracket-region-title title-right">Right branch</div>
      <div class="bracket-round-label label-left-r32">Round of 32</div>
      <div class="bracket-round-label label-left-r16">Round of 16</div>
      <div class="bracket-round-label label-left-qf">Quarter-finals</div>
      <div class="bracket-round-label label-left-sf">Semi-finals</div>
      <div class="bracket-round-label label-right-sf">Semi-finals</div>
      <div class="bracket-round-label label-right-qf">Quarter-finals</div>
      <div class="bracket-round-label label-right-r16">Round of 16</div>
      <div class="bracket-round-label label-right-r32">Round of 32</div>
      ${nodes}
      <div class="bracket-note">Lines follow the winner path toward the final. Dashed lines show the third-place match path for the two semifinal losers.</div>
    </div>`;
  }

  function renderBracketNode(match, number, x, y, klass) {
    const content = match ? matchCard(match) : `<article class="match"><div class="match-head"><span>M${Number(number)}</span><span>Scheduled</span></div><div class="teams"><div class="team"><span>Placeholder</span><span class="score">—</span></div></div></article>`;
    return `<div class="bracket-node ${escapeAttr(klass)}" data-node-match="${Number(number)}" style="--x:${Number(x)}px;--y:${Number(y)}px">${content}</div>`;
  }

  function drawBracketLines() {
    const board = $('knockoutHourglass');
    const svg = $('bracketLineSvg');
    if (!board || !svg) return;
    const boardRect = board.getBoundingClientRect();
    const width = Math.max(boardRect.width, board.scrollWidth);
    const height = Math.max(boardRect.height, board.scrollHeight);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.innerHTML = `<defs><filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    const nodeMap = new Map([...board.querySelectorAll('[data-node-match]')].map(node => [Number(node.dataset.nodeMatch), node]));
    const point = (node, towardRight) => {
      const r = node.getBoundingClientRect();
      return { x: (towardRight ? r.right : r.left) - boardRect.left + board.scrollLeft, y: r.top + r.height / 2 - boardRect.top + board.scrollTop };
    };
    const makePath = (fromNum, toNum, dashed=false) => {
      const from = nodeMap.get(Number(fromNum));
      const to = nodeMap.get(Number(toNum));
      if (!from || !to) return;
      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const goingRight = (fromRect.left + fromRect.width / 2) < (toRect.left + toRect.width / 2);
      const a = point(from, goingRight);
      const b = point(to, !goingRight);
      const mid = a.x + (b.x - a.x) * 0.5;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} H ${mid.toFixed(1)} V ${b.y.toFixed(1)} H ${b.x.toFixed(1)}`);
      path.setAttribute('class', `bracket-edge ${dashed ? 'dashed' : ''} ${toNum === 104 ? 'to-final' : ''}`);
      svg.appendChild(path);
    };
    HOURGLASS_EDGES.forEach(([a,b]) => makePath(a,b,false));
    HOURGLASS_DASHED_EDGES.forEach(([a,b]) => makePath(a,b,true));
  }

  function renderGroupFixtures() {
    const matches = decoratedMatches();
    $('groupFixtures').innerHTML = GROUPS.map(g => {
      const games = matches.filter(m => m.stage === 'Group Stage' && m.group === g).sort(sortByKickoff);
      const teams = Object.entries(WC_DATA.teams || {}).filter(([, info]) => info.group === g).map(([name]) => `<span class="tiny">${flagMarkup(name)} ${escapeHtml(displayTeamName(name))}</span>`).join('');
      return `<article class="group-fixture-card"><h3><span>Group ${g}</span><span class="pill">${games.length} matches</span></h3><div class="badge-row">${teams}</div><div class="fixture-stack">${games.map(fixtureMiniCard).join('')}</div></article>`;
    }).join('');
  }
  function renderGroups() {
    const standings = computeStandings(WC_DATA.matches);
    const thirdRows = computeThirdPlaces(standings);
    $('groupsGrid').innerHTML = GROUPS.map(g => `
      <div class="panel group-card"><h3><span>Group ${g}</span><span class="pill">${groupIsComplete(g) ? 'Complete' : 'In play'}</span></h3>
        <div class="table-scroll"><table class="standings-table"><thead><tr><th>Team / Status</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>
          ${standings[g].map(t => { const [klass,label] = standingsStatus(t, thirdRows); return `<tr><td><div class="standings-team">${teamButton(t.name)}<span class="tiny ${klass}">${escapeHtml(label)}</span></div></td><td>${t.P}</td><td>${t.W}</td><td>${t.D}</td><td>${t.L}</td><td>${t.GF}</td><td>${t.GA}</td><td>${t.GD}</td><td><b>${t.Pts}</b></td></tr>`; }).join('')}
        </tbody></table></div>
      </div>`).join('');
  }
  function renderThirdPlace() {
    const rows = computeThirdPlaces();
    $('thirdPlaceTable').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Rank</th><th>Team</th><th>Group</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Status</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r.thirdRank}</td><td><div class="team-cell">${teamButton(r.name)}</div></td><td>${r.group}</td><td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td><td>${r.GF}</td><td>${r.GA}</td><td>${r.GD}</td><td><b>${r.Pts}</b></td><td><span class="tiny ${r.statusClass}">${escapeHtml(r.status)}</span></td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function renderTeamExplorer() {
    const team = state.selectedTeam;
    const teams = Object.keys(WC_DATA.teams || {}).sort((a,b) => displayTeamName(a).localeCompare(displayTeamName(b)));
    if (!team || !isCountry(team)) {
      $('teamExplorer').innerHTML = `<p class="fine-print" style="margin-bottom:12px">Choose a team below or click a country anywhere on the page.</p><div class="team-grid">${teams.map(name => teamButton(name)).join('')}</div>`;
      return;
    }
    const standings = computeStandings();
    const info = teamInfo(team);
    const group = info.group;
    const row = standings[group]?.find(t => t.name === canonical(team));
    const teamMatches = decoratedMatches().filter(m => canonical(m.home) === canonical(team) || canonical(m.away) === canonical(team)).sort(sortByKickoff);
    const possible = possiblePathForTeam(team, row);
    $('teamExplorer').innerHTML = `<div class="team-summary-grid">
      <div class="team-focus-card"><h3><span>${flagMarkup(team)} ${escapeHtml(displayTeamName(team))}</span><button class="secondary clear-team" type="button">Clear</button></h3>
        <p>Group ${escapeHtml(group || '—')} · Current rank: ${row ? row.rank : '—'} · Record: ${row ? `${row.W}-${row.D}-${row.L}` : '—'} · Points: ${row ? row.Pts : '—'}</p>
        <div class="badge-row">${row ? `<span class="tiny">GF ${row.GF}</span><span class="tiny">GA ${row.GA}</span><span class="tiny">GD ${row.GD}</span>` : ''}</div>
        <h3 style="margin-top:16px">Possible knockout path</h3>
        <div class="fixture-stack">${possible.length ? possible.map(m => fixtureMiniCard(m)).join('') : '<p class="fine-print">No automatic path is available yet. It will appear once group placement or knockout advancement is known.</p>'}</div>
      </div>
      <div class="team-focus-card"><h3>Matches</h3><div class="fixture-stack">${teamMatches.length ? teamMatches.map(m => fixtureMiniCard(m)).join('') : '<p class="fine-print">No matches found for this team.</p>'}</div></div>
    </div>`;
  }
  function possiblePathForTeam(team, row) {
    if (!row) return [];
    const group = row.group;
    const labels = [];
    if (row.rank === 1) labels.push(`Winner Group ${group}`);
    if (row.rank === 2) labels.push(`Runner-up Group ${group}`);
    if (row.rank === 3) labels.push('3rd Group');
    return WC_DATA.matches.filter(m => m.stage === 'Round of 32' && labels.some(label => {
      if (label === '3rd Group') return String(m.home).includes(`3rd Group`) && String(m.home).includes(group) || String(m.away).includes(`3rd Group`) && String(m.away).includes(group);
      return m.home === label || m.away === label;
    })).sort(sortByKickoff);
  }

  function populateFilters() {
    const matches = WC_DATA.matches;
    const current = {
      stage: $('stageFilter')?.value || 'all', group: $('groupFilter')?.value || 'all', date: $('dateFilter')?.value || 'all',
      venue: state.selectedVenue, team: state.matchTeam, focusTeam: state.selectedTeam
    };
    $('stageFilter').innerHTML = '<option value="all">All stages</option>' + STAGES.map(s => `<option value="${escapeAttr(s)}">${escapeHtml(s)}</option>`).join('');
    $('groupFilter').innerHTML = '<option value="all">All groups</option>' + GROUPS.map(g => `<option value="${g}">Group ${g}</option>`).join('');
    const dates = [...new Set(matches.map(m => m.pdt?.date).filter(Boolean))].sort();
    $('dateFilter').innerHTML = '<option value="all">All dates</option>' + dates.map(d => `<option value="${d}">${escapeHtml(fullDateLabel(d))}</option>`).join('');
    const venues = [...new Set(matches.map(m => m.venue).filter(Boolean))].sort();
    if ($('venueFilter')) $('venueFilter').innerHTML = '<option value="all">All venues</option>' + venues.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join('');
    const teams = Object.keys(WC_DATA.teams || {}).sort((a,b) => displayTeamName(a).localeCompare(displayTeamName(b)));
    const teamOptions = teams.map(t => `<option value="${escapeAttr(t)}">${escapeHtml(displayTeamName(t))}</option>`).join('');
    if ($('teamFocusFilter')) $('teamFocusFilter').innerHTML = '<option value="">All teams</option>' + teamOptions;
    if ($('matchTeamFilter')) $('matchTeamFilter').innerHTML = '<option value="all">All teams</option>' + teamOptions;
    $('stageFilter').value = [...$('stageFilter').options].some(o => o.value === current.stage) ? current.stage : 'all';
    $('groupFilter').value = [...$('groupFilter').options].some(o => o.value === current.group) ? current.group : 'all';
    $('dateFilter').value = [...$('dateFilter').options].some(o => o.value === current.date) ? current.date : 'all';
    if ($('venueFilter')) $('venueFilter').value = [...$('venueFilter').options].some(o => o.value === current.venue) ? current.venue : 'all';
    if ($('teamFocusFilter')) $('teamFocusFilter').value = state.selectedTeam || '';
    if ($('matchTeamFilter')) $('matchTeamFilter').value = [...$('matchTeamFilter').options].some(o => o.value === state.matchTeam) ? state.matchTeam : 'all';
    $('timeMode').value = state.timeMode;
    $('quickFilters').innerHTML = QUICK_FILTERS.map(([value,label]) => `<button class="quick-filter ${state.quickFilter === value ? 'active' : ''}" type="button" data-quick="${value}">${escapeHtml(label)}</button>`).join('');
    const spoilerBtn = $('spoilerBtn');
    spoilerBtn.textContent = state.hideScores ? 'Show scores' : 'Hide scores';
    spoilerBtn.setAttribute('aria-pressed', state.hideScores ? 'true' : 'false');
  }
  function quickDateFor(value) {
    if (value === 'today') return todayKeyPT();
    if (value === 'tomorrow') return addDateKey(todayKeyPT(), 1);
    if (value === 'next') return snapshotTargetDate();
    return null;
  }
  function filterMatches(matches) {
    const q = ($('search')?.value || '').trim().toLowerCase();
    const stage = $('stageFilter')?.value || 'all';
    const group = $('groupFilter')?.value || 'all';
    const date = state.quickFilter !== 'all' ? 'all' : ($('dateFilter')?.value || 'all');
    const venue = state.selectedVenue || 'all';
    const quickDate = quickDateFor(state.quickFilter);
    return matches.filter(m => {
      const text = `${displayTeamName(m.home)} ${displayTeamName(m.away)} ${m.venue || ''} ${m.stage || ''} ${m.group || ''} ${m.pdt?.dateLabel || ''}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (stage !== 'all' && m.stage !== stage) return false;
      if (group !== 'all' && m.group !== group) return false;
      if (date !== 'all' && m.pdt?.date !== date) return false;
      if (quickDate && m.pdt?.date !== quickDate) return false;
      if (venue !== 'all' && m.venue !== venue) return false;
      if (state.matchTeam && state.matchTeam !== 'all' && canonical(m.home) !== canonical(state.matchTeam) && canonical(m.away) !== canonical(state.matchTeam)) return false;
      if (state.quickFilter === 'upcoming' && m.status === 'final') return false;
      if (state.quickFilter === 'completed' && m.status !== 'final') return false;
      return true;
    });
  }
  function renderMatches() {
    const matches = decoratedMatches();
    const filtered = filterMatches(matches).sort(sortByKickoff);
    const activeBits = [];
    if (state.quickFilter !== 'all') activeBits.push(QUICK_FILTERS.find(([v]) => v === state.quickFilter)?.[1]);
    if (state.matchTeam && state.matchTeam !== 'all') activeBits.push(`Team: ${displayTeamName(state.matchTeam)}`);
    if (state.selectedVenue !== 'all') activeBits.push(`Venue: ${state.selectedVenue}`);
    $('activeFilterLine').innerHTML = activeBits.length ? `Active filters: ${activeBits.map(escapeHtml).join(' · ')} <button class="secondary" type="button" id="clearFiltersBtn">Clear filters</button>` : '';
    if (!filtered.length) { $('matchList').innerHTML = '<p class="fine-print">No matches match the selected filters.</p>'; return; }
    const byDate = new Map();
    filtered.forEach(m => { const k = m.pdt?.date || 'unscheduled'; if (!byDate.has(k)) byDate.set(k, []); byDate.get(k).push(m); });
    $('matchList').innerHTML = [...byDate.entries()].map(([date, ms]) => {
      const groups = [...new Set(ms.map(m => m.group ? `Group ${m.group}` : m.stage))].join(' · ');
      return `<section class="match-day" aria-label="${escapeAttr(fullDateLabel(date))}"><div class="day-head"><h3>${escapeHtml(fullDateLabel(date))}</h3><span class="pill">${ms.length} match${ms.length === 1 ? '' : 'es'} · ${escapeHtml(groups)}</span></div><div class="day-grid">${ms.map(m => matchCard(m)).join('')}</div></section>`;
    }).join('');
  }
  function renderVenues() {
    if (!$('venueView')) return;
    const matches = decoratedMatches();
    const selected = state.selectedVenue || 'all';
    if (selected !== 'all') {
      const ms = matches.filter(m => m.venue === selected).sort(sortByKickoff);
      $('venueView').innerHTML = `<div class="venue-card"><h3>${escapeHtml(selected)}<span class="pill">${ms.length} matches</span></h3><div class="fixture-stack">${ms.map(fixtureMiniCard).join('')}</div></div>`;
      return;
    }
    const venues = [...new Set(matches.map(m => m.venue).filter(Boolean))].sort();
    $('venueView').innerHTML = `<div class="venue-grid">${venues.map(v => {
      const ms = matches.filter(m => m.venue === v).sort(sortByKickoff);
      const next = ms.find(m => m.status !== 'final') || ms[0];
      return `<article class="venue-card"><h3>${escapeHtml(v)}<span class="pill">${ms.length}</span></h3><p>${next ? `Next/listed: M${next.number} · ${escapeHtml(displayTeamName(next.home))} vs ${escapeHtml(displayTeamName(next.away))} · ${escapeHtml(formatKickoff(next))}` : ''}</p><button class="secondary venue-link" type="button" data-venue="${escapeAttr(v)}">Show venue matches</button></article>`;
    }).join('')}</div>`;
  }

  function renderAutomation() {
    const validation = WC_DATA.validation || validateData(WC_DATA);
    const active = activeMatchesForNow();
    const cards = [
      ['Nightly snapshot', '10:30 PM PDT daily during the tournament', 'Configured'],
      ['Match-window polling', 'GitHub Actions checks about every 10 minutes during active windows', 'Configured'],
      ['Browser refresh', `${WC_DATA.liveRefresh?.browserPollSeconds || 60} seconds while this page is open during live windows`, 'Configured'],
      ['Deploy rule', 'Scheduled publishes only when worldcup-data.json changes', 'Configured'],
      ['Active windows now', `${active.length} match${active.length === 1 ? '' : 'es'}`, active.length ? 'Watching' : 'Idle'],
      ['Next nightly update', nextNightlyUpdateLabel(), 'PDT'],
      ['Static cutoff', formatCutoff(), isPastStaticCutoff() ? 'Reached' : 'Pending'],
      ['Data validation', validation.ok ? 'Passed' : `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`, validation.ok ? 'OK' : 'Check']
    ];
    $('updateStatusBox').innerHTML = cards.map(([title,desc,badge]) => `<div class="status-card"><b>${escapeHtml(title)}</b><span>${escapeHtml(desc)}</span><div class="badge-row"><span class="tiny ${badge === 'OK' || badge === 'Configured' ? 'qualified' : ''}">${escapeHtml(badge)}</span></div></div>`).join('');
    renderChanges();
  }
  function renderChanges() {
    const changes = (WC_DATA.recentChanges || []).slice(0, 12);
    $('changesList').innerHTML = changes.length
      ? `<div class="change-list">${changes.map(ch => `<div class="change-item"><b>${escapeHtml(ch.time || 'Update')}</b><br>${escapeHtml(ch.text || ch.summary || String(ch))}</div>`).join('')}</div>`
      : '<p class="fine-print">No score/status changes have been recorded yet. This will populate after live or scheduled updates detect changes.</p>';
  }
  function renderImplemented() {
    const features = WC_DATA.implementedFeatures || WC_DATA.improvementRoadmap || [];
    const scoreRules = WC_DATA.scoreUpdateBehavior || [];
    $('implementedList').innerHTML = `<h3 style="margin:0">20 implemented HTML improvements</h3><div class="feature-grid">${features.map(item => `<article class="feature-card"><h3><span>${Number(item.number)}. ${escapeHtml(item.title)}</span><span class="tiny qualified">Implemented</span></h3><p>${escapeHtml(item.implementedAs || item.summary || '')}</p></article>`).join('')}</div><h3>4 score-update behaviors</h3><div class="feature-grid">${scoreRules.map(item => `<article class="feature-card"><h3><span>${Number(item.number)}. ${escapeHtml(item.title)}</span><span class="tiny qualified">Configured</span></h3><p>${escapeHtml(item.summary || '')}</p></article>`).join('')}</div>`;
  }
  function renderSources() {
    const last = WC_DATA.lastSuccessfulUpdate || WC_DATA.lastUpdated || 'Last checked time is stored after updates.';
    $('sourcesList').innerHTML = (WC_DATA.sources || []).map(s => `<div class="source"><a href="${escapeAttr(s.url)}" target="_blank" rel="noreferrer">${escapeHtml(s.label)}</a><p>Used by the schedule/results snapshot. Last tracker update: ${escapeHtml(last)}</p></div>`).join('');
  }

  function validateData(data) {
    const errors = [], warnings = [];
    const matches = data?.matches || [];
    if (matches.length !== 104) errors.push(`Expected 104 matches, found ${matches.length}.`);
    const nums = new Set();
    matches.forEach(m => {
      if (nums.has(m.number)) errors.push(`Duplicate match number ${m.number}.`); else nums.add(m.number);
      if (!m.pdt?.date || !m.pdt?.iso || !m.pdt?.time) errors.push(`Match ${m.number} is missing PDT date/time data.`);
      if (!m.venue) errors.push(`Match ${m.number} is missing a venue.`);
      if (m.status === 'final' && !hasScore(m)) errors.push(`Match ${m.number} is final but missing a score.`);
      if (m.status === 'scheduled' && hasScore(m)) warnings.push(`Match ${m.number} is scheduled but already has a score.`);
      ['home','away'].forEach(side => {
        const name = canonical(m[side]);
        if (isCountry(name)) {
          const info = data.teams[name];
          if (!info.flag && !info.flagCode && !TEAM_FLAG_CODES[name]) warnings.push(`${name} is missing a flag mapping.`);
        }
      });
    });
    const snapshot = data.snapshotDate;
    if (snapshot && !matches.some(m => m.pdt?.date === snapshot)) warnings.push(`Snapshot date ${snapshot} has no matches.`);
    return { ok: errors.length === 0, errors, warnings };
  }
  function renderDataStatus() {
    const pill = $('dataStatus');
    if (!pill || !WC_DATA) return;
    const validation = WC_DATA.validation || validateData(WC_DATA);
    const active = activeMatchesForNow();
    pill.classList.remove('green','warn','red');
    if (isPastStaticCutoff()) { pill.textContent = 'Static final'; pill.classList.add('warn'); }
    else if (!validation.ok) { pill.textContent = 'Validation issue'; pill.classList.add('red'); }
    else if (active.length) { pill.textContent = `Live watch · ${active.length}`; pill.classList.add('green'); }
    else { pill.textContent = 'Snapshot loaded'; pill.classList.add('green'); }
  }
  function renderAll() {
    if (!WC_DATA) return;
    populateFilters();
    renderHero();
    renderBracket();
    renderGroupFixtures();
    renderGroups();
    renderThirdPlace();
    renderTeamExplorer();
    renderVenues();
    renderMatches();
    renderAutomation();
    renderImplemented();
    renderSources();
    renderDataStatus();
  }


  function cacheBustUrl(url) {
    const sep = String(url).includes('?') ? '&' : '?';
    return `${url}${sep}_=${Date.now()}`;
  }

  async function fetchJsonWithTimeout(url, options={}, timeoutMs=10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function unwrapGames(payload) {
    if (Array.isArray(payload)) return payload;
    for (const key of ['Results','results','games','matches','data','fixtures']) {
      if (Array.isArray(payload?.[key])) return payload[key];
      if (Array.isArray(payload?.data?.[key])) return payload.data[key];
    }
    return [];
  }
  function getByPaths(obj, paths) {
    for (const path of paths) {
      let cur = obj;
      for (const p of path.split('.')) cur = cur?.[p];
      if (cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return null;
  }
  function localizedName(value) {
    if (Array.isArray(value)) {
      const en = value.find(x => String(x?.Locale || '').toLowerCase().startsWith('en')) || value[0];
      return en?.Description || en?.Value || '';
    }
    if (value && typeof value === 'object') return value.Description || value.Value || value.name || '';
    return value || '';
  }
  function fifaTeamName(team) {
    if (!team || typeof team !== 'object') return canonical(team);
    return canonical(localizedName(team.TeamName) || localizedName(team.Name) || team.ShortClubName || team.Abbreviation || team.IdCountry || '');
  }
  function fifaStatus(g, hs, as) {
    if (!('MatchStatus' in g) && !('Period' in g)) return null;
    const statusNum = Number(g.MatchStatus);
    if (statusNum === 0 && hs != null && as != null) return 'final';
    if (statusNum === 1) return 'scheduled';
    if (Number.isFinite(statusNum)) return 'live';
    const period = Number(g.Period);
    if (Number.isFinite(period) && ![0,1].includes(period)) return 'live';
    return null;
  }
  function normalizeExternalGame(g) {
    const n = Number(getByPaths(g, ['MatchNumber','number','matchNumber','match_no','gameNumber','id','match_id']));
    if ('Home' in g || 'Away' in g || 'HomeTeamScore' in g || 'AwayTeamScore' in g) {
      const hsRaw = g.HomeTeamScore ?? getByPaths(g, ['Home.Score','HomeTeam.Score']);
      const asRaw = g.AwayTeamScore ?? getByPaths(g, ['Away.Score','AwayTeam.Score']);
      const hpRaw = g.HomeTeamPenaltyScore;
      const apRaw = g.AwayTeamPenaltyScore;
      const hs = hsRaw == null ? null : Number(hsRaw);
      const as = asRaw == null ? null : Number(asRaw);
      return {
        n,
        home: fifaTeamName(g.Home || g.HomeTeam),
        away: fifaTeamName(g.Away || g.AwayTeam),
        hs: Number.isNaN(hs) ? null : hs,
        as: Number.isNaN(as) ? null : as,
        hp: hpRaw == null ? null : Number(hpRaw),
        ap: apRaw == null ? null : Number(apRaw),
        status: fifaStatus(g, hs, as) || 'scheduled'
      };
    }
    const home = canonical(String(getByPaths(g, ['home.name_en','home.name','homeTeam.name','home_team.name','team1.name','homeTeam','home_team','home','team1']) || '').trim());
    const away = canonical(String(getByPaths(g, ['away.name_en','away.name','awayTeam.name','away_team.name','team2.name','awayTeam','away_team','away','team2']) || '').trim());
    const hs = getByPaths(g, ['homeScore','home_score','score.home','home.score','goalsHome','team1_score','score1']);
    const as = getByPaths(g, ['awayScore','away_score','score.away','away.score','goalsAway','team2_score','score2']);
    const hp = getByPaths(g, ['homePenalties','home_penalties','penalties.home','home.penalties','penalty.home','score.penalties.home']);
    const ap = getByPaths(g, ['awayPenalties','away_penalties','penalties.away','away.penalties','penalty.away','score.penalties.away']);
    const statusRaw = String(getByPaths(g, ['status','match_status','state','status.short','status.long']) || '').toLowerCase();
    const status = statusRaw.includes('finish') || statusRaw.includes('final') || statusRaw.includes('complete') || ['ft','aet','pen'].includes(statusRaw) ? 'final' : (statusRaw.includes('live') || statusRaw.includes('progress') || statusRaw.includes('half') ? 'live' : 'scheduled');
    return { n, home, away, hs: hs == null ? null : Number(hs), as: as == null ? null : Number(as), hp: hp == null ? null : Number(hp), ap: ap == null ? null : Number(ap), status };
  }
  function liveEndpoints() {
    const defaults = ['https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=500&language=en'];
    const configured = Array.isArray(WC_DATA?.apiEndpoints) ? WC_DATA.apiEndpoints : [];
    if (WC_DATA?.apiEndpoint) configured.unshift(WC_DATA.apiEndpoint);
    const out = [];
    [...defaults, ...configured, 'worldcup-data.json', 'https://worldcup26.ir/get/games'].forEach(url => { if (url && !out.includes(url)) out.push(url); });
    return out;
  }
  async function fetchLiveGames() {
    let lastError = null;
    for (const endpoint of liveEndpoints()) {
      try {
        const games = unwrapGames(await fetchJsonWithTimeout(cacheBustUrl(endpoint), { cache: 'no-store' }, 12000)).map(normalizeExternalGame).filter(g => g.home && g.away);
        if (games.length) return { games, endpoint };
        lastError = new Error(`${endpoint} returned no usable games`);
      } catch (err) {
        lastError = err;
        console.warn('Live score source failed:', endpoint, err);
      }
    }
    throw lastError || new Error('No live score source returned usable matches.');
  }
  function pairMatchesExternal(match, game) {
    const mh = canonical(match.home), ma = canonical(match.away), gh = canonical(game.home), ga = canonical(game.away);
    return Boolean(gh && ga && ((mh === gh && ma === ga) || (mh === ga && ma === gh)));
  }
  function findExternalTarget(game) {
    const byPair = WC_DATA.matches.find(m => pairMatchesExternal(m, game));
    if (byPair) return byPair;
    if (game.n && (!game.home || !game.away)) return WC_DATA.matches.find(m => Number(m.number) === Number(game.n)) || null;
    return null;
  }
  function staticCutoffDate() {
    const configured = WC_DATA?.staticAfter || WC_DATA?.liveRefresh?.staticAfter;
    const parsed = configured ? new Date(configured) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
    const starts = (WC_DATA?.matches || []).map(m => new Date(m.pdt?.iso)).filter(d => !Number.isNaN(d.getTime())).sort((a,b) => a - b);
    return starts.length ? new Date(starts.at(-1).getTime() + 24*60*60*1000) : null;
  }
  function isPastStaticCutoff(now = new Date()) { const cutoff = staticCutoffDate(); return Boolean(cutoff && now >= cutoff); }
  function liveWindowMinutes(match) { return match.stage === 'Group Stage' ? (WC_DATA.liveRefresh?.groupStageWindowMinutes || 720) : (WC_DATA.liveRefresh?.knockoutWindowMinutes || 720); }
  function expectedFinalMinutes(match) { return match.stage === 'Group Stage' ? (WC_DATA.liveRefresh?.groupStageExpectedFinalMinutes || 165) : (WC_DATA.liveRefresh?.knockoutExpectedFinalMinutes || 330); }
  function isInLiveWindow(match, now = new Date()) {
    const kickoff = new Date(match.pdt?.iso);
    if (Number.isNaN(kickoff.getTime())) return false;
    const before = (WC_DATA.liveRefresh?.startMinutesBeforeKickoff || 15) * 60 * 1000;
    return now >= new Date(kickoff.getTime() - before) && now <= new Date(kickoff.getTime() + liveWindowMinutes(match) * 60 * 1000);
  }
  function activeMatchesForNow(now = new Date()) { return WC_DATA && !isPastStaticCutoff(now) ? WC_DATA.matches.filter(m => isInLiveWindow(m, now)) : []; }
  function inferExternalStatus(game, target) {
    if (game.status === 'final' || game.status === 'live') return game.status;
    if (game.hs != null && game.as != null) {
      const kickoff = new Date(target.pdt?.iso);
      if (!Number.isNaN(kickoff.getTime()) && new Date() >= new Date(kickoff.getTime() + expectedFinalMinutes(target) * 60 * 1000)) return 'final';
      return isInLiveWindow(target) ? 'live' : (target.status || 'scheduled');
    }
    return target.status || 'scheduled';
  }
  async function tryLiveRefresh(manual=false, silent=false) {
    if (!WC_DATA) return 0;
    if (isPastStaticCutoff()) { renderDataStatus(); if (manual) toast('Refreshes are stopped. The site is static after the final cutoff.'); return 0; }
    if (!manual && !activeMatchesForNow().length) { renderDataStatus(); return 0; }
    const { games, endpoint } = await fetchLiveGames();
    WC_DATA.apiEndpoint = endpoint;
    let changed = 0;
    const changes = [];
    games.forEach(g => {
      if (!g.home || !g.away) return;
      const target = findExternalTarget(g);
      if (!target) return;
      const reversed = canonical(target.home) === g.away && canonical(target.away) === g.home;
      const newHomeScore = reversed ? g.as : g.hs;
      const newAwayScore = reversed ? g.hs : g.as;
      const newHomePen = reversed ? g.ap : g.hp;
      const newAwayPen = reversed ? g.hp : g.ap;
      const updates = {};
      if (!isCountry(target.home) && isCountry(reversed ? g.away : g.home)) updates.home = reversed ? g.away : g.home;
      if (!isCountry(target.away) && isCountry(reversed ? g.home : g.away)) updates.away = reversed ? g.home : g.away;
      if (newHomeScore != null && newAwayScore != null && !Number.isNaN(newHomeScore) && !Number.isNaN(newAwayScore)) {
        updates.homeScore = newHomeScore; updates.awayScore = newAwayScore; updates.status = inferExternalStatus(g, target);
      } else if (g.status === 'live' && target.status !== 'final') updates.status = 'live';
      if (newHomePen != null && !Number.isNaN(newHomePen)) updates.homePenalties = newHomePen;
      if (newAwayPen != null && !Number.isNaN(newAwayPen)) updates.awayPenalties = newAwayPen;
      const before = `${displayTeamName(target.home)} ${target.homeScore ?? '—'}-${target.awayScore ?? '—'} ${displayTeamName(target.away)} (${target.status})`;
      Object.entries(updates).forEach(([key, value]) => { if (target[key] !== value) { target[key] = value; changed++; } });
      if (Object.keys(updates).length) {
        const after = `${displayTeamName(target.home)} ${target.homeScore ?? '—'}-${target.awayScore ?? '—'} ${displayTeamName(target.away)} (${target.status})`;
        if (before !== after) changes.push({ time: new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles', dateStyle:'medium', timeStyle:'short' }) + ' PDT', text: `M${target.number}: ${after}` });
      }
    });
    if (changed || manual) {
      WC_DATA.lastUpdated = `Browser FIFA refresh: ${new Date().toLocaleString('en-US', { timeZone:'America/Los_Angeles', dateStyle:'medium', timeStyle:'short' })} PDT`;
      WC_DATA.snapshotDate = firstMatchDateOnOrAfter(snapshotBaseDate(new Date()), WC_DATA.matches);
      WC_DATA.recentChanges = [...changes, ...(WC_DATA.recentChanges || [])].slice(0, 20);
      try { localStorage.setItem('wc2026-data', JSON.stringify(WC_DATA)); } catch {}
      renderAll();
    } else renderDataStatus();
    if (manual) toast(changed ? `Live refresh complete: ${changed} field update${changed === 1 ? '' : 's'} applied.` : 'Live refresh reached the API, but no score changes were detected.');
    else if (changed && !silent) toast(`Live score update: ${changed} field change${changed === 1 ? '' : 's'} applied.`);
    return changed;
  }
  function setupBrowserLivePolling() {
    if (!WC_DATA) return;
    const intervalMs = (WC_DATA.liveRefresh?.browserPollSeconds || 60) * 1000;
    async function tick() {
      renderDataStatus();
      if (isPastStaticCutoff()) { if (browserLiveTimer) clearInterval(browserLiveTimer); browserLiveTimer = null; return; }
      if (!activeMatchesForNow().length) return;
      try { await tryLiveRefresh(false, true); } catch (err) { console.warn('Browser live refresh failed:', err); }
    }
    tick();
    if (browserLiveTimer) clearInterval(browserLiveTimer);
    browserLiveTimer = setInterval(tick, intervalMs);
  }

  function nextNightlyUpdateLabel() {
    const now = new Date();
    const p = pacificParts(now);
    let key = `${p.year}-${p.month}-${p.day}`;
    if (Number(p.hour) > 22 || (Number(p.hour) === 22 && Number(p.minute) >= 30)) key = addDateKey(key, 1);
    return `${fullDateLabel(key)} at 10:30 PM PDT`;
  }
  function formatCutoff() {
    const cutoff = staticCutoffDate();
    return cutoff ? `${formatDateTime(cutoff, 'America/Los_Angeles')} cutoff` : 'Not configured';
  }
  function snapshotText() {
    const snap = snapshotMatches();
    const lines = [`World Cup matches for ${fullDateLabel(snap.date)}`, ''];
    snap.matches.forEach(m => lines.push(`${formatKickoff(m)} - M${m.number}: ${displayTeamName(m.home)} vs ${displayTeamName(m.away)} - ${m.venue}`));
    return lines.join('\n');
  }
  async function copyText(text, success) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast(success);
    } catch { toast('Copy failed.'); }
  }
  function downloadCalendar() {
    const snap = snapshotMatches();
    const dt = d => d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const events = snap.matches.map(m => {
      const start = new Date(m.pdt.iso);
      const end = new Date(start.getTime() + 2*60*60*1000);
      return ['BEGIN:VEVENT', `UID:wc2026-m${m.number}@bracket`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(start)}`, `DTEND:${dt(end)}`, `SUMMARY:World Cup M${m.number}: ${displayTeamName(m.home)} vs ${displayTeamName(m.away)}`, `LOCATION:${String(m.venue || '').replace(/,/g,'\\,')}`, `DESCRIPTION:${m.stage}${m.group ? ' Group ' + m.group : ''}`, 'END:VEVENT'].join('\r\n');
    }).join('\r\n');
    const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//World Cup 2026 Bracket//EN',events,'END:VCALENDAR'].join('\r\n');
    const blob = new Blob([ics], { type:'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `world-cup-2026-${snap.date || 'matches'}.ics`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    toast('Calendar file created for the snapshot matchday.');
  }
  function printView(mode) {
    document.body.classList.remove('print-bracket','print-snapshot','print-standings');
    if (mode && mode !== 'all') document.body.classList.add(`print-${mode}`);
    setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('print-bracket','print-snapshot','print-standings'), 250); }, 20);
  }
  function clearAllFilters() {
    state.quickFilter = 'all'; state.matchTeam = 'all'; state.selectedVenue = 'all';
    $('search').value = ''; $('stageFilter').value = 'all'; $('groupFilter').value = 'all'; $('dateFilter').value = 'all';
    if ($('matchTeamFilter')) $('matchTeamFilter').value = 'all';
    if ($('venueFilter')) $('venueFilter').value = 'all';
    renderAll();
  }
  function toast(msg) { const t = $('toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4600); }

  function wireEvents() {
    document.addEventListener('click', ev => {
      const teamBtn = ev.target.closest('.team-link');
      if (teamBtn) { state.selectedTeam = teamBtn.dataset.team || ''; localStorage.setItem('wc2026-selected-team', state.selectedTeam); renderAll(); location.hash = '#teams'; return; }
      const quick = ev.target.closest('.quick-filter');
      if (quick) { state.quickFilter = quick.dataset.quick || 'all'; renderAll(); return; }
      const round = ev.target.closest('.round-tab');
      if (round) { state.activeRound = round.dataset.round || 'all'; localStorage.setItem('wc2026-active-round', state.activeRound); renderAll(); return; }
      const venue = ev.target.closest('.venue-link');
      if (venue) { state.selectedVenue = venue.dataset.venue || 'all'; renderAll(); location.hash = '#matches'; return; }
      if (ev.target.closest('.clear-team')) { state.selectedTeam = ''; localStorage.removeItem('wc2026-selected-team'); renderAll(); return; }
      if (ev.target.id === 'clearFiltersBtn') { clearAllFilters(); return; }
      const print = ev.target.closest('[data-print]');
      if (print) { printView(print.dataset.print); return; }
    });
    $('refreshBtn').addEventListener('click', () => tryLiveRefresh(true).catch(err => toast('Live refresh failed: ' + err.message)));
    $('copySnapshotBtn').addEventListener('click', () => copyText(snapshotText(), 'Snapshot copied.'));
    $('copyLinkBtn').addEventListener('click', () => copyText(location.href.split('#')[0], 'Bracket link copied.'));
    $('downloadCalendarBtn').addEventListener('click', downloadCalendar);
    $('spoilerBtn').addEventListener('click', () => { state.hideScores = !state.hideScores; localStorage.setItem('wc2026-hide-scores', state.hideScores ? '1' : '0'); document.body.classList.toggle('spoilers-hidden', state.hideScores); renderAll(); });
    $('timeMode').addEventListener('change', ev => { state.timeMode = ev.target.value; localStorage.setItem('wc2026-time-mode', state.timeMode); renderAll(); });
    if ($('teamFocusFilter')) $('teamFocusFilter').addEventListener('change', ev => { state.selectedTeam = ev.target.value; state.selectedTeam ? localStorage.setItem('wc2026-selected-team', state.selectedTeam) : localStorage.removeItem('wc2026-selected-team'); renderAll(); });
    if ($('matchTeamFilter')) $('matchTeamFilter').addEventListener('change', ev => { state.matchTeam = ev.target.value || 'all'; renderMatches(); renderVenues(); renderDataStatus(); populateFilters(); });
    if ($('venueFilter')) $('venueFilter').addEventListener('change', ev => { state.selectedVenue = ev.target.value || 'all'; renderMatches(); renderVenues(); renderDataStatus(); populateFilters(); });
    ['search','stageFilter','groupFilter','dateFilter'].forEach(id => { const el = $(id); if (!el) return; el.addEventListener(id === 'search' ? 'input' : 'change', () => { if (id === 'dateFilter') state.quickFilter = 'all'; renderMatches(); renderVenues(); renderDataStatus(); populateFilters(); }); });
    window.addEventListener('resize', () => { if (state.activeRound === 'all') requestAnimationFrame(drawBracketLines); });
  }

  async function init() {
    wireEvents();
    EMBEDDED_DATA = parseEmbeddedData();
    const stored = (() => { try { return JSON.parse(localStorage.getItem('wc2026-data') || 'null'); } catch { return null; } })();
    if (EMBEDDED_DATA?.matches?.length) { setData(stored?.matches?.length ? stored : EMBEDDED_DATA); renderAll(); setupBrowserLivePolling(); }
    try {
      const data = await fetchJsonWithTimeout(`worldcup-data.json?_=${Date.now()}`, { cache:'no-store' }, 6000);
      if (data?.matches?.length) { setData(data); renderAll(); setupBrowserLivePolling(); }
    } catch (err) {
      if (!WC_DATA) {
        $('dataStatus').textContent = 'Data failed'; $('dataStatus').classList.add('red');
        $('nextMatch').innerHTML = `<p class="fine-print">Could not load worldcup-data.json. Use the bundled standalone HTML or publish through GitHub Pages.</p>`;
      } else {
        console.warn('Using embedded/local data because worldcup-data.json could not be fetched:', err);
      }
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
