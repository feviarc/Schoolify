import { Injectable } from '@angular/core';

import {
  collection,
  collectionData,
  Firestore,
  query,
  where,
} from '@angular/fire/firestore';

import { Observable } from 'rxjs';
import { UserProfile } from '../models/user-profile.model';


@Injectable({ providedIn: 'root' })
export class TeacherDataService {

  constructor(private firestore: Firestore) {}

  getTeachers(): Observable<UserProfile[]> {
    const usersRef = collection(this.firestore, 'usuarios');
    const q = query(usersRef, where('rol', '==', 'maestro'));
    return collectionData(q, {idField: 'id'}) as Observable<UserProfile[]>;
  }
}
