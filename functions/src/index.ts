/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
/* eslint-disable max-len */
/* eslint-disable quotes */
/* eslint-disable require-jsdoc */
/* eslint-disable valid-jsdoc */

import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {initializeApp} from 'firebase-admin/app';
import {onDocumentCreated} from 'firebase-functions/v2/firestore';


initializeApp();


export const onNewUserNotification = onDocumentCreated('usuarios/{userId}/notificaciones/{notificationId}',
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      console.log('No hay datos en el Snapshot');
      return;
    }

    const userId = event.params.userId;
    const notificationId = event.params.notificationId;
    const notificationData = snapshot.data();
    const db = getFirestore();

    try {
      const userDoc = await db.collection('usuarios').doc(userId).get();

      if (!userDoc.exists) {
        console.log('❌ Usuario no encontrado:', userId);
        return;
      }

      const userData = userDoc.data();
      const rol = userData?.rol;
      console.log(`📬 Nueva notificación creada para ${rol}: ${userId}`);

      switch (rol) {
        case 'administrador':
          return await handleAdminNotification(notificationId, notificationData);
        case 'tutor':
          return await handleTutorNotification(userId, notificationId, notificationData, userData);
        default:
          console.log(`⚠️ Rol desconocido o no soportado: ${rol}`);
          return {success: false, message: 'Rol no soportado'};
      }
    } catch (error) {
      console.error('❌ Error procesando notificación:', error);
      throw error;
    }
  }
);

async function handleAdminNotification(
 notificationId: string,
 notificationData: any
): Promise<any> {
  console.log(`✅ Notificación de administrador creada: ${notificationId}`);
  console.log(`📄 Contenido: ${notificationData.body}`);

  return {
    success: true,
    type: 'admin_notification',
    notificationId: notificationId,
  };
}

async function handleTutorNotification(
 tutorId: string,
 notificationId: string,
 notificationData: any,
 tutorData: any
): Promise<any> {
  try {
    const {tipo, nombreCompleto, sid, fecha, materias, observaciones} = notificationData;
    const tutorTokens: string[] = tutorData.tokens || [];
    console.log(`📱 Procesando notificación de tutor para estudiante: ${nombreCompleto}`);

    if (tutorTokens.length === 0) {
      console.log('⚠️ El tutor no tiene tokens FCM registrados');
      return {
        success: true,
        type: 'tutor_notification',
        tutorId: tutorId,
        pushNotificationsSent: 0,
        message: 'No tokens available',
      };
    }

    console.log(`📲 Enviando notificación a ${tutorTokens.length} dispositivo(s) del tutor`);
    const notificationTitle = `Aviso de ${tipo}`;
    const notificationBody = `Tienes un aviso de ${tipo} para ${nombreCompleto}`;

    const notificationDataPayload: {[key: string]: string} = {
      nombreCompleto: nombreCompleto || '',
      notificationId: notificationId,
      route: '/caregiver-dashboard/tab-notifications',
      sid: sid || '',
      tipo: tipo || '',
      type: 'caregiver_notification',
    };

    if (materias && Array.isArray(materias)) {
      notificationDataPayload.materias = materias.join(', ');
    }
    if (fecha) notificationDataPayload.fecha = fecha;
    if (observaciones) notificationDataPayload.observaciones = observaciones;

    const message = {
      notification: {
        title: notificationTitle,
        body: notificationBody,
      },
      data: notificationDataPayload,
      tokens: tutorTokens,
      webpush: {
        notification: {
          icon: 'https://escuela-mx.web.app/assets/icons/icon-192x192.png',
          badge: 'https://escuela-mx.web.app/assets/icons/icon-32x32.png',
        },
      },
    };

    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast(message);

    console.log(
      `✅ Notificaciones enviadas: ${response.successCount} exitosas, ${response.failureCount} fallidas`
    );

    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(
            `❌ Error en token ${tutorTokens[idx]}:`,
            resp.error?.code
          );

          if (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(tutorTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`🧹 Limpiando ${tokensToRemove.length} token(s) inválido(s)`);
        const db = getFirestore();

        const cleanedTokens = tutorTokens.filter(
          (token: string) => !tokensToRemove.includes(token)
        );

        await db.collection('usuarios').doc(tutorId).update({
          tokens: cleanedTokens,
        });
      }
    }

    return {
      success: true,
      type: 'tutor_notification',
      tutorId: tutorId,
      studentName: nombreCompleto,
      notificationType: tipo,
      pushNotificationsSent: response.successCount,
      pushNotificationsFailed: response.failureCount,
    };
  } catch (error) {
    console.error('❌ Error enviando notificación a tutor:', error);
    throw error;
  }
}

export const onNewUserRegistered = onDocumentCreated('usuarios/{userId}',
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      console.log('No hay datos en el snapshot');
      return;
    }

    const userId = event.params.userId;
    const newUser = snapshot.data();
    console.log(`✅ Nuevo ${newUser.rol} registrado: ${newUser.email}`);

    if (newUser.rol !== 'maestro') {
      return;
    }

    try {
      const db = getFirestore();

      const adminSnapshot = await db
        .collection('usuarios')
        .where('rol', '==', 'administrador')
        .get();

      if (adminSnapshot.empty) {
        console.log('⚠️ No se encontró ningún administrador');
        return;
      }

      const adminTokens: string[] = [];
      const adminIds: string[] = [];

      adminSnapshot.forEach((adminDoc) => {
        const adminData = adminDoc.data();
        const tokens = adminData.tokens || [];
        adminTokens.push(...tokens);
        adminIds.push(adminDoc.id);
      });

      const notificationBody = `Se registró un usuario con el correo: ${newUser.email}`;
      const timestamp = FieldValue.serverTimestamp();

      const notificationPromises = adminIds.map(async (adminId) => {
        await db
          .collection('usuarios')
          .doc(adminId)
          .collection('notificaciones')
          .add({
            body: notificationBody,
            createdAt: timestamp,
          });
      });

      await Promise.all(notificationPromises);
      console.log(`💾 Notificación guardada en Firestore para ${adminIds.length} administrador(es)`);

      if (adminTokens.length === 0) {
        console.log('⚠️ El administrador no tiene tokens FCM');
        return {
          success: true,
          firestoreNotificationsSaved: adminIds.length,
          pushNotificationsSent: 0,
        };
      }

      console.log(`📱 Enviando notificación a ${adminTokens.length} dispositivos`);

      const message = {
        notification: {
          title: 'Nuevo Usuario:',
          body: `Se registró un usuario con el correo: ${newUser.email}`,
        },
        data: {
          type: 'new_user',
          userId: userId,
          userEmail: newUser.email || '',
          userRole: newUser.rol || '',
          route: '/admin-dashboard/tab-notifications',
        },
        tokens: adminTokens,
        webpush: {
          notification: {
            icon: 'https://escuela-mx.web.app/assets/icons/icon-192x192.png',
            badge: 'https://escuela-mx.web.app/assets/icons/icon-32x32.png',
          },
        },
      };

      const messaging = getMessaging();
      const response = await messaging.sendEachForMulticast(message);
      console.log(`✅ Notificaciones enviadas: ${response.successCount} exitosas, ${response.failureCount} fallidas`);

      if (response.failureCount > 0) {
        const tokensToRemove: string[] = [];

        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(
              `❌ Error en token ${adminTokens[idx]}:`,
              resp.error?.code
            );

            if (
              resp.error?.code === 'messaging/invalid-registration-token' ||
              resp.error?.code === 'messaging/registration-token-not-registered'
            ) {
              tokensToRemove.push(adminTokens[idx]);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          console.log(`🧹 Limpiando ${tokensToRemove.length} tokens inválidos`);

          adminSnapshot.forEach(async (adminDoc) => {
            const adminData = adminDoc.data();
            const currentTokens = adminData.tokens || [];
            const cleanedTokens = currentTokens.filter(
              (token: string) => !tokensToRemove.includes(token)
            );

            await adminDoc.ref.update({
              tokens: cleanedTokens,
            });
          });
        }
      }

      return {
        success: true,
        firestoreNotificationsSaved: adminIds.length,
        pushNotificationsSent: response.successCount,
        pushNotificationsFailed: response.failureCount,
      };
    } catch (error) {
      console.error('❌ Error enviando notificación:', error);
      throw error;
    }
  }
);
