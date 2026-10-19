// Pruebas de las Cloud Functions que usa la app para leer datos de escuelas.
// Sin dependencias: habla el protocolo de los callables por HTTP.
//
// Uso:
//   terminal A:  firebase --project demo-schoolify emulators:start --only firestore,functions
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

const str = (value) => ({ stringValue: value });
const num = (value) => ({ integerValue: String(value) });

async function seed() {
  const documents = [
    ['escuelas/e1', { cct: str('CCT1'), nombre: str('ESCUELA DE PRUEBA'), turno: str('TM'), pin: num(1921), telefono: str('3531008338') }],
    ['usuarios/maestro9', { rol: str('maestro'), cct: str('CCT1') }],
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

const triggerCases = [
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
];

(async () => {
  await seed();
  console.log('Sembrado: escuelas/e1 (cct CCT1, pin 1921) y usuarios/maestro9 (cct CCT1)\n');

  let failures = 0;
  let total = cases.length + triggerCases.length;

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

  for (const triggerCase of triggerCases) {
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
