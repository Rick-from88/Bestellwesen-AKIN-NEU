(function () {
  const PRIMARY_HREFS = ["/uebersicht", "/bestellungen", "/artikel"];

  const normalizeHref = (href) => {
    try {
      const url = new URL(href, window.location.origin);
      return url.pathname;
    } catch {
      return href || "";
    }
  };

  const initMobileNav = () => {
    const nav = document.querySelector(".navbar");
    if (!nav) return;
    if (document.getElementById("navbarMoreBtn")) return;

    const links = Array.from(nav.querySelectorAll("a.navbar__item"));
    const secondaryLinks = [];
    let activeSecondary = false;

    links.forEach((link) => {
      const href = normalizeHref(link.getAttribute("href") || "");
      const isPrimary = PRIMARY_HREFS.includes(href);
      if (!isPrimary) {
        link.classList.add("navbar__item--secondary");
        secondaryLinks.push(link);
        if (link.classList.contains("is-active")) activeSecondary = true;
      } else {
        link.classList.add("navbar__item--primary");
      }
    });

    const moreBtn = document.createElement("button");
    moreBtn.id = "navbarMoreBtn";
    moreBtn.type = "button";
    moreBtn.className = "navbar__item navbar__item--more";
    moreBtn.textContent = "Mehr";
    if (activeSecondary) {
      moreBtn.classList.add("is-active");
    }
    nav.appendChild(moreBtn);

    const sheet = document.createElement("div");
    sheet.id = "mobileMoreSheet";
    sheet.className = "mobile-more-sheet";

    secondaryLinks.forEach((src) => {
      const item = document.createElement("a");
      item.className = "mobile-more-sheet__item";
      item.href = src.getAttribute("href") || "#";
      item.textContent = src.textContent || item.href;
      sheet.appendChild(item);
    });

    document.body.appendChild(sheet);

    moreBtn.addEventListener("click", () => {
      sheet.classList.toggle("is-open");
    });

    document.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === moreBtn || sheet.contains(target)) return;
      sheet.classList.remove("is-open");
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 760) {
        sheet.classList.remove("is-open");
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileNav);
  } else {
    initMobileNav();
  }
})();

