(() => {
  const script = document.currentScript;
  if (!script) return;
  // Production inlines this small bootstrap before the first paint.
  const base = new URL(script.dataset.base || '../', script.src || location.href);
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const key = `itemstracker:page-transition:${base.pathname}`;
  let bridge, observer, timer, navigationTimer, destination;

  function pageKind(url) {
    if (url.origin !== base.origin) return null;
    if (url.pathname === `${base.pathname}app.html`) return 'app';
    if ([base.pathname, base.pathname.slice(0, -1), `${base.pathname}index.html`].includes(url.pathname)) return 'landing';
    return null;
  }
  function isPair(from, to) {
    const source = pageKind(from), target = pageKind(to);
    return source && target && source !== target && !from.hash && !to.hash;
  }
  function box(element) {
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }
  function geometry() {
    const frame = box(document.querySelector('.hero-surface, .auth-shell-public .auth-layout'));
    const brand = box(document.querySelector('.site-header .brand, .auth-public-header .auth-public-brand'));
    // A footer link can be clicked after the page's header has scrolled away.
    // Keep the bridge's logo near its normal position rather than flying in.
    if (brand && (brand.y < 0 || brand.y + brand.height > innerHeight)) {
      const padding = innerWidth <= 620 ? 17 : innerWidth <= 1100 ? 30 : 42;
      if (frame) frame.y = padding;
      brand.y = padding + (innerWidth <= 620 ? 72 : 88) / 2 - brand.height / 2;
    }
    return {
      frame,
      brand,
      mobile: innerWidth <= 620,
    };
  }
  function position(element, rect) {
    if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) || rect.width <= 0 || rect.height <= 0) return;
    Object.assign(element.style, {
      left: `${rect.x}px`, top: `${rect.y}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
    });
  }
  function reset() {
    clearTimeout(timer);
    observer?.disconnect();
    bridge?.remove();
    bridge = null;
    root.removeAttribute('data-page-transition');
  }
  function showBridge(layout) {
    bridge = document.createElement('div');
    bridge.className = 'items-motion-bridge';
    bridge.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('div');
    surface.className = 'items-motion-surface';
    const brand = document.createElement('div');
    brand.className = 'items-motion-brand';
    const logo = document.createElement('span');
    logo.className = 'logo';
    const name = document.createElement('span');
    name.textContent = 'ItemsTracker';
    brand.append(logo, name);
    bridge.append(surface, brand);
    if (layout?.mobile) bridge.classList.add('is-mobile');
    position(surface, layout?.frame);
    position(brand, layout?.brand);
    // Available before the body and before the React module has rendered.
    root.append(bridge);
  }
  function enter(layout) {
    reset();
    if (reduced.matches) return;
    root.dataset.pageTransition = 'waiting';
    showBridge(layout);
    let revealed = false;
    const reveal = () => {
      if (revealed || document.readyState === 'loading') return;
      if (pageKind(new URL(location.href)) === 'app' && !document.querySelector('#root > *')) return;
      revealed = true;
      observer?.disconnect();
      clearTimeout(timer);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!bridge || reduced.matches) return;
        root.dataset.pageTransition = 'entering';
        const target = geometry();
        position(bridge.querySelector('.items-motion-surface'), target.frame);
        position(bridge.querySelector('.items-motion-brand'), target.brand);
        timer = setTimeout(reset, 520);
      }));
    };
    observer = new MutationObserver(reveal);
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', reveal, { once: true });
    // A failed bundle must never leave the interface hidden.
    timer = setTimeout(reset, 4000);
    reveal();
  }
  function takeHandoff() {
    try {
      const handoff = JSON.parse(sessionStorage.getItem(key) || 'null');
      sessionStorage.removeItem(key);
      if (handoff && Date.now() - handoff.at < 15000 &&
          (!handoff.to || handoff.to === location.href) &&
          isPair(new URL(handoff.from), new URL(location.href))) enter(handoff.layout);
    } catch { /* Navigation still works when storage is unavailable. */ }
  }
  takeHandoff();

  document.addEventListener('click', event => {
    if (reduced.matches || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const to = new URL(link.href);
    if (!isPair(new URL(location.href), to)) return;
    if (destination) { event.preventDefault(); return; }
    const layout = geometry();
    try {
      sessionStorage.setItem(key, JSON.stringify({ from: location.href, to: to.href, at: Date.now(), layout }));
    } catch { return; }
    event.preventDefault();
    destination = to.href;
    reset();
    root.dataset.pageTransition = 'leaving';
    showBridge(layout);
    navigationTimer = setTimeout(() => location.assign(destination), 150);
    timer = setTimeout(() => { reset(); destination = null; }, 4000);
  });
  window.addEventListener('pagehide', () => {
    if (reduced.matches || destination) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({ from: location.href, at: Date.now(), layout: geometry() }));
    } catch { /* Optional history transition. */ }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    clearTimeout(navigationTimer);
    destination = null;
    reset();
    takeHandoff();
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    reset();
    if (destination) { clearTimeout(navigationTimer); location.assign(destination); }
  });
})();
