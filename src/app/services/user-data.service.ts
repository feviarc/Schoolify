import { Injectable, inject } from '@angular/core';

import {
  collection,
  collectionData,
  Firestore,
} from '@angular/fire/firestore';

import { Observable } from 'rxjs';
import { UserProfile } from '../models/user-profile.model';


@Injectable({ providedIn: 'root' })
export class UserDataService {
  private firestore = inject(Firestore);


  /**
   * Todos los usuarios de la base (maestros, tutores y administradores).
   *
   * El panel los necesita a los tres: si alguien se registró con el rol
   * equivocado, solo se puede corregir si aparece en la lista.
   */
  getUsers(): Observable<UserProfile[]> {
    const usersRef = collection(this.firestore, 'usuarios');

    return collectionData(usersRef, {idField: 'id'}) as Observable<UserProfile[]>;
  }
}
