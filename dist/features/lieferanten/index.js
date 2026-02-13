"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lieferanten = void 0;
class Lieferanten {
    constructor() {
        this.lieferantenListe = [];
        // Initialisiere die Lieferantenliste, falls erforderlich
    }
    addLieferant(lieferant) {
        this.lieferantenListe.push(lieferant);
    }
    removeLieferant(lieferantId) {
        this.lieferantenListe = this.lieferantenListe.filter(lieferant => lieferant.id !== lieferantId);
    }
    filterLieferanten(criteria) {
        // Implementiere die Filterlogik basierend auf den Kriterien
        return this.lieferantenListe.filter(lieferant => {
            // Beispiel: Rückgabe von Lieferanten, die dem Kriterium entsprechen
            return Object.keys(criteria).every(key => lieferant[key] === criteria[key]);
        });
    }
    importLieferanten(data) {
        this.lieferantenListe = [...this.lieferantenListe, ...data];
    }
    exportLieferanten() {
        return this.lieferantenListe;
    }
    getLieferanten() {
        return this.lieferantenListe;
    }
}
exports.Lieferanten = Lieferanten;
