import { initializeCloud } from './cloud.js';
import { installCardNotificationEnhancer, startCardNoticeSync } from './notifications.js';

await initializeCloud();
installCardNotificationEnhancer();
await import('./simple.js');
startCardNoticeSync();
