let scoreboard;
let roster = [];

const rows = document.getElementById('score-rows');
const bulkInput = document.getElementById('bulk-scores');
const message = document.getElementById('sync-message');

function displayMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('is-success', success);
}

function renderRoster() {
  document.getElementById('event-label').textContent = scoreboard.event || 'XBTesports Match';
  document.getElementById('roster-count').textContent = `${roster.length} Players // Fixed Entry Order`;
  rows.innerHTML = roster.map((player, index) => `
    <label class="score-row">
      <span class="slot">${String(index + 1).padStart(2, '0')}</span>
      <span class="player-name">${escapeHtml(player.gamertag || 'Unassigned')}</span>
      <span class="score-input-wrap">
        <input class="score-input" data-id="${player.id}" type="number" min="0" step="1" inputmode="numeric" value="${Number(player.eliminations) || 0}" aria-label="Eliminations for ${escapeHtml(player.gamertag || 'Unassigned')}">
        <span class="elims-label">Elims</span>
      </span>
    </label>
  `).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function scoreInputs() {
  return [...document.querySelectorAll('.score-input')];
}

function applyBulkScores() {
  const scores = bulkInput.value.trim().split(/[\s,;]+/).filter(Boolean);
  if (!scores.length) return displayMessage('Paste one score for each player first.');
  if (scores.length !== roster.length || scores.some((score) => !/^\d+$/.test(score))) {
    return displayMessage(`Enter exactly ${roster.length} whole-number scores in the displayed player order.`);
  }

  scoreInputs().forEach((input, index) => { input.value = scores[index]; });
  displayMessage('Scores applied. Review, then publish the complete result.', true);
}

function clearEntry() {
  scoreInputs().forEach((input) => { input.value = '0'; });
  bulkInput.value = '';
  displayMessage('Entry cleared locally. Nothing changed on stream.');
  scoreInputs()[0]?.focus();
}

async function publishScores() {
  const valueById = new Map(scoreInputs().map((input) => [input.dataset.id, Number(input.value) || 0]));
  const entryOrder = new Map(roster.map((player, index) => [player.id, index]));
  const players = roster.map((player) => ({ ...player, eliminations: valueById.get(player.id) || 0 }));

  // Scorepad order stays stable while entering; only the published board is ranked.
  players.sort((left, right) => right.eliminations - left.eliminations || entryOrder.get(left.id) - entryOrder.get(right.id));
  players.forEach((player, index) => { player.position = index + 1; });
  scoreboard = { ...scoreboard, players };

  const button = document.getElementById('publish-scores');
  button.disabled = true;
  button.textContent = 'Publishing...';
  displayMessage('Publishing final standings to the live overlay...');
  try {
    await XBTScoreboard.save(scoreboard);
    displayMessage('Final scores synced. The OBS overlay will update shortly.', true);
    bulkInput.value = '';
  } catch {
    displayMessage('Could not sync. Check the connection and publish again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Publish Final Scores';
  }
}

function bindInteractions() {
  document.getElementById('apply-bulk').addEventListener('click', applyBulkScores);
  bulkInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') applyBulkScores(); });
  document.getElementById('clear-scores').addEventListener('click', clearEntry);
  document.getElementById('publish-scores').addEventListener('click', publishScores);
  rows.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputs = scoreInputs();
    const next = inputs[inputs.indexOf(event.target) + 1];
    if (next) { next.focus(); next.select(); }
  });
  rows.addEventListener('focusin', (event) => { if (event.target.matches('.score-input')) event.target.select(); });
}

async function init() {
  scoreboard = await XBTScoreboard.fetch();
  roster = [...scoreboard.players].sort((left, right) => left.position - right.position);
  renderRoster();
  bindInteractions();
}

init();
