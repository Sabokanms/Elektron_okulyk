(() => {
  'use strict';

  const body = document.body;
  if (!body?.classList.contains('home-page')) return;

  const root = document.documentElement;
  const progress = document.querySelector('.scroll-progress');
  const motionToggle = document.querySelector('.motion-toggle');
  const motionLabel = motionToggle?.querySelector('.motion-label');
  const art = document.querySelector('.hero-art');
  const hero = document.querySelector('.hero') || art;
  const magneticTargets = [...document.querySelectorAll('[data-magnetic]')];
  const revealTargets = [...document.querySelectorAll('[data-reveal]')];
  const countTargets = [...document.querySelectorAll('[data-count]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const counters = new Map();
  const current = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let manuallyPaused = false;
  let heroInView = true;
  let motionFrame = 0;
  let scrollFrame = 0;
  let revealObserver;
  let countObserver;

  const motionDisabled = () => manuallyPaused || reducedMotion.matches;
  const canAnimate = () => !motionDisabled() && !document.hidden;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const renderArt = () => {
    if (!art) return;
    art.style.setProperty('--rotate-x', `${-current.y * 5}deg`);
    art.style.setProperty('--rotate-y', `${current.x * 6}deg`);
    art.style.setProperty('--pointer-x', `${50 + current.x * 50}%`);
    art.style.setProperty('--pointer-y', `${50 + current.y * 50}%`);
  };

  const resetArt = () => {
    current.x = current.y = target.x = target.y = 0;
    renderArt();
  };

  const finishCounters = () => {
    counters.forEach((counter, element) => {
      element.textContent = counter.finalText;
    });
    counters.clear();
  };

  const revealAll = () => {
    root.classList.remove('motion-ready');
    revealTargets.forEach((element) => element.classList.add('is-visible'));
    revealObserver?.disconnect();
  };

  const resetMagnetics = () => {
    magneticTargets.forEach((element) => {
      element.style.setProperty('--magnetic-x', '0px');
      element.style.setProperty('--magnetic-y', '0px');
    });
  };

  const stopMotion = () => {
    if (motionFrame) window.cancelAnimationFrame(motionFrame);
    motionFrame = 0;
    finishCounters();
    resetArt();
    resetMagnetics();
  };

  const animate = (now) => {
    motionFrame = 0;
    if (!canAnimate()) {
      stopMotion();
      return;
    }

    counters.forEach((counter, element) => {
      const elapsed = clamp((now - counter.startedAt) / counter.duration, 0, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      element.textContent = counter.formatter.format(counter.value * eased);
      if (elapsed === 1) {
        element.textContent = counter.finalText;
        counters.delete(element);
      }
    });

    let artMoving = false;
    if (art && heroInView && finePointer.matches) {
      current.x += (target.x - current.x) * 0.14;
      current.y += (target.y - current.y) * 0.14;
      artMoving = Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001;
      if (!artMoving) {
        current.x = target.x;
        current.y = target.y;
      }
      renderArt();
    }

    if (counters.size || artMoving) motionFrame = window.requestAnimationFrame(animate);
  };

  const requestMotion = () => {
    if (!motionFrame && canAnimate()) motionFrame = window.requestAnimationFrame(animate);
  };

  const syncMotionPreference = () => {
    body.classList.toggle('motion-paused', manuallyPaused);
    body.classList.toggle('motion-reduced', reducedMotion.matches);
    body.classList.toggle('page-hidden', document.hidden);
    motionToggle?.setAttribute('aria-pressed', String(manuallyPaused));
    const label = manuallyPaused ? 'Анимацияны қосу' : 'Анимацияны тоқтату';
    motionToggle?.setAttribute('aria-label', label);
    if (motionLabel) motionLabel.textContent = label;
    if (!canAnimate()) stopMotion();
    if (motionDisabled()) {
      revealAll();
      countObserver?.disconnect();
    }
  };

  motionToggle?.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;
    syncMotionPreference();
  });
  reducedMotion.addEventListener('change', syncMotionPreference);
  finePointer.addEventListener('change', () => {
    if (!finePointer.matches) {
      resetArt();
      resetMagnetics();
    }
  });
  document.addEventListener('visibilitychange', syncMotionPreference);
  // Keep enhanced controls available when reveal animations are disabled.
  root.classList.add('js-ready');
  syncMotionPreference();

  const updateScroll = () => {
    scrollFrame = 0;
    const position = window.scrollY || root.scrollTop;
    if (progress) {
      const distance = root.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${distance > 0 ? clamp(position / distance, 0, 1) : 0})`;
    }
  };
  const requestScrollUpdate = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScroll);
  };
  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate, { passive: true });
  window.addEventListener('load', requestScrollUpdate, { once: true });
  updateScroll();

  if ('IntersectionObserver' in window) {
    if (!motionDisabled()) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
      revealTargets.forEach((element) => revealObserver.observe(element));
      // Content stays visible unless the enhancement is ready to reveal it.
      root.classList.add('motion-ready');

      countObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          countObserver.unobserve(entry.target);
          const value = Number(entry.target.dataset.count);
          if (!canAnimate() || !Number.isFinite(value)) return;
          const decimals = Math.min((entry.target.dataset.count.split('.')[1] || '').length, 3);
          counters.set(entry.target, {
            value,
            finalText: entry.target.textContent,
            startedAt: performance.now(),
            duration: 1250,
            formatter: new Intl.NumberFormat('kk-KZ', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            }),
          });
          requestMotion();
        });
      }, { threshold: 0.45 });
      countTargets.forEach((element) => countObserver.observe(element));
    }

    if (hero) {
      const heroObserver = new IntersectionObserver(([entry]) => {
        heroInView = entry.isIntersecting;
        body.classList.toggle('hero-in-view', heroInView);
        if (!heroInView) resetArt();
      }, { threshold: 0 });
      heroObserver.observe(hero);
    }
  } else {
    revealAll();
  }
  body.classList.toggle('hero-in-view', heroInView);

  if (art?.querySelector('.art-parallax')) {
    art.addEventListener('pointermove', (event) => {
      if (!canAnimate() || !finePointer.matches || !heroInView || event.pointerType === 'touch') return;
      const bounds = art.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      target.x = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
      target.y = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
      requestMotion();
    }, { passive: true });
    art.addEventListener('pointerleave', () => {
      target.x = target.y = 0;
      if (canAnimate()) requestMotion();
      else resetArt();
    });
    art.addEventListener('pointercancel', resetArt);
  }

  magneticTargets.forEach((element) => {
    element.addEventListener('pointermove', (event) => {
      if (!canAnimate() || !finePointer.matches || event.pointerType === 'touch') return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 9, -4.5, 4.5);
      const y = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 9, -4.5, 4.5);
      element.style.setProperty('--magnetic-x', `${x}px`);
      element.style.setProperty('--magnetic-y', `${y}px`);
    }, { passive: true });
    const reset = () => {
      element.style.setProperty('--magnetic-x', '0px');
      element.style.setProperty('--magnetic-y', '0px');
    };
    element.addEventListener('pointerleave', reset);
    element.addEventListener('pointercancel', reset);
    element.addEventListener('blur', reset);
  });

  const modules = [...document.querySelectorAll('#curriculum details.module-row')];
  modules.forEach((module) => {
    module.addEventListener('toggle', () => {
      if (module.open) {
        modules.forEach((other) => {
          if (other !== module && other.open) other.open = false;
        });
      }
      requestScrollUpdate();
    });
  });
})();
