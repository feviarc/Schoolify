import { Injectable, inject } from '@angular/core';
import { doc, Firestore, getDoc } from '@angular/fire/firestore';

/**
 * Configuracion global de la escuela. Hoy solo el ciclo escolar, que se puede
 * cambiar desde la consola (`configuracion/general`).
 */
@Injectable({
  providedIn: 'root'
})
export class SchoolConfigService {
  private firestore = inject(Firestore);

  private readonly DEFAULT_CICLO = '2026-2027';
  private ciclo = this.DEFAULT_CICLO;
  private loaded = false;

  async getCiclo(): Promise<string> {
    if(this.loaded) {
      return this.ciclo;
    }

    try {
      const snapshot = await getDoc(doc(this.firestore, 'configuracion', 'general'));
      this.ciclo = snapshot.exists()
        ? String(snapshot.data()['ciclo'] ?? this.DEFAULT_CICLO)
        : this.DEFAULT_CICLO;
    } catch(error) {
      console.log('❌ Schoolify: [school-config.service.ts]', error);
      this.ciclo = this.DEFAULT_CICLO;
    }

    this.loaded = true;

    return this.ciclo;
  }
}
