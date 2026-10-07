-- ============================================================
-- GOOGLE CALENDAR: cada usuario conecta su propio calendario y recibe
-- todos los eventos como eventos de día completo.
-- ============================================================

create table google_calendar_connections (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  user_email     text,
  google_email   text,
  calendar_id    text not null default 'primary',
  refresh_token  text not null,
  connected_at   timestamptz default now()
);

-- Qué evento de Google corresponde a cada evento del sistema, por usuario conectado
create table event_calendar_links (
  event_id         uuid not null references events(id) on delete cascade,
  user_id          uuid not null references google_calendar_connections(user_id) on delete cascade,
  google_event_id  text not null,
  primary key (event_id, user_id)
);

-- Guardan refresh tokens: sólo la API (service role) puede leerlas.
alter table google_calendar_connections enable row level security;
alter table event_calendar_links enable row level security;
