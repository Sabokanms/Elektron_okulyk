(() => {
  'use strict';

  const header = document.querySelector('.site-header');
  if (!header) return;
  let scrollFrame = 0;
  const updateHeader = () => {
    scrollFrame = 0;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateHeader);
  }, { passive: true });
  window.addEventListener('pageshow', updateHeader);
  updateHeader();
})();
