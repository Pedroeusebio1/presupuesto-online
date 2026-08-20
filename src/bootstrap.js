import { initializeCloud } from './cloud.js';
import { installCardNotificationEnhancer, startCardNoticeSync } from './notifications.js';
import { installPaymentUiEnhancer } from './payment-ui.js';

await initializeCloud();
installCardNotificationEnhancer();
installPaymentUiEnhancer();
await import('./simple.js');
startCardNoticeSync();
