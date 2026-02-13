export class Lieferanten {
    private lieferantenListe: any[] = [];

    constructor() {
        // Initialisiere die Lieferantenliste, falls erforderlich
    }

    public addLieferant(lieferant: any): void {
        this.lieferantenListe.push(lieferant);
    }

    public removeLieferant(lieferantId: number): void {
        this.lieferantenListe = this.lieferantenListe.filter(lieferant => lieferant.id !== lieferantId);
    }

    public filterLieferanten(criteria: any): any[] {
        // Implementiere die Filterlogik basierend auf den Kriterien
        return this.lieferantenListe.filter(lieferant => {
            // Beispiel: Rückgabe von Lieferanten, die dem Kriterium entsprechen
            return Object.keys(criteria).every(key => lieferant[key] === criteria[key]);
        });
    }

    public importLieferanten(data: any[]): void {
        this.lieferantenListe = [...this.lieferantenListe, ...data];
    }

    public exportLieferanten(): any[] {
        return this.lieferantenListe;
    }

    public getLieferanten(): any[] {
        return this.lieferantenListe;
    }
}