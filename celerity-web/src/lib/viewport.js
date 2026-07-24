/** Keep --app-height in sync with the visible viewport (iOS Safari chrome). */
export function bindAppHeight() {
  const apply = () => {
    const vv = window.visualViewport;
    const h = Math.round(vv?.height ?? window.innerHeight);
    const top = Math.round(vv?.offsetTop ?? 0);
    document.documentElement.style.setProperty("--app-height", `${h}px`);
    document.documentElement.style.setProperty("--app-top", `${top}px`);
  };

  apply();
  window.visualViewport?.addEventListener("resize", apply);
  window.visualViewport?.addEventListener("scroll", apply);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);

  return () => {
    window.visualViewport?.removeEventListener("resize", apply);
    window.visualViewport?.removeEventListener("scroll", apply);
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
  };
}

/** Prevent document scroll while the farmer shell is full-screen. */
export function lockBodyScroll(lock) {
  const root = document.documentElement;
  if (lock) {
    root.classList.add("cel-scroll-lock");
    document.body.classList.add("cel-scroll-lock");
  } else {
    root.classList.remove("cel-scroll-lock");
    document.body.classList.remove("cel-scroll-lock");
  }
}
