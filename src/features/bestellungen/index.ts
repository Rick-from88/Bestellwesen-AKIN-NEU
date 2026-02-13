export class Bestellungen {
    private bestellungen: any[] = []; // Array zur Speicherung der Bestellungen

    constructor() {
        // Initialisierung, falls erforderlich
    }

    // Methode zum Abrufen aller Bestellungen
    public getAllBestellungen(): any[] {
        return this.bestellungen;
    }

    // Methode zum Erstellen einer neuen Bestellung
    public createBestellung(bestellung: any): void {
        this.bestellungen.push(bestellung);
    }

    // Methode zum Anzeigen offener Bestellungen
    public getOffeneBestellungen(): any[] {
        return this.bestellungen.filter(bestellung => !bestellung.geliefert);
    }

    // Methode zum Anzeigen gelieferter Bestellungen
    public getGelieferteBestellungen(): any[] {
        return this.bestellungen.filter(bestellung => bestellung.geliefert);
    }

    // Weitere Methoden zur Verwaltung von Bestellungen können hier hinzugefügt werden
}