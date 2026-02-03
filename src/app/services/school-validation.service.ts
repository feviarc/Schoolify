import { Injectable } from '@angular/core';

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

  private readonly COLLECTION_NAME = 'escuelas';
  private collectionRef: CollectionReference;
  private cctpinValidSource = new BehaviorSubject<boolean>(false);
  cctpinValidSource$ = this.cctpinValidSource.asObservable();

  constructor(private firestore: Firestore) {
    this.collectionRef = collection(this.firestore, this.COLLECTION_NAME);
  }

  getValidationStatus(): boolean {
    return this.cctpinValidSource.getValue();
  }

  async validateCredentials(cct: string, pin: string): Promise<boolean> {
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
      console.log('❌ Escuela-MX: [school-validation.service.ts]', error);
      this.cctpinValidSource.next(false);
      return false;
    }
  }
}
