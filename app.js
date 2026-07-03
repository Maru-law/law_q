const GAS_API_URL = 'https://script.google.com/macros/s/AKfycby71xzQ4WDcpNDh677BY5hZdNeiM8Y3kpo4w-2jZA81tUyFmGvr2lqIZ6DDPcSoylWFZw/exec';

let allQuestions = [];
let maxIncorrect = 0;
let currentFilter = 0;

let currentSectionData = [];
let currentQuestionIndex = 1;
let currentQuestion = null;
let isShowingTrue = true;
let totalSectionQuestions = 0;

let pendingChecks = {}; 
let pendingLogs = [];   
let syncTimeout = null;

const views = {
  loading: document.getElementById('loading-view'),
  list: document.getElementById('list-view'),
  quiz: document.getElementById('quiz-view')
};

document.addEventListener('DOMContentLoaded', initApp);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') syncUpdates();
});

async function initApp() {
  try {
    const response = await fetch(GAS_API_URL);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    let text = await response.text();
    let fetchedData = JSON.parse(text);
    if (!Array.isArray(fetchedData)) {
      if (Array.isArray(fetchedData.data)) fetchedData = fetchedData.data;
      else if (Array.isArray(fetchedData.items)) fetchedData = fetchedData.items;
      else throw new Error("不正なデータ形式です。");
    }

    allQuestions = fetchedData.map(q => ({
      ...q,
      incorrectCount: Number(q.incorrectCount) || 0
    }));
    
    maxIncorrect = Math.max(...allQuestions.map(q => q.incorrectCount), 0);
    buildFilterUI();
    
    renderList();
    switchView('list');

  } catch (error) {
    views.loading.innerHTML = `
      <div style="padding: 20px; color: #F44336;">
        <h3 style="margin-bottom: 12px;">読み込みエラー</h3><p>${error.message}</p>
      </div>`;
  }
}

function buildFilterUI() {
  const filterSelect = document.getElementById('incorrect-filter');
  filterSelect.innerHTML = `<option value="0">すべての問題</option>`;
  for (let i = 1; i <= maxIncorrect; i++) {
    filterSelect.innerHTML += `<option value="${i}">誤答数 ${i} 回以上</option>`;
  }
  
  filterSelect.addEventListener('change', (e) => {
    currentFilter = parseInt(e.target.value, 10);
    renderList();
  });
}

function switchView(viewName) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[viewName].classList.add('active');
}

function renderList() {
  const container = document.getElementById('category-container');
  container.innerHTML = '';
  
  const filteredQuestions = allQuestions.filter(q => q.incorrectCount >= currentFilter);
  
  if (filteredQuestions.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 20px;">該当する問題がありません。</p>';
    return;
  }

  const groupedSections = {};
  filteredQuestions.forEach(q => {
    if (!q.section) return;
    const parts = q.section.split('_');
    const category = parts[0];
    const year = parts[1] || 'その他';

    if (!groupedSections[category]) groupedSections[category] = {};
    if (!groupedSections[category][year]) groupedSections[category][year] = [];
    groupedSections[category][year].push(q);
  });

  for (const [category, yearsObj] of Object.entries(groupedSections)) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'category-group';
    groupDiv.innerHTML = `<h2 class="category-title">${category}</h2>`;

    const grid = document.createElement('div');
    grid.className = 'year-grid';

    for (const [year, questions] of Object.entries(yearsObj)) {
      const btn = document.createElement('button');
      btn.className = 'year-btn';
      // ここを修正し、問題数を表示しないように変更しました
      btn.textContent = year;
      btn.onclick = () => startQuiz(category, year, questions);
      grid.appendChild(btn);
    }
    groupDiv.appendChild(grid);
    container.appendChild(groupDiv);
  }
}

function startQuiz(category, year, questions) {
  currentSectionData = [...questions].sort(() => Math.random() - 0.5);
  totalSectionQuestions = questions.length;
  currentQuestionIndex = 1;

  document.getElementById('section-name-text').textContent = `${category}_${year}`;
  switchView('quiz');
  loadNextQuestion();
}

function parseMarkdown(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function loadNextQuestion() {
  if (currentSectionData.length === 0) {
    syncUpdates(); 
    alert('このセクションをクリアしました！');
    renderList(); 
    switchView('list');
    return;
  }

  currentQuestion = currentSectionData.pop();
  isShowingTrue = Math.random() >= 0.5;
  
  document.getElementById('q-num').textContent = currentQuestionIndex;
  document.getElementById('progress-text').textContent = `全${totalSectionQuestions}問`;
  
  const badge = document.getElementById('q-incorrect-badge');
  if (currentQuestion.incorrectCount > 0) {
    badge.textContent = `過去の誤答: ${currentQuestion.incorrectCount}回`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  
  const qText = isShowingTrue ? currentQuestion.question_true : currentQuestion.question_false;
  document.getElementById('question-text').innerHTML = parseMarkdown(qText);

  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('review-checkbox').classList.add('hidden');
  document.getElementById('action-buttons').classList.add('hidden');
  
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  [btnO, btnX].forEach(btn => btn.classList.remove('disabled', 'dimmed'));

  document.getElementById('quiz-scroll-area').scrollTop = 0;
}

document.getElementById('btn-true').onclick = () => handleAnswer(true);
document.getElementById('btn-false').onclick = () => handleAnswer(false);

function handleAnswer(userSelectedTrue) {
  const isCorrect = (isShowingTrue === userSelectedTrue);
  
  const btnO = document.getElementById('btn-true');
  const btnX = document.getElementById('btn-false');
  btnO.classList.add('disabled');
  btnX.classList.add('disabled');
  if (userSelectedTrue) btnX.classList.add('dimmed');
  else btnO.classList.add('dimmed');

  const resultCard = document.getElementById('result-card');
  const resultTitle = document.getElementById('result-title');
  resultCard.classList.remove('hidden', 'correct', 'incorrect');
  
  if (isCorrect) {
    resultCard.classList.add('correct');
    resultTitle.textContent = '正解';
  } else {
    resultCard.classList.add('incorrect');
    resultTitle.textContent = '間違い';
    currentQuestion.incorrectCount += 1;
    
    if (currentQuestion.incorrectCount > maxIncorrect) {
      maxIncorrect = currentQuestion.incorrectCount;
      buildFilterUI(); 
      document.getElementById('incorrect-filter').value = currentFilter;
    }
  }
  
  document.getElementById('explanation-text').innerHTML = parseMarkdown(currentQuestion.explanation);

  pendingLogs.push({ id: currentQuestion.id, isCorrect: isCorrect });
  scheduleSync(); 

  const reviewCheck = document.getElementById('review-checkbox');
  reviewCheck.checked = currentQuestion.isChecked || false;
  reviewCheck.classList.remove('hidden');

  const actionButtons = document.getElementById('action-buttons');
  document.getElementById('btn-next-question').style.display = (currentSectionData.length === 0) ? 'none' : 'block';
  actionButtons.classList.remove('hidden');

  setTimeout(() => {
    const scrollArea = document.getElementById('quiz-scroll-area');
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
  }, 100);
}

document.getElementById('review-checkbox').onchange = (e) => {
  const checked = e.target.checked;
  currentQuestion.isChecked = checked;
  pendingChecks[currentQuestion.id] = checked;
  scheduleSync(); 
};

function scheduleSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(syncUpdates, 2000); 
}

function syncUpdates() {
  if (Object.keys(pendingChecks).length === 0 && pendingLogs.length === 0) return;

  const payload = {
    checks: Object.keys(pendingChecks).map(id => ({ id: id, isChecked: pendingChecks[id] })),
    logs: [...pendingLogs]
  };

  const backupChecks = { ...pendingChecks };
  const backupLogs = [...pendingLogs];
  pendingChecks = {};
  pendingLogs = [];

  fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    keepalive: true 
  }).catch(err => {
    console.error('通信エラー:', err);
    Object.assign(pendingChecks, backupChecks);
    pendingLogs.push(...backupLogs);
  });
}

document.getElementById('btn-next-question').onclick = () => {
  currentQuestionIndex++;
  loadNextQuestion();
};

document.getElementById('btn-back-list').onclick = () => {
  syncUpdates();
  renderList();
  switchView('list');
};