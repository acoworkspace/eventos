-- ============================================================
-- CLIENTES + contacto en proveedores + evento.client_id
-- ============================================================

create table clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  cuit        text,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

alter table providers add column email text;
alter table providers add column phone text;

alter table events add column client_id uuid references clients(id);

-- Backfill: crear un cliente por cada client_name distinto y enlazarlo
insert into clients (name)
select distinct client_name from events
where client_name is not null and client_name <> '';

update events e set client_id = c.id
from clients c
where c.name = e.client_name;

alter table events drop column client_name;
