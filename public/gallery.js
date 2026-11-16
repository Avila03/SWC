// SWC — Galeria do Pântano: revelação ao rolar, raízes e olhos do pântano.
// Tudo é decorativo: sem JS ou com animações reduzidas, o conteúdo aparece normalmente.
(() => {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  if (reduced || !("IntersectionObserver" in window)) {
    root.classList.add("g-static");
    document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-in"));
    document.querySelectorAll(".g-root-node,.g-eyes").forEach(el => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

  const watch = el => { if (!el.dataset.watched) { el.dataset.watched = "1"; io.observe(el); } };
  document.querySelectorAll("[data-reveal],.g-root-node,.g-eyes,.g-rail").forEach(watch);

  // As peças chegam depois, pelo catálogo: observa cada cartão novo com um pequeno atraso em cascata.
  const grid = document.querySelector(".products");
  if (grid) {
    const tag = () => grid.querySelectorAll(".product-card").forEach((card, i) => {
      if (card.hasAttribute("data-reveal")) return;
      card.setAttribute("data-reveal", "");
      card.style.setProperty("--g-delay", (i % 2) * 140 + "ms");
      watch(card);
    });
    new MutationObserver(tag).observe(grid, { childList: true });
    tag();
  }

  // Olhos do pântano: piscam de vez em quando depois de aparecer.
  const eyes = document.querySelector(".g-eyes");
  if (eyes) {
    const blink = () => {
      if (eyes.classList.contains("is-in") && !document.hidden) {
        eyes.classList.add("blink");
        setTimeout(() => eyes.classList.remove("blink"), 220);
      }
      setTimeout(blink, 3800 + Math.random() * 4200);
    };
    setTimeout(blink, 4000);
  }
})();
