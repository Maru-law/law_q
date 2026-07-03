const GAS_API_URL = "https://script.google.com/macros/s/AKfycby71xzQ4WDcpNDh677BY5hZdNeiM8Y3kpo4w-2jZA81tUyFmGvr2lqIZ6DDPcSoylWFZw/exec";

let allQuestions = [];
let groupedSections = {};

let currentSectionData = [];
let currentQuestion = null;

let currentQuestionIndex = 1;
let totalSectionQuestions = 0;

let currentFilter = 0;

let pendingReviewUpdates = {};
let pendingAnswerLogs = [];

const views = {
  loading: document.getElementById("loading-view"),
  list: document.getElementById("list-view"),
  quiz: document.getElementById("quiz-view")
};

document.addEventListener("DOMContentLoaded", initApp);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushAllUpdates();
  }
});

window.addEventListener("beforeunload", () => {
  flushAllUpdates();
});

async function initApp() {
  try {

    const response = await fetch(GAS_API_URL);

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }

    allQuestions = await response.json();

    processData();
    setupFilterButtons();
    renderList();

    switchView("list");

  } catch (err) {

    document.getElementById("loading-view").innerHTML = `
      <h3>データ読み込みエラー</h3>
      <p>${err.message}</p>
    `;
  }
}

function switchView(name) {
  Object.values(views).forEach(v => {
    v.classList.remove("active");
  });

  views[name].classList.add("active");
}

function processData() {

  groupedSections = {};

  allQuestions.forEach(q => {

    if (!q.section) return;

    const parts = q.section.split("_");

    const category = parts[0];
    const year = parts[1] || "その他";

    if (!groupedSections[category]) {
      groupedSections[category] = {};
    }

    if (!groupedSections[category][year]) {
      groupedSections[category][year] = [];
    }

    groupedSections[category][year].push(q);
  });
}

function setupFilterButtons() {

  const buttons = document.querySelectorAll(".filter-btn");

  buttons.forEach(btn => {

    btn.addEventListener("click", () => {

      buttons.forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      currentFilter = Number(btn.dataset.filter);

      renderList();
    });
  });
}

function renderList() {

  const container = document.getElementById("category-container");

  container.innerHTML = "";

  Object.entries(groupedSections).forEach(([category, yearsObj]) => {

    const group = document.createElement("div");
    group.className = "category-group";

    const title = document.createElement("h2");
    title.className = "category-title";
    title.textContent = category;

    group.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "year-grid";

    Object.entries(yearsObj).forEach(([year, questions]) => {

      const filteredQuestions = questions.filter(q => {
        return q.wrongCount >= currentFilter;
      });

      if (filteredQuestions.length === 0) {
        return;
      }

      const btn = document.createElement("button");

      btn.className = "year-btn";

      btn.innerHTML = `
        ${year}
        <span class="question-count">
          (${filteredQuestions.length}問)
        </span>
      `;

      btn.onclick = () => {
        startQuiz(
          category,
          year,
          filteredQuestions
        );
      };

      grid.appendChild(btn);

    });

    if (grid.children.length > 0) {
      group.appendChild(grid);
      container.appendChild(group);
    }

  });
}

function startQuiz(category, year, questions) {

  currentSectionData = [...questions];

  shuffleArray(currentSectionData);

  totalSectionQuestions = currentSectionData.length;

  currentQuestionIndex = 1;

  document.getElementById("section-name-text").textContent =
    `${category}_${year}`;

  document.getElementById("filtered-count-text").textContent =
    `${totalSectionQuestions}問`;

  switchView("quiz");

  loadNextQuestion();
}

function loadNextQuestion() {

  if (currentSectionData.length === 0) {

    flushAllUpdates();

    alert("このセクションを解き終えました");

    renderList();

    switchView("list");

    return;
  }

  currentQuestion = currentSectionData.pop();

  currentQuestion.isShowingTrue =
    Math.random() >= 0.5;

  document.getElementById("q-num").textContent =
    currentQuestionIndex;

  document.getElementById("progress-text").textContent =
    `${currentQuestionIndex}/${totalSectionQuestions}`;

  const text = currentQuestion.isShowingTrue
    ? currentQuestion.question_true
    : currentQuestion.question_false;

  document.getElementById("question-text").innerHTML =
    parseMarkdown(text);

  document.getElementById("result-card")
    .classList.add("hidden");

  document.getElementById("review-checkbox")
    .classList.add("hidden");

  document.getElementById("action-buttons")
    .classList.add("hidden");

  const btnO = document.getElementById("btn-true");
  const btnX = document.getElementById("btn-false");

  [btnO, btnX].forEach(btn => {
    btn.classList.remove("disabled");
    btn.classList.remove("dimmed");
  });

  document.getElementById("quiz-scroll-area")
    .scrollTop = 0;
}

function handleAnswer(userSelectedTrue) {

  const isCorrect =
    currentQuestion.isShowingTrue === userSelectedTrue;

  pendingAnswerLogs.push({
    id: currentQuestion.id,
    answer: isCorrect
  });

  if (pendingAnswerLogs.length >= 10) {
    syncAnswerLogs();
  }

  const btnO = document.getElementById("btn-true");
  const btnX = document.getElementById("btn-false");

  btnO.classList.add("disabled");
  btnX.classList.add("disabled");

  if (userSelectedTrue) {
    btnX.classList.add("dimmed");
  } else {
    btnO.classList.add("dimmed");
  }

  const resultCard =
    document.getElementById("result-card");

  const resultTitle =
    document.getElementById("result-title");

  const explanation =
    document.getElementById("explanation-text");

  resultCard.classList.remove(
    "hidden",
    "correct",
    "incorrect"
  );

  if (isCorrect) {

    resultCard.classList.add("correct");

    resultTitle.textContent = "正解";

  } else {

    resultCard.classList.add("incorrect");

    resultTitle.textContent = "間違い";

    currentQuestion.wrongCount =
      (currentQuestion.wrongCount || 0) + 1;
  }

  explanation.innerHTML =
    parseMarkdown(currentQuestion.explanation);

  const reviewCheckbox =
    document.getElementById("review-checkbox");

  reviewCheckbox.checked =
    currentQuestion.isChecked || false;

  reviewCheckbox.classList.remove("hidden");

  document.getElementById("action-buttons")
    .classList.remove("hidden");

  const btnNext =
    document.getElementById("btn-next-question");

  btnNext.style.display =
    currentSectionData.length === 0
      ? "none"
      : "block";

  setTimeout(() => {

    const area =
      document.getElementById("quiz-scroll-area");

    area.scrollTo({
      top: area.scrollHeight,
      behavior: "smooth"
    });

  }, 100);
}

document.getElementById("btn-true")
  .addEventListener("click", () => {
    handleAnswer(true);
  });

document.getElementById("btn-false")
  .addEventListener("click", () => {
    handleAnswer(false);
  });

document.getElementById("btn-next-question")
  .addEventListener("click", () => {

    currentQuestionIndex++;

    loadNextQuestion();
  });

document.getElementById("btn-back-list")
  .addEventListener("click", () => {

    flushAllUpdates();

    renderList();

    switchView("list");
  });

document.getElementById("review-checkbox")
  .addEventListener("change", e => {

    currentQuestion.isChecked =
      e.target.checked;

    pendingReviewUpdates[currentQuestion.id] =
      e.target.checked;
  });

async function syncReviewUpdates() {

  const ids = Object.keys(pendingReviewUpdates);

  if (ids.length === 0) return;

  const items = ids.map(id => ({
    id: Number(id),
    isChecked: pendingReviewUpdates[id]
  }));

  pendingReviewUpdates = {};

  try {

    await fetch(GAS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({
        type: "reviewUpdate",
        items
      })
    });

  } catch (e) {
    console.error(e);
  }
}

async function syncAnswerLogs() {

  if (pendingAnswerLogs.length === 0) {
    return;
  }

  const items = [...pendingAnswerLogs];

  pendingAnswerLogs = [];

  try {

    await fetch(GAS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({
        type: "answerLog",
        items
      })
    });

  } catch (e) {
    console.error(e);
  }
}

function flushAllUpdates() {
  syncReviewUpdates();
  syncAnswerLogs();
}

function parseMarkdown(text) {

  if (!text) return "";

  return text
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function shuffleArray(array) {

  for (let i = array.length - 1; i > 0; i--) {

    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [array[i], array[j]] =
      [array[j], array[i]];
  }
}