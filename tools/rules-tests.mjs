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

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function tokenDe(uid) {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const ahora = Math.floor(Date.now() / 1000);
  const payload = b64url({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: uid,
    user_id: uid,
    iat: ahora,
    exp: ahora + 3600,
    firebase: { identities: {}, sign_in_provider: 'password' },
  });
  return `${header}.${payload}.`;
}

const OWNER = 'owner';
const ADMIN = tokenDe('admin1');
const MAESTRO = tokenDe('maestro1');
const TUTOR1 = tokenDe('tutor1');
const TUTOR2 = tokenDe('tutor2');
const NUEVO = tokenDe('newuser');

const s = (v) => ({ stringValue: v });
const b = (v) => ({ booleanValue: v });
const ts = () => ({ timestampValue: new Date().toISOString() });
const int = (v) => ({ integerValue: String(v) });

async function pedir(method, path, { token, fields, mask } = {}) {
  const url = new URL(`${BASE}/${path}`);
  if (mask) mask.forEach((f) => url.searchParams.append('updateMask.fieldPaths', f));
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: fields ? JSON.stringify({ fields }) : undefined,
  });
  return res.status;
}

const creado = (status) => status === 200 || status === 201;

// Los nombres de los casos no son metodos HTTP validos (UPDATE no existe): se mapean.
const METODO = { get: 'GET', list: 'GET', post: 'POST', update: 'PATCH', delete: 'DELETE' };

async function sembrar() {
  const docs = [
    ['usuarios/admin1', { rol: s('administrador'), email: s('admin1@test.mx') }],
    ['usuarios/maestro1', { rol: s('maestro'), email: s('maestro1@test.mx') }],
    ['usuarios/tutor1', { rol: s('tutor'), email: s('tutor1@test.mx') }],
    ['usuarios/tutor2', { rol: s('tutor'), email: s('tutor2@test.mx') }],
    ['alumnos/a1', { nombre: s('ALUMNO LIBRE'), cct: s('CCT1'), validado: b(false) }],
    ['alumnos/a2', { nombre: s('ALUMNO DE TUTOR2'), cct: s('CCT1'), tid: s('tutor2') }],
    ['escuelas/e1', { cct: s('CCT1'), nombre: s('ESCUELA'), pin: int(1921) }],
    ['materias/m1', { nombre: s('MATEMATICAS'), grado: s('1') }],
  ];

  for (const [path, fields] of docs) {
    const status = await pedir('PATCH', path, { token: OWNER, fields });
    if (!creado(status)) throw new Error(`No se pudo sembrar ${path}: HTTP ${status}`);
  }
}

const casos = [
  ['tutor1 se asciende a administrador en su propio perfil', 'update', 'usuarios/tutor1', { token: TUTOR1, fields: { rol: s('administrador') }, mask: ['rol'] }, 'denegado'],
  ['tutor1 cambia otro usuario (tutor2)', 'update', 'usuarios/tutor2', { token: TUTOR1, fields: { activo: b(false) }, mask: ['activo'] }, 'denegado'],
  ['tutor1 edita su propio nombre', 'update', 'usuarios/tutor1', { token: TUTOR1, fields: { nombre: s('TUTOR UNO') }, mask: ['nombre'] }, 'permitido'],
  ['registro nuevo con rol administrador', 'post', 'usuarios?documentId=newuser', { token: NUEVO, fields: { rol: s('administrador'), email: s('n@test.mx') } }, 'denegado'],
  ['registro nuevo con rol tutor', 'post', 'usuarios?documentId=newuser', { token: NUEVO, fields: { rol: s('tutor'), email: s('n2@test.mx') } }, 'permitido'],
  ['tutor1 reclama un alumno libre (sin tid)', 'update', 'alumnos/a1', { token: TUTOR1, fields: { tid: s('tutor1'), nombreTutor: s('TUTOR UNO'), updatedAt: ts() }, mask: ['tid', 'nombreTutor', 'updatedAt'] }, 'permitido'],
  ['tutor1 roba el alumno de tutor2', 'update', 'alumnos/a2', { token: TUTOR1, fields: { tid: s('tutor1') }, mask: ['tid'] }, 'denegado'],
  ['tutor1 marca validado a un alumno', 'update', 'alumnos/a1', { token: TUTOR1, fields: { validado: b(true) }, mask: ['validado'] }, 'denegado'],
  ['tutor1 borra un alumno', 'delete', 'alumnos/a2', { token: TUTOR1 }, 'denegado'],
  ['maestro1 crea un alumno', 'post', 'alumnos?documentId=a3', { token: MAESTRO, fields: { nombre: s('ALUMNO NUEVO'), cct: s('CCT1') } }, 'permitido'],
  ['maestro1 crea un grupo de alumnos', 'post', 'grupos_de_alumnos?documentId=g9', { token: MAESTRO, fields: { cct: s('CCT1'), grado: s('1'), letra: s('A') } }, 'permitido'],
  ['maestro1 crea una escuela', 'post', 'escuelas?documentId=e9', { token: MAESTRO, fields: { cct: s('CCT9'), nombre: s('ESCUELA 9') } }, 'denegado'],
  ['maestro1 crea una materia', 'post', 'materias?documentId=m9', { token: MAESTRO, fields: { nombre: s('FISICA'), grado: s('1') } }, 'denegado'],
  ['maestro1 crea un aviso al tutor', 'post', 'usuarios/tutor1/notificaciones?documentId=n1', { token: MAESTRO, fields: { sid: s('a1'), tipo: s('Inasistencia'), nombreCompleto: s('ALUMNO LIBRE') } }, 'permitido'],
  ['tutor1 crea un aviso para si mismo', 'post', 'usuarios/tutor1/notificaciones?documentId=n2', { token: TUTOR1, fields: { sid: s('a1'), tipo: s('Indisciplina') } }, 'denegado'],
  ['admin1 crea una escuela', 'post', 'escuelas?documentId=e8', { token: ADMIN, fields: { cct: s('CCT8'), nombre: s('ESCUELA 8') } }, 'permitido'],
  ['admin1 edita una escuela existente', 'update', 'escuelas/e1', { token: ADMIN, fields: { nombre: s('ESCUELA EDITADA') }, mask: ['nombre'] }, 'permitido'],
  ['admin1 borra un usuario', 'delete', 'usuarios/tutor2', { token: ADMIN }, 'permitido'],
  ['sin sesion: leer un documento', 'get', 'alumnos/a1', {}, 'permitido'],
  ['sin sesion: listar una coleccion', 'list', 'alumnos', {}, 'permitido'],
];

async function esperarEmulador(maxMs = 240000) {
  const inicio = Date.now();
  while (Date.now() - inicio < maxMs) {
    try {
      // Cualquier respuesta HTTP (incluido 404) significa que el emulador ya escucha.
      const res = await fetch(`${BASE}/usuarios`, { headers: { Authorization: `Bearer ${OWNER}` } });
      if (res.status < 500) return true;
    } catch {
      // el emulador todavia no escucha
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  if (!(await esperarEmulador())) {
    console.error('❌ El emulador no respondio en el tiempo esperado');
    process.exit(1);
  }

  // Los casos de creacion usan ids fijos: se limpian para poder repetir la corrida.
  for (const path of ['alumnos/a3', 'grupos_de_alumnos/g9', 'escuelas/e8', 'escuelas/e9',
                      'materias/m9', 'usuarios/newuser', 'usuarios/tutor1/notificaciones/n1',
                      'usuarios/tutor1/notificaciones/n2']) {
    await pedir('DELETE', path, { token: OWNER });
  }

  await sembrar();
  console.log('Datos sembrados: admin1, maestro1, tutor1, tutor2, alumnos a1/a2, escuela e1, materia m1\n');

  let fallos = 0;
  const filas = [];

  for (const [nombre, metodo, path, opciones, esperado] of casos) {
    const status = await pedir(METODO[metodo], path, opciones);
    const permitido = creado(status);
    const real = permitido ? 'permitido' : 'denegado';
    const ok = real === esperado;
    if (!ok) fallos++;
    filas.push(`${ok ? '✅' : '❌'} ${real.padEnd(10)} (esperado ${esperado.padEnd(10)}) HTTP ${String(status).padEnd(4)} ${nombre}`);
  }

  console.log(filas.join('\n'));
  console.log(`\n${casos.length - fallos}/${casos.length} casos correctos`);
  process.exit(fallos === 0 ? 0 : 1);
})();
