-- ============================================================
-- COTIZADOR: presupuestos que, al confirmarse, se convierten en eventos
-- ============================================================

create type quote_status as enum ('borrador', 'confirmada');

create table quotes (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references clients(id),
  issue_date      date not null default current_date,   -- "Buenos Aires, <fecha>"
  event_date      date,
  location        text,                                 -- "ESPACIO" en el PDF
  pax             int,
  exchange_rate   numeric(10,2),
  iva_rate        numeric(5,2) not null default 21,

  contact_email   text default 'lucas@acoworkspace.com',
  contact_phone   text default '11 21636186',

  status          quote_status not null default 'borrador',
  chosen_option   int,                                  -- opción que eligió el cliente al confirmar
  event_id        uuid references events(id) on delete set null,   -- evento creado al confirmar
  confirmed_at    timestamptz,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Lo que ve el cliente: bloques de Título / Ítems / Precio.
-- option_no null = común a todas las opciones; 1, 2, 3… = alternativas entre sí.
create table quote_blocks (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references quotes(id) on delete cascade,
  sort_order  int not null default 0,
  option_no   int,
  title       text,
  items       text,             -- una línea por ítem; las que empiezan con "*" van como viñeta
  short_name  text,             -- nombre en el resumen final (ej: "Finger Food"); default: title
  show_price  boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Filas de costo (como las de un evento). El precio de un bloque es la suma de sus filas;
-- una fila sin bloque no se muestra al cliente pero su precio suma en todas las opciones.
create table quote_lines (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references quotes(id) on delete cascade,
  block_id        uuid references quote_blocks(id) on delete set null,
  category_id     uuid references line_categories(id),
  category_label  text not null,
  provider_id     uuid references providers(id),
  sort_order      int not null default 0,

  -- costo mío y precio al cliente (neto, sin IVA); la ganancia es la diferencia
  cost            numeric(14,2) not null default 0,
  client_price    numeric(14,2) not null default 0,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_quote_blocks_quote_id on quote_blocks(quote_id);
create index idx_quote_lines_quote_id on quote_lines(quote_id);
create index idx_quote_lines_block_id on quote_lines(block_id);
create index idx_quotes_client_id on quotes(client_id);

create trigger trg_quotes_updated_at
  before update on quotes
  for each row execute function set_updated_at();

create trigger trg_quote_blocks_updated_at
  before update on quote_blocks
  for each row execute function set_updated_at();

create trigger trg_quote_lines_updated_at
  before update on quote_lines
  for each row execute function set_updated_at();
