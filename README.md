# Holi Places

Proyecto independiente del Laravel anterior. El frontend Vue y la API Express viven en paquetes separados dentro de este monorepo.

## Estructura

```text
holi_frontend/         Vue 3, Vite, Vue Router y Pinia
  src/modules/         Registro de áreas funcionales
  src/components/      Componentes compartidos
  src/layouts/         Shell de administración
  src/router/          Rutas del frontend
  src/services/        Cliente HTTP y servicios API
  src/stores/          Estado de la aplicación
  src/views/           Dashboard y vistas de módulos
holi_backend/          API Express + MySQL
  src/controllers/     Controladores HTTP
  src/db/              Esquema MySQL y datos de demostración
  src/routes/          Rutas API
  src/services/        Lógica de servicios
```

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.
- Docker Desktop (para ejecutar MySQL localmente).

## Desarrollo

Desde esta carpeta, en PowerShell crea o valida el `.env` raíz y arranca MySQL:

```powershell
docker compose up -d --wait mysql
npm.cmd install
npm.cmd run dev
```

Antes de iniciar por primera vez, asegúrate de que exista un `.env` en la raíz del proyecto con `JWT_SECRET` y las credenciales locales. `INITIAL_SUPERADMIN_EMAIL` y `INITIAL_SUPERADMIN_PASSWORD` son opcionales y solo se usan para crear el primer superadmin: si faltan, la API arranca sin esa cuenta y registra una advertencia. Una congregación puede registrarse mediante el flujo público; no habrá acceso global de superadmin hasta que se configure el bootstrap. La contraseña inicial debe tener 12 a 72 bytes UTF-8. No compartas ni subas `.env` al repositorio.

Para el alta y cobro configura en Stripe una tarifa recurrente y añade `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (la tarifa elegida) y `STRIPE_WEBHOOK_SECRET` al `.env`. El monto, moneda y periodo se administran en Stripe; no se fijan en el código. En desarrollo puedes reenviar webhooks con `stripe listen --forward-to localhost:3002/api/billing/webhook`.

Suscribe el webhook a `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`. El panel solo se desbloquea con un evento firmado y validado de factura pagada; cancelar Stripe Checkout o volver a la URL de éxito no activa el tenant. Si Stripe falla después del registro, la cuenta queda pendiente y puede reintentar desde `/billing`.

MySQL conserva los datos en el volumen Docker `holi-mysql-data`; la API crea las tablas InnoDB y carga datos de demostración al iniciarse. Los registros de demostración existentes no se sobrescriben.

La interfaz queda en `http://localhost:5188` y la API Holi Places en `http://localhost:3002`, separada del servicio existente en el puerto 3001. Para trabajar con cada proceso por separado usa `npm run dev:web` o `npm run dev:api`. El backend lee la conexión del `.env` raíz (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`); la base y el usuario se crean al arrancar el contenedor Compose.

### Solución de problemas local

Si el navegador informa CORS para `http://localhost:3002/api/health`, comprueba primero que `npm.cmd run dev:api` haya iniciado y que el puerto 3002 esté escuchando. Un error `JWT_SECRET debe tener al menos 32 caracteres` o un mensaje de MySQL significa que el API cerró antes de responder; corrige esa configuración y vuelve a iniciarlo. El origen `http://localhost:5188` ya está permitido por CORS y cubierto por una prueba backend. `GET /api/health` ejecuta `SELECT 1` y devuelve el estado de MySQL. El favicon de la app está servido como `/favicon.svg`; un `404` aislado de `/favicon.ico` no afecta al API ni a la carga de la aplicación.

Ejecuta `npm run db:seed --workspace @holi-places/backend` para crear/verificar el esquema y agregar los datos de demostración faltantes. El cambio a MySQL no importa automáticamente archivos SQLite previos.

## Acceso, roles y tenants

- La API usa sesiones firmadas en cookie `HttpOnly`, `SameSite=Strict`, hash de contraseñas bcrypt y limitación de intentos de login.
- `superadmin`: administra tenants y selecciona una organización activa para operar. La selección se valida en servidor.
- `admin`: opera todos los módulos de su organización y puede crear cuentas `operator`.
- `operator`: consulta módulos y puede crear/editar reservas y asistencia; no puede borrar registros ni administrar cuentas.
- Una cuenta autenticada puede entrar al dashboard aunque la suscripción esté pendiente; los módulos se muestran deshabilitados hasta el pago confirmado.
- Los registros actuales se asignan de forma idempotente a `org-demo` al migrar el esquema; no se eliminan.

## Contrato backend

- `GET /api/health`: estado del servidor, marca de tiempo y comprobación MySQL con `SELECT 1`.
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`: inicio, consulta y cierre de sesión.
- `POST /api/public/registrations`: crea congregación, cuenta admin y suscripción pendiente; no inicia checkout ni requiere Stripe configurado.
- `GET /api/billing/status`, `POST /api/billing/checkout`: consulta o reintenta el pago de la organización autenticada.
- `POST /api/billing/webhook`: webhook Stripe firmado e idempotente; `invoice.paid` activa la suscripción.
- `GET /api/dashboard`: estado de suscripción; agenda solo cuando la organización está activa (requiere sesión, no requiere pago).
- `GET /api/modules/:moduleId`: lectura autenticada que requiere suscripción activa; sin pago devuelve `402 SUBSCRIPTION_REQUIRED`. La agenda canónica es `events`; `calendar` y `meetings` se conservan como alias.
- `POST /api/modules/:moduleId`, `PUT /api/modules/:moduleId/:recordId`, `DELETE /api/modules/:moduleId/:recordId`: CRUD con validación y filtro de tenant. La Agenda persiste en `events`; `calendar` y `meetings` son alias compatibles. Sedes, miembros y reservas usan sus tablas; grupos, asistencia, recursos, comunicaciones, reportes, suscripción y configuración usan `module_records`.
- `POST /api/admin/organizations`: superadmin crea un tenant y su primera cuenta administradora en una transacción. `GET /api/admin/organizations` lista tenants.
- `GET /api/admin/users`, `POST /api/admin/users`: administración de cuentas del tenant activo; los administradores solo crean operadores.
- `POST /api/modules/locations/:locationId/reservations`: crea reserva de espacio y rechaza solapamientos.
- `PATCH /api/modules/events/:eventId/location`: asigna un evento a una sede de la misma organización.
- `GET /api/public/community`: feed público de publicaciones y próximos eventos publicados.
- `GET /api/public/appearance`: nombre, símbolo, paleta y modo visual públicos de la plataforma.
- `GET /api/admin/appearance`, `PUT /api/admin/appearance`: lectura y edición de identidad visual; solo superadmin puede administrar estos valores.
- `GET /api/public/appearance`: nombre, símbolo, paleta y modo visual públicos de la plataforma.
- `GET /api/admin/appearance`, `PUT /api/admin/appearance`: lectura y edición de identidad visual; solo superadmin puede administrar estos valores.

El registro público crea la cuenta sin cobro inmediato. Después de iniciar sesión, el dashboard presenta la invitación a suscribirse; Stripe Checkout se inicia desde `/billing`. El feed comunitario es público, pero solo incluye eventos y publicaciones de organizaciones con suscripción vigente. El dashboard permanece disponible para mostrar el estado de pago; la falta de pago/cancelación bloquea todos los endpoints de módulos y oculta su agenda pública. Los datos sembrados siguen siendo demostrativos.