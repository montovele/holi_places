# Suscripciones SaaS

## Estado actual

- `GET /suscripciones/account/subscription` y `POST /suscripciones/account/subscription/refresh` resuelven la cuenta exclusivamente desde `req.session.user.id` y `saas_account_users`.
- `POST /suscripciones/account/subscription` permite el alta inicial: deriva el usuario desde la sesión, crea o reutiliza su cuenta SaaS y registra la suscripción sin exigir que el frontend conozca un `account_id`.
- `GET /suscripciones/account/providers/:proveedorId/subscriptions` solo devuelve suscripciones de un proveedor relacionado con la cuenta del usuario autenticado; no requiere permiso administrativo porque el alcance se deriva de la sesion.
- El CRUD administrativo esta separado de las rutas de cuenta: `GET /suscripciones/admin/saas/subscriptions`, `GET /suscripciones/admin/saas/subscriptions/:subscriptionId`, `GET /suscripciones/admin/saas/users/:userId/subscriptions`, `POST /suscripciones/admin/saas/accounts/:accountId/subscription`, `PUT /suscripciones/admin/saas/subscriptions/:subscriptionId`, `PUT /suscripciones/admin/saas/accounts/:accountId/subscription` y `DELETE /suscripciones/admin/saas/subscriptions/:subscriptionId`.
- Alta, actualizacion y cancelacion requieren autenticacion, rol administrativo y permisos `saas.subscription.create`, `saas.subscription.update` o `saas.subscription.cancel`; cancelar cambia el estado a `canceled` y no elimina filas.
- `saas_accounts` es la unidad comercial y de cobro; `saas_account_providers` relaciona sus proveedores operativos. `proveedor_id` limita datos y operaciones, pero no crea una suscripcion separada.
- La ruta CT piloto valida que el `proveedor_id` de la sesion pertenezca a la cuenta SaaS mediante `saas_account_providers`.
- Refresh invalida `saas:entitlements:account:{accountId}:v1` antes de reconstruir la proyeccion.
- Las rutas administrativas requieren sesion, rol `admin` real y permisos `saas.subscription.read`, `saas.subscription.update` o `saas.entitlement.update`. Mientras se migra el catalogo de permisos, un `admin` sin lista explicita conserva compatibilidad temporal.
- Los cambios administrativos usan transaccion y registran `saas_subscription_audit`.
- Solo `active` y `trialing` conceden entitlements. Redis tiene fallback de lectura a base de datos; un fallo de base de datos no autoriza acceso.

## Contrato CRUD publico

Todas las respuestas exitosas usan `{ "data": ... }`. La alta administrativa recibe `plan_id` (codigo de plan activo), `status`, `started_at`, `current_period_end`, `cancel_at_period_end` y, opcionalmente, identificadores externos. Devuelve `201`; actualizaciones devuelven `200`. El borrado administrativo es una cancelacion logica y devuelve la proyeccion efectiva.

Los filtros de listado administrativo son `account_id`, `proveedor_id` y `status`; los dos primeros solo son filtros administrativos y nunca determinan el alcance de un usuario B2B. Las rutas de cuenta ignoran cualquier `account_id` recibido del navegador y derivan la cuenta desde la sesion y sus relaciones.

Errores publicos: `401 UNAUTHORIZED`, `403 PERMISSION_DENIED`, `403 SUBSCRIPTION_REQUIRED`, `404 ACCOUNT_NOT_FOUND` o `SUBSCRIPTION_NOT_FOUND`, y `422 INVALID_PLAN` o `INVALID_SUBSCRIPTION_STATUS`. No se incluyen secretos, SQL ni datos de billing.

## Bloqueo CT

No se aplica `requireEntitlement('ct')` al router completo de CT. `ct/routes/ctRoutes.js` mezcla rutas legacy con cadenas distintas de autenticacion: algunas usan `requireRole` y las rutas B2B usan `requireB2BAuth`, que admite un contexto por `proveedor_id` en body cuando no hay sesion. No existe una frontera unica y segura para insertar el entitlement sin cambiar el comportamiento de rutas existentes ni confiar en datos del navegador.

La ruta piloto actual es `GET /ct/saas/pilot` con `requireAuth -> resolveAccount -> requireRole -> requireEntitlement('ct')`. Toma `proveedor_id` exclusivamente de la sesion y no modifica las rutas CT legacy. No se conectaron billing ni webhooks.

## Pendientes de infraestructura

- Las migraciones `005` y `006` se ejecutan mediante `ct/config/db_ct.js` sobre `ssaxxon_ct_db`; pueden repetirse con `node setup/run-saas-migration.js` y `node setup/run-saas-account-providers-migration.js` de forma idempotente.
- `node setup/seed-saas-accounts.js` sigue bloqueando el poblamiento heuristico porque `user` no tiene `proveedor_id` y `proveedores` no tiene `user_id`.
- El mapeo autorizado de `usuario_general` se aplico en `ssaxxon_ct_db` con `node setup/seed-saas-user-provider.js --apply`: cuenta `1`, usuario local `8`, proveedor `21` (`Emma Whatzon`), rol `proveedor`, suscripcion `legacy` activa y entitlements `local_service`, `ct` y `billing`.
- Los permisos granulares SaaS estan en `middleware/requirePermission.js`; el fallback de `admin` es temporal hasta persistir permisos explicitos.
- El webhook SaaS de Stripe usa firma, transacción, invalidación de caché y auditoría; la deduplicación persistente de `event.id` queda como siguiente endurecimiento operativo.

## Checkout de suscripciones con Stripe

El catálogo público usa `GET /suscripciones/plans` (el alias existente `GET /suscripciones/account/plans` también se conserva). El flujo de pago usa `POST /suscripciones/account/checkout`, requiere sesión autenticada y un header `Idempotency-Key` estable por intento lógico. El body debe enviar el `codigo` de un plan activo publicado por el catálogo:

```json
{ "plan_id": "monthly" }
```

El backend selecciona exclusivamente el Price Stripe activo asociado a la versión de precio del plan SaaS y el frontend nunca envía importe, moneda, descuento ni `stripe_price_id`. Un plan solo se publica si tiene esa versión activa y su Price Stripe configurado.

Variables requeridas:

- `STRIPE_SECRET_KEY`
- `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (o el secreto Stripe existente como fallback)

Variables opcionales: `FRONTEND_URL`, `STRIPE_SUBSCRIPTION_SUCCESS_URL` y `STRIPE_SUBSCRIPTION_CANCEL_URL`.

Respuesta exitosa:

```json
{ "data": { "checkout_url": "https://checkout.stripe.com/...", "checkout_session_id": "cs_...", "plan_id": "annual" } }
```

El webhook SaaS es `POST /stripe/subscriptions/webhook`. Debe configurarse en Stripe para `checkout.session.completed` y `customer.subscription.created`, `customer.subscription.updated` y `customer.subscription.deleted`. El webhook verifica la firma con el body crudo, sincroniza el estado y `current_period_end` en UTC, y limpia la caché de entitlements.

## Decision de unidad comercial

La cuenta SaaS representa a la empresa que contrata el servicio y es la unidad de cobro. Una cuenta puede agrupar varios usuarios y proveedores. La suscripcion se consulta por `account_id` y sus entitlements habilitan los modulos para los proveedores asociados, mientras cada operacion conserva `proveedor_id` como alcance de datos.

```text
saas_accounts (unidad comercial/cobro)
	-> saas_account_users -> user
	-> saas_account_providers -> proveedores
```

Una asignacion valida requiere confirmar explicitamente `account_id`, `user_id`, `proveedor_id` y `rol`. El seed no crea estas filas automaticamente porque el esquema actual no contiene una relacion verificable entre `user` y `proveedores`.
