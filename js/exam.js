/**
 * exam.js — 실전 모의고사 (exam.html) 전용 로직
 *
 * 계약:
 *  - data/questions.json 을 fetch 하여 전체 문제은행을 읽는다.
 *  - 60문제를 무작위로 뽑는다. 문제은행이 60개 미만이면 있는 만큼 전부 사용한다.
 *  - 60분 타이머. 문제 수가 60개 미만이면 "문항당 1분" 비율을 유지해 시간도 비례 축소한다
 *    (예: 40문제 => 40분). 60문제 이상이면 항상 60분으로 고정한다.
 *  - 제출 시 100점 만점으로 환산 채점: 원점수(맞은 개수) * 100 / 총문항수, 소수점은
 *    반올림(Math.round)한다. 60점 이상이면 합격.
 *  - 오답 리뷰: 문항, 내 선택, 정답, 해설을 아코디언(<details>)으로 제공한다.
 */
(function () {
  'use strict';

  var MAX_QUESTIONS = 60;
  var MAX_TIME_MINUTES = 60;
  var TOTAL_SCORE = 100;

  var CATEGORY_NAMES = {
    theory: '미용이론',
    skin: '피부학',
    cosmetics: '화장품학',
    hygiene: '공중위생관리학'
  };

  // ---- state -------------------------------------------------------------
  var state = {
    bank: [],
    questions: [],      // 이번 회차에 뽑힌 문제(옵션 셔플 후) 목록
    answers: [],         // 사용자가 선택한 옵션 인덱스, 미응답은 null
    currentIndex: 0,
    timeLimitSeconds: MAX_TIME_MINUTES * 60,
    remainingSeconds: MAX_TIME_MINUTES * 60,
    timerId: null,
    submitted: false
  };

  // ---- DOM refs ------------------------------------------------------------
  var el = {};

  document.addEventListener('DOMContentLoaded', function () {
    cacheEls();
    bindStaticEvents();
    loadBank();
  });

  function cacheEls() {
    el.intro = document.getElementById('examIntro');
    el.running = document.getElementById('examRunning');
    el.result = document.getElementById('examResult');

    el.introQuestionCount = document.getElementById('introQuestionCount');
    el.introTimeLimit = document.getElementById('introTimeLimit');
    el.introBankWarning = document.getElementById('introBankWarning');
    el.startExamBtn = document.getElementById('startExamBtn');

    el.timerBar = document.getElementById('examTimerBar');
    el.timerValue = document.getElementById('examTimerValue');
    el.answeredCount = document.getElementById('examAnsweredCount');
    el.totalCount = document.getElementById('examTotalCount');

    el.questionGrid = document.getElementById('examQuestionGrid');
    el.categoryBadge = document.getElementById('examCategoryBadge');
    el.currentNum = document.getElementById('examCurrentNum');
    el.totalNum = document.getElementById('examTotalNum');
    el.questionText = document.getElementById('examQuestionText');
    el.optionList = document.getElementById('examOptionList');

    el.prevBtn = document.getElementById('examPrevBtn');
    el.nextBtn = document.getElementById('examNextBtn');
    el.submitBtn = document.getElementById('examSubmitBtn');
    el.submitHint = document.getElementById('examSubmitHint');

    el.resultBanner = document.getElementById('resultBanner');
    el.resultStatus = document.getElementById('resultStatus');
    el.resultScore = document.getElementById('resultScore');
    el.resultDetail = document.getElementById('resultDetail');
    el.resultCategoryBreakdown = document.getElementById('resultCategoryBreakdown');
    el.resultReviewEmpty = document.getElementById('resultReviewEmpty');
    el.resultReviewList = document.getElementById('resultReviewList');
    el.retryExamBtn = document.getElementById('retryExamBtn');
  }

  function bindStaticEvents() {
    el.startExamBtn.addEventListener('click', startExam);
    el.prevBtn.addEventListener('click', function () { goToQuestion(state.currentIndex - 1); });
    el.nextBtn.addEventListener('click', function () { goToQuestion(state.currentIndex + 1); });
    el.submitBtn.addEventListener('click', function () { attemptSubmit(false); });
    el.retryExamBtn.addEventListener('click', resetToIntro);
  }

  // ---- data loading --------------------------------------------------------
  function loadBank() {
    fetch('data/questions.json')
      .then(function (res) {
        if (!res.ok) { throw new Error('questions.json fetch failed: ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        state.bank = (data && data.questions) ? data.questions : [];
        prepareIntro();
      })
      .catch(function (err) {
        el.introBankWarning.hidden = false;
        el.introBankWarning.textContent = '문제 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요. (' + err.message + ')';
        el.startExamBtn.disabled = true;
      });
  }

  function prepareIntro() {
    var count = Math.min(MAX_QUESTIONS, state.bank.length);
    var minutes = computeTimeLimitMinutes(count);

    el.introQuestionCount.textContent = count + '문제';
    el.introTimeLimit.textContent = minutes + '분';

    if (state.bank.length === 0) {
      el.introBankWarning.hidden = false;
      el.introBankWarning.textContent = '문제은행이 비어 있어 모의고사를 시작할 수 없습니다.';
      el.startExamBtn.disabled = true;
    } else if (state.bank.length < MAX_QUESTIONS) {
      el.introBankWarning.hidden = false;
      el.introBankWarning.textContent =
        '현재 문제은행에는 ' + state.bank.length + '문제가 있습니다. 60문제 기준 대신 ' +
        count + '문제 / ' + minutes + '분으로 축소하여 진행합니다.';
    }
  }

  // 문항당 1분 비율 유지: 60문제=60분, 그보다 적으면 문항 수만큼(최소 1분)
  function computeTimeLimitMinutes(questionCount) {
    if (questionCount >= MAX_QUESTIONS) { return MAX_TIME_MINUTES; }
    return Math.max(1, Math.round(MAX_TIME_MINUTES * questionCount / MAX_QUESTIONS));
  }

  // ---- exam lifecycle --------------------------------------------------------
  function startExam() {
    if (state.bank.length === 0) { return; }

    var picked = shuffle(state.bank.slice()).slice(0, MAX_QUESTIONS);
    state.questions = picked.map(function (q) {
      return shuffleQuestionOptions(q);
    });
    state.answers = state.questions.map(function () { return null; });
    state.currentIndex = 0;
    state.submitted = false;

    var minutes = computeTimeLimitMinutes(state.questions.length);
    state.timeLimitSeconds = minutes * 60;
    state.remainingSeconds = state.timeLimitSeconds;

    el.totalCount.textContent = state.questions.length;
    el.totalNum.textContent = state.questions.length;

    buildQuestionGrid();
    renderQuestion(0);
    updateAnsweredCount();

    el.intro.hidden = true;
    el.result.hidden = true;
    el.running.hidden = false;

    startTimer();
  }

  function shuffleQuestionOptions(q) {
    var order = shuffle(q.options.map(function (_, i) { return i; }));
    var newOptions = order.map(function (origIdx) { return q.options[origIdx]; });
    var newAnswerIndex = order.indexOf(q.answerIndex);
    return {
      category: q.category,
      question: q.question,
      options: newOptions,
      answerIndex: newAnswerIndex,
      explanation: q.explanation
    };
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // ---- timer --------------------------------------------------------------
  function startTimer() {
    clearInterval(state.timerId);
    updateTimerDisplay();
    state.timerId = setInterval(function () {
      state.remainingSeconds -= 1;
      if (state.remainingSeconds <= 0) {
        state.remainingSeconds = 0;
        updateTimerDisplay();
        clearInterval(state.timerId);
        attemptSubmit(true);
        return;
      }
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  function updateTimerDisplay() {
    var m = Math.floor(state.remainingSeconds / 60);
    var s = state.remainingSeconds % 60;
    el.timerValue.textContent = pad2(m) + ':' + pad2(s);

    el.timerBar.classList.remove('is-warning', 'is-danger');
    if (state.remainingSeconds <= 60) {
      el.timerBar.classList.add('is-danger');
    } else if (state.remainingSeconds <= 300) {
      el.timerBar.classList.add('is-warning');
    }
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  // ---- rendering ------------------------------------------------------------
  function buildQuestionGrid() {
    el.questionGrid.innerHTML = '';
    state.questions.forEach(function (_, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'exam-question-chip';
      btn.textContent = String(idx + 1);
      btn.setAttribute('aria-label', (idx + 1) + '번 문제로 이동');
      btn.dataset.index = idx;
      btn.addEventListener('click', function () { goToQuestion(idx); });
      el.questionGrid.appendChild(btn);
    });
    refreshQuestionGrid();
  }

  function refreshQuestionGrid() {
    var chips = el.questionGrid.querySelectorAll('.exam-question-chip');
    chips.forEach(function (chip, idx) {
      chip.classList.toggle('is-current', idx === state.currentIndex);
      chip.classList.toggle('is-answered', state.answers[idx] !== null);
    });
  }

  function goToQuestion(idx) {
    if (idx < 0 || idx >= state.questions.length) { return; }
    renderQuestion(idx);
  }

  function renderQuestion(idx) {
    state.currentIndex = idx;
    var q = state.questions[idx];

    el.categoryBadge.textContent = CATEGORY_NAMES[q.category] || q.category;
    el.categoryBadge.className = 'badge badge-' + q.category;
    el.currentNum.textContent = idx + 1;
    el.questionText.textContent = q.question;

    el.optionList.innerHTML = '';
    q.options.forEach(function (optionText, optIdx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.textContent = optionText;
      btn.setAttribute('aria-pressed', String(state.answers[idx] === optIdx));
      if (state.answers[idx] === optIdx) {
        btn.classList.add('is-selected');
      }
      btn.addEventListener('click', function () { selectOption(idx, optIdx); });
      el.optionList.appendChild(btn);
    });

    el.prevBtn.disabled = idx === 0;
    el.nextBtn.disabled = idx === state.questions.length - 1;

    refreshQuestionGrid();
  }

  function selectOption(qIdx, optIdx) {
    state.answers[qIdx] = optIdx;
    if (qIdx === state.currentIndex) {
      renderQuestion(qIdx);
    } else {
      refreshQuestionGrid();
    }
    updateAnsweredCount();
  }

  function updateAnsweredCount() {
    var answered = state.answers.filter(function (a) { return a !== null; }).length;
    el.answeredCount.textContent = answered;
  }

  // ---- submit / grading --------------------------------------------------------
  function attemptSubmit(isAutoSubmit) {
    if (state.submitted) { return; }

    var answeredCount = state.answers.filter(function (a) { return a !== null; }).length;
    var unanswered = state.questions.length - answeredCount;

    if (!isAutoSubmit && unanswered > 0) {
      var proceed = window.confirm(
        unanswered + '개 문항에 아직 답하지 않았습니다. 그래도 제출하시겠습니까?'
      );
      if (!proceed) { return; }
    }

    submitExam();
  }

  function submitExam() {
    state.submitted = true;
    stopTimer();

    var total = state.questions.length;
    var correctCount = 0;
    var categoryStats = {};

    state.questions.forEach(function (q, idx) {
      var userAnswer = state.answers[idx];
      var isCorrect = userAnswer === q.answerIndex;
      if (isCorrect) { correctCount += 1; }

      if (!categoryStats[q.category]) {
        categoryStats[q.category] = { correct: 0, total: 0 };
      }
      categoryStats[q.category].total += 1;
      if (isCorrect) { categoryStats[q.category].correct += 1; }
    });

    // 100점 만점 환산: 원점수(맞은 개수) / 총문항수 * 100, 반올림.
    var score = total > 0 ? Math.round((correctCount / total) * TOTAL_SCORE) : 0;
    var passed = score >= 60;

    renderResult({
      total: total,
      correctCount: correctCount,
      score: score,
      passed: passed,
      categoryStats: categoryStats
    });

    el.running.hidden = true;
    el.result.hidden = false;
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderResult(summary) {
    el.resultBanner.classList.remove('is-pass', 'is-fail');
    el.resultBanner.classList.add(summary.passed ? 'is-pass' : 'is-fail');
    el.resultStatus.textContent = summary.passed ? '합격' : '불합격';
    el.resultScore.textContent = summary.score;
    el.resultDetail.textContent =
      summary.total + '문제 중 ' + summary.correctCount + '문제 정답 (합격 기준 60점 이상)';

    el.resultCategoryBreakdown.innerHTML = '';
    Object.keys(summary.categoryStats).forEach(function (cat) {
      var stat = summary.categoryStats[cat];
      var li = document.createElement('li');
      li.className = 'exam-category-breakdown-item';

      var name = document.createElement('span');
      name.className = 'badge badge-' + cat;
      name.textContent = CATEGORY_NAMES[cat] || cat;

      var value = document.createElement('span');
      value.textContent = stat.correct + ' / ' + stat.total + '문제 정답';

      li.appendChild(name);
      li.appendChild(value);
      el.resultCategoryBreakdown.appendChild(li);
    });

    renderReview();
  }

  function renderReview() {
    el.resultReviewList.innerHTML = '';
    var wrongItems = [];

    state.questions.forEach(function (q, idx) {
      var userAnswer = state.answers[idx];
      if (userAnswer !== q.answerIndex) {
        wrongItems.push({ q: q, idx: idx, userAnswer: userAnswer });
      }
    });

    if (wrongItems.length === 0) {
      el.resultReviewEmpty.hidden = false;
      return;
    }
    el.resultReviewEmpty.hidden = true;

    wrongItems.forEach(function (item) {
      el.resultReviewList.appendChild(buildReviewEntry(item));
    });
  }

  function buildReviewEntry(item) {
    var q = item.q;
    var details = document.createElement('details');
    details.className = 'review-item';

    var summary = document.createElement('summary');
    summary.className = 'review-item-summary';

    var badgeSpan = document.createElement('span');
    badgeSpan.className = 'badge badge-' + q.category;
    badgeSpan.textContent = CATEGORY_NAMES[q.category] || q.category;

    var numSpan = document.createElement('span');
    numSpan.className = 'review-item-question-num';
    numSpan.textContent = (item.idx + 1) + '번';

    var textSpan = document.createElement('span');
    textSpan.className = 'review-item-question-text';
    textSpan.textContent = q.question;

    summary.appendChild(badgeSpan);
    summary.appendChild(document.createTextNode(' '));
    summary.appendChild(numSpan);
    summary.appendChild(document.createTextNode(' '));
    summary.appendChild(textSpan);
    details.appendChild(summary);

    var body = document.createElement('div');
    body.className = 'review-item-body';

    var userLine = document.createElement('p');
    userLine.className = 'review-item-answer review-item-answer--wrong';
    userLine.textContent = '내 선택: ' + (item.userAnswer === null ? '(응답 없음)' : ('✗ ' + q.options[item.userAnswer]));

    var correctLine = document.createElement('p');
    correctLine.className = 'review-item-answer review-item-answer--correct';
    correctLine.textContent = '정답: ✓ ' + q.options[q.answerIndex];

    var explanationLine = document.createElement('p');
    explanationLine.className = 'review-item-explanation';
    explanationLine.textContent = q.explanation;

    body.appendChild(userLine);
    body.appendChild(correctLine);
    body.appendChild(explanationLine);
    details.appendChild(body);

    return details;
  }

  // ---- reset --------------------------------------------------------------
  function resetToIntro() {
    stopTimer();
    state.questions = [];
    state.answers = [];
    state.currentIndex = 0;
    state.submitted = false;

    el.result.hidden = true;
    el.running.hidden = true;
    el.intro.hidden = false;
    el.intro.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
