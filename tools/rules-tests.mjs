// Pruebas de reglas de Firestore contra el emulador local.
// Sin dependencias: usa fetch de Node 18+ y tokens JWT sin firmar, que es
// exactamente lo que acepta el emulador para simular usuarios.
//
// Uso:
//   terminal A:  firebase --project demo-schoolify emulators:start --only firestore
//   terminal B:  node tools/rules-tests.mjs
//
// Requiere Java 21 (el emulador de Firestore no acepta versiones anteriores) y
// corre SOLO contra la base local del emulador: nunca toca el proyecto real.
// Los ids que crea se limpian al inicio de cada corrida, asi que se puede repetir.

const PROJECT = 'demo-schoolify';
const BASE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

const toBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function tokenFor(uid) {
  const header = toBase64Url({ alg: 'none', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: 'password' },
  });
  return `${header}.${payload}.`;
}

const OWNER = 'owner';
const ADMIN = tokenFor('admin1');
const TEACHER = tokenFor('maestro1');
const TUTOR1 = tokenFor('tutor1');
const TUTOR2 = tokenFor('tutor2');
const NEW_USER = tokenFor('newuser');

const str = (value) => ({ stringValue: value });
const bool = (value) => ({ booleanValue: value });
const timestamp = () => ({ timestampValue: new Date().toISOString() });
const num = (value) => ({ integerValue: String(value) });

async function sendRequest(method, path, { token, fields, mask } = {}) {
  const url = new URL(`${BASE}/${path}`);
  if (mask) mask.forEach((field) => url.searchParams.append('updateMask.fieldPaths', field));
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method,
    headers,
    body: fields ? JSON.stringify({ fields }) : undefined,
  });
  return response.status;
}

const succeeded = (status) => status === 200 || status === 201;

// Los nombres de los casos no son metodos HTTP validos (UPDATE no existe): se mapean.
const HTTP_METHOD = { get: 'GET', list: 'GET', post: 'POST', update: 'PATCH', delete: 'DELETE' };

async function seed() {
  const documents = [
    ['usuarios/admin1', { rol: str('administrador'), email: str('admin1@test.mx') }],
    ['usuarios/maestro1', { rol: str('maestro'), email: str('maestro1@test.mx') }],
    ['usuarios/tutor1', { rol: str('tutor'), email: str('tutor1@test.mx') }],
    ['usuarios/tutor2', { rol: str('tutor'), email: str('tutor2@test.mx') }],
    ['alumnos/a1', { nombre: str('ALUMNO LIBRE'), cct: str('CCT1'), validado: bool(false) }],
    ['alumnos/a2', { nombre: str('ALUMNO DE TUTOR2'), cct: str('CCT1'), tid: str('tutor2') }],
    ['escuelas/e1', { cct: str('CCT1'), nombre: str('ESCUELA'), pin: num(1921) }],
    ['materias/m1', { nombre: str('MATEMATICAS'), grado: str('1') }],
  ];

  for (const [path, fields] of documents) {
    const status = await sendRequest('PATCH', path, { token: OWNER, fields });
    if (!succeeded(status)) throw new Error(`No se pudo sembrar ${path}: HTTP ${status}`);
  }
}

const cases = [
  ['tutor1 se asciende a administrador en su propio perfil', 'update', 'usuarios/tutor1', { token: TUTOR1, fields: { rol: str('administrador') }, mask: ['rol'] }, 'denegado'],
  ['tutor1 cambia otro usuario (tutor2)', 'update', 'usuarios/tutor2', { token: TUTOR1, fields: { activo: bool(false) }, mask: ['activo'] }, 'denegado'],
  ['tutor1 edita su propio nombre', 'update', 'usuarios/tutor1', { token: TUTOR1, fields: { nombre: str('TUTOR UNO') }, mask: ['nombre'] }, 'permitido'],
  ['registro nuevo con rol administrador', 'post', 'usuarios?documentId=newuser', { token: NEW_USER, fields: { rol: str('administrador'), email: str('n@test.mx') } }, 'denegado'],
  ['registro nuevo con rol tutor', 'post', 'usuarios?documentId=newuser', { token: NEW_USER, fields: { rol: str('tutor'), email: str('n2@test.mx') } }, 'permitido'],
  ['tutor1 reclama un alumno libre (sin tid)', 'update', 'alumnos/a1', { token: TUTOR1, fields: { tid: str('tutor1'), nombreTutor: str('TUTOR UNO'), updatedAt: timestamp() }, mask: ['tid', 'nombreTutor', 'updatedAt'] }, 'permitido'],
  ['tutor1 roba el alumno de tutor2', 'update', 'alumnos/a2', { token: TUTOR1, fields: { tid: str('tutor1') }, mask: ['tid'] }, 'denegado'],
  ['tutor1 marca validado a un alumno', 'update', 'alumnos/a1', { token: TUTOR1, fields: { validado: bool(true) }, mask: ['validado'] }, 'denegado'],
  ['tutor1 borra un alumno', 'delete', 'alumnos/a2', { token: TUTOR1 }, 'denegado'],
  ['maestro1 crea un alumno', 'post', 'alumnos?documentId=a3', { token: TEACHER, fields: { nombre: str('ALUMNO NUEVO'), cct: str('CCT1') } }, 'permitido'],
  ['maestro1 crea un grupo de alumnos', 'post', 'grupos_de_alumnos?documentId=g9', { token: TEACHER, fields: { cct: str('CCT1'), grado: str('1'), letra: str('A') } }, 'permitido'],
  ['maestro1 crea una escuela', 'post', 'escuelas?documentId=e9', { token: TEACHER, fields: { cct: str('CCT9'), nombre: str('ESCUELA 9') } }, 'denegado'],
  ['maestro1 crea una materia', 'post', 'materias?documentId=m9', { token: TEACHER, fields: { nombre: str('FISICA'), grado: str('1') } }, 'denegado'],
  ['maestro1 crea un aviso al tutor', 'post', 'usuarios/tutor1/notificaciones?documentId=n1', { token: TEACHER, fields: { sid: str('a1'), tipo: str('Inasistencia'), nombreCompleto: str('ALUMNO LIBRE') } }, 'permitido'],
  ['tutor1 crea un aviso para si mismo', 'post', 'usuarios/tutor1/notificaciones?documentId=n2', { token: TUTOR1, fields: { sid: str('a1'), tipo: str('Indisciplina') } }, 'denegado'],
  ['admin1 crea una escuela', 'post', 'escuelas?documentId=e8', { token: ADMIN, fields: { cct: str('CCT8'), nombre: str('ESCUELA 8') } }, 'permitido'],
  ['admin1 edita una escuela existente', 'update', 'escuelas/e1', { token: ADMIN, fields: { nombre: str('ESCUELA EDITADA') }, mask: ['nombre'] }, 'permitido'],
  ['admin1 borra un usuario', 'delete', 'usuarios/tutor2', { token: ADMIN }, 'permitido'],
  ['sin sesion: leer un documento', 'get', 'alumnos/a1', {}, 'permitido'],
  ['sin sesion: listar una coleccion', 'list', 'alumnos', {}, 'permitido'],
  // `escuelas` contiene el `pin`: solo la lee el administrador.
  ['sin sesion: leer una escuela', 'get', 'escuelas/e1', {}, 'denegado'],
  ['sin sesion: listar escuelas', 'list', 'escuelas', {}, 'denegado'],
  ['maestro1 lee una escuela', 'get', 'escuelas/e1', { token: TEACHER }, 'denegado'],
  ['maestro1 lista escuelas', 'list', 'escuelas', { token: TEACHER }, 'denegado'],
  ['admin1 lee una escuela', 'get', 'escuelas/e1', { token: ADMIN }, 'permitido'],
  ['admin1 lista escuelas', 'list', 'escuelas', { token: ADMIN }, 'permitido'],
];

async function waitForEmulator(maxMs = 240000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    try {
      // Cualquier respuesta HTTP (incluido 404) significa que el emulador ya escucha.
      const response = await fetch(`${BASE}/usuarios`, { headers: { Authorization: `Bearer ${OWNER}` } });
      if (response.status < 500) return true;
    } catch {
      // el emulador todavia no escucha
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

(async () => {
  if (!(await waitForEmulator())) {
    console.error('❌ El emulador no respondio en el tiempo esperado');
    process.exit(1);
  }

  // Los casos de creacion usan ids fijos: se limpian para poder repetir la corrida.
  for (const path of ['alumnos/a3', 'grupos_de_alumnos/g9', 'escuelas/e8', 'escuelas/e9',
                      'materias/m9', 'usuarios/newuser', 'usuarios/tutor1/notificaciones/n1',
                      'usuarios/tutor1/notificaciones/n2']) {
    await sendRequest('DELETE', path, { token: OWNER });
  }

  await seed();
  console.log('Datos sembrados: admin1, maestro1, tutor1, tutor2, alumnos a1/a2, escuela e1, materia m1\n');

  let failures = 0;
  const rows = [];

  for (const [name, method, path, options, expected] of cases) {
    const status = await sendRequest(HTTP_METHOD[method], path, options);
    const allowed = succeeded(status);
    const actual = allowed ? 'permitido' : 'denegado';
    const passed = actual === expected;
    if (!passed) failures++;
    rows.push(`${passed ? '✅' : '❌'} ${actual.padEnd(10)} (esperado ${expected.padEnd(10)}) HTTP ${String(status).padEnd(4)} ${name}`);
  }

  console.log(rows.join('\n'));
  console.log(`\n${cases.length - failures}/${cases.length} casos correctos`);
  process.exit(failures === 0 ? 0 : 1);
})();
