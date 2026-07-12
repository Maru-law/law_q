const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby71xzQ4WDcpNDh677BY5hZdNeiM8Y3kpo4w-2jZA81tUyFmGvr2lqIZ6DDPcSoylWFZw/exec';
let allQuestions = [], currentFilter = 'all', currentAccuracyLimit = null;
let currentSectionData = [], currentQuestionIndex = 1, currentQuestion = null, isShowingTrue = true, totalSectionQuestions = 0;
let pendingChecks = {}, pendingLogs = [], syncTimeout = null;
const views = { loading: document.getElementById('loading-view'), list: document.getElementById('list-view'), quiz: document.getElementById('quiz-view') };

document.addEventListener('DOMContentLoaded', initApp);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncUpdates(); });

async function initApp() {
  try {
    const response = await fetch(GAS_API_URL);
    if (!response.ok) throw new Error(`HTTPエラー: ${response.status}`);
    let data = JSON.parse(await response.text());
    if (!Array.isArray(data)) data = Array.isArray(data.data) ? data.data : data.items;
    if (!Array.isArray(data)) throw new Error('データ形式が正しくありません。');
    allQuestions = data.map(normalizeQuestion);
    buildFilterUI(); renderList(); switchView('list');
  } catch (error) {
    views.loading.innerHTML = `<div class="load-error"><h3>読み込みエラー</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function normalizeQuestion(question) {
  const answerCount = toNumber(question.answerCount), correctCount = toNumber(question.correctCount), incorrectCount = toNumber(question.incorrectCount);
  return { ...question, answerCount, correctCount, incorrectCount, accuracy: answerCount ? correctCount / answerCount : null, isChecked: question.isChecked === true || String(question.isChecked).toUpperCase() === 'TRUE' };
}
function toNumber(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; }
function addFilterOption(select, value, label) { const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option); }
function buildFilterUI() {
  const select = document.getElementById('question-filter'); select.innerHTML = '';
  addFilterOption(select, 'all', 'すべての問題'); addFilterOption(select, 'unanswered', '未回答の問題');
  for (let percent = 0; percent <= 100; percent += 10) addFilterOption(select, `accuracy:${percent}`, `正答率 ${percent}%以下`);
  select.value = currentFilter;
  select.onchange = event => { currentFilter = event.target.value; currentAccuracyLimit = currentFilter.startsWith('accuracy:') ? Number(currentFilter.split(':')[1]) / 100 : null; renderList(); };
}
function switchView(viewName) { Object.values(views).forEach(view => view.classList.remove('active')); views[viewName].classList.add('active'); }
function filterQuestions() {
  if (currentFilter === 'unanswered') return allQuestions.filter(question => question.answerCount === 0);
  if (currentAccuracyLimit !== null) return allQuestions.filter(question => question.answerCount > 0 && question.accuracy <= currentAccuracyLimit);
  return allQuestions;
}
function renderList() {
  const container = document.getElementById('category-container'), filtered = filterQuestions(); container.innerHTML = '';
  document.getElementById('list-summary').textContent = `${filtered.length}問を表示中（全${allQuestions.length}問）`;
  if (!filtered.length) { container.innerHTML = `<p class="empty-message">${currentFilter === 'unanswered' ? '未回答の問題はありません。' : '条件に一致する問題がありません。'}</p>`; return; }
  const grouped = {};
  filtered.forEach(question => { if (!question.section) return; const parts = String(question.section).split('_'), category = parts[0], year = parts[1] || 'その他'; if (!grouped[category]) grouped[category] = {}; if (!grouped[category][year]) grouped[category][year] = []; grouped[category][year].push(question); });
  Object.entries(grouped).forEach(([category, years]) => {
    const group = document.createElement('section'); group.className = 'category-group';
    const title = document.createElement('h2'); title.className = 'category-title'; title.textContent = category; group.appendChild(title);
    const grid = document.createElement('div'); grid.className = 'year-grid';
    Object.entries(years).forEach(([year, questions]) => { const button = document.createElement('button'); button.className = 'year-btn'; button.innerHTML = `<span>${escapeHtml(year)}</span><small>${questions.length}問</small>`; button.onclick = () => startQuiz(category, year, questions); grid.appendChild(button); });
    group.appendChild(grid); container.appendChild(group);
  });
}
function startQuiz(category, year, questions) { currentSectionData = [...questions].sort(() => Math.random() - 0.5); totalSectionQuestions = questions.length; currentQuestionIndex = 1; document.getElementById('section-name-text').textContent = `${category}_${year}`; switchView('quiz'); loadNextQuestion(); }
function escapeHtml(text) { return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function parseMarkdown(text) { return text ? escapeHtml(String(text)).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') : ''; }
function formatAccuracy(accuracy) { return Math.round(accuracy * 100); }

function loadNextQuestion() {
  if (!currentSectionData.length) { syncUpdates(); alert('このセクションをクリアしました！'); renderList(); switchView('list'); return; }
  currentQuestion = currentSectionData.pop(); isShowingTrue = Math.random() >= 0.5;
  document.getElementById('q-num').textContent = currentQuestionIndex; document.getElementById('progress-text').textContent = `全${totalSectionQuestions}問`;
  const badge = document.getElementById('q-incorrect-badge'); badge.classList.remove('hidden'); badge.textContent = currentQuestion.answerCount === 0 ? '未回答' : `正答率 ${formatAccuracy(currentQuestion.accuracy)}%`;
  document.getElementById('question-text').innerHTML = parseMarkdown(isShowingTrue ? currentQuestion.question_true : currentQuestion.question_false);
  document.getElementById('result-card').classList.add('hidden'); document.getElementById('review-checkbox').classList.add('hidden'); document.getElementById('action-buttons').classList.add('hidden');
  [document.getElementById('btn-true'), document.getElementById('btn-false')].forEach(button => button.classList.remove('disabled', 'dimmed'));
  document.getElementById('btn-next-question').style.display = 'block'; document.getElementById('quiz-scroll-area').scrollTop = 0;
}

document.getElementById('btn-true').onclick = () => handleAnswer(true);
document.getElementById('btn-false').onclick = () => handleAnswer(false);
function handleAnswer(userSelectedTrue) {
  const isCorrect = isShowingTrue === userSelectedTrue;
  document.getElementById('btn-true').classList.add('disabled'); document.getElementById('btn-false').classList.add('disabled'); document.getElementById(userSelectedTrue ? 'btn-false' : 'btn-true').classList.add('dimmed');
  currentQuestion.answerCount += 1; if (isCorrect) currentQuestion.correctCount += 1; else currentQuestion.incorrectCount += 1; currentQuestion.accuracy = currentQuestion.correctCount / currentQuestion.answerCount;
  const resultCard = document.getElementById('result-card'), resultTitle = document.getElementById('result-title'); resultCard.classList.remove('hidden', 'correct', 'incorrect'); resultCard.classList.add(isCorrect ? 'correct' : 'incorrect'); resultTitle.textContent = isCorrect ? '正解' : '不正解';
  document.getElementById('explanation-text').innerHTML = parseMarkdown(currentQuestion.explanation); pendingLogs.push({ id: currentQuestion.id, isCorrect }); scheduleSync();
  const reviewCheck = document.getElementById('review-checkbox'); reviewCheck.checked = currentQuestion.isChecked || false; reviewCheck.classList.remove('hidden');
  document.getElementById('btn-next-question').style.display = currentSectionData.length ? 'block' : 'none'; document.getElementById('action-buttons').classList.remove('hidden');
  setTimeout(() => document.getElementById('quiz-scroll-area').scrollTo({ top: document.getElementById('quiz-scroll-area').scrollHeight, behavior: 'smooth' }), 100);
}
document.getElementById('review-checkbox').onchange = event => { currentQuestion.isChecked = event.target.checked; pendingChecks[currentQuestion.id] = event.target.checked; scheduleSync(); };
function scheduleSync() { if (syncTimeout) clearTimeout(syncTimeout); syncTimeout = setTimeout(syncUpdates, 2000); }
function syncUpdates() {
  if (!Object.keys(pendingChecks).length && !pendingLogs.length) return;
  const payload = { checks: Object.keys(pendingChecks).map(id => ({ id, isChecked: pendingChecks[id] })), logs: [...pendingLogs] }, backupChecks = { ...pendingChecks }, backupLogs = [...pendingLogs]; pendingChecks = {}; pendingLogs = [];
  fetch(GAS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload), keepalive: true }).catch(error => { console.error('送信エラー:', error); Object.assign(pendingChecks, backupChecks); pendingLogs.push(...backupLogs); });
}
document.getElementById('btn-next-question').onclick = () => { currentQuestionIndex += 1; loadNextQuestion(); };
document.getElementById('btn-back-list').onclick = () => { syncUpdates(); renderList(); switchView('list'); };