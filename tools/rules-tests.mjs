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
//
// Ademas de lecturas y escrituras por documento, prueba las CONSULTAS reales de la
// app (`query`): las reglas no son filtros, asi que una consulta que no filtre por
// `cct`, `tid` o el uid del dueño se rechaza entera.

const PROJECT = 'demo-schoolify';
const BASE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

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

const OWNER = 'owner';
const ADMIN = tokenFor('admin1');
const TEACHER = tokenFor('maestro1');
const TUTOR1 = tokenFor('tutor1');
const TUTOR2 = tokenFor('tutor2');
// Recien registrado: todavia no verifico su correo.
const NEW_USER = tokenFor('newuser', { emailVerified: false });
// La misma cuenta de tutor, pero con el correo sin verificar.
const TUTOR1_UNVERIFIED = tokenFor('tutor1', { emailVerified: false });

const str = (value) => ({ stringValue: value });
const bool = (value) => ({ booleanValue: value });
const timestamp = () => ({ timestampValue: new Date().toISOString() });
const num = (value) => ({ integerValue: String(value) });

// `Connection: close` evita reutilizar un socket que el emulador cerro al responder
// un 403: Node lo reusaba y la peticion siguiente se quedaba esperando sin fin.
// El timeout es la red de seguridad para que un cuelgue se vea como error.
const REQUEST_TIMEOUT_MS = 15000;
const commonHeaders = () => ({ 'Content-Type': 'application/json', Connection: 'close' });

function toFirestoreValue(value) {
  if (typeof value === 'number') return num(value);
  if (typeof value === 'boolean') return bool(value);
  return str(value);
}

async function sendRequest(method, path, { token, fields, mask } = {}) {
  const url = new URL(`${BASE}/${path}`);
  if (mask) mask.forEach((field) => url.searchParams.append('updateMask.fieldPaths', field));
  const headers = commonHeaders();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    method,
    headers,
    body: fields ? JSON.stringify({ fields }) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response.status;
}

// `path` es la ruta de la coleccion: `alumnos` o `usuarios/tutor1/notificaciones`.
async function sendQuery(path, { token, where = [], orderBy = [] } = {}) {
  const segments = path.split('/');
  const collectionId = segments.pop();
  const parentPath = segments.join('/');

  const filters = where.map(({ field, op = 'EQUAL', value }) => ({
    fieldFilter: { field: { fieldPath: field }, op, value: toFirestoreValue(value) },
  }));

  const structuredQuery = {
    from: [{ collectionId }],
    ...(filters.length === 1 ? { where: filters[0] } : {}),
    ...(filters.length > 1 ? { where: { compositeFilter: { op: 'AND', filters } } } : {}),
    ...(orderBy.length ? { orderBy: orderBy.map((field) => ({ field: { fieldPath: field } })) } : {}),
  };

  // El `parent` va en la URL, no en el cuerpo: el emulador se queda colgado si se
  // manda en el cuerpo de la peticion.
  const url = parentPath ? `${BASE}/${parentPath}:runQuery` : `${BASE}:runQuery`;

  const headers = commonHeaders();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ structuredQuery }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return response.status;
}

const succeeded = (status) => status === 200 || status === 201;

// Los nombres de los casos no son metodos HTTP validos (UPDATE no existe): se mapean.
const HTTP_METHOD = { get: 'GET', list: 'GET', post: 'POST', update: 'PATCH', delete: 'DELETE' };

async function seed() {
  const documents = [
    // Dos escuelas distintas: CCT1 (admin1, maestro1, tutor1) y CCT2 (tutor2).
    ['usuarios/admin1', { rol: str('administrador'), email: str('admin1@test.mx'), cct: str('CCT1') }],
    ['usuarios/maestro1', { rol: str('maestro'), email: str('maestro1@test.mx'), cct: str('CCT1') }],
    ['usuarios/tutor1', { rol: str('tutor'), email: str('tutor1@test.mx'), cct: str('CCT1') }],
    ['usuarios/tutor2', { rol: str('tutor'), email: str('tutor2@test.mx'), cct: str('CCT2') }],
    ['alumnos/a1', { nombre: str('ALUMNO LIBRE'), cct: str('CCT1'), validado: bool(false) }],
    ['alumnos/a2', { nombre: str('ALUMNO DE TUTOR2'), cct: str('CCT1'), tid: str('tutor2') }],
    ['alumnos/a4', { nombre: str('ALUMNO DE OTRA ESCUELA'), cct: str('CCT2') }],
    ['grupos_de_alumnos/g1', { cct: str('CCT1'), grado: str('1'), letra: str('A') }],
    ['grupos_de_alumnos/g2', { cct: str('CCT2'), grado: str('1'), letra: str('B') }],
    ['usuarios/tutor1/notificaciones/n0', { sid: str('a1'), tipo: str('Inasistencia'), nombreCompleto: str('ALUMNO LIBRE') }],
    ['escuelas/e1', { cct: str('CCT1'), nombre: str('ESCUELA'), pin: num(1921) }],
    ['materias/m1', { nombre: str('MATEMATICAS'), grado: str('1') }],
    ['grupos/gr1', { grado: str('1'), letra: str('A'), nombre: str('Grupo 1 A') }],
  ];

  for (const [path, fields] of documents) {
    const status = await sendRequest('PATCH', path, { token: OWNER, fields });
    if (!succeeded(status)) throw new Error(`No se pudo sembrar ${path}: HTTP ${status}`);
  }
}

const cases = [
  // ==================== escrituras (acotadas por rol) ====================
  ['tutor1 se asciende a administrador en su propio perfil', 'update', 'usuarios/tutor1', { token: TUTOR1, fields: { rol: str('administrador') }, mask: ['rol'] }, 'denegado'],
  ['tutor1 cambia otro usuario (tutor2)', 'update', 'usuarios/tutor2', { token: TUTOR1, fields: { activo: bool(false) }, mask: ['activo'] }, 'denegado'],
  ['tutor1 edita su propio nombre', 'update', 'usuarios/tutor1', { token: TUTOR1, fields: { nombre: str('TUTOR UNO') }, mask: ['nombre'] }, 'permitido'],
  ['registro nuevo con rol administrador', 'post', 'usuarios?documentId=newuser', { token: NEW_USER, fields: { rol: str('administrador'), email: str('n@test.mx') } }, 'denegado'],
  ['registro nuevo sin correo verificado (rol tutor)', 'post', 'usuarios?documentId=newuser', { token: NEW_USER, fields: { rol: str('tutor'), email: str('n2@test.mx') } }, 'permitido'],
  // El correo sin verificar no da acceso a nada mas: ni al propio perfil.
  ['correo sin verificar: leer su propio perfil', 'get', 'usuarios/tutor1', { token: TUTOR1_UNVERIFIED }, 'denegado'],
  ['correo sin verificar: lista los alumnos de su escuela', 'query', 'alumnos', { token: TUTOR1_UNVERIFIED, where: [{ field: 'cct', value: 'CCT1' }], orderBy: ['nombre'] }, 'denegado'],
  ['correo sin verificar: crea un aviso', 'post', 'usuarios/tutor1/notificaciones?documentId=n3', { token: TUTOR1_UNVERIFIED, fields: { sid: str('a1'), tipo: str('Inasistencia') } }, 'denegado'],
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

  // ==================== escuelas (solo administrador) ====================
  ['sin sesion: leer una escuela', 'get', 'escuelas/e1', {}, 'denegado'],
  ['maestro1 lee una escuela', 'get', 'escuelas/e1', { token: TEACHER }, 'denegado'],
  ['admin1 lee una escuela', 'get', 'escuelas/e1', { token: ADMIN }, 'permitido'],

  // ==================== alumnos: por escuela o por dueño ====================
  ['sin sesion: leer un alumno', 'get', 'alumnos/a1', {}, 'denegado'],
  ['sin sesion: listar alumnos', 'list', 'alumnos', {}, 'denegado'],
  ['maestro1 lee un alumno de su escuela', 'get', 'alumnos/a1', { token: TEACHER }, 'permitido'],
  ['maestro1 lee un alumno de otra escuela', 'get', 'alumnos/a4', { token: TEACHER }, 'denegado'],
  ['maestro1 lista los alumnos de su escuela', 'query', 'alumnos', { token: TEACHER, where: [{ field: 'cct', value: 'CCT1' }], orderBy: ['nombre'] }, 'permitido'],
  ['maestro1 lista los alumnos de otra escuela', 'query', 'alumnos', { token: TEACHER, where: [{ field: 'cct', value: 'CCT2' }], orderBy: ['nombre'] }, 'denegado'],
  ['maestro1 lista alumnos sin filtrar por escuela', 'query', 'alumnos', { token: TEACHER, orderBy: ['nombre'] }, 'denegado'],
  ['tutor1 lista a sus alumnos', 'query', 'alumnos', { token: TUTOR1, where: [{ field: 'tid', value: 'tutor1' }], orderBy: ['nombre'] }, 'permitido'],
  ['tutor1 lista a los alumnos sin tutor de su escuela', 'query', 'alumnos', { token: TUTOR1, where: [{ field: 'cct', value: 'CCT1' }], orderBy: ['nombre'] }, 'permitido'],
  ['tutor1 lee un alumno de su escuela', 'get', 'alumnos/a2', { token: TUTOR1 }, 'permitido'],
  ['tutor1 lista los alumnos de otra escuela', 'query', 'alumnos', { token: TUTOR1, where: [{ field: 'cct', value: 'CCT2' }], orderBy: ['nombre'] }, 'denegado'],
  ['tutor1 lee un alumno de otra escuela', 'get', 'alumnos/a4', { token: TUTOR1 }, 'denegado'],
  ['tutor1 lista alumnos sin filtrar por escuela', 'query', 'alumnos', { token: TUTOR1, orderBy: ['nombre'] }, 'denegado'],
  ['admin1 lista todos los alumnos', 'query', 'alumnos', { token: ADMIN, orderBy: ['nombre'] }, 'permitido'],

  // ==================== grupos de alumnos: por escuela ====================
  ['maestro1 lista los grupos de su escuela', 'query', 'grupos_de_alumnos', { token: TEACHER, where: [{ field: 'cct', value: 'CCT1' }], orderBy: ['grado', 'letra'] }, 'permitido'],
  ['maestro1 lista los grupos de otra escuela', 'query', 'grupos_de_alumnos', { token: TEACHER, where: [{ field: 'cct', value: 'CCT2' }], orderBy: ['grado'] }, 'denegado'],
  ['sin sesion: listar grupos de alumnos', 'list', 'grupos_de_alumnos', {}, 'denegado'],

  // ==================== usuarios: solo el dueño y el administrador ====================
  ['tutor1 lee su propio perfil', 'get', 'usuarios/tutor1', { token: TUTOR1 }, 'permitido'],
  ['maestro1 lee su propio perfil', 'get', 'usuarios/maestro1', { token: TEACHER }, 'permitido'],
  ['tutor1 lee el perfil de un maestro de su escuela', 'get', 'usuarios/maestro1', { token: TUTOR1 }, 'denegado'],
  ['maestro1 lee el perfil de un tutor de su escuela', 'get', 'usuarios/tutor1', { token: TEACHER }, 'denegado'],
  ['tutor1 lee a un usuario de otra escuela', 'get', 'usuarios/tutor2', { token: TUTOR1 }, 'denegado'],
  ['tutor1 lista los usuarios de su escuela', 'query', 'usuarios', { token: TUTOR1, where: [{ field: 'cct', value: 'CCT1' }] }, 'denegado'],
  ['tutor1 lista usuarios sin filtrar por escuela', 'query', 'usuarios', { token: TUTOR1 }, 'denegado'],
  ['maestro1 lista los usuarios de su escuela', 'query', 'usuarios', { token: TEACHER, where: [{ field: 'cct', value: 'CCT1' }] }, 'denegado'],
  ['admin1 lista todos los usuarios', 'query', 'usuarios', { token: ADMIN }, 'permitido'],
  ['admin1 lee el perfil de un maestro', 'get', 'usuarios/maestro1', { token: ADMIN }, 'permitido'],

  // ==================== notificaciones: dueño o maestro de su escuela ====================
  ['tutor1 lista sus propias notificaciones', 'query', 'usuarios/tutor1/notificaciones', { token: TUTOR1, orderBy: ['createdAt'] }, 'permitido'],
  ['tutor1 lista sus notificaciones de un alumno', 'query', 'usuarios/tutor1/notificaciones', { token: TUTOR1, where: [{ field: 'sid', value: 'a1' }], orderBy: ['createdAt'] }, 'permitido'],
  ['tutor1 lista las notificaciones de otro tutor', 'query', 'usuarios/tutor2/notificaciones', { token: TUTOR1, orderBy: ['createdAt'] }, 'denegado'],
  ['maestro1 abre el historial de un tutor de su escuela', 'query', 'usuarios/tutor1/notificaciones', { token: TEACHER, where: [{ field: 'sid', value: 'a1' }], orderBy: ['createdAt'] }, 'permitido'],
  ['maestro1 abre el historial de un tutor de otra escuela', 'query', 'usuarios/tutor2/notificaciones', { token: TEACHER, where: [{ field: 'sid', value: 'a1' }], orderBy: ['createdAt'] }, 'denegado'],
  ['admin1 lista las notificaciones de un tutor', 'query', 'usuarios/tutor1/notificaciones', { token: ADMIN, orderBy: ['createdAt'] }, 'permitido'],

  // ==================== catalogos generales ====================
  ['maestro1 lee una materia', 'get', 'materias/m1', { token: TEACHER }, 'permitido'],
  ['maestro1 lista los grupos escolares', 'list', 'grupos', { token: TEACHER }, 'permitido'],
  ['tutor1 lee una materia', 'get', 'materias/m1', { token: TUTOR1 }, 'denegado'],
  ['sin sesion: listar materias', 'list', 'materias', {}, 'denegado'],
];

async function waitForEmulator(maxMs = 240000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    try {
      // Cualquier respuesta HTTP (incluido 404) significa que el emulador ya escucha.
      const response = await fetch(`${BASE}/usuarios`, {
        headers: { Authorization: `Bearer ${OWNER}`, Connection: 'close' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
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
                      'usuarios/tutor1/notificaciones/n2', 'usuarios/tutor1/notificaciones/n3']) {
    await sendRequest('DELETE', path, { token: OWNER });
  }

  await seed();
  console.log('Sembrado: 2 escuelas (CCT1 y CCT2), admin1, maestro1, tutor1, tutor2, alumnos a1/a2/a4, grupos g1/g2, escuela e1, materia m1\n');

  let failures = 0;
  const rows = [];

  for (const [name, method, path, options, expected] of cases) {
    let status;
    try {
      status = method === 'query'
        ? await sendQuery(path, options)
        : await sendRequest(HTTP_METHOD[method], path, options);
    } catch (error) {
      status = `error (${error.name})`;
    }

    const allowed = succeeded(status);
    const actual = typeof status === 'string' ? status : (allowed ? 'permitido' : 'denegado');
    const passed = actual === expected;
    if (!passed) failures++;
    rows.push(`${passed ? '✅' : '❌'} ${actual.padEnd(10)} (esperado ${expected.padEnd(10)}) HTTP ${String(status).padEnd(4)} ${name}`);
  }

  console.log(rows.join('\n'));
  console.log(`\n${cases.length - failures}/${cases.length} casos correctos`);
  process.exit(failures === 0 ? 0 : 1);
})();
