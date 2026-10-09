/**
 * ============================================================================
 * ESTE SERVICE WORKER SE DESPLIEGA PERO **NO SE REGISTRA**. LEER ANTES DE TOCAR.
 * ============================================================================
 *
 * ESTADO ACTUAL (por que este archivo es inerte):
 *   - El push lo maneja el service worker de Angular, `ngsw-worker.js`.
 *     `NotificationService.getPushRegistration()` le pasa a FCM la registration de
 *     `navigator.serviceWorker.getRegistration()`, que es la de ngsw.
 *   - ngsw SI maneja el evento `push` (su `onPush` -> `handlePush`): muestra la
 *     notificacion con el titulo y el cuerpo del payload de FCM.
 *   - El clic navega gracias al `onActionClick` que agrega la Cloud Function
 *     (`functions/src/index.ts` -> `buildClickAction`).
 *   - Este archivo se copia a `www/` por el glob de assets de `angular.json`, pero
 *     nadie lo registra: sus handlers NUNCA se ejecutan.
 *
 * SI ALGUN DIA SE MIGRA EL PUSH A ESTE SERVICE WORKER ("opcion B"), hay que resolver
 * estas tres trampas. Si no, o se rompe el push o se duplican los avisos:
 *
 *   1) NO SE GENERA SOLO. `src/firebase-messaging-sw.js` esta en .gitignore y NO hay
 *      ningun script que lo cree desde esta plantilla. Un clon nuevo o CI compila
 *      sin ese archivo, el glob de assets no encuentra nada (falla en silencio) y
 *      `getToken()` no puede registrar el SW => NO HAY PUSH.
 *      -> Agregar un paso de build que copie esta plantilla sustituyendo las
 *         credenciales, o sacar el archivo generado de .gitignore.
 *
 *   2) DOBLE NOTIFICACION. El SDK de FCM YA muestra la notificacion cuando el payload
 *      trae `notification` (su `onPush` llama a `showNotification`). Si ademas este
 *      archivo la muestra en `onBackgroundMessage`, el usuario recibe DOS avisos por
 *      cada mensaje.
 *      -> Quitar el `showNotification` de mas abajo, o no registrar
 *         `onBackgroundMessage`.
 *
 *   3) EL CLIC NO LLEVA A NINGUNA PARTE. El handler de abajo lee
 *      `event.notification.data.route`, pero cuando la notificacion la muestra el
 *      SDK, `data` es `{ [FCM_MSG]: payload }`: ahi NO hay `route`, asi que abriria
 *      `/`. El SDK resuelve la navegacion con `fcmOptions.link` (o
 *      `notification.click_action`).
 *      -> En la Cloud Function, mandar `webpush: { fcmOptions: { link: ruta } }` y
 *         dejar que el SDK maneje el clic.
 *
 * ADEMAS, al migrar hay que pensar en los TOKENS YA EMITIDOS: este SW vive en otro
 * scope (`/firebase-cloud-messaging-push-scope`), asi que `getToken()` devolvera un
 * token NUEVO. Las suscripciones viejas (las de ngsw) siguen activas y seguirian
 * recibiendo: habria notificaciones DUPLICADAS hasta limpiar a mano el array
 * `tokens` de `usuarios/{uid}` en Firestore, porque la Cloud Function solo purga los
 * tokens que fallan y los viejos no fallan.
 *
 * VER TAMBIEN:
 *   - src/app/services/notification.service.ts -> getPushRegistration()
 *   - functions/src/index.ts -> buildClickAction()
 */

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');


firebase.initializeApp({
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'Schoolify';

  const notificationOptions = {
    body: payload.notification?.body || 'Tienes una nueva notificación',
    icon: payload.notification?.icon || '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-72x72.png',
    tag: payload.data?.tag || 'notification-' + Date.now(),
    data: payload.data,
    vibrate: [200, 100, 200],
    requireInteraction: false
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        const route = event.notification.data?.route || '/';
        return clients.openWindow(route);
      }
    })
  );
});
