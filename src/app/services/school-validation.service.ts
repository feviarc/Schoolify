import { Injectable, inject } from '@angular/core';

import {
  collection,
  CollectionReference,
  getDocs,
  Firestore,
  query,
  where,
} from '@angular/fire/firestore';

import { BehaviorSubject } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class SchoolValidationService {
  private firestore = inject(Firestore);


  private readonly COLLECTION_NAME = 'escuelas';
  private collectionRef: CollectionReference;
  private cctpinValidSource = new BehaviorSubject<boolean>(false);
  cctpinValidSource$ = this.cctpinValidSource.asObservable();

  constructor() {
    this.collectionRef = collection(this.firestore, this.COLLECTION_NAME);
  }

  getValidationStatus(): boolean {
    return this.cctpinValidSource.getValue();
  }

  /**
   * El PIN se guarda como number en `escuelas` (ver `School.pin`) y la igualdad de
   * Firestore distingue tipos, asi que la consulta TIENE que ser numerica.
   * El portal entrega un number porque `ion-input-otp` usa `type="number"` por
   * defecto y su value accessor aplica parseFloat (null cuando el campo esta vacio).
   * Pasar un string aqui rompe la validacion de todas las escuelas en silencio.
   */
  async validateCredentials(cct: string, pin: number): Promise<boolean> {
    const q = query(
      this.collectionRef,
      where('cct', '==', cct),
      where('pin', '==', pin)
    );

    try {
      const querySnapshot = await getDocs(q);
      const isValid = !querySnapshot.empty;
      this.cctpinValidSource.next(isValid);
      return isValid;

    } catch(error) {
      console.log('❌ Schoolify: [school-validation.service.ts]', error);
      this.cctpinValidSource.next(false);
      return false;
    }
  }
}
