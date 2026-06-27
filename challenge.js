
// ============================================================
// BRACKET CHALLENGE — Supabase-backed prediction game
// ============================================================

const CHALLENGE = (() => {
  'use strict';

  const SUPABASE_URL = 'https://phdzpfkejiomgnajayum.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoZHpwZmtlamlvbWduYWpheXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDc5MDQsImV4cCI6MjA5ODA4MzkwNH0.co4K-fPwLxPTN084-Tbh1qDuA6u-rd-xh8hOR6KyTuU';

  // Bracket match progression tree
  const BRACKET_STAGES = [
    { stage: 'Round of 32',    matches: [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88], points: 1 },
    { stage: 'Round of 16',    matches: [89,90,91,92,93,94,95,96],                         points: 2 },
    { stage: 'Quarter-finals', matches: [97,98,99,100],                                     points: 3 },
    { stage: 'Semi-finals',    matches: [101,102],                                           points: 5 },
    { stage: 'Final',          matches: [104],                                               points: 10 },
  ];
  const ALL_BRACKET_MATCHES = BRACKET_STAGES.flatMap(s => s.matches);

  // Which R32 feeds which R16, etc.
  const FEEDS_INTO = {
    74:89, 77:89,  73:90, 75:90,
    76:91, 78:91,  79:92, 80:92,
    83:93, 84:93,  81:94, 82:94,
    86:95, 88:95,  85:96, 87:96,
    89:97, 90:97,  93:98, 94:98,
    91:99, 92:99,  95:100,96:100,
    97:101,98:101, 99:102,100:102,
    101:104,102:104
  };

  // Local state
  let state = {
    playerId: localStorage.getItem('wc_challenge_player_id') || null,
    playerName: localStorage.getItem('wc_challenge_player_name') || null,
    token: localStorage.getItem('wc_challenge_token') || null,
    bracket: null,      // loaded from Supabase
    allBrackets: [],    // for leaderboard
    activeView: 'my-bracket', // 'my-bracket' | 'leaderboard' | player id
  };

  // ── Supabase helpers ──────────────────────────────────────
  async function sbFetch(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': opts.prefer || 'return=representation',
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    return data;
  }

  async function createPlayer(name) {
    const rows = await sbFetch('players', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return rows[0];
  }

  async function createBracket(playerId, playerName) {
    const rows = await sbFetch('brackets', {
      method: 'POST',
      body: JSON.stringify({ player_id: playerId, player_name: playerName, picks: {}, submitted: false, score: 0 }),
    });
    return rows[0];
  }

  async function loadMyBracket(playerId) {
    const rows = await sbFetch(`brackets?player_id=eq.${playerId}&limit=1`);
    return rows[0] || null;
  }

  async function savePicks(bracketId, picks) {
    await sbFetch(`brackets?id=eq.${bracketId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ picks }),
    });
  }

  async function submitBracket(bracketId, picks) {
    await sbFetch(`brackets?id=eq.${bracketId}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: JSON.stringify({ picks, submitted: true, submitted_at: new Date().toISOString() }),
    });
  }

  async function loadAllBrackets() {
    return await sbFetch('brackets?submitted=eq.true&order=score.desc');
  }

  // ── Match helpers (uses global WC_DATA from app.js) ───────
  function getMatch(num) {
    return window.WC_DATA?.matches?.find(m => Number(m.number) === num);
  }

  function matchKickoff(num) {
    const m = getMatch(num);
    if (!m?.pdt?.iso) return null;
    return new Date(m.pdt.iso);
  }

  function matchIsLocked(num) {
    const ko = matchKickoff(num);
    if (!ko) return false;
    return new Date() >= ko; // locked once kickoff passes
  }

  function matchIsComplete(num) {
    const m = getMatch(num);
    return m?.status === 'final' || (matchKickoff(num) && (new Date() - matchKickoff(num)) / 60000 >= 130);
  }

  function resolvedTeams(num, myPicks) {
    // Returns { home, away } with real team names resolved through the bracket
    const m = getMatch(num);
    if (!m) return { home: '?', away: '?' };

    function resolveSlot(label, picks) {
      if (!label) return '?';
      // Real team already
      if (window.WC_DATA?.teams?.[label]) return label;
      // Winner Match X — from picks or real result
      const wm = label.match(/^Winner Match (\d+)$/);
      if (wm) {
        const priorNum = Number(wm[1]);
        const priorMatch = getMatch(priorNum);
        if (priorMatch?.status === 'final') return winnerName(priorMatch);
        // Use my pick for that match
        return picks?.[priorNum] || `Winner M${priorNum}`;
      }
      // Placeholder like "Winner Group A" — resolved by app.js decoratedMatches
      const decorated = window.WC_DATA?.matches
        ? window.decoratedMatchesCache?.find?.(dm => Number(dm.number) === num)
        : null;
      return decorated ? decorated[label === m.home ? 'home' : 'away'] : label;
    }

    // Use decorated matches from app.js for group-stage placeholders
    const dm = (window._decoratedMatchesCache || []).find(x => Number(x.number) === num);
    return {
      home: dm ? dm.home : resolveSlot(m.home, myPicks),
      away: dm ? dm.away : resolveSlot(m.away, myPicks),
    };
  }

  function winnerName(match) {
    if (!match || match.status !== 'final') return null;
    if (match.homeScore > match.awayScore) return match.home;
    if (match.awayScore > match.homeScore) return match.away;
    if (match.homePenalties != null && match.awayPenalties != null) {
      if (match.homePenalties > match.awayPenalties) return match.home;
      if (match.awayPenalties > match.homePenalties) return match.away;
    }
    return null;
  }

  function pointsFor(stage) {
    return BRACKET_STAGES.find(s => s.stage === stage)?.points || 1;
  }

  function computeScore(picks, realResults) {
    let score = 0;
    for (const [numStr, predicted] of Object.entries(picks)) {
      const num = Number(numStr);
      const match = realResults.find(m => Number(m.number) === num);
      if (!match || match.status !== 'final') continue;
      const actual = winnerName(match);
      if (actual && actual === predicted) {
        score += pointsFor(match.stage);
      }
    }
    return score;
  }

  // ── Rendering ─────────────────────────────────────────────
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>'"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
  }

  function flagImg(name) {
    if (!window.WC_DATA?.teams?.[name]) return '';
    const info = window.WC_DATA.teams[name];
    const code = info.flagCode;
    if (code) return `<img src="https://flagcdn.com/w20/${escHtml(code)}.png" alt="" style="width:20px;height:14px;object-fit:cover;border-radius:2px;vertical-align:middle;margin-right:4px">`;
    return `<span style="margin-right:4px">${escHtml(info.flag || '')}</span>`;
  }

  function renderJoinForm() {
    return `
      <div class="challenge-join">
        <h3>Join the Bracket Challenge</h3>
        <p>Pick the winner of every knockout match. Lock in before each game kicks off — you can't change picks after a game starts.</p>
        <div class="challenge-form">
          <input id="challengeNameInput" type="text" placeholder="Enter your name or nickname" maxlength="30" autocomplete="off">
          <button id="challengeJoinBtn" class="challenge-btn-primary">Create my bracket →</button>
        </div>
        <p class="fine-print">Already have a bracket? <button class="link-btn" id="challengeReturnBtn">Return to my bracket</button></p>
      </div>`;
  }

  function renderReturnForm() {
    return `
      <div class="challenge-join">
        <h3>Return to your bracket</h3>
        <p>Enter the name you used when you created your bracket.</p>
        <div class="challenge-form">
          <input id="returnNameInput" type="text" placeholder="Your nickname" maxlength="30" autocomplete="off">
          <button id="returnLookupBtn" class="challenge-btn-primary">Find my bracket →</button>
        </div>
        <p class="fine-print"><button class="link-btn" id="returnCancelBtn">← Back</button></p>
      </div>`;
  }

  function renderBracketPicker(bracket, picks, submitted) {
    const dm = window._decoratedMatchesCache || [];

    let html = `<div class="challenge-bracket-header">`;
    if (submitted) {
      html += `<div class="challenge-submitted-banner">✅ Bracket submitted — picks are locked in</div>`;
    } else {
      const totalPickable = ALL_BRACKET_MATCHES.filter(n => !matchIsLocked(n)).length;
      const made = ALL_BRACKET_MATCHES.filter(n => picks[n] && !matchIsLocked(n)).length;
      html += `<div class="challenge-progress">
        <span>${made} of ${totalPickable} available picks made</span>
        <button id="challengeSubmitBtn" class="challenge-btn-primary" ${made === 0 ? 'disabled' : ''}>
          Submit bracket
        </button>
      </div>`;
    }
    html += `</div><div class="challenge-stages">`;

    for (const { stage, matches, points } of BRACKET_STAGES) {
      html += `<div class="challenge-stage">
        <div class="challenge-stage-label">${escHtml(stage)} <span class="pill">${points} pt${points > 1 ? 's' : ''}</span></div>
        <div class="challenge-match-list">`;

      for (const num of matches) {
        const m = getMatch(num);
        const dm_entry = dm.find(x => Number(x.number) === num);
        const home = dm_entry?.home || m?.home || '?';
        const away = dm_entry?.away || m?.away || '?';
        const locked = matchIsLocked(num);
        const complete = matchIsComplete(num);
        const realWinner = complete && m ? winnerName(m) : null;
        const myPick = picks[num];
        const correct = realWinner && myPick === realWinner;
        const wrong   = realWinner && myPick && myPick !== realWinner;

        const homeReal = window.WC_DATA?.teams?.[home];
        const awayReal = window.WC_DATA?.teams?.[away];

        let statusBadge = '';
        if (complete && realWinner) {
          statusBadge = `<span class="tiny final">Final</span>`;
        } else if (locked) {
          statusBadge = `<span class="tiny live">Live</span>`;
        } else {
          const ko = matchKickoff(num);
          const timeStr = ko ? ko.toLocaleString('en-US', { timeZone:'America/Los_Angeles', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' }) : '';
          statusBadge = `<span class="tiny scheduled">${escHtml(timeStr)}</span>`;
        }

        html += `<div class="challenge-match ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}" data-match="${num}">
          <div class="challenge-match-head"><span>M${num}</span>${statusBadge}</div>
          <div class="challenge-pick-row">`;

        // Home team button
        if (!homeReal) {
          html += `<div class="challenge-team-placeholder">${escHtml(home)}</div>`;
        } else if (locked || submitted) {
          const isWinner = realWinner === home;
          const isPicked = myPick === home;
          html += `<div class="challenge-team-locked ${isPicked ? 'picked' : ''} ${isWinner ? 'real-winner' : ''} ${isPicked && wrong && home === myPick ? 'wrong-pick' : ''}">
            ${flagImg(home)}<span>${escHtml(window.WC_DATA.teams[home].display || home)}</span>
            ${isPicked ? '<span class="pick-badge">Your pick</span>' : ''}
          </div>`;
        } else {
          const isPicked = myPick === home;
          html += `<button class="challenge-team-btn ${isPicked ? 'picked' : ''}" data-match="${num}" data-team="${escHtml(home)}">
            ${flagImg(home)}<span>${escHtml(window.WC_DATA.teams[home].display || home)}</span>
          </button>`;
        }

        html += `<span class="challenge-vs">vs</span>`;

        // Away team button
        if (!awayReal) {
          html += `<div class="challenge-team-placeholder">${escHtml(away)}</div>`;
        } else if (locked || submitted) {
          const isWinner = realWinner === away;
          const isPicked = myPick === away;
          html += `<div class="challenge-team-locked ${isPicked ? 'picked' : ''} ${isWinner ? 'real-winner' : ''} ${isPicked && wrong && away === myPick ? 'wrong-pick' : ''}">
            ${flagImg(away)}<span>${escHtml(window.WC_DATA.teams[away].display || away)}</span>
            ${isPicked ? '<span class="pick-badge">Your pick</span>' : ''}
          </div>`;
        } else {
          const isPicked = myPick === away;
          html += `<button class="challenge-team-btn ${isPicked ? 'picked' : ''}" data-match="${num}" data-team="${escHtml(away)}">
            ${flagImg(away)}<span>${escHtml(window.WC_DATA.teams[away].display || away)}</span>
          </button>`;
        }

        // Result indicator
        if (correct) html += `<span class="result-badge correct-badge">✅ +${pointsFor(m.stage)}pts</span>`;
        if (wrong)   html += `<span class="result-badge wrong-badge">❌</span>`;
        if (complete && !myPick) html += `<span class="result-badge missed-badge">—</span>`;

        html += `</div></div>`;
      }
      html += `</div></div>`;
    }

    html += `</div>`;
    return html;
  }

  function renderLeaderboard(allBrackets, myPlayerId, realMatches) {
    if (!allBrackets.length) {
      return `<div class="challenge-empty"><p>No submitted brackets yet. Be the first!</p></div>`;
    }

    // Recompute live scores
    const scored = allBrackets.map(b => ({
      ...b,
      liveScore: computeScore(b.picks || {}, realMatches),
    })).sort((a, b) => b.liveScore - a.liveScore);

    let html = `<div class="leaderboard">
      <div class="leaderboard-header">
        <span>Rank</span><span>Player</span><span>Score</span><span>Picks</span>
      </div>`;

    scored.forEach((b, i) => {
      const isMe = b.player_id === myPlayerId;
      const picks = b.picks || {};
      const total = ALL_BRACKET_MATCHES.filter(n => picks[n]).length;
      const correct = ALL_BRACKET_MATCHES.filter(n => {
        const m = realMatches.find(x => Number(x.number) === n);
        return m?.status === 'final' && picks[n] && winnerName(m) === picks[n];
      }).length;
      const finished = ALL_BRACKET_MATCHES.filter(n => {
        const m = realMatches.find(x => Number(x.number) === n);
        return m?.status === 'final';
      }).length;

      html += `<div class="leaderboard-row ${isMe ? 'my-row' : ''}" data-player="${escHtml(b.player_id)}">
        <span class="rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
        <span class="lb-name">${escHtml(b.player_name)}${isMe ? ' <span class="pill">You</span>' : ''}</span>
        <span class="lb-score">${b.liveScore} pts</span>
        <span class="lb-picks">${correct}/${finished} correct</span>
      </div>`;
    });

    html += `</div>`;
    return html;
  }

  function renderViewerBracket(bracket, myPlayerId, realMatches) {
    const picks = bracket.picks || {};
    const dm = window._decoratedMatchesCache || [];
    const isMe = bracket.player_id === myPlayerId;

    let html = `<div class="challenge-viewer-header">
      <h3>${escHtml(bracket.player_name)}${isMe ? "'s bracket (You)" : "'s bracket"}</h3>
      <div class="viewer-score">${computeScore(picks, realMatches)} pts</div>
    </div><div class="challenge-stages">`;

    for (const { stage, matches, points } of BRACKET_STAGES) {
      html += `<div class="challenge-stage">
        <div class="challenge-stage-label">${escHtml(stage)} <span class="pill">${points}pt${points>1?'s':''}</span></div>
        <div class="challenge-match-list">`;
      for (const num of matches) {
        const m = realMatches.find(x => Number(x.number) === num);
        const dm_entry = dm.find(x => Number(x.number) === num);
        const home = dm_entry?.home || m?.home || '?';
        const away = dm_entry?.away || m?.away || '?';
        const realWinner = (m?.status === 'final') ? winnerName(m) : null;
        const pick = picks[num];
        const correct = realWinner && pick === realWinner;
        const wrong   = realWinner && pick && pick !== realWinner;

        html += `<div class="challenge-match ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}" data-match="${num}">
          <div class="challenge-match-head"><span>M${num}</span></div>
          <div class="challenge-viewer-pick">
            <span>${pick ? `${flagImg(pick)}<b>${escHtml(window.WC_DATA?.teams?.[pick]?.display || pick)}</b>` : '<em>No pick</em>'}</span>
            ${correct ? `<span class="result-badge correct-badge">✅ +${pointsFor(m.stage)}pts</span>` : ''}
            ${wrong   ? `<span class="result-badge wrong-badge">❌ ${flagImg(realWinner)}<span>${escHtml(window.WC_DATA?.teams?.[realWinner]?.display || realWinner)}</span></span>` : ''}
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    return html;
  }

  // ── Main render orchestrator ───────────────────────────────
  async function render() {
    const root = document.getElementById('challengeRoot');
    if (!root) return;

    // Cache decorated matches from app.js
    if (window.decoratedMatches) {
      window._decoratedMatchesCache = window.decoratedMatches();
    }

    const realMatches = window.WC_DATA?.matches || [];

    // Not joined yet
    if (!state.playerId) {
      root.innerHTML = renderJoinForm();
      wireJoinForm();
      return;
    }

    // Load bracket if not cached
    if (!state.bracket) {
      root.innerHTML = `<div class="challenge-loading">Loading your bracket…</div>`;
      try {
        state.bracket = await loadMyBracket(state.playerId);
        if (!state.bracket) {
          // Player exists but bracket wasn't created — create it
          state.bracket = await createBracket(state.playerId, state.playerName);
        }
      } catch (err) {
        root.innerHTML = `<div class="challenge-error">Error loading bracket: ${escHtml(err.message)}</div>`;
        return;
      }
    }

    // Load all submitted brackets for leaderboard
    try {
      state.allBrackets = await loadAllBrackets();
    } catch { state.allBrackets = []; }

    const picks = state.bracket.picks || {};
    const submitted = state.bracket.submitted;

    // Build tab bar
    const tabs = [
      { id: 'my-bracket', label: 'My Bracket' },
      { id: 'leaderboard', label: `Leaderboard (${state.allBrackets.length})` },
      ...state.allBrackets.filter(b => b.player_id !== state.playerId).map(b => ({
        id: b.player_id,
        label: b.player_name,
      })),
    ];

    let html = `<div class="challenge-tabs">
      ${tabs.map(t => `<button class="challenge-tab ${state.activeView === t.id ? 'active' : ''}" data-view="${escHtml(t.id)}">${escHtml(t.label)}</button>`).join('')}
    </div><div class="challenge-tab-content">`;

    if (state.activeView === 'my-bracket') {
      html += renderBracketPicker(state.bracket, picks, submitted);
    } else if (state.activeView === 'leaderboard') {
      html += renderLeaderboard(state.allBrackets, state.playerId, realMatches);
    } else {
      // Viewing another player's bracket
      const viewed = state.allBrackets.find(b => b.player_id === state.activeView);
      if (viewed) {
        html += renderViewerBracket(viewed, state.playerId, realMatches);
      } else {
        html += `<p class="fine-print">Bracket not found.</p>`;
      }
    }

    html += `</div>`;
    root.innerHTML = html;
    wireInteractions(picks, submitted);
  }

  // ── Event wiring ─────────────────────────────────────────
  function wireJoinForm() {
    const joinBtn = document.getElementById('challengeJoinBtn');
    const returnBtn = document.getElementById('challengeReturnBtn');
    const root = document.getElementById('challengeRoot');

    joinBtn?.addEventListener('click', async () => {
      const name = document.getElementById('challengeNameInput')?.value?.trim();
      if (!name) { alert('Please enter a name.'); return; }
      joinBtn.disabled = true;
      joinBtn.textContent = 'Creating…';
      try {
        const player = await createPlayer(name);
        const bracket = await createBracket(player.id, name);
        state.playerId = player.id;
        state.playerName = name;
        state.token = player.token;
        state.bracket = bracket;
        localStorage.setItem('wc_challenge_player_id', player.id);
        localStorage.setItem('wc_challenge_player_name', name);
        localStorage.setItem('wc_challenge_token', player.token);
        await render();
      } catch (err) {
        alert('Error creating bracket: ' + err.message);
        joinBtn.disabled = false;
        joinBtn.textContent = 'Create my bracket →';
      }
    });

    returnBtn?.addEventListener('click', () => {
      root.innerHTML = renderReturnForm();
      wireReturnForm();
    });
  }

  function wireReturnForm() {
    const lookupBtn = document.getElementById('returnLookupBtn');
    const cancelBtn = document.getElementById('returnCancelBtn');
    const root = document.getElementById('challengeRoot');

    lookupBtn?.addEventListener('click', async () => {
      const name = document.getElementById('returnNameInput')?.value?.trim();
      if (!name) { alert('Please enter your name.'); return; }
      lookupBtn.disabled = true;
      lookupBtn.textContent = 'Searching…';
      try {
        const rows = await sbFetch(`players?name=eq.${encodeURIComponent(name)}&limit=1`);
        if (!rows.length) { alert('No bracket found with that name.'); lookupBtn.disabled=false; lookupBtn.textContent='Find my bracket →'; return; }
        const player = rows[0];
        const bracket = await loadMyBracket(player.id);
        state.playerId = player.id;
        state.playerName = player.name;
        state.token = player.token;
        state.bracket = bracket;
        localStorage.setItem('wc_challenge_player_id', player.id);
        localStorage.setItem('wc_challenge_player_name', player.name);
        localStorage.setItem('wc_challenge_token', player.token);
        await render();
      } catch (err) {
        alert('Error: ' + err.message);
        lookupBtn.disabled = false;
        lookupBtn.textContent = 'Find my bracket →';
      }
    });

    cancelBtn?.addEventListener('click', () => render());
  }

  function wireInteractions(picks, submitted) {
    // Tab switching
    document.querySelectorAll('.challenge-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeView = btn.dataset.view;
        render();
      });
    });

    // Leaderboard row click → view that bracket
    document.querySelectorAll('.leaderboard-row[data-player]').forEach(row => {
      row.addEventListener('click', () => {
        state.activeView = row.dataset.player;
        render();
      });
    });

    if (submitted) return;

    // Pick buttons
    document.querySelectorAll('.challenge-team-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const matchNum = Number(btn.dataset.match);
        const team = btn.dataset.team;
        if (matchIsLocked(matchNum)) return;

        // Update pick
        const newPicks = { ...picks, [matchNum]: team };

        // Cascade: clear downstream picks that depended on this match
        function clearDownstream(num) {
          const next = FEEDS_INTO[num];
          if (!next) return;
          delete newPicks[next];
          clearDownstream(next);
        }
        clearDownstream(matchNum);

        // Save to Supabase
        try {
          await savePicks(state.bracket.id, newPicks);
          state.bracket.picks = newPicks;
          render();
        } catch (err) {
          alert('Error saving pick: ' + err.message);
        }
      });
    });

    // Submit button
    document.getElementById('challengeSubmitBtn')?.addEventListener('click', async () => {
      const confirmed = confirm('Submit your bracket? You will not be able to make any more changes.');
      if (!confirmed) return;
      try {
        await submitBracket(state.bracket.id, picks);
        state.bracket.submitted = true;
        await render();
      } catch (err) {
        alert('Error submitting: ' + err.message);
      }
    });
  }

  // ── Public init ────────────────────────────────────────────
  async function init() {
    // Wait for WC_DATA to be available
    let attempts = 0;
    while (!window.WC_DATA?.matches?.length && attempts < 20) {
      await new Promise(r => setTimeout(r, 300));
      attempts++;
    }
    await render();
    // Refresh scores every 60s to update correct/wrong indicators
    setInterval(async () => {
      if (state.bracket) await render();
    }, 60000);
  }

  return { init };
})();
