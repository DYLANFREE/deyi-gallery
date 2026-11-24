(() => {
  // The gallery already supplies a return control in its reader bar.
  // Keep the standalone return link when the exhibit is opened on its own.
  try {
    if (window.frameElement?.matches('.exhibit-frame') && parent.document.querySelector('.reader-bar')) {
      document.documentElement.classList.add('in-gallery-reader');
    }
  } catch { /* An external embed keeps its own return link. */ }
  const tabs = [...document.querySelectorAll('[data-view]')];
  const choices = [...document.querySelectorAll('input[name="rule"]')];
  function change(view, rule) {
    location.hash = view + '/' + rule;
    display();
  }
  function display() {
    const {view,rule} = BitcoinSeasons.route();
    const rendered = document.documentElement.dataset;
    if (rendered.view === view && rendered.rule === rule) return;
    for (const tab of tabs) {
      const active = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    }
    for (const radio of choices) radio.checked = radio.value === rule;
    document.dispatchEvent(new Event('season-view-change'));
    rendered.rule = rule;
    rendered.view = view;
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => change(tab.dataset.view, BitcoinSeasons.route().rule));
    tab.addEventListener('keydown', event => {
      let index;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') index = 1 - tabs.indexOf(tab);
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[index].focus();
      change(tabs[index].dataset.view, BitcoinSeasons.route().rule);
    });
  }
  for (const radio of choices) radio.addEventListener('change', () => change(BitcoinSeasons.route().view, radio.value));
  window.addEventListener('hashchange', display);
  display();
  window.BitcoinDailyReader.start();
})();
