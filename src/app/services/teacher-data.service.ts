import { Injectable } from '@angular/core';
import {
  collection,
  collectionData,
  doc,
  Firestore,
  query,
  setDoc,
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

  async createTeacherProfile(userProfile: UserProfile): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${userProfile.uid}`);
    await setDoc(userDocRef, userProfile);
  }

}
