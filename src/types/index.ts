export interface Bestellung {
  id: number;
  bestellnummer?: number;
  createdByUid?: string;
  createdByName?: string;
  createdByEmail?: string;
  auftragsBestaetigt?: boolean;
  status:
    | "offen"
    | "bestellt"
    | "teilgeliefert"
    | "geliefert"
    | "teilstorniert"
    | "storniert";
  bestellDatum: Date;
  positionen: BestellungPosition[];
}

export interface BestellungPosition {
  artikelId: number;
  lieferantId: number;
  menge: number;
  geliefertMenge?: number;
  storniertMenge?: number;
  notiz?: string;
  /** Gespeicherter Einzelpreis zum Zeitpunkt der Fixierung (nicht-offene Bestellungen). */
  einzelpreis?: number;
}

export interface Artikel {
  id: number;
  lieferantId: number;
  name: string;
  beschreibung: string;
  artikelnummer?: string;
  einheit?: string;
  verpackungseinheit?: string;
  standardBestellwert?: number;
  fotoUrl?: string;
  preis: number;
}

export interface Lieferant {
  id: number;
  name: string;
  kundenNummer?: string;
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
