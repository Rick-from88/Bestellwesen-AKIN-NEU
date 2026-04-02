create table if not exists lieferanten (
    id serial primary key,
    name text not null,
    kundennummer text,
    kontakt_person text,
    email text,
    telefon text,
    strasse text,
    plz text,
    stadt text,
    land text,
    created_at timestamp not null default now()
);

create table if not exists artikel (
    id serial primary key,
    lieferant_id integer references lieferanten(id) on delete restrict,
    name text not null,
    beschreibung text,
    artikelnummer text,
    einheit text,
    verpackungseinheit text,
    standard_bestellwert integer,
    foto_url text,
    preis numeric(10, 2) not null,
    created_at timestamp not null default now()
);

create table if not exists bestellungen (
    id serial primary key,
    -- bestellnummer wurde in einer späteren Version ergänzt; für bestehende
    -- Datenbanken wird die Spalte weiter unten per ALTER TABLE hinzugefügt.
    bestellnummer integer unique not null default 0,
    auftrags_bestaetigt boolean not null default false,
    created_by_uid text,
    created_by_name text,
    created_by_email text,
    artikel_id integer not null references artikel(id) on delete restrict,
    lieferant_id integer not null references lieferanten(id) on delete restrict,
    menge integer not null,
    status text not null check (status in ('offen', 'bestellt', 'teilgeliefert', 'geliefert', 'teilstorniert', 'storniert')),
    bestell_datum timestamp not null default now()
);

create table if not exists bestellpositionen (
    id serial primary key,
    bestellung_id integer not null references bestellungen(id) on delete cascade,
    artikel_id integer not null references artikel(id) on delete restrict,
    lieferant_id integer not null references lieferanten(id) on delete restrict,
    menge integer not null,
    geliefert_menge integer not null default 0,
    storniert_menge integer not null default 0,
    notiz text
);

create index if not exists idx_bestellungen_status on bestellungen(status);
create index if not exists idx_bestellungen_bestell_datum on bestellungen(bestell_datum);
create index if not exists idx_bestellpositionen_bestellung_id on bestellpositionen(bestellung_id);

create table if not exists settings (
    key text primary key,
    value text
);

-- Migration für bestehende Datenbanken, bei denen die Spalte
-- "bestellnummer" in "bestellungen" noch fehlt.
alter table bestellungen
    add column if not exists bestellnummer integer;
alter table bestellungen
    add column if not exists created_by_uid text;
alter table bestellungen
    add column if not exists created_by_name text;
alter table bestellungen
    add column if not exists created_by_email text;
alter table bestellpositionen
    add column if not exists notiz text;
alter table lieferanten
    add column if not exists kundennummer text;

-- Migration für ältere Datenbanken ohne erweiterte Artikel-Felder.
alter table artikel
    add column if not exists artikelnummer text;
alter table artikel
    add column if not exists einheit text;
alter table artikel
    add column if not exists verpackungseinheit text;
alter table artikel
    add column if not exists standard_bestellwert integer;
alter table artikel
    add column if not exists foto_url text;

-- Migration: veraltete Status-Constraint auf bestellungen aktualisieren
alter table bestellungen
    drop constraint if exists bestellungen_status_check;
alter table bestellungen
    add constraint bestellungen_status_check
    check (status in ('offen', 'bestellt', 'teilgeliefert', 'geliefert', 'teilstorniert', 'storniert'));

-- Lagerbestand/Mindestbestand werden nicht mehr verwendet.
alter table artikel
    drop column if exists lagerbestand;
alter table artikel
    drop column if exists min_bestand;

-- Delivery/Cancel tracking & Auftragsbestaetigung
alter table bestellungen
    add column if not exists auftrags_bestaetigt boolean not null default false;
alter table bestellpositionen
    add column if not exists geliefert_menge integer not null default 0;
alter table bestellpositionen
    add column if not exists storniert_menge integer not null default 0;
