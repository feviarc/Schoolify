export interface UserProfile {
  uid: string;
  email: string;
  rol: string;
  activo?: boolean;
  cct?: string;
  celular?: string;
  /** `gid` de los grupos que el maestro decidio seguir (no aplica al prefecto). */
  grupos?: string[];
  id?: string;
  /** Materias que imparte el maestro; alimentan el selector de sus avisos. */
  materias?: string[];
  nombre?: string;
}
