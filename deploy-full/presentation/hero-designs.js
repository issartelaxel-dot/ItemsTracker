const proposedHero = new URLSearchParams(location.search).get('hero') || 'centered';
if (['dashboard', 'cards', 'relief'].includes(proposedHero)) {
  document.documentElement.dataset.heroDesign = proposedHero;
}

if (proposedHero === 'centered') {
  document.documentElement.dataset.heroDesign = 'relief';
  document.documentElement.dataset.heroLayout = 'centered';
}
