/**
 * quiz.js — 문제풀이 페이지 로직
 * 두 가지 모드를 지원한다:
 *   1) 카테고리별 문제 모드 — 선택한 과목 문제를 원래 순서 그대로 순차 출제
 *   2) 랜덤 문제 모드 — 선택한 과목(복수 가능) 범위에서 무작위 출제
 *      ("무작위 출제" 토글이 켜져 있으면 문제 순서 + 보기 순서를 모두 섞되,
 *       셔플 후에도 answerIndex를 정확히 재매핑해서 정답 판정이 어긋나지 않도록 한다)
 */
(function () {
  "use strict";

  var CATEGORY_META = {
    theory: { name: "미용이론", badgeClass: "cat-theory" },
    skin: { name: "피부학", badgeClass: "cat-skin" },
    cosmetics: { name: "화장품학", badgeClass: "cat-cosmetics" },
    hygiene: { name: "공중위생관리학", badgeClass: "cat-hygiene" }
  };

  var els = {};
  var allQuestions = [];
  var subCategoryNames = {}; // subCategoryKey -> subCategoryName (data/concepts.json에서 로드)
  var session = {
    mode: "category",
    questions: [],
    currentIndex: 0,
    score: 0,
    answered: false,
    filterSub: null, // ?sub= 로 진입한 중과목 필터 모드일 때의 subCategoryKey
    filterSubName: null
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheEls();
    bindSetupEvents();
    bindPlayEvents();
    bindResultEvents();
    loadQuestions();
  }

  function cacheEls() {
    els.setupSection = document.getElementById("quizSetup");
    els.playSection = document.getElementById("quizPlay");
    els.resultSection = document.getElementById("quizResult");

    els.modeTabCategory = document.getElementById("modeTabCategory");
    els.modeTabRandom = document.getElementById("modeTabRandom");
    els.categoryPanel = document.getElementById("categoryPanel");
    els.randomPanel = document.getElementById("randomPanel");
    els.categoryChoiceList = document.getElementById("categoryChoiceList");
    els.categoryFilterList = document.getElementById("categoryFilterList");
    els.shuffleToggle = document.getElementById("shuffleToggle");
    els.setupError = document.getElementById("setupError");
    els.startQuizBtn = document.getElementById("startQuizBtn");

    els.quizProgress = document.getElementById("quizProgress");
    els.quizScore = document.getElementById("quizScore");
    els.progressBarFill = document.getElementById("progressBarFill");
    els.quitQuizBtn = document.getElementById("quitQuizBtn");
    els.questionCatBadge = document.getElementById("questionCatBadge");
    els.questionNumber = document.getElementById("questionNumber");
    els.questionText = document.getElementById("questionText");
    els.optionsList = document.getElementById("optionsList");
    els.explanationBox = document.getElementById("explanationBox");
    els.explanationText = document.getElementById("explanationText");
    els.nextQuestionBtn = document.getElementById("nextQuestionBtn");

    els.resultScoreText = document.getElementById("resultScoreText");
    els.retryQuizBtn = document.getElementById("retryQuizBtn");

    els.quizFilterBanner = document.getElementById("quizFilterBanner");
  }

  function loadQuestions() {
    Promise.all([
      fetch("data/questions.json").then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      }),
      fetch("data/concepts.json")
        .then(function (res) {
          if (!res.ok) {
            throw new Error("HTTP " + res.status);
          }
          return res.json();
        })
        .catch(function (err) {
          // concepts.json 로드 실패는 중과목 이름 표시만 못 할 뿐 치명적이지 않으므로
          // 전체 로드를 실패시키지 않는다.
          // eslint-disable-next-line no-console
          console.error("[quiz] failed to load concepts.json", err);
          return null;
        })
    ])
      .then(function (results) {
        var questionsData = results[0];
        var conceptsData = results[1];

        allQuestions = (questionsData && questionsData.questions) || [];
        buildSubCategoryNames(conceptsData);
        els.startQuizBtn.disabled = false;

        handleSubCategoryParam();
      })
      .catch(function (err) {
        showSetupError("문제 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
        // eslint-disable-next-line no-console
        console.error("[quiz] failed to load questions.json", err);
      });
  }

  function buildSubCategoryNames(conceptsData) {
    subCategoryNames = {};
    var categories = (conceptsData && conceptsData.categories) || [];
    categories.forEach(function (cat) {
      (cat.subCategories || []).forEach(function (sub) {
        subCategoryNames[sub.subCategoryKey] = sub.subCategoryName;
      });
    });
  }

  // ---------- 중과목 필터 (quiz.html?sub=<subCategoryKey>) ----------

  function getUrlParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  function handleSubCategoryParam() {
    var sub = getUrlParam("sub");
    if (!sub) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(subCategoryNames, sub)) {
      // 알 수 없는(잘못된) sub 값 -> 무시하고 일반 설정 화면을 그대로 보여준다.
      return;
    }

    var subName = subCategoryNames[sub];
    var pool = allQuestions.filter(function (q) {
      return q.subCategory === sub;
    });

    if (!pool.length) {
      showSetupError(
        "'" + subName + "' 중과목은 아직 등록된 문제가 없습니다. 다른 방식으로 풀어보세요."
      );
      return;
    }

    startFilteredQuiz(sub, subName);
  }

  function startFilteredQuiz(subKey, subName) {
    var pool = allQuestions.filter(function (q) {
      return q.subCategory === subKey;
    });

    pool = shuffleArray(pool.slice());
    pool = pool.map(shuffleQuestionOptions);

    hideSetupError();

    session.mode = "sub";
    session.filterSub = subKey;
    session.filterSubName = subName;
    session.questions = pool;
    session.currentIndex = 0;
    session.score = 0;
    session.answered = false;

    els.setupSection.hidden = true;
    els.resultSection.hidden = true;
    els.playSection.hidden = false;

    updateFilterBanner();
    renderQuestion();
  }

  function updateFilterBanner() {
    if (!els.quizFilterBanner) {
      return;
    }
    if (session.filterSub) {
      els.quizFilterBanner.textContent = session.filterSubName + " 문제";
      els.quizFilterBanner.hidden = false;
    } else {
      els.quizFilterBanner.hidden = true;
      els.quizFilterBanner.textContent = "";
    }
  }

  // ---------- 설정 화면 ----------

  function bindSetupEvents() {
    els.modeTabCategory.addEventListener("click", function () {
      setMode("category");
    });
    els.modeTabRandom.addEventListener("click", function () {
      setMode("random");
    });
    els.startQuizBtn.addEventListener("click", startQuiz);
  }

  function setMode(mode) {
    session.mode = mode;
    var isCategory = mode === "category";

    els.modeTabCategory.classList.toggle("is-active", isCategory);
    els.modeTabCategory.setAttribute("aria-selected", String(isCategory));
    els.modeTabRandom.classList.toggle("is-active", !isCategory);
    els.modeTabRandom.setAttribute("aria-selected", String(!isCategory));

    els.categoryPanel.hidden = !isCategory;
    els.randomPanel.hidden = isCategory;

    hideSetupError();
  }

  function showSetupError(message) {
    els.setupError.textContent = message;
    els.setupError.hidden = false;
  }

  function hideSetupError() {
    els.setupError.hidden = true;
    els.setupError.textContent = "";
  }

  function startQuiz() {
    hideSetupError();

    if (!allQuestions.length) {
      showSetupError("문제 데이터가 아직 준비되지 않았습니다.");
      return;
    }

    var pool;

    if (session.mode === "category") {
      var selectedRadio = els.categoryChoiceList.querySelector('input[name="categorySingle"]:checked');
      var category = selectedRadio ? selectedRadio.value : null;
      if (!category) {
        showSetupError("과목을 선택해주세요.");
        return;
      }
      pool = allQuestions.filter(function (q) {
        return q.category === category;
      });
    } else {
      var checked = Array.prototype.slice
        .call(els.categoryFilterList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(function (input) {
          return input.value;
        });
      if (!checked.length) {
        showSetupError("최소 한 개 이상의 과목을 선택해주세요.");
        return;
      }
      pool = allQuestions.filter(function (q) {
        return checked.indexOf(q.category) !== -1;
      });

      var shuffle = !!(els.shuffleToggle && els.shuffleToggle.checked);
      if (shuffle) {
        pool = shuffleArray(pool.slice());
        pool = pool.map(shuffleQuestionOptions);
      }
    }

    if (!pool.length) {
      showSetupError("선택한 조건에 맞는 문제가 없습니다.");
      return;
    }

    session.questions = pool;
    session.currentIndex = 0;
    session.score = 0;
    session.answered = false;
    session.filterSub = null;
    session.filterSubName = null;

    els.setupSection.hidden = true;
    els.resultSection.hidden = true;
    els.playSection.hidden = false;

    updateFilterBanner();
    renderQuestion();
  }

  // Fisher-Yates shuffle (in place, returns the same array for convenience)
  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // 보기 순서를 섞되, 정답 텍스트를 추적해서 새 answerIndex를 정확히 재계산한다.
  function shuffleQuestionOptions(question) {
    var opts = question.options.map(function (text, idx) {
      return { text: text, isCorrect: idx === question.answerIndex };
    });
    shuffleArray(opts);
    var newAnswerIndex = opts.findIndex(function (o) {
      return o.isCorrect;
    });
    var copy = {};
    for (var key in question) {
      if (Object.prototype.hasOwnProperty.call(question, key)) {
        copy[key] = question[key];
      }
    }
    copy.options = opts.map(function (o) {
      return o.text;
    });
    copy.answerIndex = newAnswerIndex;
    return copy;
  }

  // ---------- 풀이 화면 ----------

  function bindPlayEvents() {
    els.nextQuestionBtn.addEventListener("click", goToNextQuestion);
    els.quitQuizBtn.addEventListener("click", quitQuiz);
  }

  function renderQuestion() {
    var q = session.questions[session.currentIndex];
    var total = session.questions.length;
    var meta = CATEGORY_META[q.category] || { name: q.category, badgeClass: "" };

    els.quizProgress.textContent = (session.currentIndex + 1) + " / " + total;
    els.quizScore.textContent = session.score;
    if (els.progressBarFill) {
      var pct = Math.round((session.currentIndex / total) * 100);
      els.progressBarFill.style.width = pct + "%";
    }

    els.questionCatBadge.textContent = meta.name;
    els.questionCatBadge.className = "badge cat-badge " + meta.badgeClass;
    els.questionNumber.textContent = (session.currentIndex + 1) + "번";
    els.questionText.textContent = q.question;

    els.optionsList.innerHTML = "";
    var letters = ["A", "B", "C", "D"];
    q.options.forEach(function (optionText, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.setAttribute("data-index", String(idx));

      var marker = document.createElement("span");
      marker.className = "option-marker";
      marker.textContent = letters[idx] || String(idx + 1);

      var textSpan = document.createElement("span");
      textSpan.className = "option-text";
      textSpan.textContent = optionText;

      var resultIcon = document.createElement("span");
      resultIcon.className = "option-result-icon";
      resultIcon.setAttribute("aria-hidden", "true");

      btn.appendChild(marker);
      btn.appendChild(textSpan);
      btn.appendChild(resultIcon);

      btn.addEventListener("click", function () {
        selectOption(idx);
      });

      els.optionsList.appendChild(btn);
    });

    els.explanationBox.hidden = true;
    els.explanationText.textContent = "";
    els.nextQuestionBtn.disabled = true;
    session.answered = false;
  }

  function selectOption(selectedIdx) {
    if (session.answered) {
      return;
    }
    session.answered = true;

    var q = session.questions[session.currentIndex];
    var isCorrect = selectedIdx === q.answerIndex;
    if (isCorrect) {
      session.score += 1;
      els.quizScore.textContent = session.score;
    }

    var buttons = Array.prototype.slice.call(els.optionsList.querySelectorAll(".option-btn"));
    buttons.forEach(function (btn) {
      var idx = Number(btn.getAttribute("data-index"));
      btn.classList.add("is-answered");
      btn.disabled = true;

      var icon = btn.querySelector(".option-result-icon");

      if (idx === q.answerIndex) {
        btn.classList.add("is-correct");
        if (icon) {
          icon.textContent = "✓ 정답";
        }
      } else if (idx === selectedIdx) {
        btn.classList.add("is-incorrect");
        if (icon) {
          icon.textContent = "✗";
        }
      }
    });

    els.explanationText.textContent = q.explanation || "";
    els.explanationBox.hidden = false;
    els.nextQuestionBtn.disabled = false;
  }

  function goToNextQuestion() {
    if (session.currentIndex + 1 < session.questions.length) {
      session.currentIndex += 1;
      renderQuestion();
    } else {
      showResult();
    }
  }

  function quitQuiz() {
    var confirmed = window.confirm("문제풀이를 종료하고 결과를 볼까요?");
    if (confirmed) {
      // 그만두기는 중과목 필터를 해제해서, 이후 "다시 풀기"를 누르면
      // 일반 설정 화면으로 돌아가 자유롭게 새 퀴즈를 고를 수 있게 한다.
      session.filterSub = null;
      session.filterSubName = null;
      showResult();
    }
  }

  // ---------- 결과 화면 ----------

  function bindResultEvents() {
    els.retryQuizBtn.addEventListener("click", handleRetryClick);
  }

  function handleRetryClick() {
    if (session.filterSub) {
      // 중과목 필터 모드였다면 같은 중과목 문제를 다시 섞어서 재출제한다.
      startFilteredQuiz(session.filterSub, session.filterSubName);
    } else {
      backToSetup();
    }
  }

  function showResult() {
    if (els.progressBarFill) {
      els.progressBarFill.style.width = "100%";
    }
    els.playSection.hidden = true;
    els.resultSection.hidden = false;

    var total = session.questions.length;
    var score = session.score;
    var percent = total ? Math.round((score / total) * 100) : 0;
    els.resultScoreText.textContent =
      total + "문제 중 " + score + "개 정답 (" + percent + "%)";
  }

  function backToSetup() {
    els.resultSection.hidden = true;
    els.setupSection.hidden = false;
  }
})();
