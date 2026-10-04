(() => {
  'use strict';
  const storageKey = 'civil-law-reader-v1';
  const data = window.lectureTexts || {};
  const preferences = { fontSize: 18, bookmarks: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if ([16, 18, 20, 22, 24].includes(saved?.fontSize)) preferences.fontSize = saved.fontSize;
    for (const [id, lecture] of Object.entries(data)) {
      if (Array.isArray(saved?.bookmarks?.[id])) {
        const anchors = saved.bookmarks[id].map(anchor => lecture.legacyAnchors[anchor] || anchor);
        preferences.bookmarks[id] = lecture.blocks.filter(block => anchors.includes(block.id)).map(block => block.id);
      }
    }
  } catch { /* Reading remains available without saved preferences. */ }

  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const bookmarkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>';
  const excerpt = block => block.text.length > 100 ? `${block.text.slice(0, 100).trim()}…` : block.text;
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(preferences)); return true; }
    catch { return false; }
  };

  function render(container, lessonId) {
    const lecture = data[lessonId];
    if (!lecture) {
      container.innerHTML = '<p>Дәріс мәтіні жүктелмеді. Төмендегі Word немесе PDF нұсқасын ашыңыз.</p>';
      return;
    }
    const listCounters = {};
    let blocks = '';
    let openList = null;
    for (const block of lecture.blocks) {
      const list = block.list;
      if (openList && (!list || list.id !== openList.id)) {
        blocks += `</${openList.ordered ? 'ol' : 'ul'}>`;
        openList = null;
      }
      if (list && !openList) {
        const start = (listCounters[list.id] ?? list.start - 1) + 1;
        blocks += list.ordered ? `<ol start="${start}">` : '<ul>';
        openList = list;
      }
      if (list) listCounters[list.id] = (listCounters[list.id] ?? list.start - 1) + 1;
      const tag = list ? 'li' : 'p';
      const marker = list ? ` data-list-marker="${escape(list.marker.replace(/%[1-9]/g, String(listCounters[list.id])))}"` : '';
      // Only source paragraphs and lists are rendered: no editorial headings or divisions.
      blocks += `<${tag} id="${block.id}" class="reader-paragraph" tabindex="-1" data-source-block${marker}><span class="reader-paragraph-text">${block.html}</span><button class="reader-bookmark" type="button" data-bookmark="${block.id}" aria-pressed="false" aria-label="Бетбелгіге сақтау: ${escape(excerpt(block))}">${bookmarkIcon}</button></${tag}>`;
    }
    if (openList) blocks += `</${openList.ordered ? 'ol' : 'ul'}>`;

    container.innerHTML = `<div class="lecture-reader">
      <div class="reader-toolbar">
        <div><span class="reader-eyebrow">ДӘРІС МӘТІНІ</span><p>Шамамен ${Math.max(1, Math.ceil(lecture.words / 180))} минут</p></div>
        <div class="reader-font-controls" role="group" aria-label="Мәтін өлшемі">
          <button type="button" data-font-change="-2" aria-label="Мәтінді кішірейту">A−</button>
          <button type="button" class="reader-font-reset" data-font-reset aria-label="Мәтін өлшемін қалпына келтіру"><span id="reader-font-value">${preferences.fontSize}</span> px</button>
          <button type="button" data-font-change="2" aria-label="Мәтінді үлкейту">A+</button>
        </div>
      </div>
      <div class="reader-navigation">
        <details class="reader-saved"><summary>${bookmarkIcon} Бетбелгілер <span id="reader-bookmark-count">0</span></summary><div id="reader-bookmark-list"></div></details>
      </div>
      <p class="reader-announcement" role="status" aria-live="polite"></p>
      <article class="reader-article reader-prose" aria-label="${escape(lecture.title)}">${blocks}</article>
    </div>`;
    const reader = container.querySelector('.lecture-reader');
    const announcement = container.querySelector('.reader-announcement');

    function updateFont() {
      reader.style.setProperty('--reader-font-size', `${preferences.fontSize}px`);
      container.querySelector('#reader-font-value').textContent = preferences.fontSize;
      container.querySelector('[data-font-change="-2"]').disabled = preferences.fontSize <= 16;
      container.querySelector('[data-font-change="2"]').disabled = preferences.fontSize >= 24;
    }

    function updateBookmarks() {
      const bookmarks = Object.entries(data).flatMap(([id, item]) => item.blocks
        .filter(block => preferences.bookmarks[id]?.includes(block.id))
        .map(block => ({ ...block, lessonId: id })));
      container.querySelector('#reader-bookmark-count').textContent = bookmarks.length;
      container.querySelector('#reader-bookmark-list').innerHTML = bookmarks.length ? `<ul>${bookmarks.map(block => `<li>
        <a href="lectures.html?lesson=${block.lessonId}#${block.id}" ${Number(block.lessonId) === lessonId ? `data-reader-target="${block.id}"` : ''}><small>${block.lessonId}-дәріс</small>${escape(excerpt(block))}</a>
        <button type="button" data-remove-bookmark="${block.id}" data-lesson-id="${block.lessonId}" aria-label="Бетбелгіні өшіру: ${escape(excerpt(block))}">×</button>
      </li>`).join('')}</ul>` : '<p class="reader-empty">Қажетті абзацтың жанындағы бетбелгі белгісін басыңыз. Сақталған үзінділер осында көрінеді.</p>';
      for (const button of container.querySelectorAll('[data-bookmark]')) {
        const saved = preferences.bookmarks[lessonId]?.includes(button.dataset.bookmark) || false;
        const block = lecture.blocks.find(item => item.id === button.dataset.bookmark);
        button.setAttribute('aria-pressed', String(saved));
        button.setAttribute('aria-label', `${saved ? 'Бетбелгіні өшіру' : 'Бетбелгіге сақтау'}: ${excerpt(block)}`);
        button.title = saved ? 'Бетбелгі сақталды' : 'Бетбелгіге сақтау';
      }
    }

    function goToParagraph(id) {
      const paragraph = document.getElementById(id);
      if (!paragraph || !container.contains(paragraph)) return;
      paragraph.focus({ preventScroll: true });
      paragraph.scrollIntoView({ block: 'start' });
    }

    // Assign the handler to replace it when moving between lectures.
    container.onclick = event => {
      const target = event.target.closest('button, a');
      if (!target || !container.contains(target)) return;
      if (target.hasAttribute('data-font-change') || target.hasAttribute('data-font-reset')) {
        preferences.fontSize = target.hasAttribute('data-font-reset') ? 18 : Math.max(16, Math.min(24, preferences.fontSize + Number(target.dataset.fontChange)));
        updateFont();
        save();
        announcement.textContent = `Мәтін өлшемі: ${preferences.fontSize} px.`;
      } else if (target.dataset.readerTarget) {
        event.preventDefault();
        goToParagraph(target.dataset.readerTarget);
      } else if (target.dataset.bookmark || target.dataset.removeBookmark) {
        const id = target.dataset.bookmark || target.dataset.removeBookmark;
        const owner = target.dataset.lessonId || lessonId;
        const saved = preferences.bookmarks[owner] || [];
        const removing = saved.includes(id);
        preferences.bookmarks[owner] = removing ? saved.filter(value => value !== id) : [...saved, id];
        const persistent = save();
        updateBookmarks();
        announcement.textContent = removing ? 'Бетбелгі өшірілді.' : persistent ? 'Бетбелгі сақталды.' : 'Бетбелгі осы сеансқа сақталды.';
        if (target.dataset.removeBookmark) container.querySelector('.reader-saved summary').focus();
      }
    };
    updateFont();
    updateBookmarks();
    const requestedAnchor = window.location.hash.slice(1);
    const requestedParagraph = lecture.legacyAnchors[requestedAnchor] || requestedAnchor;
    if (lecture.blocks.some(block => block.id === requestedParagraph)) {
      requestAnimationFrame(() => goToParagraph(requestedParagraph));
    }
  }

  window.LectureReader = { render };
})();
