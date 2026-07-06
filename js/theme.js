/**
 * theme.js — 다크모드 토글 (모든 페이지 공용)
 *
 * 계약:
 *  - 페이지 로드 시 localStorage.getItem('theme') 확인
 *    -> 없으면 prefers-color-scheme 감지
 *    -> document.documentElement.setAttribute('data-theme', 'dark'|'light')
 *  - #themeToggle 클릭 시 토글 + localStorage 저장 + aria-pressed 갱신
 *  - 아이콘 전환은 CSS(.icon-sun/.icon-moon)가 담당, JS는 상태만 관리
 */
(function () {
  "use strict";

  var STORAGE_KEY = "theme";
  var root = document.documentElement;

  function getPreferredTheme() {
    var stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      stored = null;
    }
    if (stored === "dark" || stored === "light") {
      return stored;
    }
    var prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var toggle = document.getElementById("themeToggle");
    if (toggle) {
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* localStorage unavailable (private mode, etc.) — ignore, state stays in-memory */
    }
  }

  // Apply as early as possible to avoid a flash of the wrong theme.
  applyTheme(getPreferredTheme());

  function initToggle() {
    var toggle = document.getElementById("themeToggle");
    if (!toggle) {
      return;
    }
    // Sync aria-pressed once DOM is ready (in case applyTheme ran before the button existed).
    applyTheme(root.getAttribute("data-theme") || getPreferredTheme());

    toggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      storeTheme(next);
    });
  }

  function initMobileNav() {
    var navToggle = document.getElementById("navToggle");
    var nav = document.getElementById("primaryNav");
    if (!navToggle || !nav) {
      return;
    }
    navToggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    // Close the mobile menu after a nav link is chosen.
    nav.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initToggle();
      initMobileNav();
    });
  } else {
    initToggle();
    initMobileNav();
  }
})();
