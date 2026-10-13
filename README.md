# App de lubricación (fase 1)

Recomendador de lubricante de cadena con datos de Zero Friction Cycling y precios en Chile.
Fase 1: perfil de 8 preguntas, ranking AHP con solidez, comparación con el lubricante actual,
modo invitado y cuenta opcional con Google. Claro u oscuro según el teléfono.

## Correr en tu computador

```bash
npm install
npm run dev        # abre http://localhost:5173
npm run build      # genera la carpeta dist/
```

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/data/catalogo.json` | 54 productos ZFC, 23 disponibles en Chile, precios CLP y parámetros |
| `src/lib/motor.js` | Recomendador AHP, solidez (Monte Carlo 1.500), comparación anual |
| `src/pantallas/` | Bienvenida, Perfil, Resultado, Comparar, Tú |
| `src/lib/supabase.js` | Login con Google y guardado (solo si hay variables de entorno) |
| `supabase/esquema.sql` | Tablas `perfiles` y `recomendaciones` con seguridad por fila |

Para cambiar precios o productos, edita `src/data/catalogo.json` y vuelve a publicar.

## Publicar (una sola vez, unos 30 minutos)

### 1. GitHub
1. Crea un repositorio vacío en github.com (por ejemplo `app-lubricacion`, privado).
2. Sube esta carpeta:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/app-lubricacion.git
   git push -u origin main
   ```

### 2. Supabase (base de datos y cuentas)
1. En supabase.com crea un proyecto (región São Paulo, la más cercana a Chile).
2. **SQL Editor → New query**: pega `supabase/esquema.sql` y presiona Run.
3. **Project Settings → API**: copia `Project URL` y la clave `anon public`.

### 3. Google (botón "Continuar con Google")
1. En console.cloud.google.com crea un proyecto y ve a **APIs y servicios → Pantalla de consentimiento OAuth** (tipo Externo, con nombre de la app y tu correo).
2. **Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web**.
3. En "URI de redireccionamiento autorizados" pega la que muestra Supabase en
   **Authentication → Providers → Google** (termina en `/auth/v1/callback`).
4. Copia el Client ID y el Client Secret en ese mismo panel de Supabase y activa Google.
5. En Supabase, **Authentication → URL Configuration**: pon la dirección de Cloudflare
   (paso 4) como Site URL y agrégala en Redirect URLs.

### 4. Cloudflare Pages (hosting gratuito)
1. En dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** y elige el repositorio.
2. Framework preset: **Vite**. Build command `npm run build`, output `dist`.
3. En **Environment variables** agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Deploy. Cada `git push` vuelve a publicar solo.

## Ver los datos de los usuarios
En Supabase, **Table Editor**: `perfiles` (una fila por persona), `recomendaciones` (historial)
y la vista `resumen_usuarios`, que se puede exportar a CSV. Cada persona solo puede ver sus datos;
tú ves todo desde el panel.
