(() => {
  const menu = document.querySelector('.mobile-navigation');
  if (!menu) return;
  const summary = menu.querySelector('summary');
  // Native details keeps the full navigation usable without JavaScript.
  menu.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a[href]')) menu.open = false;
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      summary.focus();
    }
  });
  matchMedia('(min-width: 1201px)').addEventListener('change', event => {
    if (event.matches) menu.open = false;
  });
  addEventListener('pageshow', () => { menu.open = false; });
})();
