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

type Firestore = ReturnType<typeof getFirestore>;

/** Mes del aviso (`YYYY-MM`) en la zona de la escuela, no en UTC. */
const PERIODO_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function periodoFromDate(date: Date): string {
  return PERIODO_FORMATTER.format(date).slice(0, 7);
}

function isPeriodo(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Ciclo escolar (`2026-2027`); si el cliente no manda uno valido, se usa el actual. */
const DEFAULT_CICLO = '2026-2027';

function normalizeCiclo(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{4}$/.test(value) ? value : DEFAULT_CICLO;
}

// ==================== auditoria ====================

interface AuditInput {
  accion: string;
  actorUid: string;
  actorRol: string;
  actorNombre?: string;
  objetivoTipo: string;
  objetivoId: string;
  cct?: string;
  antes?: any;
  despues?: any;
}

function auditData(input: AuditInput): any {
  return {
    accion: input.accion,
    actorUid: input.actorUid,
    actorRol: input.actorRol,
    actorNombre: input.actorNombre ?? '',
    objetivoTipo: input.objetivoTipo,
    objetivoId: input.objetivoId,
    cct: input.cct ?? '',
    antes: input.antes ?? null,
    despues: input.despues ?? null,
    creadoEn: FieldValue.serverTimestamp(),
  };
}

/** Registra una accion sensible. Si falla, no debe tumbar la accion principal. */
async function writeAudit(db: Firestore, input: AuditInput): Promise<void> {
  try {
    await db.collection('auditoria').add(auditData(input));
  } catch (error) {
    console.error('❌ No se pudo escribir la auditoria:', error);
  }
}

/** Campo del resumen que corresponde a cada tipo de aviso. */
const SUMMARY_TYPE_FIELDS: {[key: string]: string} = {
  Inasistencia: 'inasistencias',
  Incumplimiento: 'incumplimientos',
  Indisciplina: 'indisciplinas',
};

/** Campo del resumen que corresponde a cada gravedad. */
const SUMMARY_SEVERITY_FIELDS: {[key: string]: string} = {
  leve: 'leves',
  media: 'medias',
  grave: 'graves',
};

interface MonthlySummaryInput {
  cct: string;
  sid: string;
  tid: string;
  periodo: string;
  tipo: string;
  gravedad?: string;
  gid?: string;
  grado?: string;
  letra?: string;
}

function summaryDocId(input: MonthlySummaryInput): string {
  return `${input.cct}_${input.sid}_${input.periodo}`;
}

/** Suma el aviso al resumen mensual del alumno (crea el documento si falta). */
async function addToMonthlySummary(
  db: Firestore,
  input: MonthlySummaryInput
): Promise<void> {
  const typeField = SUMMARY_TYPE_FIELDS[input.tipo];
  if (!typeField) return;

  const gravedad = input.gravedad && SUMMARY_SEVERITY_FIELDS[input.gravedad] ? input.gravedad : 'leve';
  const severityField = SUMMARY_SEVERITY_FIELDS[gravedad];
  const ref = db.collection('resumen_alumno').doc(summaryDocId(input));

  const increments: any = {
    total: FieldValue.increment(1),
    [typeField]: FieldValue.increment(1),
    [severityField]: FieldValue.increment(1),
    actualizadoEn: FieldValue.serverTimestamp(),
  };

  await ref.set({
    cct: input.cct,
    sid: input.sid,
    tid: input.tid,
    periodo: input.periodo,
    gid: input.gid ?? '',
    grado: input.grado ?? '',
    letra: input.letra ?? '',
    ...increments,
  }, {merge: true});
}

/** Resta el aviso del resumen; borra el documento cuando ya no queda ninguno. */
async function removeFromMonthlySummary(
  db: Firestore,
  input: MonthlySummaryInput
): Promise<void> {
  const typeField = SUMMARY_TYPE_FIELDS[input.tipo];
  if (!typeField) return;

  const gravedad = input.gravedad && SUMMARY_SEVERITY_FIELDS[input.gravedad] ? input.gravedad : 'leve';
  const severityField = SUMMARY_SEVERITY_FIELDS[gravedad];
  const ref = db.collection('resumen_alumno').doc(summaryDocId(input));

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;

    const total = snapshot.get('total') ?? 0;
    if (total <= 1) {
      transaction.delete(ref);
      return;
    }

    transaction.set(ref, {
      total: FieldValue.increment(-1),
      [typeField]: FieldValue.increment(-1),
      [severityField]: FieldValue.increment(-1),
      actualizadoEn: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}

/**
 * Completa el aviso con los datos que necesitan la reincidencia y el futuro
 * modelo: escuela, grupo, grado, autor, periodo y gravedad (si el cliente es
 * viejo y no la manda, se asume leve).
 */
async function enrichNotification(
  db: Firestore,
  tutorId: string,
  notificationId: string,
  data: any,
  createTime?: {toDate(): Date}
): Promise<void> {
  const {sid, tipo, gravedad, maestroUid} = data;

  if (!sid || !tipo) {
    return;
  }

  const studentSnapshot = await db.collection('alumnos').doc(sid).get();
  if (!studentSnapshot.exists) {
    return;
  }

  const student = studentSnapshot.data() ?? {};
  const cct = student.cct ?? '';
  const gid = student.gid ?? '';
  let grado = '';
  let letra = '';

  if (gid) {
    const groupSnapshot = await db.collection('grupos_de_alumnos').doc(gid).get();
    grado = groupSnapshot.data()?.grado ?? '';
    letra = groupSnapshot.data()?.letra ?? '';
  }

  let autorRol = '';
  if (maestroUid) {
    const authorSnapshot = await db.collection('usuarios').doc(maestroUid).get();
    autorRol = authorSnapshot.data()?.rol ?? '';
  }

  const gravedadFinal = ['leve', 'media', 'grave'].includes(gravedad) ? gravedad : 'leve';
  const periodo = periodoFromDate(createTime ? createTime.toDate() : new Date());

  await db.collection('usuarios').doc(tutorId).collection('notificaciones').doc(notificationId).update({
    cct,
    gid,
    grado,
    letra,
    autorRol,
    periodo,
    gravedad: gravedadFinal,
    schemaVersion: 1,
  });

  if (!cct) {
    return;
  }

  await addToMonthlySummary(db, {
    cct,
    sid,
    tid: tutorId,
    periodo,
    tipo,
    gravedad: gravedadFinal,
    gid,
    grado,
    letra,
  });
}

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

    // Datos estructurados para reincidencia y ML. Si falla, el push sigue.
    try {
      await enrichNotification(db, userId, notificationId, notificationData, snapshot.createTime);
    } catch (error) {
      console.error(`❌ No se pudo enriquecer el aviso ${notificationId}:`, error);
    }

    try {
      const userDoc = await db.collection('usuarios').doc(userId).get();

      if (!userDoc.exists) {
        console.log('❌ Usuario no encontrado:', userId);
        return;
      }

      const userData = userDoc.data();
      const rol = userData?.rol;
      console.log(`📬 Nuevo aviso creado para ${rol}: ${userId}`);

      // Esta subcoleccion solo lleva avisos de alumnos (las reglas validan la
      // forma); los mensajes internos viven en `mensajes` y no pasan por aqui.
      return await handleTutorNotification(userId, notificationId, notificationData, userData);
    } catch (error) {
      console.error('❌ Error procesando notificación:', error);
      throw error;
    }
  }
);

export const onDeletedUserNotification = onDocumentDeleted({
  document: 'usuarios/{userId}/notificaciones/{notificationId}',
  region: TRIGGER_REGION,
},
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    const data = snapshot.data();

    if (!data?.cct || !data?.sid || !data?.periodo || !data?.tipo) {
      return;
    }

    try {
      await removeFromMonthlySummary(getFirestore(), {
        cct: data.cct,
        sid: data.sid,
        tid: event.params.userId,
        periodo: data.periodo,
        tipo: data.tipo,
        gravedad: data.gravedad,
        gid: data.gid,
        grado: data.grado,
        letra: data.letra,
      });
    } catch (error) {
      console.error('❌ No se pudo actualizar el resumen al borrar el aviso:', error);
    }
  }
);

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
          .collection('mensajes')
          .add({
            body: notificationBody,
            createdAt: timestamp,
          });
      });

      await Promise.all(notificationPromises);
      console.log(`💾 Mensaje guardado en Firestore para ${adminIds.length} administrador(es)`);

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
      const target = await db.collection('usuarios').doc(uid).get();
      const targetData = target.data() ?? {};
      const callerData = caller.data() ?? {};

      await getAuth().deleteUser(uid);
      await db.collection('usuarios').doc(uid).delete();

      await writeAudit(db, {
        accion: 'usuario_borrado',
        actorUid: request.auth.uid,
        actorRol: callerData.rol ?? 'administrador',
        actorNombre: callerData.nombre ?? '',
        objetivoTipo: 'usuario',
        objetivoId: uid,
        cct: targetData.cct ?? callerData.cct ?? '',
        antes: {rol: targetData.rol ?? ''},
      });

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
const VALID_ROLES = ['administrador', 'prefecto', 'maestro', 'tutor'];

/** Rol de prefecto: administra alumnos, grupos y avisos de dia completo. */
function isPrefectRole(rol?: string): boolean {
  return rol === 'prefecto';
}

/** Docente de la escuela: prefecto o maestro. */
function isStaffRole(rol?: string): boolean {
  return rol === 'prefecto' || rol === 'maestro';
}


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
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const callerData = caller.data() ?? {};
    const target = await db.collection('usuarios').doc(uid).get();

    if (!target.exists) {
      throw new HttpsError('not-found', 'La cuenta no existe.');
    }

    const targetData = target.data() ?? {};

    try {
      if (rol !== undefined) {
        await db.collection('usuarios').doc(uid).update({rol});
        console.log(`👤 Rol de ${uid} cambiado a ${rol}`);
      }

      if (disabled !== undefined) {
        await getAuth().updateUser(uid, {disabled});
        console.log(`👤 Cuenta ${uid} ${disabled ? 'deshabilitada' : 'habilitada'}`);
      }

      await writeAudit(db, {
        accion: 'usuario_actualizado',
        actorUid: request.auth.uid,
        actorRol: callerData.rol ?? 'administrador',
        actorNombre: callerData.nombre ?? '',
        objetivoTipo: 'usuario',
        objetivoId: uid,
        cct: targetData.cct ?? callerData.cct ?? '',
        antes: {rol: targetData.rol ?? ''},
        despues: {
          rol: rol ?? targetData.rol ?? '',
          ...(disabled !== undefined ? {disabled} : {}),
        },
      });

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
      const isPrefect = isPrefectRole(callerData?.rol);

      if (!caller.exists || (!isAdmin && !isPrefect)) {
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

      await writeAudit(db, {
        accion: 'grupo_borrado',
        actorUid: request.auth.uid,
        actorRol: callerData?.rol ?? '',
        actorNombre: callerData?.nombre ?? '',
        objetivoTipo: 'grupo',
        objetivoId: gid,
        cct: group.data()?.cct ?? callerData?.cct ?? '',
        antes: {
          grado: group.data()?.grado ?? '',
          letra: group.data()?.letra ?? '',
        },
      });

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


/**
 * Cuenta los avisos SIN CONFIRMAR (sin "Enterado") de cada alumno de la escuela del
 * maestro. Es la senal que importa: si el tutor atendio el aviso, no solo si lo abrio.
 *
 * Las notificaciones viven en `usuarios/{tid}/notificaciones`, asi que leerlas de
 * todos los alumnos desde el cliente serian N consultas (y un collection group
 * dejaria a un maestro ver las de otras escuelas). Aqui el servidor agrupa a los
 * alumnos por tutor y hace una sola consulta por tutor, limitada a los 200 avisos
 * mas recientes (mas antiguos no cuentan).
 *
 * Solo para maestros: es el distintivo de SU lista de alumnos.
 */
export const getUnconfirmedNotificationCounts = onCall(
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const callerData = caller.data();

    if (!caller.exists || !isStaffRole(callerData?.rol)) {
      throw new HttpsError('permission-denied', 'Solo el personal de la escuela puede consultar esta lista.');
    }

    const cct = callerData?.cct;

    if (!cct) {
      return {counts: {}};
    }

    try {
      const students = await db.collection('alumnos').where('cct', '==', cct).get();

      // Agrupa los alumnos por tutor: una consulta por tutor en lugar de una por alumno.
      const byTutor: Record<string, string[]> = {};

      students.forEach((doc) => {
        const tid = doc.data().tid;

        if (!tid) {
          return;
        }

        byTutor[tid] = byTutor[tid] ?? [];
        byTutor[tid].push(doc.id);
      });

      const counts: Record<string, number> = {};

      for (const [tid, sids] of Object.entries(byTutor)) {
        const studentIds = new Set(sids);
        const notifications = await db
          .collection('usuarios')
          .doc(tid)
          .collection('notificaciones')
          .orderBy('createdAt', 'desc')
          .limit(200)
          .get();

        notifications.forEach((notification) => {
          const data = notification.data();
          const sid = data?.sid;

          if (sid && studentIds.has(sid) && data?.acknowledged !== true) {
            counts[sid] = (counts[sid] ?? 0) + 1;
          }
        });
      }

      return {counts};
    } catch (error) {
      console.error('❌ Schoolify: [getUnconfirmedNotificationCounts]', error);
      throw new HttpsError('internal', 'No se pudieron contar los avisos.');
    }
  }
);

/**
 * Reincidencia mensual por alumno. La coleccion `resumen_alumno` no se lee
 * directo: esta funcion filtra por el rol de quien llama (prefecto: escuela;
 * maestro: sus grupos; tutor: sus hijos).
 */
export const getMonthlyRecurrence = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const db = getFirestore();
    const uid = request.auth.uid;
    const caller = await db.collection('usuarios').doc(uid).get();
    const callerData = caller.data();
    const rol = callerData?.rol;

    if (!caller.exists || !(isStaffRole(rol) || rol === 'tutor')) {
      throw new HttpsError('permission-denied', 'Solo el personal y los tutores pueden consultar la reincidencia.');
    }

    const cct = callerData?.cct;
    const periodo = isPeriodo(request.data?.periodo) ? request.data.periodo : periodoFromDate(new Date());

    if (!cct) {
      return {periodo, counts: {}};
    }

    try {
      const snapshot = await db.collection('resumen_alumno')
        .where('cct', '==', cct)
        .where('periodo', '==', periodo)
        .get();

      const grupos = new Set<string>(Array.isArray(callerData?.grupos) ? callerData.grupos : []);
      const counts: Record<string, any> = {};

      snapshot.forEach((doc) => {
        const data = doc.data();

        if (rol === 'tutor' && data.tid !== uid) return;
        if (rol === 'maestro' && !grupos.has(data.gid)) return;

        counts[data.sid] = {
          inasistencias: data.inasistencias ?? 0,
          incumplimientos: data.incumplimientos ?? 0,
          indisciplinas: data.indisciplinas ?? 0,
          leves: data.leves ?? 0,
          medias: data.medias ?? 0,
          graves: data.graves ?? 0,
          total: data.total ?? 0,
        };
      });

      return {periodo, counts};
    } catch (error) {
      console.error('❌ Schoolify: [getMonthlyRecurrence]', error);
      throw new HttpsError('internal', 'No se pudo consultar la reincidencia.');
    }
  }
);

// ==================== acreditacion y desenlaces ====================

/**
 * Acreditaciones de un grupo en una materia y ciclo. El maestro solo puede
 * consultar sus grupos/materias; el prefecto y el admin, su escuela.
 */
export const getAccreditations = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const gid = request.data?.gid;
    const subjectId = request.data?.subjectId;
    const ciclo = normalizeCiclo(request.data?.ciclo);

    if (typeof gid !== 'string' || typeof subjectId !== 'string') {
      throw new HttpsError('invalid-argument', 'Faltan el grupo o la materia.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = caller.data() ?? {};
    const rol = profile.rol;
    const cct = profile.cct;

    if (!caller.exists || !(isStaffRole(rol) || rol === 'administrador') || !cct) {
      throw new HttpsError('permission-denied', 'Solo el personal de la escuela puede consultar la acreditación.');
    }

    const group = await db.collection('grupos_de_alumnos').doc(gid).get();

    if (!group.exists || group.data()?.cct !== cct) {
      throw new HttpsError('permission-denied', 'El grupo no pertenece a tu escuela.');
    }

    const subject = await db.collection('materias').doc(subjectId).get();

    if (!subject.exists) {
      throw new HttpsError('not-found', 'La materia no existe.');
    }

    const subjectNombre: string = subject.data()?.nombre ?? '';

    if (rol === 'maestro') {
      const grupos = Array.isArray(profile.grupos) ? profile.grupos : [];
      const materias = Array.isArray(profile.materias) ? profile.materias : [];

      if (!grupos.includes(gid) || !materias.includes(subjectNombre)) {
        throw new HttpsError('permission-denied', 'Solo puedes acreditar tus grupos y materias.');
      }
    }

    const studentsSnapshot = await db.collection('alumnos').where('gid', '==', gid).get();
    const students = studentsSnapshot.docs
      .filter((doc) => doc.data().cct === cct)
      .map((doc) => ({
        id: doc.id,
        nombreCompleto: doc.data().nombreCompleto ?? doc.data().nombre ?? '',
      }))
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));

    const recordsSnapshot = await db
      .collection('acreditaciones')
      .where('gid', '==', gid)
      .where('subjectId', '==', subjectId)
      .where('ciclo', '==', ciclo)
      .get();

    const records: Record<string, string> = {};

    recordsSnapshot.forEach((doc) => {
      const data = doc.data();

      if (data.cct === cct) {
        records[data.sid] = data.estatus;
      }
    });

    return {ciclo, subjectNombre, students, records};
  }
);

/**
 * Guarda en lote la acreditacion de un grupo/materia. `sin_registrar` borra el
 * registro; el resto debe ser `acreditado` o `no_acreditado`.
 */
export const saveAccreditations = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const gid = request.data?.gid;
    const subjectId = request.data?.subjectId;
    const ciclo = normalizeCiclo(request.data?.ciclo);
    const entries = request.data?.entries;

    if (typeof gid !== 'string' || typeof subjectId !== 'string' || !Array.isArray(entries)) {
      throw new HttpsError('invalid-argument', 'Faltan el grupo, la materia o las acreditaciones.');
    }

    if (entries.length > 200) {
      throw new HttpsError('invalid-argument', 'Demasiados alumnos en una sola operación.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = caller.data() ?? {};
    const rol = profile.rol;
    const cct = profile.cct;

    if (!caller.exists || !(isStaffRole(rol) || rol === 'administrador') || !cct) {
      throw new HttpsError('permission-denied', 'Solo el personal de la escuela puede acreditar.');
    }

    const group = await db.collection('grupos_de_alumnos').doc(gid).get();

    if (!group.exists || group.data()?.cct !== cct) {
      throw new HttpsError('permission-denied', 'El grupo no pertenece a tu escuela.');
    }

    const subject = await db.collection('materias').doc(subjectId).get();

    if (!subject.exists) {
      throw new HttpsError('not-found', 'La materia no existe.');
    }

    const subjectNombre: string = subject.data()?.nombre ?? '';

    if (rol === 'maestro') {
      const grupos = Array.isArray(profile.grupos) ? profile.grupos : [];
      const materias = Array.isArray(profile.materias) ? profile.materias : [];

      if (!grupos.includes(gid) || !materias.includes(subjectNombre)) {
        throw new HttpsError('permission-denied', 'Solo puedes acreditar tus grupos y materias.');
      }
    }

    const studentsSnapshot = await db.collection('alumnos').where('gid', '==', gid).get();
    const allowedStudents = new Set(
      studentsSnapshot.docs.filter((doc) => doc.data().cct === cct).map((doc) => doc.id)
    );

    const batch = db.batch();
    let saved = 0;

    for (const entry of entries) {
      const sid = entry?.sid;
      const estatus = entry?.estatus;

      if (typeof sid !== 'string' || !allowedStudents.has(sid)) {
        throw new HttpsError('invalid-argument', 'Hay un alumno que no pertenece al grupo.');
      }

      const ref = db.collection('acreditaciones').doc(`${cct}_${sid}_${subjectId}_${ciclo}`);

      if (estatus === 'sin_registrar') {
        batch.delete(ref);
        saved++;
        continue;
      }

      if (estatus !== 'acreditado' && estatus !== 'no_acreditado') {
        throw new HttpsError('invalid-argument', 'Estatus de acreditación inválido.');
      }

      batch.set(ref, {
        cct,
        sid,
        gid,
        ciclo,
        subjectId,
        subjectNombre,
        grado: group.data()?.grado ?? '',
        letra: group.data()?.letra ?? '',
        estatus,
        registradoPor: request.auth.uid,
        registradoPorNombre: profile.nombre ?? '',
        actualizadoEn: FieldValue.serverTimestamp(),
      }, {merge: true});
      saved++;
    }

    batch.set(db.collection('auditoria').doc(), auditData({
      accion: 'acreditacion_guardada',
      actorUid: request.auth.uid,
      actorRol: rol ?? '',
      actorNombre: profile.nombre ?? '',
      objetivoTipo: 'acreditacion',
      objetivoId: `${gid}_${subjectId}_${ciclo}`,
      cct,
      despues: {
        gid,
        subjectId,
        subjectNombre,
        ciclo,
        guardados: saved,
        entradas: entries.map((entry: any) => ({
          sid: entry?.sid,
          estatus: entry?.estatus,
        })),
      },
    }));

    await batch.commit();

    return {saved};
  }
);

/** Acreditaciones de un alumno en el ciclo (para el modal del prefecto). */
export const getStudentAccreditations = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const sid = request.data?.sid;
    const ciclo = normalizeCiclo(request.data?.ciclo);

    if (typeof sid !== 'string') {
      throw new HttpsError('invalid-argument', 'Falta el alumno.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = caller.data() ?? {};
    const rol = profile.rol;
    const cct = profile.cct;

    if (!caller.exists || !(isStaffRole(rol) || rol === 'administrador') || !cct) {
      throw new HttpsError('permission-denied', 'Solo el personal de la escuela puede consultar los resultados.');
    }

    const student = await db.collection('alumnos').doc(sid).get();

    if (!student.exists || student.data()?.cct !== cct) {
      throw new HttpsError('permission-denied', 'El alumno no pertenece a tu escuela.');
    }

    const snapshot = await db
      .collection('acreditaciones')
      .where('sid', '==', sid)
      .where('ciclo', '==', ciclo)
      .get();

    const records = snapshot.docs
      .filter((doc) => doc.data().cct === cct)
      .map((doc) => ({
        subjectId: doc.data().subjectId,
        subjectNombre: doc.data().subjectNombre ?? '',
        estatus: doc.data().estatus,
      }))
      .sort((a, b) => a.subjectNombre.localeCompare(b.subjectNombre));

    return {
      ciclo,
      records,
      desenlace: student.data()?.desenlace ?? null,
    };
  }
);

/**
 * Marca la situacion del alumno: expulsion temporal (con fechas), baja
 * definitiva o activo (cuando termina la suspension). Solo el prefecto (o el
 * admin) de la escuela.
 */
export const saveDesenlace = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const sid = request.data?.sid;
    const tipo = request.data?.tipo;
    const inicio = typeof request.data?.inicio === 'string' && request.data.inicio ? request.data.inicio : null;
    const fin = typeof request.data?.fin === 'string' && request.data.fin ? request.data.fin : null;
    const ciclo = normalizeCiclo(request.data?.ciclo);

    if (typeof sid !== 'string' || !['expulsion_temporal', 'baja_definitiva', 'activo'].includes(tipo)) {
      throw new HttpsError('invalid-argument', 'Desenlace inválido.');
    }

    if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
      throw new HttpsError('invalid-argument', 'La fecha de inicio no es válida.');
    }

    if (fin && !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
      throw new HttpsError('invalid-argument', 'La fecha de fin no es válida.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = caller.data() ?? {};
    const rol = profile.rol;
    const cct = profile.cct;

    if (!caller.exists || !(rol === 'prefecto' || rol === 'administrador') || !cct) {
      throw new HttpsError('permission-denied', 'Solo el prefecto puede registrar desenlaces.');
    }

    const student = await db.collection('alumnos').doc(sid).get();

    if (!student.exists || student.data()?.cct !== cct) {
      throw new HttpsError('permission-denied', 'El alumno no pertenece a tu escuela.');
    }

    const desenlace = {
      tipo,
      inicio: tipo === 'expulsion_temporal' ? inicio : null,
      fin: tipo === 'expulsion_temporal' ? fin : null,
      actualizadoEn: FieldValue.serverTimestamp(),
      por: request.auth.uid,
    };

    // "activo" borra la suspension vigente; el evento queda en `desenlaces`.
    const studentUpdate = tipo === 'activo' ?
      {desenlace: FieldValue.delete()} :
      {desenlace};

    const batch = db.batch();

    batch.set(db.collection('desenlaces').doc(), {
      cct,
      sid,
      ciclo,
      tipo,
      inicio: desenlace.inicio,
      fin: desenlace.fin,
      registradoPor: request.auth.uid,
      registradoPorNombre: profile.nombre ?? '',
      registradoEn: FieldValue.serverTimestamp(),
    });

    batch.update(db.collection('alumnos').doc(sid), studentUpdate);

    batch.set(db.collection('auditoria').doc(), auditData({
      accion: 'desenlace_registrado',
      actorUid: request.auth.uid,
      actorRol: rol ?? '',
      actorNombre: profile.nombre ?? '',
      objetivoTipo: 'alumno',
      objetivoId: sid,
      cct,
      antes: student.data()?.desenlace ?? null,
      despues: {
        tipo,
        inicio: desenlace.inicio,
        fin: desenlace.fin,
      },
    }));

    await batch.commit();

    return {ok: true, desenlace};
  }
);

/**
 * Acepta o rechaza al tutor que reclamo a un alumno. Solo el prefecto (o admin)
 * de la escuela. Al aceptar queda `validado`; al rechazar se libera al alumno.
 */
export const validateTutor = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const sid = request.data?.sid;
    const accept = request.data?.accept;

    if (typeof sid !== 'string' || typeof accept !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Faltan el alumno o la decisión.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = caller.data() ?? {};
    const rol = profile.rol;
    const cct = profile.cct;

    if (!caller.exists || !(rol === 'prefecto' || rol === 'administrador') || !cct) {
      throw new HttpsError('permission-denied', 'Solo el prefecto puede validar tutores.');
    }

    const student = await db.collection('alumnos').doc(sid).get();

    if (!student.exists || student.data()?.cct !== cct) {
      throw new HttpsError('permission-denied', 'El alumno no pertenece a tu escuela.');
    }

    const data = student.data() ?? {};

    if (!data.tid) {
      throw new HttpsError('failed-precondition', 'El alumno no tiene un tutor pendiente.');
    }

    if (data.validado === true) {
      throw new HttpsError('failed-precondition', 'El tutor ya está validado.');
    }

    const before = {
      tid: data.tid,
      nombreTutor: data.nombreTutor ?? '',
      validado: false,
    };

    const updates = accept ?
      {validado: true, updatedAt: FieldValue.serverTimestamp()} :
      {tid: '', nombreTutor: '', validado: false, updatedAt: FieldValue.serverTimestamp()};

    const batch = db.batch();

    batch.update(student.ref, updates);

    batch.set(db.collection('auditoria').doc(), auditData({
      accion: accept ? 'tutor_validado' : 'tutor_rechazado',
      actorUid: request.auth.uid,
      actorRol: rol,
      actorNombre: profile.nombre ?? '',
      objetivoTipo: 'alumno',
      objetivoId: sid,
      cct,
      antes: before,
      despues: accept ?
        {validado: true} :
        {tid: '', nombreTutor: '', validado: false},
    }));

    await batch.commit();

    return {ok: true};
  }
);

/**
 * Desvincula al tutor de un alumno. El tutor solo puede soltar a un alumno
 * pendiente de validar y propio; el prefecto/admin puede deshacer el vinculo en
 * su escuela. Toda desvinculacion queda auditada.
 */
export const releaseStudent = onCall(
  {region: TRIGGER_REGION},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'El usuario no está autenticado.');
    }

    if (request.auth.token.email_verified !== true) {
      throw new HttpsError('permission-denied', 'El correo electrónico no está verificado.');
    }

    const sid = request.data?.sid;

    if (typeof sid !== 'string') {
      throw new HttpsError('invalid-argument', 'Falta el alumno.');
    }

    const db = getFirestore();
    const caller = await db.collection('usuarios').doc(request.auth.uid).get();
    const profile = caller.data() ?? {};
    const rol = profile.rol;
    const cct = profile.cct;

    const student = await db.collection('alumnos').doc(sid).get();

    if (!student.exists) {
      throw new HttpsError('not-found', 'El alumno no existe.');
    }

    const data = student.data() ?? {};
    const isTutor = rol === 'tutor' && data.tid === request.auth.uid;
    const isStaff = (rol === 'prefecto' || rol === 'administrador') && data.cct === cct;

    if (!isTutor && !isStaff) {
      throw new HttpsError('permission-denied', 'No puedes desvincular a este alumno.');
    }

    if (!data.tid) {
      throw new HttpsError('failed-precondition', 'El alumno no tiene tutor.');
    }

    if (isTutor && data.validado === true) {
      throw new HttpsError(
        'failed-precondition',
        'El tutor ya está validado; solo el prefecto puede desvincularlo.'
      );
    }

    const before = {
      tid: data.tid,
      nombreTutor: data.nombreTutor ?? '',
      validado: data.validado === true,
    };

    const batch = db.batch();

    batch.update(student.ref, {
      tid: '',
      nombreTutor: '',
      validado: false,
      updatedAt: FieldValue.serverTimestamp(),
    });

    batch.set(db.collection('auditoria').doc(), auditData({
      accion: 'alumno_desvinculado',
      actorUid: request.auth.uid,
      actorRol: rol,
      actorNombre: profile.nombre ?? '',
      objetivoTipo: 'alumno',
      objetivoId: sid,
      cct: data.cct ?? cct ?? '',
      antes: before,
      despues: {tid: '', nombreTutor: '', validado: false},
    }));

    await batch.commit();

    return {ok: true};
  }
);
