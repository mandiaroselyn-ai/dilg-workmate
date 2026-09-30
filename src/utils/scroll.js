// Scrolls the page's content area so `element` is near the top. Unlike scrollIntoView, it
// never scrolls the app's outer frame, which pushed the header and sidebar logo out of view.
export const scrollIntoContentView = (element, { offset = 16 } = {}) => {
  const scroller = element?.closest('main');
  if (!element || !scroller) return;
  const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
  scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
};
