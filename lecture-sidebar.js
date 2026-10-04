(() => {
  'use strict';

  const sidebar = document.querySelector('.sidebar');
  const header = document.querySelector('.site-header');
  if (!sidebar || !header) return;

  const desktop = window.matchMedia('(min-width: 961px)');
  let layoutFrame = 0;

  const updateLayout = () => {
    layoutFrame = 0;
    const top = Math.ceil(header.getBoundingClientRect().height) + 12;
    sidebar.style.setProperty('--lecture-sidebar-top', `${top}px`);
    delete sidebar.dataset.pinned;
    delete sidebar.dataset.density;
    if (!desktop.matches) return;

    const availableHeight = document.documentElement.clientHeight - top - 12;
    for (const density of ['comfortable', 'compact', 'dense']) {
      sidebar.dataset.density = density;
      if (Math.ceil(sidebar.getBoundingClientRect().height) <= availableHeight) {
        sidebar.dataset.pinned = '';
        return;
      }
    }

    // A short or enlarged viewport must never trap the last lessons off-screen.
    delete sidebar.dataset.density;
  };

  const scheduleLayout = () => {
    if (!layoutFrame) layoutFrame = window.requestAnimationFrame(updateLayout);
  };

  const observer = new ResizeObserver(scheduleLayout);
  observer.observe(header);
  observer.observe(sidebar);
  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('pageshow', scheduleLayout);
  document.fonts.ready.then(scheduleLayout);
  scheduleLayout();
})();
