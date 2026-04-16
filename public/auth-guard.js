;(function () {
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return;
  }

  // Nur einmal initialisieren
  if (window.__bwAuthGuardInstalled) {
    return;
  }
  window.__bwAuthGuardInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const response = await originalFetch(input, init);

    try {
      const status = response && typeof response.status === "number" ? response.status : 0;
      const path = String(window.location.pathname || "");
      const isAuthError = status === 401 || status === 403;
      const isOnLoginPage = path.startsWith("/login");

      if (isAuthError && !isOnLoginPage) {
        // Versuche doppelte Redirects zu vermeiden
        if (!window.__bwAuthRedirecting) {
          window.__bwAuthRedirecting = true;
          window.location.href = "/login";
        }
      }
    } catch {
      // Bei Guard-Fehlern Response trotzdem normal zurückgeben
    }

    return response;
  };
})();

