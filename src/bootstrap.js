import { initializeCloud } from './cloud.js';
import { installCardNotificationEnhancer, startCardNoticeSync } from './notifications.js';

await initializeCloud();
installCardNotificationEnhancer();
await import('./simple.js');

// La corrección de origen/destino se carga después de que la app ya abrió.
// Si este módulo falla por cualquier razón, no bloquea el arranque principal.
import('./payment-source-fix.js')
  .then(({ installPaymentSourceFix })=>installPaymentSourceFix())
  .catch(error=>console.error('Payment source module failed',error));

startCardNoticeSync();
