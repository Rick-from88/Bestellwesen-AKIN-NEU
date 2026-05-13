-- Preis-Snapshots für Bestellpositionen und Legacy-Zeile auf bestellungen.
-- Wird bei App-Start über ensureSchema (src/db.ts) idempotent nachgezogen.
-- Backfill: einzelpreis wird aus dem aktuellen artikel.preis gesetzt (nur Näherung für Altbestand).

alter table bestellpositionen
  add column if not exists einzelpreis numeric(10, 2);

alter table bestellungen
  add column if not exists einzelpreis numeric(10, 2);

update bestellpositionen p
   set einzelpreis = a.preis
  from artikel a
 where p.artikel_id = a.id
   and p.einzelpreis is null;

update bestellungen b
   set einzelpreis = a.preis
  from artikel a
 where b.artikel_id = a.id
   and b.einzelpreis is null;

update bestellpositionen set einzelpreis = 0 where einzelpreis is null;
update bestellungen set einzelpreis = 0 where einzelpreis is null;

alter table bestellpositionen
  alter column einzelpreis set default 0;
alter table bestellpositionen
  alter column einzelpreis set not null;

alter table bestellungen
  alter column einzelpreis set default 0;
alter table bestellungen
  alter column einzelpreis set not null;

create table if not exists artikel_preis_historie (
  id serial primary key,
  artikel_id integer not null references artikel (id) on delete cascade,
  preis_alt numeric(10, 2),
  preis_neu numeric(10, 2) not null,
  geaendert_am timestamptz not null default now()
);

create index if not exists idx_artikel_preis_historie_artikel
  on artikel_preis_historie (artikel_id);
