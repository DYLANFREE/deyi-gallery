// Change between the author's saved chart views. No provider requests or recalculation.
for (const section of document.querySelectorAll('section[data-selected]')) {
  let box = section.querySelector('.chartbox');
  const views = new Map([...section.querySelectorAll('template[data-variant]')]
    .map(template => [template.dataset.variant, template.content.firstElementChild]));
  views.set(section.dataset.selected, box.cloneNode(true));

  section.addEventListener('click', event => {
    const button = event.target.closest('button[data-gpu-model], button[data-cross-model], button[data-cross-view]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    const selectedOption = group => box.querySelector('button[' + group + '][aria-pressed="true"]')?.getAttribute(group);
    const model = button.dataset.gpuModel || button.dataset.crossModel || selectedOption('data-cross-model');
    const mode = button.dataset.crossView || selectedOption('data-cross-view');
    const key = [model, mode].filter(Boolean).join('-');
    const saved = views.get(key);
    if (!saved) return;

    const expanded = box.querySelector('details[open]') !== null;
    const next = saved.cloneNode(true);
    if (expanded && next.querySelector('details')) next.querySelector('details').open = true;
    const group = ['data-gpu-model', 'data-cross-model', 'data-cross-view'].find(name => button.hasAttribute(name));
    const focusTarget = next.querySelector('button[' + group + '][aria-pressed="true"]');
    box.replaceWith(next);
    box = next;
    section.dataset.selected = key;
    enhancePlot(box);
    focusTarget?.focus({preventScroll: true});
  });
}

// The complete figure fits on phones. The same vector drawing can also be enlarged and panned.
function enhancePlot(container) {
  const svg = container.querySelector('svg.latest-chart');
  if (!svg || svg.style.display === 'none' || svg.parentElement.classList.contains('plot-window')) return;
  const viewport = document.createElement('div');
  viewport.className = 'plot-window';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'plot-zoom';
  toggle.textContent = '放大曲线';
  toggle.setAttribute('aria-pressed', 'false');
  svg.before(toggle, viewport);
  viewport.append(svg);
  toggle.addEventListener('click', () => {
    const enlarged = viewport.classList.toggle('enlarged');
    toggle.textContent = enlarged ? '查看全图' : '放大曲线';
    toggle.setAttribute('aria-pressed', String(enlarged));
    if (enlarged) {
      viewport.tabIndex = 0;
      viewport.setAttribute('role', 'region');
      viewport.setAttribute('aria-label', '放大的曲线，可左右滚动');
    } else {
      viewport.removeAttribute('tabindex');
      viewport.removeAttribute('role');
      viewport.removeAttribute('aria-label');
    }
  });
}
document.querySelectorAll('.chartbox').forEach(enhancePlot);
