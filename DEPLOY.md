# Deploy — Eventos ACO

Pasos para conectar el proyecto a las cuentas reales de `acoworkspace`. El código ya está listo; esto son los pasos manuales que solo Fede puede hacer (requieren login en las cuentas de la organización).

## 1. Supabase (`info@acoworkspace.com`)

1. Crear un proyecto nuevo en https://supabase.com/dashboard (org de acoworkspace).
2. Ir a **SQL Editor** y correr el contenido de `supabase/migrations/001_initial_schema.sql`.
3. Ir a **Authentication → Providers** y confirmar que **Email** está habilitado, con **"Confirm email"** desactivado si querés poder crear usuarios sin que confirmen por mail (o dejarlo activado y confirmar manualmente).
4. Ir a **Authentication → Users → Add user** y crear un usuario por cada persona del equipo que va a usar el sistema (email + contraseña). No hay self-signup.
5. Ir a **Project Settings → API** y copiar:
   - `Project URL` → `SUPABASE_URL` (backend) / `NEXT_PUBLIC_SUPABASE_URL` (frontend)
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (frontend)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (backend, **nunca** en el frontend)

## 2. GitHub (`acoworkspace`)

1. Crear el repo `acoworkspace/eventos` (privado).
2. Desde esta carpeta:
   ```bash
   cd eventos-bar
   git init
   git add .
   git commit -m "Scaffold inicial: gestión de ingresos y costos de eventos"
   git remote add origin https://github.com/acoworkspace/eventos.git
   git push -u origin main
   ```

## 3. Vercel (`acoworkspace`) — dos proyectos

### `apps/api` (Express como función serverless)
1. Import Project → seleccionar el repo `acoworkspace/eventos`.
2. **Root Directory**: `apps/api`.
3. Framework Preset: **Other**.
4. Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL` = `https://eventos.acoworkspace.com` (se actualiza cuando el dominio del web esté listo)
5. Deploy. Anotar la URL resultante (ej. `eventos-api.vercel.app`).

### `apps/web` (Next.js)
1. Import Project → mismo repo, **Root Directory**: `apps/web`.
2. Framework Preset: **Next.js** (autodetectado).
3. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` = la URL del proyecto `apps/api` del paso anterior
4. Deploy.

## 4. Dominio `eventos.acoworkspace.com`

1. En el proyecto Vercel de `apps/web` → **Settings → Domains** → agregar `eventos.acoworkspace.com`.
2. Vercel va a pedir un registro DNS (CNAME o A, según cómo esté configurado el DNS de `acoworkspace.com`). Agregarlo donde se administra el dominio.
3. Esperar la verificación (unos minutos).

## 5. Verificación final

1. Abrir `eventos.acoworkspace.com`, loguearse con un usuario creado en el paso 1.4.
2. Crear un evento de prueba, confirmar que aparecen las líneas fijas (Precio Servicio, Seña, Saldo / Catering, Camareros, etc.).
3. Cargar una factura real de ACO en una línea de gasto y confirmar que los datos se parsean bien (número, fecha, cliente, CUIT, montos).
4. Marcar una línea como pagada, adjuntar un comprobante, y "deshacerlo" antes de confirmar para probar que se puede quitar.
5. Confirmar que el Resultado final coincide con el cálculo esperado.

Cualquier ajuste al parser de facturas (si aparece un layout de factura distinto) se hace en `apps/api/src/lib/invoiceParser.ts`.
