/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
/* eslint-disable max-len */
/* eslint-disable quotes */
/* eslint-disable require-jsdoc */
/* eslint-disable valid-jsdoc */

import {getFirestore, FieldValue} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';
import {initializeApp} from 'firebase-admin/app';
import {onDocumentCreated, onDocumentDeleted} from 'firebase-functions/v2/firestore';

import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {getAuth} from 'firebase-admin/auth';

initializeApp();


/**
 * ngsw (el service worker que recibe el push) decide a donde navegar al hacer clic
 * leyendo `notification.data.onActionClick[accion]`. Sin esto el clic cierra la
 * notificacion y no abre nada. `navigateLastFocusedOrOpen` reutiliza la ventana
 * abierta en lugar de abrir una nueva.
 */
function buildClickAction(route: string): {[key: string]: unknown} {
  return {
    onActionClick: {
      default: {
        operation: 'navigateLastFocusedOrOpen',
        url: route,
      },
    },
  };
}


/**
 * Decide si un token FCM ya no sirve y hay que quitarlo del usuario.
 *
 * La API v1 responde con dos codigos distintos segun como este roto el token:
 *   - `messaging/registration-token-not-registered`: la app se desinstalo o el
 *     token se renovo.
 *   - `messaging/invalid-registration-token`: token invalido (nombre heredado).
 *   - `messaging/invalid-argument` con el mensaje "The registration token is not a
 *     valid FCM registration token": token mal formado. Es el que devuelve la API
 *     v1 para un token inventado, y sin este caso los tokens basura se acumulan.
 *
 * Ojo: un payload invalido TAMBIEN da `invalid-argument`, pero en todas las
 * respuestas del envio; por eso se exige ademas el mensaje especifico del token,
 * para no borrar tokens buenos por un error nuestro.
 */
function isTokenGone(code: string | undefined, message: string | undefined): boolean {
  if (code === 'messaging/registration-token-not-registered') return true;
  if (code === 'messaging/invalid-registration-token') return true;

  return code === 'messaging/invalid-argument' &&
    /not a valid FCM registration token/i.test(message ?? '');
}


/**
 * Region de los triggers de Firestore.
 *
 * `firebase-functions` v7 toma por defecto la region de la base
 * (`northamerica-south1`), donde Cloud Functions v2 no esta disponible en este
 * proyecto: el deploy falla con `403 Location ... not found or access is
 * unauthorized`. Las funciones de este archivo viven en `us-central1`, asi que la
 * region se declara explicitamente para que no dependa del valor por defecto.
 */
const TRIGGER_REGION = 'us-central1';

export const onNewUserNotification = onDocumentCreated({
  document: 'usuarios/{userId}/notificaciones/{notificationId}',
  region: TRIGGER_REGION,
},
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

    // Un documento sin campos (o un evento sin datos) hacia reventar a los
    // manejadores con "Cannot destructure property ... as it is undefined".
    if (!notificationData) {
      console.log(`⚠️ La notificación ${notificationId} no tiene datos: no se envía push`);
      return {success: false, message: 'Notificación sin datos'};
    }

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

    const notificationRoute = '/caregiver-dashboard/tab-notifications';

    const notificationDataPayload: {[key: string]: string} = {
      nombreCompleto: nombreCompleto || '',
      notificationId: notificationId,
      route: notificationRoute,
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
          icon: 'https://schoolify-mx.web.app/assets/icons/icon-192x192.png',
          badge: 'https://schoolify-mx.web.app/assets/icons/icon-32x32.png',
          data: buildClickAction(notificationRoute),
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

          if (isTokenGone(resp.error?.code, resp.error?.message)) {
            tokensToRemove.push(tutorTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`🧹 Limpiando ${tokensToRemove.length} token(s) inválido(s)`);
        const db = getFirestore();

        // `arrayRemove` quita SOLO los tokens invalidos. Reescribir el array
        // completo perderia el token que un dispositivo acabe de registrar.
        await db.collection('usuarios').doc(tutorId).update({
          tokens: FieldValue.arrayRemove(...tokensToRemove),
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

export const onNewUserRegistered = onDocumentCreated({
  document: 'usuarios/{userId}',
  region: TRIGGER_REGION,
},
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

      const notificationRoute = '/admin-dashboard/tab-notifications';

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
          route: notificationRoute,
        },
        tokens: adminTokens,
        webpush: {
          notification: {
            icon: 'https://schoolify-mx.web.app/assets/icons/icon-192x192.png',
            badge: 'https://schoolify-mx.web.app/assets/icons/icon-32x32.png',
            data: buildClickAction(notificationRoute),
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

            if (isTokenGone(resp.error?.code, resp.error?.message)) {
              tokensToRemove.push(adminTokens[idx]);
            }
          }
        });

        if (tokensToRemove.length > 0) {
          console.log(`🧹 Limpiando ${tokensToRemove.length} tokens inválidos`);

          // Un `arrayRemove` por administrador, en un batch: quitar de un
          // documento un token que no tiene es inofensivo, y asi no se pierde el
          // que se haya registrado mientras se enviaba la notificacion. (Antes
          // reescribia el array completo y ademas lanzaba los updates sin
          // esperarlos dentro del forEach.)
          const batch = db.batch();

          adminSnapshot.forEach((adminDoc) => {
            batch.update(adminDoc.ref, {
              tokens: FieldValue.arrayRemove(...tokensToRemove),
            });
          });

          await batch.commit();
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

export const deleteTeacher = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    const uid = request.data.uid;

    if (!uid) {
      throw new HttpsError('invalid-argument', 'El UID del maestro es requerido.');
    }

    const db = getFirestore();

    // Solo un administrador puede borrar cuentas. Las reglas de Firestore no
    // cubren esta funcion (se salta el cliente), asi que el rol se comprueba aqui.
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();

    if (!caller.exists || caller.data()?.rol !== 'administrador') {
      throw new HttpsError('permission-denied', 'Solo un administrador puede eliminar usuarios.');
    }

    if (uid === request.auth.uid) {
      throw new HttpsError('failed-precondition', 'No puedes eliminar tu propia cuenta de administrador.');
    }

    try {
      await getAuth().deleteUser(uid);
      await db.collection('usuarios').doc(uid).delete();
      console.log(`🗑️ Maestro eliminado correctamente: ${uid}`);
      return {success: true};
    } catch (error) {
      console.error('❌ Schoolify: [deleteTeacher]', error);
      throw new HttpsError('internal', 'Error al eliminar el maestro.');
    }
  }
);


/**
 * Valida CCT + PIN desde el portal, que todavia no tiene sesion.
 *
 * Vive aqui porque `escuelas` dejo de ser legible por cualquiera: el PIN no puede
 * salir del servidor. El PIN se guarda como number y la igualdad de Firestore
 * distingue tipos, asi que se compara contra un number (con string no encontraria
 * nada, y el portal fallaria en silencio).
 */
export const validateSchoolAccess = onCall(
  async (request) => {
    const cct = typeof request.data?.cct === 'string' ? request.data.cct.trim().toUpperCase() : '';
    const pin = request.data?.pin;

    if (!cct || typeof pin !== 'number' || !Number.isFinite(pin)) {
      return {valid: false};
    }

    try {
      const snapshot = await getFirestore()
        .collection('escuelas')
        .where('cct', '==', cct)
        .where('pin', '==', pin)
        .limit(1)
        .get();

      return {valid: !snapshot.empty};
    } catch (error) {
      console.error('❌ Schoolify: [validateSchoolAccess]', error);
      return {valid: false};
    }
  }
);


/**
 * Datos de la escuela de quien llama: id, cct, nombre, turno y telefono. Nunca el PIN.
 * Maestro y tutor los usan para mostrar los datos de su escuela.
 */
export const getMySchool = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    // Mismo candado que las reglas de Firestore: correo verificado.
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    try {
      const db = getFirestore();
      const profile = await db.collection('usuarios').doc(request.auth.uid).get();

      // El cct del perfil manda; el del cliente solo cubre perfiles antiguos,
      // creados antes de guardar `cct` (el dato no es sensible: no incluye el PIN).
      const cct = profile.data()?.cct ||
        (typeof request.data?.cct === 'string' ? request.data.cct.trim().toUpperCase() : '');

      if (!cct) {
        return {school: null};
      }

      const snapshot = await db.collection('escuelas').where('cct', '==', cct).limit(1).get();

      if (snapshot.empty) {
        return {school: null};
      }

      const school = snapshot.docs[0];
      const data = school.data();

      return {
        school: {
          id: school.id,
          cct: data.cct,
          nombre: data.nombre,
          turno: data.turno,
          telefono: data.telefono ?? '',
        },
      };
    } catch (error) {
      console.error('❌ Schoolify: [getMySchool]', error);
      throw new HttpsError('internal', 'No se pudo obtener la escuela.');
    }
  }
);


/**
 * Limpieza al borrar una cuenta (lo hace `deleteTeacher` o la consola).
 *
 *   1) Borra su subcoleccion de notificaciones: sin esto quedan avisos huerfanos
 *      que ya nadie puede leer (las reglas no dan acceso a un perfil inexistente).
 *   2) Suelta a sus alumnos: si el tutor desaparece y sus alumnos conservan el
 *      `tid`, dejan de aparecer en la lista de "alumnos sin tutor" y nadie puede
 *      volver a reclamarlos.
 *
 * El array `alumnos[]` de `grupos_de_alumnos` no se toca: hoy se crea vacio y
 * ninguna pantalla lo lee.
 */
export const onUserDeleted = onDocumentDeleted({
  document: 'usuarios/{userId}',
  region: TRIGGER_REGION,
},
  async (event) => {
    const userId = event.params.userId;
    const db = getFirestore();

    try {
      const notifications = await db.collection('usuarios').doc(userId)
        .collection('notificaciones').get();

      if (!notifications.empty) {
        const batch = db.batch();
        notifications.docs.forEach((notification) => batch.delete(notification.ref));
        await batch.commit();
        console.log(`🧹 ${notifications.size} notificación(es) borradas de ${userId}`);
      }

      const students = await db.collection('alumnos').where('tid', '==', userId).get();

      if (!students.empty) {
        const batch = db.batch();
        students.docs.forEach((student) => batch.update(student.ref, {
          tid: '',
          nombreTutor: '',
          updatedAt: FieldValue.serverTimestamp(),
        }));
        await batch.commit();
        console.log(`🧹 ${students.size} alumno(s) liberados de ${userId}`);
      }

      return {success: true};
    } catch (error) {
      console.error('❌ Schoolify: [onUserDeleted]', error);
      throw error;
    }
  }
);


/** Roles validos de la app. */
const VALID_ROLES = ['administrador', 'maestro', 'tutor'];


/**
 * Devuelve true si quien llama es administrador con el correo verificado.
 * Se usa en las callables que gestionan cuentas ajenas.
 */
async function isAdminCaller(uid: string): Promise<boolean> {
  const caller = await getFirestore().collection('usuarios').doc(uid).get();
  return caller.exists && caller.data()?.rol === 'administrador';
}


/**
 * Cambia el rol y/o el estado de una cuenta. Solo administradores.
 *
 * El estado se maneja con `disabled` de Firebase Auth (no con `activo` del
 * perfil): es lo unico que bloquea de verdad el inicio de sesion. El rol se
 * escribe en Firestore, que es de donde lo leen la app y las reglas.
 *
 * Salvaguarda: un administrador no puede cambiarse el rol ni deshabilitarse a si
 * mismo, para no quedarse fuera de su propio panel (misma idea que deleteTeacher).
 */
export const updateUserByAdmin = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const uid: string = request.data?.uid;
    const rol: string | undefined = request.data?.rol;
    const disabled: boolean | undefined = request.data?.disabled;

    if (!uid || typeof uid !== 'string') {
      throw new HttpsError('invalid-argument', 'El UID de la cuenta es requerido.');
    }

    if (rol !== undefined && !VALID_ROLES.includes(rol)) {
      throw new HttpsError('invalid-argument', 'Rol no válido.');
    }

    if (disabled !== undefined && typeof disabled !== 'boolean') {
      throw new HttpsError('invalid-argument', 'El estado debe ser booleano.');
    }

    if (rol === undefined && disabled === undefined) {
      throw new HttpsError('invalid-argument', 'No hay nada que actualizar.');
    }

    if (!(await isAdminCaller(request.auth.uid))) {
      throw new HttpsError('permission-denied', 'Solo un administrador puede actualizar cuentas.');
    }

    if (uid === request.auth.uid) {
      throw new HttpsError(
        'failed-precondition',
        'No puedes cambiar tu propio rol ni deshabilitar tu cuenta.'
      );
    }

    const db = getFirestore();
    const target = await db.collection('usuarios').doc(uid).get();

    if (!target.exists) {
      throw new HttpsError('not-found', 'La cuenta no existe.');
    }

    try {
      if (rol !== undefined) {
        await db.collection('usuarios').doc(uid).update({rol});
        console.log(`👤 Rol de ${uid} cambiado a ${rol}`);
      }

      if (disabled !== undefined) {
        await getAuth().updateUser(uid, {disabled});
        console.log(`👤 Cuenta ${uid} ${disabled ? 'deshabilitada' : 'habilitada'}`);
      }

      return {success: true};
    } catch (error) {
      console.error('❌ Schoolify: [updateUserByAdmin]', error);

      if ((error as {code?: string}).code === 'auth/user-not-found') {
        throw new HttpsError('not-found', 'La cuenta no existe en Auth.');
      }

      throw new HttpsError('internal', 'No se pudo actualizar la cuenta.');
    }
  }
);


/**
 * Estado de las cuentas en Firebase Auth: correo verificado, deshabilitada y
 * ultimo acceso. Solo administradores. Sirve para que el panel muestre a quien le
 * falta verificar el correo o quien esta dado de baja.
 *
 * `listUsers` devuelve como maximo 1000 usuarios por pagina; con el tamaño actual
 * de la base alcanza y sobra.
 */
export const getUsersAuthStatus = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    if (!(await isAdminCaller(request.auth.uid))) {
      throw new HttpsError('permission-denied', 'Solo un administrador puede consultar cuentas.');
    }

    try {
      const list = await getAuth().listUsers(1000);
      const status: {[uid: string]: {emailVerified: boolean; disabled: boolean}} = {};

      list.users.forEach((user) => {
        status[user.uid] = {
          emailVerified: user.emailVerified,
          disabled: user.disabled,
        };
      });

      return {status};
    } catch (error) {
      console.error('❌ Schoolify: [getUsersAuthStatus]', error);
      throw new HttpsError('internal', 'No se pudo consultar el estado de las cuentas.');
    }
  }
);


/**
 * Borra un grupo de alumnos, solo si esta vacio. Solo administradores y maestros.
 *
 * El cliente no puede borrar el documento (las reglas lo niegan): esta funcion es
 * la unica puerta, y por eso puede garantizar que un grupo con alumnos no se borre.
 * Si se borrara desde la consola, el trigger `onGroupDeleted` igual libera a los
 * alumnos como red de seguridad.
 */
export const deleteStudentGroup = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const gid: string = request.data?.gid;

    if (!gid || typeof gid !== 'string') {
      throw new HttpsError('invalid-argument', 'El identificador del grupo es requerido.');
    }

    const db = getFirestore();

    try {
      const caller = await db.collection('usuarios').doc(request.auth.uid).get();
      const callerData = caller.data();
      const isAdmin = callerData?.rol === 'administrador';
      const isTeacher = callerData?.rol === 'maestro';

      if (!caller.exists || (!isAdmin && !isTeacher)) {
        throw new HttpsError('permission-denied', 'Solo el personal de la escuela puede borrar grupos.');
      }

      const group = await db.collection('grupos_de_alumnos').doc(gid).get();

      if (!group.exists) {
        throw new HttpsError('not-found', 'El grupo no existe.');
      }

      // Un maestro solo borra grupos de su escuela.
      if (!isAdmin && group.data()?.cct !== callerData?.cct) {
        throw new HttpsError('permission-denied', 'Ese grupo no pertenece a tu escuela.');
      }

      const students = await db.collection('alumnos').where('gid', '==', gid).limit(1).get();

      if (!students.empty) {
        const count = await db.collection('alumnos').where('gid', '==', gid).count().get();
        const total = count.data().count;

        throw new HttpsError(
          'failed-precondition',
          `No se puede eliminar el grupo: tiene ${total} alumno(s) asignado(s).`
        );
      }

      await db.collection('grupos_de_alumnos').doc(gid).delete();
      console.log(`🗑️ Grupo eliminado: ${gid}`);

      return {success: true};
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error('❌ Schoolify: [deleteStudentGroup]', error);
      throw new HttpsError('internal', 'No se pudo eliminar el grupo.');
    }
  }
);


/**
 * Red de seguridad al borrar un grupo de alumnos: suelta a los alumnos que lo
 * tuvieran asignado, para que no queden apuntando a un grupo que ya no existe.
 *
 * Lo normal es que el grupo se borre vacio (la funcion `deleteStudentGroup` lo
 * exige), pero un borrado desde la consola si puede dejar alumnos colgando.
 */
export const onGroupDeleted = onDocumentDeleted({
  document: 'grupos_de_alumnos/{gid}',
  region: TRIGGER_REGION,
},
  async (event) => {
    const gid = event.params.gid;
    const db = getFirestore();

    try {
      const students = await db.collection('alumnos').where('gid', '==', gid).get();

      if (students.empty) {
        return {success: true};
      }

      const batch = db.batch();

      students.docs.forEach((student) => batch.update(student.ref, {
        gid: '',
        updatedAt: FieldValue.serverTimestamp(),
      }));

      await batch.commit();
      console.log(`🧹 ${students.size} alumno(s) liberados del grupo ${gid}`);

      return {success: true};
    } catch (error) {
      console.error('❌ Schoolify: [onGroupDeleted]', error);
      throw error;
    }
  }
);
