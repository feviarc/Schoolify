import { Injectable, inject } from '@angular/core';

import {
  collection,
  collectionData,
  doc,
  Firestore,
  getDoc,
  query,
  updateDoc,
  where,
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

  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${uid}`);
    try {
     await updateDoc(userDocRef, data);
    } catch(error) {
      console.log('❌ Schoolify: [user-profile.service.ts]', error)
    }
    this.invalidateProfile(uid);
  }

  /**
   * Compañeros de la misma escuela con el rol indicado.
   *
   * El filtro por `cct` va en la consulta, no en memoria: las reglas acotan la
   * lectura a la propia escuela y rechazan la consulta entera si no la filtra
   * ("las reglas no son filtros"). El rol se filtra despues para no necesitar un
   * indice compuesto (rol, cct).
   */
  getUsersByRoleAndCCT(rol: string, cct: string): Observable<UserProfile[]> {
    const usuariosCollectionRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosCollectionRef, where('cct', '==', cct));

    return collectionData(q, { idField: 'id' }).pipe(
      map(users => (users as UserProfile[]).filter(user => user.rol === rol))
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
