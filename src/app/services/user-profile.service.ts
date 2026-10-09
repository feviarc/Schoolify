import { Injectable, inject } from '@angular/core';

import {
  collection,
  doc,
  Firestore,
  getDoc,
  getDocs,
  updateDoc,
} from '@angular/fire/firestore';

import { from, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { UserProfile } from '../models/user-profile.model';


/** Ventana en la que un perfil leido se reutiliza antes de volver a Firestore. */
const PROFILE_CACHE_TTL_MS = 60_000;


@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private firestore = inject(Firestore);


  private readonly profileCache = new Map<string, { profile: UserProfile | null; expiresAt: number }>();

  getUserProfile(uid: string, forceRefresh = false): Observable<UserProfile | null> {
    if(!forceRefresh) {
      const cached = this.profileCache.get(uid);

      if(cached && cached.expiresAt > Date.now()) {
        return of(cached.profile);
      }
    }

    return this.fetchProfile(uid).pipe(
      tap(profile => {
        this.profileCache.set(uid, {
          profile,
          expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
        });
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
      console.log('❌ Schoolify: [user-profile.service.ts]', error)
    }
    this.invalidateProfile(uid);
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

  /**
   * Lectura real a Firestore, sin cache. `protected` es una costura deliberada:
   * permite sustituirla en el spec sin mockear `getDoc`, que es una funcion de
   * modulo. La politica de cache vive en `getUserProfile`, no aqui.
   */
  protected fetchProfile(uid: string): Observable<UserProfile | null> {
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

  private invalidateProfile(uid: string): void {
    this.profileCache.delete(uid);
  }
}
