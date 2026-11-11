import { tourText } from '../ui/strings';

// Read-only tour: the overlay points at controls without invoking any workspace action.
export function createTour(currentPane: () => HTMLElement) {
  const dialog = document.createElement('dialog');
  dialog.className = 'tour';
  dialog.setAttribute('aria-label', tourText.label);
  dialog.innerHTML = `<div class="tour-spotlight" aria-hidden="true"></div>
    <section class="tour-card" aria-labelledby="tour-title">
      <div class="tour-top"><span class="tour-progress"></span><button type="button" class="tour-end">${tourText.end}</button></div>
      <div class="tour-copy" aria-live="polite" aria-atomic="true"><h2 id="tour-title"></h2><p class="tour-body"></p><p class="tour-hint"></p></div>
      <div class="tour-actions"><button type="button" class="tour-back">${tourText.back}</button><button type="button" class="tour-next">${tourText.next}</button></div>
      <p class="tour-keyboard">${tourText.keyboard}</p>
    </section>`;
  document.body.append(dialog);
  const card = dialog.querySelector<HTMLElement>('.tour-card')!;
  const spotlight = dialog.querySelector<HTMLElement>('.tour-spotlight')!;
  const back = dialog.querySelector<HTMLButtonElement>('.tour-back')!;
  const next = dialog.querySelector<HTMLButtonElement>('.tour-next')!;
  const query = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
  const paneQuery = (selector: string) => [...currentPane().querySelectorAll<HTMLElement>(selector)];
  const targets = [
    () => query('.toolbar .count-group'),
    () => query('.toolbar .split-left, .toolbar .split-x, .toolbar .split-up, .toolbar .split-y'),
    () => paneQuery('.pane-number'),
    () => paneQuery('.pane-number'),
    () => query('.toolbar .sidebar-toggle'),
    () => paneQuery('.back, .forward'),
    () => paneQuery('.close'),
    () => query('.toolbar .direction-group, .toolbar .preset'),
    () => query('.toolbar .guide'),
  ];
  let index = 0;
  let returnFocus: HTMLElement | null = null;
  let frame: number | undefined;
  const observer = new ResizeObserver(() => schedulePosition());
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));
  function position(): void {
    if (!dialog.open) return;
    const rects = targets[index]!().map(element => {
      const rect = element.getBoundingClientRect();
      const pane = element.closest('.pane')?.getBoundingClientRect();
      // Headers in very narrow panes can clip controls. Highlight only a visible control.
      return pane && (rect.left < pane.left || rect.right > pane.right) ? null : rect;
    }).filter((rect): rect is DOMRect => Boolean(rect && rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight));
    const bounds = rects.length ? {
      left: clamp(Math.min(...rects.map(rect => rect.left)) - 5, 6, innerWidth - 6),
      top: clamp(Math.min(...rects.map(rect => rect.top)) - 5, 6, innerHeight - 6),
      right: clamp(Math.max(...rects.map(rect => rect.right)) + 5, 6, innerWidth - 6),
      bottom: clamp(Math.max(...rects.map(rect => rect.bottom)) + 5, 6, innerHeight - 6),
    } : null;
    dialog.classList.toggle('tour-no-target', !bounds);
    spotlight.hidden = !bounds;
    const { width, height } = card.getBoundingClientRect();
    let left = (innerWidth - width) / 2;
    let top = (innerHeight - height) / 2;
    if (bounds) {
      Object.assign(spotlight.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.right - bounds.left}px`, height: `${bounds.bottom - bounds.top}px` });
      left = clamp(bounds.left, 12, innerWidth - width - 12);
      if (innerHeight - bounds.bottom - 12 >= height) top = bounds.bottom + 12;
      else if (bounds.top - 12 >= height) top = bounds.top - height - 12;
      else if (innerWidth - bounds.right - 12 >= width) { left = bounds.right + 12; top = bounds.top; }
      else if (bounds.left - 12 >= width) { left = bounds.left - width - 12; top = bounds.top; }
    }
    Object.assign(card.style, { left: `${clamp(left, 12, innerWidth - width - 12)}px`, top: `${clamp(top, 12, innerHeight - height - 12)}px` });
  }
  function schedulePosition(): void {
    if (!dialog.open || frame !== undefined) return;
    frame = requestAnimationFrame(() => { frame = undefined; position(); });
  }
  function render(): void {
    const step = tourText.steps[index]!;
    dialog.querySelector('.tour-progress')!.textContent = `${index + 1} / ${tourText.steps.length}`;
    dialog.querySelector('h2')!.textContent = step.title;
    dialog.querySelector('.tour-body')!.textContent = step.body;
    dialog.querySelector('.tour-hint')!.textContent = step.hint;
    back.disabled = index === 0;
    next.textContent = index === tourText.steps.length - 1 ? tourText.finish : tourText.next;
    observer.disconnect();
    observer.observe(card);
    for (const target of targets[index]!()) observer.observe(target);
    position();
    if (document.activeElement === back && back.disabled) next.focus();
  }
  function close(): void {
    observer.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    dialog.close();
    returnFocus?.focus({ preventScroll: true });
  }
  function advance(delta: number): void {
    if (delta > 0 && index === tourText.steps.length - 1) { close(); return; }
    index = clamp(index + delta, 0, tourText.steps.length - 1);
    render();
  }
  back.addEventListener('click', () => advance(-1));
  next.addEventListener('click', () => advance(1));
  dialog.querySelector('.tour-end')!.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    // Do not let a tour key press reach the workspace's keyboard handlers.
    event.stopPropagation();
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const active = controls.indexOf(document.activeElement as HTMLButtonElement);
      controls[(active + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]!.focus();
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1); }
  });
  window.addEventListener('resize', schedulePosition);
  return {
    get isOpen(): boolean { return dialog.open; },
    open(): void {
      if (dialog.open) return;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      index = 0;
      dialog.showModal();
      render();
      next.focus({ preventScroll: true });
    },
  };
}
