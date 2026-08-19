# Presupuesto Online

Aplicación personal de presupuesto quincenal con una interfaz sencilla, oscura y enfocada en el flujo real del presupuesto.

## Flujo principal

1. Ingresos
2. Gastos de la quincena
3. Pagos
4. Saldo disponible
5. Tarjetas y cuentas

## Persistencia de datos

La aplicación guarda automáticamente todos los cambios en `localStorage` usando la clave estable `presupuesto-online-dark-v2`.

Esto significa que:

- recargar la página no borra la información;
- cerrar y volver a abrir el navegador conserva los datos;
- publicar una nueva versión en Vercel no borra los datos del navegador;
- cada edición se guarda automáticamente;
- también existe exportación e importación de respaldo JSON.

La app reutiliza la misma clave de almacenamiento de la versión anterior para no perder los datos ya guardados.

> Esta persistencia es local al navegador/dispositivo. Para sincronizar automáticamente PC y celular, la siguiente fase será mover la persistencia a Supabase.

## Tarjetas

Una compra realizada con tarjeta aumenta la deuda de la tarjeta, pero no reduce el efectivo inmediatamente.

El efectivo disminuye cuando se registra el pago de la tarjeta.

La sección de cuentas calcula:

`Saldo anterior + Cargos - Pagos = Saldo proyectado`

Cada tarjeta puede guardar:

- saldo base;
- límite de crédito;
- día de corte;
- día límite de pago.

La aplicación genera cortes internos y muestra avisos cuando se acerca un corte o un pago.

## Quincenas

Se puede navegar entre 1ra y 2da quincena de cada mes y copiar una quincena anterior como punto de partida.

## Desarrollo local

```bash
python -m http.server 8000
```

Luego abre `http://localhost:8000`.

## Vercel

El proyecto es estático y puede publicarse directamente desde este repositorio sin comando de build.
