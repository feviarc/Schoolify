import { Injectable } from '@angular/core';

import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';

import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserProfile } from '../models/user-profile.model';


@Injectable({ providedIn: 'root' })
export class UserProfileService {

  constructor(private firestore: Firestore) { }

  async createUserProfile(profile: UserProfile): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${profile.uid}`);
    await setDoc(userDocRef, profile);
  }

  getUserProfile(uid: string): Observable<UserProfile | null> {
    const userDocRef = doc(this.firestore, `usuarios/${uid}`);

    return from(getDoc(userDocRef)).pipe(
      map(docSnap => {
        if(docSnap.exists()) {
          return {id: docSnap.id, ...docSnap.data() as UserProfile};
        }
        else {
          return null;
        }
      })
    );
  }

  async isFirstUser(): Promise<boolean> {
    const usuariosCollectionRef = collection(this.firestore, 'usuarios');
    const querySnapshot = await getDocs(usuariosCollectionRef);
    return querySnapshot.empty;
  }

  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${uid}`);
    try {
     await updateDoc(userDocRef, data);
    } catch(error) {
      console.log('❌ Escuela-MX: [user-profile.service.ts]', error)
    }
  }

  getAllUsers(): Observable<UserProfile[]> {
    const usuariosCollectionRef = collection(this.firestore, 'usuarios');

    return from(getDocs(usuariosCollectionRef)).pipe(
      map(querySnapshot => {
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as UserProfile
        }));
      })
    );
  }

  getUsersByRole(rol: string): Observable<UserProfile[]> {
    return this.getAllUsers().pipe(
      map(users => users.filter(user => user.rol === rol))
    );
  }

  getUsersByRoleAndCCT(rol: string, cct: string) {
    return this.getUsersByRole(rol).pipe(
      map( users => users.filter(user => user.cct === cct))
    );
  }

  async userExists(uid: string): Promise<boolean> {
    const userDocRef = doc(this.firestore, `usuarios/${uid}`);
    const docSnap = await getDoc(userDocRef);
    return docSnap.exists();
  }

  async toggleUserStatus(uid: string, activo: boolean): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${uid}`);
    await updateDoc(userDocRef, { activo });
  }

  async deleteUserProfile(uid: string): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${uid}`);
    await deleteDoc(userDocRef);
  }

  getActiveUsers(): Observable<UserProfile[]> {
    return this.getAllUsers().pipe(
      map(users => users.filter(user => user.activo === true))
    );
  }

  getUsersBySchool(escuela: string): Observable<UserProfile[]> {
    return this.getAllUsers().pipe(
      map(users => users.filter(user =>
        user.escuela?.toLowerCase() === escuela.toLowerCase()
      ))
    );
  }

  searchUsers(searchTerm: string): Observable<UserProfile[]> {
    const term = searchTerm.toLowerCase().trim();

    return this.getAllUsers().pipe(
      map(users => users.filter(user => {
        const nombre = user.nombre?.toLowerCase() || '';
        const email = user.email?.toLowerCase() || '';
        return nombre.includes(term) || email.includes(term);
      }))
    );
  }

  getUserCount(): Observable<number> {
    return this.getAllUsers().pipe(
      map(users => users.length)
    );
  }
}
