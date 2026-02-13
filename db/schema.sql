create table if not exists lieferanten (
    id serial primary key,
    name text not null,
    kontakt_person text,
    email text,
    telefon text,
    created_at timestamp not null default now()
);

create table if not exists artikel (
    id serial primary key,
    name text not null,
    beschreibung text,
    preis numeric(10, 2) not null,
    lagerbestand integer not null default 0,
    min_bestand integer not null default 0,
    created_at timestamp not null default now()
);

create table if not exists bestellungen (
    id serial primary key,
    artikel_id integer not null references artikel(id) on delete restrict,
    lieferant_id integer not null references lieferanten(id) on delete restrict,
    menge integer not null,
    status text not null check (status in ('offen', 'geliefert', 'storniert')),
    bestell_datum timestamp not null default now()
);

create index if not exists idx_bestellungen_status on bestellungen(status);
create index if not exists idx_bestellungen_bestell_datum on bestellungen(bestell_datum);
