"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bestellungen = void 0;
class Bestellungen {
    constructor() {
        this.bestellungen = []; // Array zur Speicherung der Bestellungen
        // Initialisierung, falls erforderlich
    }
    // Methode zum Abrufen aller Bestellungen
    getAllBestellungen() {
        return this.bestellungen;
    }
    // Methode zum Erstellen einer neuen Bestellung
    createBestellung(bestellung) {
        this.bestellungen.push(bestellung);
    }
    // Methode zum Anzeigen offener Bestellungen
    getOffeneBestellungen() {
        return this.bestellungen.filter(bestellung => !bestellung.geliefert);
    }
    // Methode zum Anzeigen gelieferter Bestellungen
    getGelieferteBestellungen() {
        return this.bestellungen.filter(bestellung => bestellung.geliefert);
    }
}
exports.Bestellungen = Bestellungen;
