# Presupuesto Online

App web personal para manejar presupuesto por quincena, métodos de pago, balances de tarjetas, cortes y fechas límite.

## Funciones

- Presupuesto por mes y 1ra/2da quincena.
- Ingresos, gastos y pagos.
- Account Overview por tarjeta/cuenta.
- Día de corte y día límite configurables por tarjeta.
- Generación automática de cortes al abrir la app después del día de corte.
- Alertas visuales para cortes y pagos próximos.
- Notificaciones del navegador con permiso del usuario.
- Respaldo e importación JSON.
- PWA básica y modo oscuro.
- Datos guardados en `localStorage`.

## Ejecutar localmente

Como usa módulos ES, levanta un servidor local en la carpeta del proyecto. Por ejemplo:

```bash
python -m http.server 8000
```

Luego abre `http://localhost:8000`.

## Subir a GitHub

```bash
git init
git add .
git commit -m "Initial budget app"
git branch -M main
git remote add origin TU_URL_DE_GITHUB
git push -u origin main
```

## Publicar en Vercel

Importa el repositorio desde Vercel. El proyecto es estático y no necesita comando de build. Mantén la raíz del repositorio como Root Directory.

## Importante sobre las notificaciones

Las notificaciones incluidas funcionan cuando el usuario concede permiso y la web se abre/ejecuta. Para avisos garantizados aunque la app esté cerrada se necesita un backend de notificaciones push, email o una tarea programada. Ese sería el siguiente paso natural (por ejemplo con Supabase + cron/email/push).
