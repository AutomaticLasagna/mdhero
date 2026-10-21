export function scrollTabsWithWheel(event: WheelEvent, strip: HTMLElement, side: boolean): void {
  if (side || event.ctrlKey || event.metaKey || event.shiftKey || event.deltaX !== 0 || event.deltaY === 0) return;
  if (strip.scrollWidth <= strip.clientWidth) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
  strip.scrollLeft += event.deltaY * unit;
  event.preventDefault();
}
