// Guided Tour über alle Hauptseiten mit Shepherd.js
// Erwartet: window.Shepherd global verfügbar.

(function () {
  const STORAGE_KEY = "bw_guided_tour_seen_v1";

  function hasSeenTour() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markTourSeen() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  }

  function createTour() {
    if (!window.Shepherd) return null;

    const ua = (navigator && navigator.userAgent) || "";
    const isIOS = /iP(hone|ad|od)/i.test(ua);

    const tour = new window.Shepherd.Tour({
      defaultStepOptions: {
        cancelIcon: { enabled: true },
        scrollTo: { behavior: "smooth", block: "center" },
        classes: "bw-tour-step",
      },
      // iOS/Safari: Shepherd Modal-Overlay rendert teils über dem Highlight
      // und kann nach Abschluss Layout/Fixed-Positioning “verschieben”.
      // Daher auf iOS deaktivieren (Tooltip + Highlight bleiben).
      useModalOverlay: !isIOS,
    });

    const path = (window.location.pathname || "").replace(/\/+$/, "") || "/";
    const isSmallScreen =
      typeof window !== "undefined" && (window.innerWidth || 0) <= 520;

    // Auf sehr kleinen Screens zentrieren wir Steps statt "attachTo",
    // damit Tooltips nicht außerhalb des Viewports landen.
    const attachToIfRoom = (element, on) => {
      if (isSmallScreen) return undefined;
      return { element, on };
    };

    const HIGHLIGHT_CLASS = "bw-tour-highlight";
    const clearHighlight = () => {
      try {
        document
          .querySelectorAll("." + HIGHLIGHT_CLASS)
          .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
      } catch {}
    };

    // Sicherstellen, dass nach Abbruch/Ende nie ein Highlight “hängen bleibt”.
    try {
      tour.on("complete", clearHighlight);
      tour.on("cancel", clearHighlight);
    } catch {}

    const withHighlight = (selector, opts) => {
      if (!selector) return opts;
      return {
        ...opts,
        when: {
          show: () => {
            clearHighlight();
            try {
              const el = document.querySelector(selector);
              if (el) {
                el.classList.add(HIGHLIGHT_CLASS);
                if (typeof el.scrollIntoView === "function") {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
              }
            } catch {}
          },
          hide: () => {
            try {
              clearHighlight();
            } catch {}
          },
        },
      };
    };

    const addStep = (id, opts) => {
      // Unterstützt Shepherd v11+: addStep(options). id gehört in options.
      tour.addStep({ id, ...opts });
    };

    // Gemeinsame Hilfen
    const nextBtn = {
      text: "Weiter",
      action: () => tour.next(),
    };
    const backBtn = {
      text: "Zurück",
      secondary: true,
      action: () => tour.back(),
    };
    const doneBtn = {
      text: "Fertig",
      action: () => {
        clearHighlight();
        markTourSeen();
        tour.complete();
      },
    };

    // Dashboard
    if (path === "/" || path === "/uebersicht") {
      addStep("dash-intro", {
        title: "Willkommen im Dashboard",
        text: "Hier bekommst du einen schnellen Überblick über offene Bestellungen, Summen und Notizen.",
        buttons: [nextBtn],
      });

      addStep(
        "dash-offene",
        withHighlight("#offeneCount", {
          title: "Offene Bestellungen",
          text: "Diese Kachel zeigt dir, wie viele Bestellungen aktuell noch offen sind.",
          attachTo: attachToIfRoom("#offeneCount", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "dash-summe",
        withHighlight(".dashboard-grid", {
          title: "Bestellsumme im Zeitraum",
          text: "Stelle hier den Zeitraum ein oder nutze die Schnell-Buttons, um Summen z. B. für diesen Monat zu sehen.",
          attachTo: attachToIfRoom(".dashboard-grid", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "dash-notes",
        withHighlight("#savedNotes", {
          title: "Notizen",
          text: "Kurze Todos oder Hinweise kannst du direkt hier im Dashboard als Notizen ablegen.",
          attachTo: attachToIfRoom("#savedNotes", "top"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "dash-navbar",
        withHighlight(".navbar", {
          title: "Navigation",
          text: "Über die Leiste unten wechselst du zwischen Dashboard, Bestellungen, Lieferanten, Artikeln und Einstellungen.",
          attachTo: attachToIfRoom(".navbar", "top"),
          buttons: [backBtn, doneBtn],
        }),
      );
    }

    // Bestellungen
    if (path === "/bestellungen") {
      addStep("bestellungen-intro", {
        title: "Bestellungen",
        text: "Hier siehst du alle Bestellungen und kannst sie filtern, bearbeiten und Sammelbestellungen auslösen.",
        buttons: [nextBtn],
      });

      addStep(
        "bestellungen-actions",
        withHighlight(".hero__actions", {
          title: "Aktionen",
          text: "Über diese Buttons legst du neue Bestellungen an oder führst Sammelbestellungen aus.",
          attachTo: attachToIfRoom(".hero__actions", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "bestellungen-filter",
        withHighlight(".filter-bar", {
          title: "Filter & Suche",
          text: "Nutze Suche, Status- und Sortierfilter, um schnell die richtigen Bestellungen zu finden.",
          attachTo: attachToIfRoom(".filter-bar", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "bestellungen-list",
        withHighlight("#bestellungenList", {
          title: "Liste der Bestellungen",
          text: "In der Liste kannst du Bestellungen öffnen, bearbeiten und den Status anpassen.",
          attachTo: attachToIfRoom("#bestellungenList", "top"),
          buttons: [backBtn, doneBtn],
        }),
      );
    }

    // Lieferanten
    if (path === "/lieferanten") {
      addStep("lieferanten-intro", {
        title: "Lieferanten",
        text: "Hier verwaltest du alle Lieferantenkontakte und siehst zugehörige Artikel und Bestellungen.",
        buttons: [nextBtn],
      });

      addStep(
        "lieferanten-actions",
        withHighlight("#addLieferantBtn", {
          title: "Neuer Lieferant",
          text: "Über diesen Button legst du neue Lieferanten an.",
          attachTo: attachToIfRoom("#addLieferantBtn", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "lieferanten-filter",
        withHighlight(".filter-bar", {
          title: "Filter & Suche",
          text: "Suche nach Namen, Kundennummern oder Orten und sortiere die Liste nach Bedarf.",
          attachTo: attachToIfRoom(".filter-bar", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "lieferanten-list",
        withHighlight("#lieferantenList", {
          title: "Lieferantenliste",
          text: "Klicke einen Lieferanten an, um Details, Artikel und Bestellhistorie zu sehen.",
          attachTo: attachToIfRoom("#lieferantenList", "top"),
          buttons: [backBtn, doneBtn],
        }),
      );
    }

    // Artikel
    if (path === "/artikel") {
      addStep("artikel-intro", {
        title: "Artikel",
        text: "In der Artikelseite verwaltest du alle Artikel pro Lieferant.",
        buttons: [nextBtn],
      });

      addStep(
        "artikel-actions",
        withHighlight("#addArtikelBtn", {
          title: "Artikel anlegen",
          text: "Lege neue Artikel an oder aktualisiere bestehende über diesen Button.",
          attachTo: attachToIfRoom("#addArtikelBtn", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "artikel-filter",
        withHighlight(".filter-bar", {
          title: "Filter & Suche",
          text: "Suche nach Artikelnummern oder Bezeichnungen und filtere nach Lieferant oder Preis.",
          attachTo: attachToIfRoom(".filter-bar", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "artikel-list",
        withHighlight("#artikelList", {
          title: "Artikelliste",
          text: "Hier findest du alle Artikel, kannst Preise prüfen und Bilder hinterlegen.",
          attachTo: attachToIfRoom("#artikelList", "top"),
          buttons: [backBtn, doneBtn],
        }),
      );
    }

    // Einstellungen
    if (path === "/einstellungen") {
      addStep("settings-intro", {
        title: "Einstellungen",
        text: "Hier konfigurierst du Backups, Mailversand, Bestellnummern und – für Admins – Nutzerverwaltung.",
        buttons: [nextBtn],
      });

      addStep(
        "settings-tiles",
        withHighlight(".settings-page .grid", {
          title: "Einstellungs-Kacheln",
          text: "Wähle eine Kachel aus, um in den jeweiligen Bereich zu springen, z. B. Backup oder Maileinstellungen.",
          attachTo: attachToIfRoom(".settings-page .grid", "bottom"),
          buttons: [backBtn, nextBtn],
        }),
      );

      addStep(
        "settings-forms",
        withHighlight(".settings-page .panel:nth-of-type(2)", {
          title: "Detail-Einstellungen",
          text: "Darunter findest du die Formulare für SMTP, Vorlagen und weitere Einstellungen.",
          attachTo: attachToIfRoom(".settings-page .panel:nth-of-type(2)", "top"),
          buttons: [backBtn, doneBtn],
        }),
      );
    }

    return tour;
  }

  window.startGuidedTour = function () {
    if (!window.Shepherd) {
      alert("Die Tour konnte nicht gestartet werden (Shepherd.js nicht geladen).");
      return;
    }

    const tour = createTour();
    if (!tour) return;

    // Einmalig merken, dass Tour schon gesehen wurde
    if (hasSeenTour()) {
      // Optional könnten wir hier fragen, ob man sie trotzdem nochmal sehen will.
    }

    tour.start();
  };
})();

