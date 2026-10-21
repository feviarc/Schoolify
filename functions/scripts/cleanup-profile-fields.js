/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable quotes */
/* eslint-disable indent */

/**
 * Limpieza de datos viejos. NO es una Cloud Function: se corre a mano, una vez.
 *
 *   1) Borra `escuela` y `telefono` de los perfiles de usuario. Esos campos los
 *      mantenia el maestro y hoy son fuente duplicada: el dato oficial vive en
 *      `escuelas` y se lee por la funcion `getMySchool`.
 *   2) Con `--messages`, borra los mensajes internos antiguos que quedaron dentro
 *      de la subcoleccion de avisos (`notificaciones`), ahora que los mensajes
 *      viven en `mensajes`.
 *
 * Uso (desde la carpeta functions):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node scripts/cleanup-profile-fields.js
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node scripts/cleanup-profile-fields.js --apply
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/clave.json node scripts/cleanup-profile-fields.js --apply --messages
 *
 * Sin `--apply` solo informa lo que haria (modo simulacion). Necesita credenciales
 * de servicio: una clave JSON del proyecto o `gcloud auth application-default login`.
 */
const {initializeApp, applicationDefault} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const WITH_MESSAGES = process.argv.includes('--messages');

async function cleanProfileFields(db, users) {
  const legacy = users.docs.filter((doc) => {
    const data = doc.data();
    return data.escuela !== undefined || data.telefono !== undefined;
  });

  console.log(`\nPerfiles con escuela/telefono: ${legacy.length} de ${users.size}`);

  for (const doc of legacy) {
    const data = doc.data();
    console.log(` - ${doc.id}: escuela="${data.escuela || ''}" telefono="${data.telefono || ''}"`);

    if (APPLY) {
      await doc.ref.update({
        escuela: FieldValue.delete(),
        telefono: FieldValue.delete(),
      });
    }
  }

  return legacy.length;
}

async function cleanLegacyMessages(db, users) {
  let total = 0;

  for (const userDoc of users.docs) {
    const messages = await db
      .collection('usuarios')
      .doc(userDoc.id)
      .collection('notificaciones')
      .where('body', '!=', null)
      .get();

    if (messages.empty) {
      continue;
    }

    total += messages.size;
    console.log(` - ${userDoc.id}: ${messages.size} mensaje(s) viejo(s) en notificaciones`);

    if (APPLY) {
      const batch = db.batch();
      messages.docs.forEach((message) => batch.delete(message.ref));
      await batch.commit();
    }
  }

  console.log(`\nMensajes viejos encontrados: ${total}`);

  return total;
}

async function main() {
  initializeApp({credential: applicationDefault()});
  const db = getFirestore();

  console.log(APPLY ? 'MODO REAL: se van a borrar datos.' : 'MODO SIMULACION: no se borra nada (usa --apply).');

  const users = await db.collection('usuarios').get();

  const profiles = await cleanProfileFields(db, users);
  const messages = WITH_MESSAGES ? await cleanLegacyMessages(db, users) : 0;

  if (!WITH_MESSAGES) {
    console.log('\n(La revision de mensajes viejos se omite; agregale --messages.)');
  }

  console.log(`\nResumen: ${profiles} perfil(es) y ${messages} mensaje(s) ${APPLY ? 'limpiados' : 'por limpiar'}.`);
}

main().catch((error) => {
  console.error('❌ Schoolify: [cleanup-profile-fields]', error.message || error);
  console.error('Necesitas credenciales: exporta GOOGLE_APPLICATION_CREDENTIALS o corre gcloud auth application-default login.');
  process.exit(1);
});
