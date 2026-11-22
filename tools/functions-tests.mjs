// Pruebas de las Cloud Functions que usa la app para leer datos de escuelas.
// Sin dependencias: habla el protocolo de los callables por HTTP.
//
// Uso:
//   terminal A:  firebase --project demo-schoolify emulators:start --only auth,firestore,functions
//   terminal B:  npm --prefix functions run build && node tools/functions-tests.mjs
//
// Requiere Java 21 y corre SOLO contra los emuladores: nunca toca el proyecto real.

const PROJECT = 'demo-schoolify';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const OWNER = 'owner';

const toBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function tokenFor(uid, { emailVerified = true } = {}) {
  const header = toBase64Url({ alg: 'none', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    email: `${uid}@test.mx`,
    email_verified: emailVerified,
    firebase: { identities: {}, sign_in_provider: 'password' },
  });
  return `${header}.${payload}.`;
}

const PREFECT = tokenFor('prefecto9');
const PREFECT_UNVERIFIED = tokenFor('prefecto9', { emailVerified: false });
const ADMIN = tokenFor('admin9');
const TUTORREC = tokenFor('tutorrec');
const MAESTRO = tokenFor('maestro9');
const MAESTRO_OTRO = tokenFor('maestro-otro');
const MAESTRO_ACRED = tokenFor('maestro-acred');
const TUTOR_AUDIT = tokenFor('tutor-audit');

const AUTH_EMULATOR = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`;

const str = (value) => ({ stringValue: value });
const bool = (value) => ({ booleanValue: value });
const timestamp = () => ({ timestampValue: new Date().toISOString() });
const num = (value) => ({ integerValue: String(value) });
const arr = (values) => ({ arrayValue: { values: values.map((value) => str(value)) } });

/** Crea una cuenta en el emulador de Auth y devuelve su uid. */
async function createAuthUser(email) {
  const response = await fetch(AUTH_EMULATOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ email, password: 'Password123', returnSecureToken: true }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`No se pudo crear ${email} en Auth: ${response.status}`);

  const body = await response.json();
  return body.localId;
}

async function seed() {
  const documents = [
    ['escuelas/e1', { cct: str('CCT1'), nombre: str('ESCUELA DE PRUEBA'), turno: str('TM'), pin: num(1921), telefono: str('3531008338') }],
    ['usuarios/prefecto9', { rol: str('prefecto'), cct: str('CCT1') }],
    ['usuarios/admin9', { rol: str('administrador'), cct: str('CCT1') }],
  ];

  for (const [path, fields] of documents) {
    const response = await fetch(`${FIRESTORE}/${path}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${OWNER}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) throw new Error(`No se pudo sembrar ${path}: ${response.status}`);
  }
}

async function callFunction(name, data, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${FUNCTIONS}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // respuesta sin cuerpo JSON
  }

  return { status: response.status, body };
}

const cases = [
  ['CCT + PIN correctos (sin sesion)', 'validateSchoolAccess', { cct: 'CCT1', pin: 1921 }, undefined, (r) => r.body?.result?.valid === true, 'valid: true'],
  ['CCT correcto, PIN equivocado', 'validateSchoolAccess', { cct: 'CCT1', pin: 9999 }, undefined, (r) => r.body?.result?.valid === false, 'valid: false'],
  ['PIN como string (la trampa del tipo)', 'validateSchoolAccess', { cct: 'CCT1', pin: '1921' }, undefined, (r) => r.body?.result?.valid === false, 'valid: false'],
  ['CCT inexistente', 'validateSchoolAccess', { cct: 'NOEXISTE', pin: 1921 }, undefined, (r) => r.body?.result?.valid === false, 'valid: false'],
  ['CCT vacio', 'validateSchoolAccess', { cct: '', pin: 1921 }, undefined, (r) => r.body?.result?.valid === false, 'valid: false'],
  ['getMySchool sin sesion', 'getMySchool', {}, undefined, (r) => r.status >= 400, 'error de autenticacion'],
  ['getMySchool con sesion de maestro', 'getMySchool', {}, PREFECT, (r) => r.body?.result?.school?.nombre === 'ESCUELA DE PRUEBA' && r.body.result.school.pin === undefined, 'escuela sin pin'],
  ['getMySchool devuelve el telefono de la escuela', 'getMySchool', {}, PREFECT, (r) => r.body?.result?.school?.telefono === '3531008338', 'telefono'],
  ['getMySchool con correo sin verificar', 'getMySchool', {}, PREFECT_UNVERIFIED, (r) => r.status >= 400, 'error de correo no verificado'],
];

// ==================== triggers ====================
// Casos que no se llaman por HTTP: se provoca un cambio en la base y se espera
// el efecto que debe producir la funcion.

async function firestore(method, path, { token = OWNER, fields } = {}) {
  return fetch(`${FIRESTORE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Connection: 'close',
    },
    body: fields ? JSON.stringify({ fields }) : undefined,
    signal: AbortSignal.timeout(15000),
  });
}

async function readField(path, field) {
  const response = await firestore('GET', path);
  if (!response.ok) return null;
  const document = await response.json();
  return document.fields?.[field]?.stringValue ?? null;
}

async function readInt(path, field) {
  const response = await firestore('GET', path);
  if (!response.ok) return null;
  const document = await response.json();
  const value = document.fields?.[field]?.integerValue;
  return value === undefined ? null : Number(value);
}

async function readMapField(path, field, subfield) {
  const response = await firestore('GET', path);
  if (!response.ok) return null;
  const document = await response.json();
  return document.fields?.[field]?.mapValue?.fields?.[subfield]?.stringValue ?? null;
}

async function readBool(path, field) {
  const response = await firestore('GET', path);
  if (!response.ok) return null;
  const document = await response.json();
  return document.fields?.[field]?.booleanValue ?? null;
}

async function auditActions() {
  const response = await firestore('GET', 'auditoria');
  if (!response.ok) return [];
  const body = await response.json();

  return (body.documents ?? [])
    .map((document) => document.fields?.accion?.stringValue)
    .filter(Boolean);
}

async function waitUntil(check, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const scenarioCases = [
  {
    name: 'borrar una cuenta borra sus avisos y libera a sus alumnos',
    run: async () => {
      await firestore('PATCH', 'usuarios/tutorborrado', { fields: { rol: str('tutor'), cct: str('CCT1') } });
      await firestore('PATCH', 'usuarios/tutorborrado/notificaciones/n1', { fields: { sid: str('ad1'), tipo: str('Inasistencia') } });
      await firestore('PATCH', 'alumnos/ad1', { fields: { nombre: str('ALUMNO DEL TUTOR BORRADO'), cct: str('CCT1'), tid: str('tutorborrado') } });

      await firestore('DELETE', 'usuarios/tutorborrado');

      const studentFreed = await waitUntil(async () => (await readField('alumnos/ad1', 'tid')) === '');

      const notificationsGone = await waitUntil(async () => {
        const response = await firestore('GET', 'usuarios/tutorborrado/notificaciones');
        if (!response.ok) return false;
        const body = await response.json();
        return !body.documents || body.documents.length === 0;
      });

      return studentFreed && notificationsGone;
    },
  },
  {
    name: 'un aviso sin datos no revienta la funcion',
    run: async () => {
      // Documento sin campos: antes hacia fallar el trigger al desestructurar.
      await firestore('PATCH', 'usuarios/tutor9/notificaciones/vacia', { fields: {} });

      // Si la funcion sobrevive, el emulador sigue respondiendo y el documento existe.
      const response = await firestore('GET', 'usuarios/tutor9/notificaciones/vacia');
      return response.ok;
    },
  },
  // ==================== administracion de cuentas ====================
  {
    name: 'solo un administrador puede cambiar el rol de otra cuenta',
    run: async () => {
      const uid = await createAuthUser('gestion@test.mx');
      await firestore('PATCH', `usuarios/${uid}`, { fields: { rol: str('tutor'), cct: str('CCT1') } });

      const asTeacher = await callFunction('updateUserByAdmin', { uid, rol: 'maestro' }, PREFECT);
      if (asTeacher.status < 400) return false;

      const asAdmin = await callFunction('updateUserByAdmin', { uid, rol: 'maestro' }, ADMIN);
      if (asAdmin.status >= 400) return false;

      return (await readField(`usuarios/${uid}`, 'rol')) === 'maestro';
    },
  },
  {
    name: 'el administrador deshabilita y habilita una cuenta',
    run: async () => {
      const uid = await createAuthUser('baja@test.mx');
      await firestore('PATCH', `usuarios/${uid}`, { fields: { rol: str('tutor'), cct: str('CCT1') } });

      const disabled = await callFunction('updateUserByAdmin', { uid, disabled: true }, ADMIN);
      if (disabled.status >= 400) return false;

      const afterDisable = await callFunction('getUsersAuthStatus', {}, ADMIN);
      if (afterDisable.body?.result?.status?.[uid]?.disabled !== true) return false;

      const enabled = await callFunction('updateUserByAdmin', { uid, disabled: false }, ADMIN);
      if (enabled.status >= 400) return false;

      const afterEnable = await callFunction('getUsersAuthStatus', {}, ADMIN);
      return afterEnable.body?.result?.status?.[uid]?.disabled === false;
    },
  },
  {
    name: 'el administrador no puede deshabilitarse a si mismo',
    run: async () => {
      const response = await callFunction('updateUserByAdmin', { uid: 'admin9', disabled: true }, ADMIN);
      return response.status >= 400;
    },
  },
  {
    name: 'un maestro no puede leer el estado de las cuentas',
    run: async () => {
      const response = await callFunction('getUsersAuthStatus', {}, PREFECT);
      return response.status >= 400;
    },
  },
  // ==================== borrado de grupos ====================
  {
    name: 'no se puede borrar un grupo con alumnos asignados',
    run: async () => {
      await firestore('PATCH', 'grupos_de_alumnos/gcon', { fields: { cct: str('CCT1'), grado: str('1'), letra: str('Z') } });
      await firestore('PATCH', 'alumnos/acon', { fields: { nombre: str('ALUMNO DEL GRUPO'), cct: str('CCT1'), gid: str('gcon') } });

      const response = await callFunction('deleteStudentGroup', { gid: 'gcon' }, PREFECT);
      if (response.status < 400) return false;

      // El grupo sigue existiendo.
      const stillThere = await firestore('GET', 'grupos_de_alumnos/gcon');
      return stillThere.ok;
    },
  },
  {
    name: 'se puede borrar un grupo vacio',
    run: async () => {
      await firestore('PATCH', 'grupos_de_alumnos/gvacio', { fields: { cct: str('CCT1'), grado: str('2'), letra: str('Z') } });

      const response = await callFunction('deleteStudentGroup', { gid: 'gvacio' }, PREFECT);
      if (response.status >= 400) return false;

      const gone = await firestore('GET', 'grupos_de_alumnos/gvacio');
      return gone.status === 404;
    },
  },
  {
    name: 'un maestro no puede borrar un grupo de otra escuela',
    run: async () => {
      await firestore('PATCH', 'grupos_de_alumnos/gotra', { fields: { cct: str('CCT2'), grado: str('1'), letra: str('B') } });

      const response = await callFunction('deleteStudentGroup', { gid: 'gotra' }, PREFECT);
      return response.status >= 400;
    },
  },
  {
    name: 'el maestro ve cuantos avisos sin confirmar tiene cada alumno',
    run: async () => {
      // Tres avisos: sin abrir, visto sin confirmar y ya confirmado.
      await firestore('PATCH', 'alumnos/apend', { fields: { nombre: str('ALUMNO CON AVISOS'), cct: str('CCT1'), gid: str('g1'), tid: str('tutorpend') } });
      await firestore('PATCH', 'usuarios/tutorpend', { fields: { rol: str('tutor'), cct: str('CCT1') } });
      await firestore('PATCH', 'usuarios/tutorpend/notificaciones/p1', { fields: { sid: str('apend'), tipo: str('Inasistencia'), nombreCompleto: str('ALUMNO CON AVISOS'), createdAt: timestamp() } });
      await firestore('PATCH', 'usuarios/tutorpend/notificaciones/p2', { fields: { sid: str('apend'), tipo: str('Incumplimiento'), nombreCompleto: str('ALUMNO CON AVISOS'), leido: bool(true), createdAt: timestamp() } });
      await firestore('PATCH', 'usuarios/tutorpend/notificaciones/p3', { fields: { sid: str('apend'), tipo: str('Indisciplina'), nombreCompleto: str('ALUMNO CON AVISOS'), leido: bool(true), acknowledged: bool(true), createdAt: timestamp() } });

      const response = await callFunction('getUnconfirmedNotificationCounts', {}, PREFECT);
      if (response.status >= 400) return false;

      // Cuentan el sin abrir y el visto sin confirmar; el confirmado no.
      return response.body?.result?.counts?.apend === 2;
    },
  },
  {
    name: 'un tutor no puede consultar los avisos sin confirmar de la escuela',
    run: async () => {
      const response = await callFunction('getUnconfirmedNotificationCounts', {}, tokenFor('tutorpend'));
      return response.status >= 400;
    },
  },
  {
    name: 'registrar un maestro deja el mensaje en /mensajes del administrador',
    run: async () => {
      await firestore('PATCH', 'usuarios/adminmsg', { fields: { rol: str('administrador'), cct: str('CCT1') } });
      await firestore('PATCH', 'usuarios/nuevomaestro', { fields: { rol: str('maestro'), cct: str('CCT1'), email: str('nuevo@test.mx') } });

      return waitUntil(async () => {
        const response = await firestore('GET', 'usuarios/adminmsg/mensajes');
        if (!response.ok) return false;
        const body = await response.json();
        return (body.documents?.length ?? 0) > 0;
      });
    },
  },
  {
    name: 'si el grupo se borra igual, sus alumnos quedan libres',
    run: async () => {
      await firestore('PATCH', 'grupos_de_alumnos/gtrigger', { fields: { cct: str('CCT1'), grado: str('3'), letra: str('Z') } });
      await firestore('PATCH', 'alumnos/atrigger', { fields: { nombre: str('ALUMNO DEL GRUPO BORRADO'), cct: str('CCT1'), gid: str('gtrigger') } });

      await firestore('DELETE', 'grupos_de_alumnos/gtrigger');

      return waitUntil(async () => (await readField('alumnos/atrigger', 'gid')) === '');
    },
  },
  // ==================== reincidencia ====================
  {
    name: 'el aviso se enriquece y actualiza el resumen mensual',
    run: async () => {
      // Ids unicos: la prueba se puede repetir sin chocar con el resumen anterior.
      const run = Date.now();
      const sid = `arec${run}`;
      const notificationPath = `usuarios/tutorrec/notificaciones/nrec${run}`;

      await firestore('PATCH', 'usuarios/tutorrec', { fields: { rol: str('tutor'), cct: str('CCT1') } });
      await firestore('PATCH', 'usuarios/maestro9', { fields: { rol: str('maestro'), cct: str('CCT1'), grupos: arr(['grec']) } });
      await firestore('PATCH', 'usuarios/maestro-otro', { fields: { rol: str('maestro'), cct: str('CCT1'), grupos: arr(['gotro']) } });
      await firestore('PATCH', 'grupos_de_alumnos/grec', { fields: { cct: str('CCT1'), grado: str('1'), letra: str('A') } });
      await firestore('PATCH', `alumnos/${sid}`, { fields: { nombre: str('ALUMNO REINCIDENTE'), cct: str('CCT1'), gid: str('grec'), tid: str('tutorrec') } });
      await firestore('PATCH', notificationPath, {
        fields: {
          sid: str(sid),
          tipo: str('Indisciplina'),
          gravedad: str('grave'),
          nombreCompleto: str('ALUMNO REINCIDENTE'),
          maestroUid: str('prefecto9'),
        },
      });

      const enriched = await waitUntil(async () => (await readField(notificationPath, 'periodo')) !== null);
      if (!enriched) return false;

      const periodo = await readField(notificationPath, 'periodo');
      const cct = await readField(notificationPath, 'cct');
      const gid = await readField(notificationPath, 'gid');
      const autorRol = await readField(notificationPath, 'autorRol');

      if (cct !== 'CCT1' || gid !== 'grec' || autorRol !== 'prefecto') return false;

      const summaryPath = `resumen_alumno/${cct}_${sid}_${periodo}`;
      const summaryReady = await waitUntil(async () => (await readInt(summaryPath, 'total')) === 1);
      if (!summaryReady) return false;
      if ((await readInt(summaryPath, 'indisciplinas')) !== 1) return false;
      if ((await readInt(summaryPath, 'graves')) !== 1) return false;

      const prefect = await callFunction('getMonthlyRecurrence', { periodo }, PREFECT);
      if (prefect.body?.result?.counts?.[sid]?.total !== 1) return false;

      const tutor = await callFunction('getMonthlyRecurrence', { periodo }, TUTORREC);
      if (tutor.body?.result?.counts?.[sid]?.total !== 1) return false;

      const maestro = await callFunction('getMonthlyRecurrence', { periodo }, MAESTRO);
      if (maestro.body?.result?.counts?.[sid]?.total !== 1) return false;

      const otro = await callFunction('getMonthlyRecurrence', { periodo }, MAESTRO_OTRO);
      if (otro.body?.result?.counts?.[sid]) return false;

      // Al borrar el aviso, el resumen del mes debe desaparecer.
      await firestore('DELETE', notificationPath);
      return waitUntil(async () => !(await firestore('GET', summaryPath)).ok);
    },
  },
  // ==================== acreditacion y desenlaces ====================
  {
    name: 'acreditacion por materia y desenlace del prefecto',
    run: async () => {
      await firestore('PATCH', 'usuarios/maestro-acred', {
        fields: {
          rol: str('maestro'),
          cct: str('CCT1'),
          grupos: arr(['gacred']),
          materias: arr(['MATEMATICAS']),
          nombre: str('MAESTRO ACREDITA'),
        },
      });
      await firestore('PATCH', 'materias/macred', { fields: { nombre: str('MATEMATICAS'), grado: str('1') } });
      await firestore('PATCH', 'grupos_de_alumnos/gacred', { fields: { cct: str('CCT1'), grado: str('1'), letra: str('B') } });
      await firestore('PATCH', 'alumnos/aacred1', { fields: { nombre: str('ALUMNO UNO'), nombreCompleto: str('ALUMNO UNO'), cct: str('CCT1'), gid: str('gacred'), tid: str('tutorrec') } });
      await firestore('PATCH', 'alumnos/aacred2', { fields: { nombre: str('ALUMNO DOS'), nombreCompleto: str('ALUMNO DOS'), cct: str('CCT1'), gid: str('gacred'), tid: str('tutorrec') } });

      const list = await callFunction('getAccreditations', {gid: 'gacred', subjectId: 'macred', ciclo: '2026-2027'}, MAESTRO_ACRED);

      if (list.status >= 400 || list.body?.result?.students?.length !== 2) return false;

      const saved = await callFunction('saveAccreditations', {
        gid: 'gacred',
        subjectId: 'macred',
        ciclo: '2026-2027',
        entries: [
          {sid: 'aacred1', estatus: 'acreditado'},
          {sid: 'aacred2', estatus: 'no_acreditado'},
        ],
      }, MAESTRO_ACRED);

      if (saved.status >= 400) return false;

      const after = await callFunction('getAccreditations', {gid: 'gacred', subjectId: 'macred', ciclo: '2026-2027'}, MAESTRO_ACRED);

      if (after.body?.result?.records?.aacred1 !== 'acreditado') return false;
      if (after.body?.result?.records?.aacred2 !== 'no_acreditado') return false;

      // Otro maestro no puede ver ni guardar este grupo.
      const otro = await callFunction('getAccreditations', {gid: 'gacred', subjectId: 'macred', ciclo: '2026-2027'}, MAESTRO_OTRO);
      if (otro.status < 400) return false;

      // Un tutor tampoco.
      const tutor = await callFunction('getAccreditations', {gid: 'gacred', subjectId: 'macred', ciclo: '2026-2027'}, TUTORREC);
      if (tutor.status < 400) return false;

      // El prefecto lee los resultados del alumno.
      const student = await callFunction('getStudentAccreditations', {sid: 'aacred1', ciclo: '2026-2027'}, PREFECT);
      if (student.status >= 400 || student.body?.result?.records?.length !== 1) return false;

      // El maestro no marca desenlaces; el prefecto si.
      const byMaestro = await callFunction('saveDesenlace', {sid: 'aacred1', tipo: 'baja_definitiva', ciclo: '2026-2027'}, MAESTRO_ACRED);
      if (byMaestro.status < 400) return false;

      const byPrefect = await callFunction('saveDesenlace', {
        sid: 'aacred1',
        tipo: 'expulsion_temporal',
        inicio: '2026-11-20',
        fin: '2026-11-25',
        ciclo: '2026-2027',
      }, PREFECT);

      if (byPrefect.status >= 400) return false;

      const desenlace = await readMapField('alumnos/aacred1', 'desenlace', 'tipo');
      if (desenlace !== 'expulsion_temporal') return false;

      // El aviso al tutor se crea con la nota automatica y sus fechas.
      const notificationsResponse = await firestore('GET', 'usuarios/tutorrec/notificaciones');
      if (!notificationsResponse.ok) return false;
      const notificationsBody = await notificationsResponse.json();
      const suspensionNotification = (notificationsBody.documents ?? []).find(
        (doc) => doc.fields?.tipo?.stringValue === 'Suspensión temporal'
      );
      if (!suspensionNotification) return false;

      const suspensionText = suspensionNotification.fields?.observaciones?.stringValue ?? '';
      if (!suspensionText.includes('20/11/2026') || !suspensionText.includes('25/11/2026')) return false;

      // La baja definitiva tambien avisa al tutor.
      const baja = await callFunction('saveDesenlace', {
        sid: 'aacred2',
        tipo: 'baja_definitiva',
        ciclo: '2026-2027',
      }, PREFECT);
      if (baja.status >= 400) return false;

      const afterBaja = await firestore('GET', 'usuarios/tutorrec/notificaciones');
      if (!afterBaja.ok) return false;
      const afterBajaBody = await afterBaja.json();
      const bajaNotification = (afterBajaBody.documents ?? []).find(
        (doc) => doc.fields?.tipo?.stringValue === 'Baja definitiva'
      );
      if (!bajaNotification) return false;

      const bajaText = bajaNotification.fields?.observaciones?.stringValue ?? '';
      if (!bajaText.includes('baja definitiva')) return false;

      const events = await firestore('GET', 'desenlaces');
      if (!events.ok) return false;
      const body = await events.json();

      return (body.documents?.length ?? 0) >= 1;
    },
  },
  // ==================== auditoria y tutores ====================
  {
    name: 'valida tutores, desvincula y deja auditoria',
    run: async () => {
      await firestore('PATCH', 'usuarios/tutor-audit', { fields: { rol: str('tutor'), cct: str('CCT1') } });
      await firestore('PATCH', 'alumnos/a-audit', {
        fields: {
          nombre: str('ALUMNO AUDIT'),
          cct: str('CCT1'),
          tid: str('tutor-audit'),
          nombreTutor: str('TUTOR AUDIT'),
          validado: bool(false),
        },
      });
      await firestore('PATCH', 'alumnos/a-audit2', {
        fields: {
          nombre: str('ALUMNO AUDIT 2'),
          cct: str('CCT1'),
          tid: str('tutor-audit'),
          nombreTutor: str('TUTOR AUDIT'),
          validado: bool(false),
        },
      });

      // El maestro no puede validar tutores.
      const asMaestro = await callFunction('validateTutor', { sid: 'a-audit', accept: true }, MAESTRO_ACRED);
      if (asMaestro.status < 400) return false;

      // El prefecto valida al tutor.
      const accept = await callFunction('validateTutor', { sid: 'a-audit', accept: true }, PREFECT);
      if (accept.status >= 400) return false;
      if ((await readBool('alumnos/a-audit', 'validado')) !== true) return false;

      // Un tutor no puede soltar a un alumno ya validado.
      const tutorValidated = await callFunction('releaseStudent', { sid: 'a-audit' }, TUTOR_AUDIT);
      if (tutorValidated.status < 400) return false;

      // Pero si al pendiente.
      const release = await callFunction('releaseStudent', { sid: 'a-audit2' }, TUTOR_AUDIT);
      if (release.status >= 400) return false;
      if ((await readField('alumnos/a-audit2', 'tid')) !== '') return false;

      // El prefecto puede deshacer el vinculo validado; el maestro no.
      const staffRelease = await callFunction('releaseStudent', { sid: 'a-audit' }, PREFECT);
      if (staffRelease.status >= 400) return false;

      const maestroRelease = await callFunction('releaseStudent', { sid: 'a-audit2' }, MAESTRO_ACRED);
      if (maestroRelease.status < 400) return false;

      // "Activo" borra la suspension vigente y deja el evento.
      const active = await callFunction('saveDesenlace', { sid: 'aacred1', tipo: 'activo', ciclo: '2026-2027' }, PREFECT);
      if (active.status >= 400) return false;
      if ((await readMapField('alumnos/aacred1', 'desenlace', 'tipo')) !== null) return false;

      // La callable de borrado de cuenta tambien deja auditoria.
      const borrarUid = await createAuthUser('borrar-audit@test.mx');
      await firestore('PATCH', `usuarios/${borrarUid}`, { fields: { rol: str('tutor'), cct: str('CCT1') } });
      const deleted = await callFunction('deleteTeacher', { uid: borrarUid }, ADMIN);
      if (deleted.status >= 400) return false;

      const actions = await auditActions();

      return [
        'tutor_validado',
        'alumno_desvinculado',
        'usuario_borrado',
        'usuario_actualizado',
        'grupo_borrado',
        'acreditacion_guardada',
        'desenlace_registrado',
      ].every((action) => actions.includes(action));
    },
  },
];

(async () => {
  await seed();
  console.log('Sembrado: escuelas/e1 (cct CCT1, pin 1921) y usuarios/prefecto9 (cct CCT1)\n');

  let failures = 0;
  let total = cases.length + scenarioCases.length;

  for (const [name, fn, data, token, check, expected] of cases) {
    let passed = false;
    let detail = '';

    try {
      const response = await callFunction(fn, data, token);
      passed = check(response);
      detail = JSON.stringify(response.body?.result ?? response.body?.error?.message ?? response.body).slice(0, 90);
    } catch (error) {
      detail = `excepcion: ${error.message}`;
    }

    if (!passed) failures++;
    console.log(`${passed ? '✅' : '❌'} ${name.padEnd(38)} esperado ${expected.padEnd(22)} ${detail}`);
  }

  for (const triggerCase of scenarioCases) {
    let passed = false;

    try {
      passed = await triggerCase.run();
    } catch (error) {
      console.log(`   excepcion: ${error.message}`);
    }

    if (!passed) failures++;
    console.log(`${passed ? '✅' : '❌'} ${triggerCase.name}`);
  }

  console.log(`\n${total - failures}/${total} casos correctos`);
  process.exit(failures === 0 ? 0 : 1);
})();
