/**
 * Plantillas generales de los avisos: 4 por cada tipo. Son fijas (no se
 * administran ni se guardan en Firestore) y no llevan nombres, materias ni
 * fechas: el docente elige una y la ajusta en el campo de observaciones.
 */
export type NotificationType = 'Inasistencia' | 'Incumplimiento' | 'Indisciplina';

export interface NotificationTemplate {
  id: string;
  tipo: NotificationType;
  titulo: string;
  texto: string;
}


export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  // ==================== Inasistencia ====================
  {
    id: 'inasistencia-1',
    tipo: 'Inasistencia',
    titulo: 'Plantilla 1',
    texto: 'Se registró la inasistencia de su hijo(a) a la clase. Agradecemos informarnos si existió alguna situación que impidiera su asistencia.',
  },
  {
    id: 'inasistencia-2',
    tipo: 'Inasistencia',
    titulo: 'Plantilla 2',
    texto: 'El/La estudiante no se presentó a clase. Favor de enviar un justificante a la siguiente sesión.',
  },
  {
    id: 'inasistencia-3',
    tipo: 'Inasistencia',
    titulo: 'Plantilla 3',
    texto: 'El/La estudiante llegó a la escuela después del tiempo de tolerancia, por reglamento se registró la falta correspondiente. Agradecemos su apoyo para el cumplimiento de la puntualidad.',
  },
  {
    id: 'inasistencia-4',
    tipo: 'Inasistencia',
    titulo: 'Plantilla 4',
    texto: 'El/La estudiante asistió a la escuela pero no se presentó a la clase. Es importante que nos ayude con este tipo de situaciones.',
  },

  // ==================== Incumplimiento ====================
  {
    id: 'incumplimiento-1',
    tipo: 'Incumplimiento',
    titulo: 'Plantilla 1',
    texto: 'El/La estudiante no entregó la tarea solicitada. Le pedimos apoyo en casa para que la complete y la entregue en la siguiente clase.',
  },
  {
    id: 'incumplimiento-2',
    tipo: 'Incumplimiento',
    titulo: 'Plantilla 2',
    texto: 'El/La estudiante no hizo una tarea del libro. Le pedimos apoyo en casa para evitar atrasos y bajas calificaciones.',
  },
  {
    id: 'incumplimiento-3',
    tipo: 'Incumplimiento',
    titulo: 'Plantilla 3',
    texto: 'El/La estudiante no realizó las actividades de la clase. Solicitamos su apoyo para que no se acumulen trabajos pendientes.',
  },
  {
    id: 'incumplimiento-4',
    tipo: 'Incumplimiento',
    titulo: 'Plantilla 4',
    texto: 'El/La estudiante no envió la actividad en plataforma. Favor de informar si se han presentado problemas técnicos con su cuenta.',
  },

  // ==================== Indisciplina ====================
  {
    id: 'indisciplina-1',
    tipo: 'Indisciplina',
    titulo: 'Plantilla 1',
    texto: 'Durante la clase, el alumno recibió una o más llamadas de atención. Le pedimos apoyo con el seguimiento de esta situación en casa.',
  },
  {
    id: 'indisciplina-2',
    tipo: 'Indisciplina',
    titulo: 'Plantilla 2',
    texto: 'El alumno presentó una conducta que afectó el desarrollo de la clase. Agradecemos su apoyo para reforzar el reglamento del aula.',
  },
  {
    id: 'indisciplina-3',
    tipo: 'Indisciplina',
    titulo: 'Plantilla 3',
    texto: 'Se registró una situación seria de indisciplina en clase en la que participó su hijo(a). Le pedimos apoyar para que el alumno retome el respeto y la sana convivencia.',
  },
  {
    id: 'indisciplina-4',
    tipo: 'Indisciplina',
    titulo: 'Plantilla 4',
    texto: 'Hubo una falta de respeto al reglamento de la clase. Le pedimos apoyo para que el/la estudiante reflexione y mejore su conducta.',
  },
];


/** Plantillas del tipo de aviso, en el orden en que se muestran. */
export function templatesByType(tipo: NotificationType): NotificationTemplate[] {
  return NOTIFICATION_TEMPLATES.filter(template => template.tipo === tipo);
}
