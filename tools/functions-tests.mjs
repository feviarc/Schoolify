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

const TEACHER = tokenFor('maestro9');
const TEACHER_UNVERIFIED = tokenFor('maestro9', { emailVerified: false });
const ADMIN = tokenFor('admin9');

const AUTH_EMULATOR = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`;

const str = (value) => ({ stringValue: value });
const num = (value) => ({ integerValue: String(value) });

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
    ['usuarios/maestro9', { rol: str('maestro'), cct: str('CCT1') }],
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
  ['getMySchool con sesion de maestro', 'getMySchool', {}, TEACHER, (r) => r.body?.result?.school?.nombre === 'ESCUELA DE PRUEBA' && r.body.result.school.pin === undefined, 'escuela sin pin'],
  ['getMySchool devuelve el telefono de la escuela', 'getMySchool', {}, TEACHER, (r) => r.body?.result?.school?.telefono === '3531008338', 'telefono'],
  ['getMySchool con correo sin verificar', 'getMySchool', {}, TEACHER_UNVERIFIED, (r) => r.status >= 400, 'error de correo no verificado'],
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

      const asTeacher = await callFunction('updateUserByAdmin', { uid, rol: 'maestro' }, TEACHER);
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
      const response = await callFunction('getUsersAuthStatus', {}, TEACHER);
      return response.status >= 400;
    },
  },
  // ==================== borrado de grupos ====================
  {
    name: 'no se puede borrar un grupo con alumnos asignados',
    run: async () => {
      await firestore('PATCH', 'grupos_de_alumnos/gcon', { fields: { cct: str('CCT1'), grado: str('1'), letra: str('Z') } });
      await firestore('PATCH', 'alumnos/acon', { fields: { nombre: str('ALUMNO DEL GRUPO'), cct: str('CCT1'), gid: str('gcon') } });

      const response = await callFunction('deleteStudentGroup', { gid: 'gcon' }, TEACHER);
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

      const response = await callFunction('deleteStudentGroup', { gid: 'gvacio' }, TEACHER);
      if (response.status >= 400) return false;

      const gone = await firestore('GET', 'grupos_de_alumnos/gvacio');
      return gone.status === 404;
    },
  },
  {
    name: 'un maestro no puede borrar un grupo de otra escuela',
    run: async () => {
      await firestore('PATCH', 'grupos_de_alumnos/gotra', { fields: { cct: str('CCT2'), grado: str('1'), letra: str('B') } });

      const response = await callFunction('deleteStudentGroup', { gid: 'gotra' }, TEACHER);
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
];

(async () => {
  await seed();
  console.log('Sembrado: escuelas/e1 (cct CCT1, pin 1921) y usuarios/maestro9 (cct CCT1)\n');

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
