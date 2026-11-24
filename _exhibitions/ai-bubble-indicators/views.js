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

// A small screen needs actual text-sized ticks. Reuse the drawn paths and read the
// tick positions/labels from the source SVG, including its two independent dollar axes.
function compactFigure(svg) {
  const grid = [...svg.querySelectorAll('line[stroke="#dbe3ee"]')].filter(line =>
    line.y1.baseVal.value === line.y2.baseVal.value && line.x1.baseVal.value < line.x2.baseVal.value);
  if (grid.length < 2) return null;
  const left = grid[0].x1.baseVal.value;
  const right = grid[0].x2.baseVal.value;
  const rows = grid.map(line => line.y1.baseVal.value).sort((a,b) => a-b);
  const top = rows[0], bottom = rows.at(-1);
  const labels = [...svg.querySelectorAll('text')];
  const x = node => Number(node.getAttribute('x')), y = node => Number(node.getAttribute('y'));
  const dates = labels.filter(node => y(node) > bottom && x(node) >= left && x(node) <= right && /^[\d/.-]+$/.test(node.textContent));
  const dual = svg.dataset.chart === 'combined-original';
  if (dates.length < 2) return null;

  function axis(edge, side) {
    const column = document.createElement('div');
    column.className = 'compact-axis ' + side + (dual ? ' dual' : '');
    const ticks = rows.map(row => labels.find(node => Math.abs(x(node) - edge) < .1 && Math.abs(y(node) - row - 4) < .1));
    if (ticks.some(tick => !tick)) return null;
    column.dataset.widest = ticks.map(t => t.textContent).sort((a,b) => b.length - a.length)[0];
    for (const [i, tick] of ticks.entries()) {
      const label = document.createElement('span');
      label.textContent = tick.textContent;
      label.style.top = ((rows[i]-top)/(bottom-top)*100) + '%';
      column.append(label);
    }
    return column;
  }
  const leftAxis = axis(left - 10, 'left');
  const rightAxis = dual ? axis(right + 10, 'right') : document.createElement('div');
  if (!leftAxis || !rightAxis) return null;
  const drawing = document.createElementNS(svg.namespaceURI, 'svg');
  drawing.classList.add('compact-drawing');
  drawing.setAttribute('viewBox', [left, top, right-left, bottom-top].join(' '));
  drawing.setAttribute('preserveAspectRatio', 'none');
  drawing.setAttribute('aria-hidden', 'true');
  for (const shape of svg.children) {
    if (['path','line','circle','rect','polyline','g'].includes(shape.localName)) drawing.append(shape.cloneNode(true));
  }
  const period = document.createElement('div');
  period.className = 'compact-dates';
  for (const tick of [dates[0], dates.at(-1)]) {
    const label = document.createElement('span');
    label.textContent = tick.textContent;
    period.append(label);
  }
  const compact = document.createElement('div');
  compact.className = 'compact-figure';
  compact.setAttribute('role','img');
  compact.setAttribute('aria-label', svg.getAttribute('aria-label'));
  const frame = document.createElement('div');
  frame.className = 'compact-grid';
  frame.append(leftAxis, drawing, rightAxis, period);
  compact.append(frame);
  return compact;
}

const narrow = window.matchMedia('(max-width: 880px)');
function fitNarrow(viewport) {
  if (!narrow.matches || viewport.classList.contains('has-compact')) return;
  const fitted = compactFigure(viewport.querySelector('svg.latest-chart'));
  if (fitted) {
    viewport.append(fitted);
    viewport.classList.add('has-compact');
  }
}

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
  fitNarrow(viewport);
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
narrow.addEventListener('change', () => document.querySelectorAll('.plot-window').forEach(fitNarrow));
if (window.self !== window.top) document.documentElement.classList.add('in-gallery');

const contents = [...document.querySelectorAll('.figure-index a[href^="#"]')].map(link =>
  ({link, section: document.getElementById(link.hash.slice(1))})).filter(item => item.section);
function markCurrent() {
  let current = contents[0];
  for (const item of contents) {
    if (item.section.getBoundingClientRect().top <= Math.min(innerHeight / 4, 150)) current = item;
  }
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) current = contents.at(-1);
  for (const item of contents) {
    if (item === current) item.link.setAttribute('aria-current', 'location');
    else item.link.removeAttribute('aria-current');
  }
}
let pending = false;
addEventListener('scroll', () => {
  if (!pending) requestAnimationFrame(() => { pending = false; markCurrent(); });
  pending = true;
}, {passive: true});
markCurrent();
