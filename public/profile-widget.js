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
      if (!res.ok) {
        // Wenn kein gültiger Login vorhanden ist (oder API-Fehler),
        // grundsätzlich auf /login umleiten – aber nicht von der Login-Seite selbst,
        // damit man sich dort anmelden kann.
        if (
          typeof window !== "undefined" &&
          !String(window.location.pathname || "").startsWith("/login")
        ) {
          window.location.href = "/login";
        }
        return;
      }
      me = await res.json();
    } catch (e) {
      if (
        typeof window !== "undefined" &&
        !String(window.location.pathname || "").startsWith("/login")
      ) {
        window.location.href = "/login";
      }
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "profileWidgetBtn";
    btn.className = "profile-fab";
    btn.setAttribute("aria-label", "Profil und Abmelden");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML =
      '<span class="profile-fab__icon" aria-hidden="true">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/>' +
      "</svg></span>" +
      '<span class="profile-fab__label"></span>';
    const labelEl = btn.querySelector(".profile-fab__label");
    if (labelEl) labelEl.textContent = shortEmail(me.email);

    const popover = document.createElement("div");
    popover.id = "profilePopover";
    popover.className = "profile-popover";
    popover.innerHTML = `
      <div class="profile-popover__title">Profil</div>
      <div class="profile-popover__meta"><strong>E-Mail:</strong> ${me.email || "-"}<br><strong>Rolle:</strong> ${roleLabel(me.role)}</div>
      <div class="profile-popover__actions">
        <a class="btn btn--ghost btn--small" href="/einstellungen">Einstellungen</a>
        <a class="btn btn--ghost btn--small" href="/einstellungen#push-notifications">Push</a>
        <button class="btn btn--ghost btn--small" id="profileTourBtn" type="button">Tour starten</button>
        <button class="btn btn--danger btn--small" id="profileLogoutBtn" type="button">Logout</button>
      </div>
    `;

    btn.addEventListener("click", () => {
      const open = popover.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (target === btn || popover.contains(target)) return;
      popover.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    });

    document.body.appendChild(btn);
    document.body.appendChild(popover);

    // Heartbeat: prueft in Intervallen, ob Session noch gueltig ist
    try {
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        const startHeartbeat = () => {
          if (window.__bwAuthHeartbeatStarted) return;
          window.__bwAuthHeartbeatStarted = true;
          const INTERVAL_MS = 30 * 60 * 1000; // 30 Minuten
          setInterval(async () => {
            // Login-Seite nicht umleiten
            const path = String(window.location.pathname || "");
            if (path.startsWith("/login")) return;
            try {
              const pingRes = await fetch("/api/auth/me", {
                method: "GET",
                headers: { "X-Auth-Heartbeat": "true" },
              });
              if (!pingRes.ok) {
                if (!window.__bwAuthRedirecting) {
                  window.__bwAuthRedirecting = true;
                  window.location.href = "/login";
                }
              }
            } catch {
              if (!window.__bwAuthRedirecting) {
                window.__bwAuthRedirecting = true;
                window.location.href = "/login";
              }
            }
          }, INTERVAL_MS);
        };

        if (document.visibilityState === "visible") {
          startHeartbeat();
        }
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            startHeartbeat();
          }
        });
      }
    } catch {
      // Heartbeat-Fehler ignorieren, Widget trotzdem nutzbar lassen
    }

    const tourBtn = document.getElementById("profileTourBtn");
    if (tourBtn) {
      tourBtn.addEventListener("click", () => {
        popover.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        if (typeof window !== "undefined" && typeof window.startGuidedTour === "function") {
          window.startGuidedTour();
        }
      });
    }

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

