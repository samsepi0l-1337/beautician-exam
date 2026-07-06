/*
 * study.js — 개념학습 페이지 전용 로직
 * data/concepts.json을 fetch해서 55개 개념을 "한 번에 하나씩" 보여주는 리더로 렌더링한다.
 * 구조: { categories: [ { categoryKey, categoryName, subCategories: [ { subCategoryKey, subCategoryName, concepts: [ { title, body, summary, examPoints[] } ] } ] } ] }
 *
 * 흐름:
 *   1) fetch → categories 로드
 *   2) buildFlatConcepts(categories) 로 대과목→중과목→개념 순서를 그대로 평평한 배열(flatConcepts)로 만든다
 *      (concept 0 = 미용이론 첫 개념, concept 54 = 공중위생관리학 마지막 개념)
 *   3) renderToc() 로 대과목/중과목/개념이 중첩된 목차를 한 번 그린다 (이후 재렌더 없음)
 *   4) navigateTo(index) 가 유일한 진입점: URL 해시 갱신 + renderReader(index) 로 본문 교체 + TOC 하이라이트 갱신
 *   5) hashchange (브라우저 뒤로/앞으로가기, TOC 링크 클릭)와 prev/next 버튼 클릭이 모두 navigateTo를 거친다
 */
(function () {
  "use strict";

  var CATEGORY_COLOR_VAR = {
    theory: "--cat-theory",
    skin: "--cat-skin",
    cosmetics: "--cat-cosmetics",
    hygiene: "--cat-hygiene",
  };

  var tocEl = document.getElementById("studyToc");
  var contentEl = document.getElementById("studyContent");

  // flatConcepts[i] = { id, categoryKey, categoryName, colorVar, subCategoryKey, subCategoryName, subIndex, conceptIndex, concept }
  var flatConcepts = [];
  // id(concept-theory-6-0 형태) -> flatConcepts의 인덱스
  var idIndexMap = {};
  var currentIndex = 0;

  // TOC 렌더 이후 채워지는 요소 참조 (매 네비게이션마다 다시 querySelectorAll 하지 않기 위해 캐시)
  var tocCatLabelEls = {};
  var tocSubLinkEls = {};
  var tocConceptListEls = {};
  var tocCaretEls = {};
  var tocConceptLinkEls = {};

  // navigateTo()가 스스로 location.hash를 바꿀 때, 곧바로 뒤따르는 hashchange 이벤트에서
  // 같은 내용을 두 번 렌더링하지 않도록 막는 가드 플래그.
  var suppressNextHashChange = false;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // body는 문단 사이에 빈 줄(\n\n)로 구분되어 있다고 가정하고 <p>로 분리한다.
  function renderParagraphs(body) {
    return String(body || "")
      .split(/\n\s*\n/)
      .map(function (p) {
        return p.trim();
      })
      .filter(Boolean)
      .map(function (p) {
        return "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
  }

  function categoryColorVar(categoryKey) {
    return CATEGORY_COLOR_VAR[categoryKey] || "--accent";
  }

  function conceptId(categoryKey, subIndex, conceptIndex) {
    return "concept-" + categoryKey + "-" + subIndex + "-" + conceptIndex;
  }

  // 대과목 → 중과목 → 개념 순서를 그대로 훑어서 55개 개념의 평평한 목록을 만든다.
  function buildFlatConcepts(categories) {
    var flat = [];
    var indexMap = {};

    categories.forEach(function (category) {
      var categoryKey = category.categoryKey || "";
      var categoryName = category.categoryName || "";
      var colorVar = categoryColorVar(categoryKey);
      var subCategories = Array.isArray(category.subCategories) ? category.subCategories : [];

      subCategories.forEach(function (subCategory, subIndex) {
        var subCategoryKey = subCategory.subCategoryKey || "";
        var subCategoryName = subCategory.subCategoryName || "";
        var concepts = Array.isArray(subCategory.concepts) ? subCategory.concepts : [];

        concepts.forEach(function (concept, conceptIndex) {
          var id = conceptId(categoryKey, subIndex, conceptIndex);
          indexMap[id] = flat.length;
          flat.push({
            id: id,
            categoryKey: categoryKey,
            categoryName: categoryName,
            colorVar: colorVar,
            subCategoryKey: subCategoryKey,
            subCategoryName: subCategoryName,
            subIndex: subIndex,
            conceptIndex: conceptIndex,
            concept: concept,
          });
        });
      });
    });

    idIndexMap = indexMap;
    return flat;
  }

  function clampIndex(index) {
    if (!flatConcepts.length) return 0;
    if (index < 0) return 0;
    if (index > flatConcepts.length - 1) return flatConcepts.length - 1;
    return index;
  }

  function indexFromHash(hash) {
    var id = String(hash || "").replace(/^#/, "");
    if (id && Object.prototype.hasOwnProperty.call(idIndexMap, id)) {
      return idIndexMap[id];
    }
    return 0;
  }

  // ---- 목차(TOC) 렌더링 ----------------------------------------------------

  function renderToc(categories) {
    var html = categories
      .map(function (category) {
        var categoryKey = category.categoryKey || "";
        var colorVar = categoryColorVar(categoryKey);
        var subCategories = Array.isArray(category.subCategories) ? category.subCategories : [];

        var subItemsHtml = subCategories
          .map(function (subCategory, subIndex) {
            var subCategoryKey = subCategory.subCategoryKey || "";
            var concepts = Array.isArray(subCategory.concepts) ? subCategory.concepts : [];
            var firstHref = concepts.length ? "#" + conceptId(categoryKey, subIndex, 0) : "#";

            var conceptLinksHtml = concepts
              .map(function (concept, conceptIndex) {
                var id = conceptId(categoryKey, subIndex, conceptIndex);
                return (
                  '<li><a class="toc-concept-link" href="#' + id + '" data-concept-id="' + id + '">' +
                  escapeHtml(concept.title || "") +
                  "</a></li>"
                );
              })
              .join("");

            return (
              '<li class="study-toc-subitem" data-subcategory-key="' + escapeHtml(subCategoryKey) + '">' +
              '<div class="toc-sub-row">' +
              '<a class="toc-sublink" href="' + firstHref + '" data-subcategory-key="' + escapeHtml(subCategoryKey) + '">' +
              escapeHtml(subCategory.subCategoryName || "") +
              "</a>" +
              '<button type="button" class="toc-caret" data-subcategory-key="' + escapeHtml(subCategoryKey) + '" aria-expanded="false" aria-label="' + escapeHtml(subCategory.subCategoryName || "") + ' 개념 목록 펼치기">' +
              '<span aria-hidden="true">▾</span>' +
              "</button>" +
              "</div>" +
              '<ul class="toc-concept-list" data-subcategory-key="' + escapeHtml(subCategoryKey) + '" hidden>' +
              conceptLinksHtml +
              "</ul>" +
              "</li>"
            );
          })
          .join("");

        return (
          '<li class="study-toc-catitem">' +
          '<p class="toc-cat-label" data-category-key="' + escapeHtml(categoryKey) + '" style="--cat-color: var(' + colorVar + ')">' +
          escapeHtml(category.categoryName || "") +
          "</p>" +
          '<ul class="study-toc-sublist">' + subItemsHtml + "</ul>" +
          "</li>"
        );
      })
      .join("");

    tocEl.innerHTML = html;
    cacheTocElements();
  }

  function cacheTocElements() {
    tocCatLabelEls = {};
    tocSubLinkEls = {};
    tocConceptListEls = {};
    tocCaretEls = {};
    tocConceptLinkEls = {};

    var catLabels = tocEl.querySelectorAll(".toc-cat-label[data-category-key]");
    for (var i = 0; i < catLabels.length; i++) {
      tocCatLabelEls[catLabels[i].getAttribute("data-category-key")] = catLabels[i];
    }

    var subLinks = tocEl.querySelectorAll(".toc-sublink[data-subcategory-key]");
    for (var j = 0; j < subLinks.length; j++) {
      tocSubLinkEls[subLinks[j].getAttribute("data-subcategory-key")] = subLinks[j];
    }

    var conceptLists = tocEl.querySelectorAll(".toc-concept-list[data-subcategory-key]");
    for (var k = 0; k < conceptLists.length; k++) {
      tocConceptListEls[conceptLists[k].getAttribute("data-subcategory-key")] = conceptLists[k];
    }

    var carets = tocEl.querySelectorAll(".toc-caret[data-subcategory-key]");
    for (var m = 0; m < carets.length; m++) {
      tocCaretEls[carets[m].getAttribute("data-subcategory-key")] = carets[m];
    }

    var conceptLinks = tocEl.querySelectorAll(".toc-concept-link[data-concept-id]");
    for (var n = 0; n < conceptLinks.length; n++) {
      tocConceptLinkEls[conceptLinks[n].getAttribute("data-concept-id")] = conceptLinks[n];
    }
  }

  function setSubcategoryExpanded(subCategoryKey, expanded) {
    var list = tocConceptListEls[subCategoryKey];
    var caret = tocCaretEls[subCategoryKey];
    if (list) list.hidden = !expanded;
    if (caret) caret.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  // 현재 보여주는 개념에 맞춰 TOC 하이라이트를 갱신한다: 대과목 라벨, 중과목 링크, 개념 링크에
  // is-current를 찍고, 현재 중과목만 펼치고 나머지는 접어 사이드바가 무한정 길어지지 않게 한다.
  function updateTocHighlight(entry) {
    var key;

    for (key in tocCatLabelEls) {
      if (Object.prototype.hasOwnProperty.call(tocCatLabelEls, key)) {
        tocCatLabelEls[key].classList.toggle("is-current", key === entry.categoryKey);
      }
    }

    for (key in tocSubLinkEls) {
      if (Object.prototype.hasOwnProperty.call(tocSubLinkEls, key)) {
        tocSubLinkEls[key].classList.toggle("is-current", key === entry.subCategoryKey);
      }
    }

    for (key in tocConceptListEls) {
      if (Object.prototype.hasOwnProperty.call(tocConceptListEls, key)) {
        setSubcategoryExpanded(key, key === entry.subCategoryKey);
      }
    }

    for (key in tocConceptLinkEls) {
      if (Object.prototype.hasOwnProperty.call(tocConceptLinkEls, key)) {
        tocConceptLinkEls[key].classList.toggle("is-current", key === entry.id);
      }
    }
  }

  // ---- 단일 개념 리더(reader) 렌더링 ---------------------------------------

  function renderConceptArticle(entry) {
    var concept = entry.concept || {};
    var examPoints = Array.isArray(concept.examPoints) ? concept.examPoints : [];
    var examPointsHtml = examPoints
      .map(function (point) {
        return "<li>" + escapeHtml(point) + "</li>";
      })
      .join("");

    var summaryBox = concept.summary
      ? '<div class="concept-box concept-summary">' +
        '<p class="concept-box-label">요약</p>' +
        "<p>" + escapeHtml(concept.summary) + "</p>" +
        "</div>"
      : "";

    var examBox = examPointsHtml
      ? '<div class="concept-box concept-exam-points">' +
        '<p class="concept-box-label">시험 출제 포인트</p>' +
        "<ul>" + examPointsHtml + "</ul>" +
        "</div>"
      : "";

    return (
      '<article class="concept" id="' + entry.id + '" style="--cat-color: var(' + entry.colorVar + ')">' +
      '<p class="reader-breadcrumb">' +
      escapeHtml(entry.categoryName) +
      ' <span class="reader-breadcrumb-sep" aria-hidden="true">·</span> ' +
      escapeHtml(entry.subCategoryName) +
      "</p>" +
      '<h1 class="concept-title reader-title">' + escapeHtml(concept.title || "") + "</h1>" +
      '<div class="concept-body">' + renderParagraphs(concept.body) + "</div>" +
      summaryBox +
      examBox +
      "</article>"
    );
  }

  function renderNavRow(index) {
    var isFirst = index <= 0;
    var isLast = index >= flatConcepts.length - 1;
    var entry = flatConcepts[index];
    var prevEntry = isFirst ? null : flatConcepts[index - 1];
    var nextEntry = isLast ? null : flatConcepts[index + 1];

    var prevTitleHtml = prevEntry
      ? '<span class="reader-nav-title">' + escapeHtml(prevEntry.concept.title || "") + "</span>"
      : "";
    var nextTitleHtml = nextEntry
      ? '<span class="reader-nav-title">' + escapeHtml(nextEntry.concept.title || "") + "</span>"
      : "";

    return (
      '<div class="reader-nav">' +
      '<button type="button" class="btn reader-nav-btn reader-prev"' + (isFirst ? " disabled" : "") + ">" +
      '<span aria-hidden="true">◀</span> 이전 개념' +
      prevTitleHtml +
      "</button>" +
      '<a class="btn btn-primary reader-quiz-btn" href="quiz.html?sub=' + encodeURIComponent(entry.subCategoryKey) + '">' +
      "‘" + escapeHtml(entry.subCategoryName) + "’ 문제 풀기" +
      "</a>" +
      '<button type="button" class="btn reader-nav-btn reader-next"' + (isLast ? " disabled" : "") + ">" +
      "다음 개념 " +
      nextTitleHtml +
      '<span aria-hidden="true">▶</span>' +
      "</button>" +
      "</div>" +
      '<p class="reader-position">' + (index + 1) + " / " + flatConcepts.length + "</p>"
    );
  }

  function renderReader(index) {
    currentIndex = clampIndex(index);
    var entry = flatConcepts[currentIndex];

    contentEl.innerHTML =
      '<div class="concept-reader">' +
      renderConceptArticle(entry) +
      renderNavRow(currentIndex) +
      "</div>";

    updateTocHighlight(entry);
  }

  // 유일한 네비게이션 진입점: 인덱스를 정하고, URL 해시를 맞추고, 화면을 다시 그린다.
  function navigateTo(index) {
    index = clampIndex(index);
    var entry = flatConcepts[index];
    var newHash = "#" + entry.id;

    if (window.location.hash !== newHash) {
      suppressNextHashChange = true;
      window.location.hash = newHash;
    }

    renderReader(index);
  }

  function handleHashChange() {
    if (suppressNextHashChange) {
      suppressNextHashChange = false;
      return;
    }
    renderReader(indexFromHash(window.location.hash));
  }

  function handleContentClick(event) {
    var prevBtn = event.target.closest ? event.target.closest(".reader-prev") : null;
    var nextBtn = event.target.closest ? event.target.closest(".reader-next") : null;

    if (prevBtn && !prevBtn.disabled) {
      navigateTo(currentIndex - 1);
      return;
    }
    if (nextBtn && !nextBtn.disabled) {
      navigateTo(currentIndex + 1);
    }
  }

  function handleTocClick(event) {
    var caret = event.target.closest ? event.target.closest(".toc-caret") : null;
    if (!caret) return;

    var subCategoryKey = caret.getAttribute("data-subcategory-key");
    var list = tocConceptListEls[subCategoryKey];
    if (!list) return;

    setSubcategoryExpanded(subCategoryKey, list.hidden);
  }

  function showError() {
    contentEl.innerHTML =
      '<p class="study-error">개념 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
    tocEl.innerHTML = "";
  }

  function showEmpty() {
    contentEl.innerHTML = '<p class="study-empty">등록된 개념이 아직 없습니다.</p>';
    tocEl.innerHTML = "";
  }

  function init() {
    fetch("data/concepts.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var categories = (data && data.categories) || [];
        flatConcepts = buildFlatConcepts(categories);

        if (!flatConcepts.length) {
          showEmpty();
          return;
        }

        renderToc(categories);
        contentEl.addEventListener("click", handleContentClick);
        tocEl.addEventListener("click", handleTocClick);
        window.addEventListener("hashchange", handleHashChange);

        renderReader(indexFromHash(window.location.hash));
      })
      .catch(function (err) {
        showError();
        if (window.console && console.error) {
          console.error("study.js: failed to load concepts.json", err);
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
