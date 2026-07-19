-- ============================================================
-- EVENTOS ACO - Schema inicial
-- ============================================================

create type line_kind as enum ('ingreso', 'gasto');
create type line_status as enum ('pendiente', 'pagado');

-- ============================================================
-- PROVEEDORES (catálogo reutilizable entre eventos)
-- ============================================================
create table providers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  cuit        text,
  created_at  timestamptz default now()
);

-- ============================================================
-- EVENTOS
-- ============================================================
create table events (
  id              uuid primary key default gen_random_uuid(),
  client_name     text not null,
  event_date      date not null,
  location        text,                  -- ej: "SUM/Terraza"
  exchange_rate   numeric(10,2),          -- tipo de cambio manual del evento
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ============================================================
-- CATEGORÍAS DE LÍNEA (fijas, ampliables desde la UI)
-- ============================================================
create table line_categories (
  id          uuid primary key default gen_random_uuid(),
  kind        line_kind not null,
  name        text not null,
  sort_order  int not null default 0,
  unique (kind, name)
);

insert into line_categories (kind, name, sort_order) values
  ('ingreso', 'Precio Servicio', 1),
  ('ingreso', 'Seña', 2),
  ('ingreso', 'Saldo', 3),
  ('gasto', 'Catering', 1),
  ('gasto', 'Camareros', 2),
  ('gasto', 'Medialunas y dulces', 3),
  ('gasto', 'Hielo', 4),
  ('gasto', 'Bebidas y Barras tragos', 5),
  ('gasto', 'Vajilla', 6),
  ('gasto', 'Café', 7),
  ('gasto', 'DJ Sonido', 8),
  ('gasto', 'Limpieza', 9),
  ('gasto', 'Seguridad', 10);

-- ============================================================
-- LÍNEAS DE INGRESOS / GASTOS DE CADA EVENTO
-- ============================================================
create table event_lines (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references events(id) on delete cascade,
  kind                  line_kind not null,
  category_id           uuid references line_categories(id),
  category_label        text not null,     -- copia editable (permite líneas custom)
  provider_id           uuid references providers(id),  -- solo gastos
  sort_order            int not null default 0,

  -- montos (en pesos, base para el cálculo en USD con events.exchange_rate)
  neto                  numeric(14,2) not null default 0,
  impuestos             numeric(14,2) not null default 0,
  total                 numeric(14,2) generated always as (neto + impuestos) stored,

  -- factura
  has_invoice           boolean not null default false,
  invoice_pdf_url        text,              -- path en bucket "facturas"
  invoice_number        text,
  invoice_issue_date    date,
  invoice_client_name   text,
  invoice_client_cuit   text,
  invoice_currency      text,
  invoice_exchange_rate numeric(10,2),

  -- pago
  status                line_status not null default 'pendiente',
  payment_date          date,
  payment_method        text,              -- "Efectivo", "Transferencia", etc.
  receipt_url           text,              -- comprobante de pago (bucket "comprobantes")
  retention_url         text,              -- retenciones (opcional)

  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index idx_event_lines_event_id on event_lines(event_id);
create index idx_event_lines_provider_id on event_lines(provider_id);
create index idx_event_lines_category_id on event_lines(category_id);

-- ============================================================
-- UPDATED_AT automático
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_events_updated_at
  before update on events
  for each row execute function set_updated_at();

create trigger trg_event_lines_updated_at
  before update on event_lines
  for each row execute function set_updated_at();

-- ============================================================
-- STORAGE BUCKETS (privados, se sirven con signed URLs)
-- ============================================================
insert into storage.buckets (id, name, public) values ('facturas', 'facturas', false);
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false);
