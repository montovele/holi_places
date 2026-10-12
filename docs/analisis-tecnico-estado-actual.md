# Análisis técnico del estado actual

Fecha de revisión: 2026-10-09

## Resumen ejecutivo

Holi Places es una SPA Vue 3 con API Express 5 y persistencia MySQL. Se incorporó una base SaaS multi-tenant, autenticación por sesión, roles, CRUD administrativo y un flujo de alta con Stripe Checkout. Una congregación nueva permanece en estado `pending_payment`; puede iniciar sesión y entrar al dashboard, que muestra el estado de pago sin agenda privada. Los módulos y las actividades públicas solo se habilitan cuando el servidor recibe una factura pagada por webhook firmado.

El flujo de Stripe está implementado en código, pero no se puede completar un cobro real sin configurar las claves, el Price ID y el endpoint de webhook en Stripe y `.env`. No se inspeccionó ni modificó el `.env` local. Tampoco se ejecutó una migración contra una instancia MySQL real en esta revisión.

## Arquitectura

- Frontend: Vue 3, Vite, Vue Router y Pinia; servicios HTTP Axios con cookies de credenciales.
- API: Express, controladores y servicios separados, validación de origen para escrituras, Helmet y límites de frecuencia para login/registro.
- Datos: MySQL con `mysql2/promise`. La inicialización crea el esquema e incorpora `organization_id` a tablas existentes, asignando filas previas a `org-demo` sin eliminarlas.
- Sesión: JWT de una hora en cookie `HttpOnly`, `SameSite=Strict`; nunca se devuelve el hash bcrypt ni se expone el JWT a JavaScript.

## Registro y ciclo de pago

1. `POST /api/public/registrations` valida nombre, email y contraseña, crea organización, usuario administrador y suscripción `pending_payment`. No requiere configuración Stripe ni inicia un cobro.
2. La interfaz confirma el alta y ofrece iniciar sesión. Tras autenticar, el dashboard muestra el estado pendiente y la invitación de suscripción; la acción inicia Checkout desde `/billing`.
3. `POST /api/billing/webhook` recibe el cuerpo raw, valida `Stripe-Signature` y registra el ID del evento con una clave única para evitar procesarlo dos veces.
4. `invoice.paid` activa la suscripción. Fallos de cobro la pasan a `past_due`; cancelaciones y vencimientos bloquean el acceso.
5. Middleware consulta la suscripción más reciente y su vencimiento UTC antes de acceder a `/api/modules/*`. El dashboard requiere sesión pero no pago; devuelve el estado de suscripción y solo consulta agenda si está activa. El rol `superadmin` conserva acceso de soporte.
6. El feed público solo muestra eventos y publicaciones de organizaciones con suscripción vigente.

Stripe usa una tarifa recurrente configurada en Dashboard y referida mediante `STRIPE_PRICE_ID`. El precio, moneda e intervalo no están codificados. El modelo actual libera todos los módulos al pagar; no hay entitlements por módulo ni múltiples planes en la aplicación.

## Cuentas y permisos

- `superadmin`: administra organizaciones, selecciona tenant y crea una congregación con su primer admin.
- `admin`: administra módulos de su organización y puede crear operadores.
- `operator`: lectura general y escritura acotada a asistencia/reservas; no puede borrar ni administrar cuentas.

La vista de superadmin muestra solo correo, rol e ID de la cuenta autenticada. No presenta contraseña, hash, secretos ni tokens.

## Módulos y persistencia

| Módulo | Persistencia actual | Acciones |
|---|---|---|
| Agenda (calendario, reuniones y eventos) | `events` | Un único CRUD canónico; las rutas/API antiguas `calendar` y `meetings` se mantienen como alias compatibles |
| Sedes | `locations` | CRUD; validación de coordenadas y relación con eventos/reservas |
| Miembros | `members` | CRUD; email único |
| Reservas | `space_reservations` | CRUD, transacción y rechazo de conflictos horarios |
| Grupos, asistencia, recursos, comunicaciones, reportes, suscripción y configuración | `module_records` | CRUD genérico por módulo |
| Blog/publicaciones editoriales | `community_posts` | Lectura pública filtrada por suscripción; el CRUD editorial aún no está conectado a una pantalla de administración |

El CRUD de `module_records` es deliberadamente genérico porque no hay tablas de dominio para esos módulos auxiliares. Antes de uso productivo se deben definir campos, relaciones y reglas reales para grupos, asistencia, recursos, comunicaciones, reportes, planes y configuración. El módulo visual “Suscripción” sigue siendo un registro genérico y no debe usarse como fuente del estado de cobro; la fuente autoritativa es `subscriptions`.

## Superficie HTTP principal

- `POST /api/public/registrations`: crea el tenant, usuario admin y suscripción pendiente sin iniciar checkout.
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`: sesión.
- `GET /api/billing/status`, `POST /api/billing/checkout`: estado y reintento de pago autenticado.
- `POST /api/billing/webhook`: eventos firmados de Stripe.
- `GET /api/dashboard`: requiere cuenta y devuelve el estado de suscripción; la agenda se oculta si no está activa.
- `GET /api/modules/:moduleId`: requiere cuenta y suscripción activa; si falta pago devuelve `402 SUBSCRIPTION_REQUIRED`.
- `POST`, `PUT` y `DELETE /api/modules/:moduleId/...`: mutaciones restringidas por organización y rol.
- `GET /api/public/community`: agenda/publicaciones activas sin exponer contenido de tenants impagos.
- `GET /api/public/appearance`: configuración pública validada de nombre, icono, colores y presentación de Comunidad; `GET/PUT /api/admin/appearance` solo para superadmin.
- `GET/POST /api/admin/organizations`, `GET/POST /api/admin/users`: operación de tenants y equipo.

## Seguridad aplicada

- Hash de contraseñas bcrypt con coste 12; límites de contraseña compatibles con 72 bytes UTF-8.
- JWT con algoritmo HS256 explícito, expiración de sesión y comprobación del usuario activo en cada request.
- Rate limit en login y registro, límite de JSON de 1 MB, Helmet y validación `Origin` en operaciones con cookie.
- El encabezado de selección de tenant solo surte efecto para superadmin y el tenant se valida contra organizaciones activas. Admin y operador siempre usan su organización del servidor.
- Webhooks Stripe verificados con secreto de firma e idempotencia. La URL de retorno del navegador no activa la suscripción.
- Errores internos ocultan detalles SQL; los conflictos de integridad se devuelven como `409`.

## Verificación realizada

- Backend: 32 pruebas pasan, incluyendo sesión/roles, aislamiento de tenant, bloqueo de módulos sin pago, firma/idempotencia de Checkout, CRUD y conflictos de reservas.
- Frontend: `npm run build --workspace @holi-places/frontend` pasa.
- Dependencias: `npm audit --workspace @holi-places/backend --omit=dev` reportó cero vulnerabilidades, incluyendo Stripe.
- No verificado: ejecución de migraciones MySQL reales, una suscripción end-to-end con Stripe, entrega de webhooks live/test desde Stripe y correos de verificación/recuperación.

## Pendientes antes de producción

1. Configurar y probar `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` y `STRIPE_WEBHOOK_SECRET` usando modo test; registrar los cinco eventos descritos en `README.md`.
2. Ejecutar la inicialización/migración sobre una copia de la base real y comprobar conteos, constraints e índices antes de producción.
3. Añadir verificación de email, recuperación de contraseña, cambio de contraseña, MFA opcional y auditoría de cambios administrativos.
4. Reemplazar el CRUD genérico auxiliar por modelos de dominio acordados y construir administración editorial para `community_posts` si se necesita publicar artículos además de eventos.
5. Definir política de impuestos, cancelación al fin de periodo, reembolsos, facturas y manejo de disputas. La aplicación sigue el estado de Stripe, pero no administra esos procesos comerciales.
6. Añadir pruebas de integración con MySQL y pruebas end-to-end de Stripe usando Stripe CLI antes de cobrar a congregaciones.
