create table if not exists lieferanten (
    id serial primary key,
    name text not null,
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
    preis numeric(10, 2) not null,
    lagerbestand integer not null default 0,
    min_bestand integer not null default 0,
    created_at timestamp not null default now()
);

create table if not exists bestellungen (
    id serial primary key,
    bestellnummer integer unique not null default 0,
    artikel_id integer not null references artikel(id) on delete restrict,
    lieferant_id integer not null references lieferanten(id) on delete restrict,
    menge integer not null,
    status text not null check (status in ('offen', 'bestellt', 'geliefert', 'storniert')),
    bestell_datum timestamp not null default now()
);

create table if not exists bestellpositionen (
    id serial primary key,
    bestellung_id integer not null references bestellungen(id) on delete cascade,
    artikel_id integer not null references artikel(id) on delete restrict,
    lieferant_id integer not null references lieferanten(id) on delete restrict,
    menge integer not null
);

create index if not exists idx_bestellungen_status on bestellungen(status);
create index if not exists idx_bestellungen_bestell_datum on bestellungen(bestell_datum);
create index if not exists idx_bestellpositionen_bestellung_id on bestellpositionen(bestellung_id);

create table if not exists settings (
    key text primary key,
    value text
);
