// Content script for Wordle Hints Chrome extension

(function() {
  'use strict';

  let worker = null;
  let lastGuessCount = 0;
  let debounceTimer = null;
  let boardObserver = null;
  let panelEl = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function readBoardState() {
    const tiles = document.querySelectorAll('[data-testid="tile"]');
    if (tiles.length === 0) return { guesses: [], feedbacks: [] };

    const guesses = [];
    const feedbacks = [];
    const stateMap = { correct: 2, present: 1, absent: 0 };

    for (let row = 0; row < 6; row++) {
      const start = row * 5;
      if (start >= tiles.length) break;

      const rowTiles = Array.from(tiles).slice(start, start + 5);
      const states = rowTiles.map(t => t.getAttribute('data-state'));

      if (states.some(s => s === 'empty' || s === 'tbd' || s === null)) break;

      const letters = rowTiles.map(t => t.textContent.trim().toLowerCase());
      const guess = letters.join('');
      const feedback = states.map(s => stateMap[s] !== undefined ? stateMap[s] : 0);

      guesses.push(guess);
      feedbacks.push(feedback);
    }

    return { guesses, feedbacks };
  }

  function initWorker() {
    const workerUrl = chrome.runtime.getURL('worker.js');
    worker = new Worker(workerUrl);
    worker.onmessage = function(e) { updatePanel(e.data); };
  }

  function requestSuggestions(state) {
    if (!worker) return;
    showLoading();
    worker.postMessage({ guesses: state.guesses, feedbacks: state.feedbacks });
  }

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'wordle-hint-panel';
    panelEl.innerHTML = `
      <div id="wordle-hint-header">
        <span id="wordle-hint-title">Wordle Hints</span>
        <span id="wordle-hint-remaining-badge"></span>
        <button class="wordle-hint-btn" id="wordle-hint-minimize" title="Minimize">&#8211;</button>
        <button class="wordle-hint-btn" id="wordle-hint-close" title="Close">&times;</button>
      </div>
      <div id="wordle-hint-body">
        <div id="wordle-hint-loading" class="wordle-hint-hidden">
          <span class="wordle-hint-spinner"></span> Computing...
        </div>
        <div id="wordle-hint-content">
          <ol id="wordle-hint-list"></ol>
          <div id="wordle-hint-stats">
            <div class="wordle-hint-stat">
              <div class="wordle-hint-stat-value" id="wordle-hint-stat-remaining">-</div>
              <div class="wordle-hint-stat-label">Remaining</div>
            </div>
            <div class="wordle-hint-stat">
              <div class="wordle-hint-stat-value" id="wordle-hint-stat-confidence">-</div>
              <div class="wordle-hint-stat-label">Confidence</div>
            </div>
          </div>
          <div id="wordle-hint-freq">
            <div id="wordle-hint-freq-title">Top Letters</div>
            <div id="wordle-hint-freq-list"></div>
          </div>
        </div>
        <div id="wordle-hint-solved" class="wordle-hint-hidden">Solved!</div>
      </div>
    `;
    document.body.appendChild(panelEl);
    document.getElementById('wordle-hint-minimize').addEventListener('click', toggleMinimize);
    document.getElementById('wordle-hint-close').addEventListener('click', closePanel);
    document.getElementById('wordle-hint-header').addEventListener('mousedown', startDrag);
    restorePanelState();
  }

  function toggleMinimize() {
    const body = document.getElementById('wordle-hint-body');
    const btn = document.getElementById('wordle-hint-minimize');
    const isMinimized = body.classList.toggle('wordle-hint-hidden');
    btn.innerHTML = isMinimized ? '&#9633;' : '&#8211;';
    chrome.storage.local.set({ wordleHintMinimized: isMinimized });
  }

  function closePanel() {
    if (panelEl) { panelEl.remove(); panelEl = null; }
    if (boardObserver) { boardObserver.disconnect(); boardObserver = null; }
    if (worker) { worker.terminate(); worker = null; }
  }

  function startDrag(e) {
    if (e.target.closest('.wordle-hint-btn')) return;
    isDragging = true;
    const rect = panelEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  }

  function onDrag(e) {
    if (!isDragging || !panelEl) return;
    panelEl.style.left = (e.clientX - dragOffsetX) + 'px';
    panelEl.style.top = (e.clientY - dragOffsetY) + 'px';
    panelEl.style.right = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    if (panelEl) {
      chrome.storage.local.set({
        wordleHintPos: { left: panelEl.style.left, top: panelEl.style.top }
      });
    }
  }

  function restorePanelState() {
    chrome.storage.local.get(['wordleHintPos', 'wordleHintMinimized'], function(data) {
      if (data.wordleHintPos && panelEl) {
        panelEl.style.left = data.wordleHintPos.left;
        panelEl.style.top = data.wordleHintPos.top;
        panelEl.style.right = 'auto';
      }
      if (data.wordleHintMinimized && panelEl) {
        document.getElementById('wordle-hint-body').classList.add('wordle-hint-hidden');
        document.getElementById('wordle-hint-minimize').innerHTML = '&#9633;';
      }
    });
  }

  function showLoading() {
    const loading = document.getElementById('wordle-hint-loading');
    const content = document.getElementById('wordle-hint-content');
    const solved = document.getElementById('wordle-hint-solved');
    if (loading) loading.classList.remove('wordle-hint-hidden');
    if (content) content.classList.add('wordle-hint-hidden');
    if (solved) solved.classList.add('wordle-hint-hidden');
  }

  function updatePanel(data) {
    const loading = document.getElementById('wordle-hint-loading');
    const content = document.getElementById('wordle-hint-content');
    const solved = document.getElementById('wordle-hint-solved');
    const badge = document.getElementById('wordle-hint-remaining-badge');
    if (!loading || !content || !solved) return;

    loading.classList.add('wordle-hint-hidden');

    if (data.solved) {
      content.classList.add('wordle-hint-hidden');
      solved.classList.remove('wordle-hint-hidden');
      if (badge) badge.textContent = 'Solved';
      return;
    }

    content.classList.remove('wordle-hint-hidden');
    solved.classList.add('wordle-hint-hidden');

    if (badge) badge.textContent = data.remaining + ' left';

    const list = document.getElementById('wordle-hint-list');
    if (list) {
      const maxScore = data.suggestions.length > 0 ? data.suggestions[0][1] : 1;
      list.innerHTML = data.suggestions.map((s, i) => {
        const barWidth = Math.round((s[1] / maxScore) * 100);
        return `<li>
          <span class="wordle-hint-rank">${i + 1}.</span>
          <span class="wordle-hint-word">${s[0]}</span>
          <span class="wordle-hint-score">${s[1].toFixed(2)}</span>
          <span class="wordle-hint-bar-container">
            <span class="wordle-hint-bar" style="width:${barWidth}%"></span>
          </span>
        </li>`;
      }).join('');
    }

    const statRemaining = document.getElementById('wordle-hint-stat-remaining');
    const statConfidence = document.getElementById('wordle-hint-stat-confidence');
    if (statRemaining) statRemaining.textContent = data.remaining;
    if (statConfidence) {
      const confidence = data.remaining > 0 ? (100 / data.remaining).toFixed(1) : '0';
      statConfidence.textContent = confidence + '%';
    }

    const freqList = document.getElementById('wordle-hint-freq-list');
    if (freqList && data.letterFrequency) {
      freqList.innerHTML = data.letterFrequency.map(([letter, pct]) => {
        return `<span class="wordle-hint-freq-item">
          <span class="wordle-hint-freq-letter">${letter}</span>
          <span class="wordle-hint-freq-pct">${pct}%</span>
        </span>`;
      }).join('');
    }
  }

  function startObserving() {
    const boardEl = document.querySelector('[data-testid="tile"]');
    if (!boardEl) return false;
    const observeTarget = boardEl.parentElement?.parentElement?.parentElement || document.body;

    boardObserver = new MutationObserver(function(mutations) {
      const relevant = mutations.some(m => m.attributeName === 'data-state');
      if (!relevant) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        const state = readBoardState();
        if (state.guesses.length !== lastGuessCount) {
          lastGuessCount = state.guesses.length;
          requestSuggestions(state);
        }
      }, 600);
    });

    boardObserver.observe(observeTarget, {
      attributes: true,
      attributeFilter: ['data-state'],
      subtree: true
    });
    return true;
  }

  function waitForBoard(callback) {
    const observer = new MutationObserver(function(_, obs) {
      if (document.querySelector('[data-testid="tile"]')) {
        obs.disconnect();
        callback();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, 10000);
  }

  function init() {
    createPanel();
    initWorker();
    const state = readBoardState();
    lastGuessCount = state.guesses.length;
    requestSuggestions(state);
    if (!startObserving()) {
      waitForBoard(function() {
        const s = readBoardState();
        lastGuessCount = s.guesses.length;
        requestSuggestions(s);
        startObserving();
      });
    }
  }

  init();
})();
