export interface Bestellung {
    id: number;
    artikelId: number;
    lieferantId: number;
    menge: number;
    status: 'offen' | 'geliefert' | 'storniert';
    bestellDatum: Date;
}

export interface Artikel {
    id: number;
    name: string;
    beschreibung: string;
    preis: number;
    lagerbestand: number;
}

export interface Lieferant {
    id: number;
    name: string;
    kontaktPerson: string;
    email: string;
    telefon: string;
}

export interface FilterOption {
    suchbegriff?: string;
    minPreis?: number;
    maxPreis?: number;
    lieferantId?: number;
}