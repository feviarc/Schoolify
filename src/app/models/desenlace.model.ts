/** Desenlace disciplinario del alumno para el ciclo. */
export type DesenlaceTipo = 'expulsion_temporal' | 'baja_definitiva';

export interface StudentDesenlace {
  tipo: DesenlaceTipo;
  inicio?: string | null;
  fin?: string | null;
  actualizadoEn?: Date;
  por?: string;
}
