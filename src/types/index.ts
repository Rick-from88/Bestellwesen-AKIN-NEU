export interface Bestellung {
  id: number;
  status: "offen" | "geliefert" | "storniert";
  bestellDatum: Date;
  positionen: BestellungPosition[];
}

export interface BestellungPosition {
  artikelId: number;
  lieferantId: number;
  menge: number;
}

export interface Artikel {
  id: number;
  lieferantId: number;
  name: string;
  beschreibung: string;
  preis: number;
  lagerbestand: number;
  minBestand: number;
}

export interface Lieferant {
  id: number;
  name: string;
  kontaktPerson: string;
  email: string;
  telefon: string;
  strasse?: string;
  plz?: string;
  stadt?: string;
  land?: string;
}

export interface FilterOption {
  suchbegriff?: string;
  minPreis?: number;
  maxPreis?: number;
  lieferantId?: number;
}
