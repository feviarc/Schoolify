import { Injectable, inject } from '@angular/core';

import { Functions, httpsCallable } from '@angular/fire/functions';

import { BehaviorSubject } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class SchoolValidationService {
  private functions = inject(Functions);


  private cctpinValidSource = new BehaviorSubject<boolean>(false);
  cctpinValidSource$ = this.cctpinValidSource.asObservable();

  getValidationStatus(): boolean {
    return this.cctpinValidSource.getValue();
  }

  /**
   * La validacion vive en la funcion `validateSchoolAccess` porque `escuelas` solo
   * lo lee el administrador: el `pin` es la credencial del portal y no puede salir
   * del servidor.
   *
   * El PIN se guarda como number en `escuelas` y la igualdad de Firestore distingue
   * tipos, asi que tiene que viajar como number. El portal lo entrega asi porque
   * `ion-input-otp` usa `type="number"` por defecto y su value accessor aplica
   * parseFloat (null cuando el campo esta vacio). Mandarlo como string haria que la
   * validacion fallara en silencio para todas las escuelas.
   */
  async validateCredentials(cct: string, pin: number): Promise<boolean> {
    try {
      const callable = httpsCallable<{ cct: string; pin: number }, { valid: boolean }>(
        this.functions,
        'validateSchoolAccess'
      );

      const { data } = await callable({ cct, pin });
      const isValid = data?.valid === true;
      this.cctpinValidSource.next(isValid);
      return isValid;

    } catch(error) {
      console.log('❌ Schoolify: [school-validation.service.ts]', error);
      this.cctpinValidSource.next(false);
      return false;
    }
  }
}
