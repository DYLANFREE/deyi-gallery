// Preserve the dedicated public URLs while both charts share a single reader.
(() => {
  const view = document.body.dataset.chart;
  const target = new URL('index.html', location.href);
  target.search = location.search;
  const rule = location.hash.slice(1).split('/').find(part => ['calendar','halving'].includes(part));
  if (rule) target.searchParams.set('rule', rule);
  target.hash = view;
  location.replace(target.href);
})();
