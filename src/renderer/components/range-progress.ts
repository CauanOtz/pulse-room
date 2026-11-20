/**
 * Every native slider in the window, filled up to its value.
 *
 * A range input cannot paint the part of its track before the thumb, so its
 * position is kept in `--range-progress` and the stylesheet draws the fill.
 * Moving it fires `input`; a value React sets from state changes the `value`
 * attribute, which the observer sees; a slider that appears later is caught
 * when it is added.
 */
function paint(input: HTMLInputElement) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const share = max > min ? ((value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--range-progress', `${Math.min(100, Math.max(0, share))}%`);
}

const isRange = (node: unknown): node is HTMLInputElement =>
  node instanceof HTMLInputElement && node.type === 'range';

export function installRangeProgress(root: Document = document): () => void {
  const onInput = (event: Event) => isRange(event.target) && paint(event.target);
  root.addEventListener('input', onInput, true);
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(paint);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && isRange(record.target)) paint(record.target);
      record.addedNodes.forEach((node) => {
        if (isRange(node)) paint(node);
        else if (node instanceof Element)
          node.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(paint);
      });
    }
  });
  observer.observe(root.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['value', 'max', 'min'],
  });
  return () => {
    root.removeEventListener('input', onInput, true);
    observer.disconnect();
  };
}
