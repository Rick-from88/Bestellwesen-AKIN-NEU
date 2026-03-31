(function () {
  const roleLabel = (role) => {
    if (role === "admin") return "Admin";
    if (role === "buero") return "Buero";
    return "Produktion";
  };

  const shortEmail = (email) => {
    if (!email) return "Profil";
    const local = String(email).split("@")[0] || email;
    return local.length > 18 ? local.slice(0, 18) + "..." : local;
  };

  const ensureWidget = async () => {
    const nav = document.querySelector(".navbar");
    if (!nav) return;
    if (document.getElementById("profileWidgetBtn")) return;

    let me = null;
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      me = await res.json();
    } catch (e) {
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "profileWidgetBtn";
    btn.className = "profile-fab";
    btn.textContent = shortEmail(me.email);

    const popover = document.createElement("div");
    popover.id = "profilePopover";
    popover.className = "profile-popover";
    popover.innerHTML = `
      <div class="profile-popover__title">Profil</div>
      <div class="profile-popover__meta"><strong>E-Mail:</strong> ${me.email || "-"}<br><strong>Rolle:</strong> ${roleLabel(me.role)}</div>
      <div class="profile-popover__actions">
        <a class="btn btn--ghost btn--small" href="/einstellungen">Einstellungen</a>
        <button class="btn btn--danger btn--small" id="profileLogoutBtn" type="button">Logout</button>
      </div>
    `;

    btn.addEventListener("click", () => {
      popover.classList.toggle("is-open");
    });

    document.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === btn || popover.contains(target)) return;
      popover.classList.remove("is-open");
    });

    document.body.appendChild(btn);
    document.body.appendChild(popover);

    const logoutBtn = document.getElementById("profileLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (e) {
          // ignore
        }
        window.location.href = "/login";
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureWidget);
  } else {
    ensureWidget();
  }
})();

