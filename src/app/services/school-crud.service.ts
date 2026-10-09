import { Injectable, inject } from '@angular/core';

import {
  addDoc,
  collection,
  collectionData,
  CollectionReference,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import {
  BehaviorSubject,
  from,
  Observable,
  of,
  throwError,
} from 'rxjs';

import {
  catchError,
  map,
  switchMap,
  tap,
} from 'rxjs/operators';


export interface School {
  id?: string;
  cct: string;
  nombre: string;
  pin: number;
  turno: string;
  createdAt?: Date;
  updatedAt?: Date;
}


@Injectable({ providedIn: 'root' })
export class SchoolCRUDService {
  private firestore = inject(Firestore);


  private readonly COLLECTION_NAME = 'escuelas';
  private schoolsCollection: CollectionReference;
  // BehaviorSubject to maintain schools state
  private schoolsSubject = new BehaviorSubject<School[]>([]);
  public schools$ = this.schoolsSubject.asObservable();

  constructor() {
    this.schoolsCollection = collection(this.firestore, this.COLLECTION_NAME);
    // Load schools when service initializes
    this.loadSchools();
  }

  /**
   * Load all schools and update the BehaviorSubject
   * Private method that keeps the state updated
   */
  private loadSchools(): void {
    this.getSchools().subscribe({
      next: (schools) => this.schoolsSubject.next(schools),
      error: (error) => console.error('❌ Schoolify: [school-crud.service.ts]', error)
    });
  }

  /**
   * Add a new school
   * @param school - School data (without id)
   * @returns Observable with the created document ID
   */
  addSchool(school: Omit<School, 'id'>): Observable<string> {
    const schoolWithTimestamps = {
      ...school,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return from(addDoc(this.schoolsCollection, schoolWithTimestamps)).pipe(
      map(docRef => docRef.id),
      tap(id => {
        this.loadSchools(); // Update list
      }),
      catchError(error => {
        console.error('❌ Schoolify: [school-crud.service.ts]', error);
        return throwError(() => new Error('Could not add school'));
      })
    );
  }

  /**
   * Get all schools as Observable
   * Subscribes to real-time changes
   * @returns Observable with array of schools
   */
  getSchools(): Observable<School[]> {
    const q = query(this.schoolsCollection, orderBy('nombre', 'asc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(schools => schools as School[]),
      catchError(error => {
        console.error('❌ Schoolify: [school-crud.service.ts]', error);
        return throwError(() => new Error('Could not get schools'));
      })
    );
  }

  /**
   * Search school by CCT (Clave de Centro de Trabajo)
   * @param cct - Work Center Key
   * @returns Observable with found school or null
   */
  getSchoolByCCT(cct: string): Observable<School | null> {
    const q = query(
      this.schoolsCollection,
      where('cct', '==', cct)
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        if (querySnapshot.empty) {
          return null;
        }
        const doc = querySnapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data()
        } as School;
      }),
      catchError(error => {
        console.error('❌ Schoolify: [school-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Edit/update an existing school
   * @param schoolId - Document ID
   * @param updatedData - Data to update (partial)
   * @returns Observable<void>
   */
  updateSchool(
    schoolId: string,
    updatedData: Partial<Omit<School, 'id' | 'createdAt'>>
  ): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, schoolId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('School does not exist'));
        }

        const dataWithTimestamp = {
          ...updatedData,
          updatedAt: new Date()
        };

        return from(updateDoc(docRef, dataWithTimestamp));
      }),
      tap(() => {
        this.loadSchools(); // Update list
      }),
      catchError(error => {
        console.error('❌ Schoolify: [school-crud.service.ts]', error);
        return throwError(() => new Error('Could not update school'));
      })
    );
  }

  /**
   * Delete a school
   * @param schoolId - Document ID
   * @returns Observable<void>
   */
  deleteSchool(schoolId: string): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, schoolId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('School does not exist'));
        }
        return from(deleteDoc(docRef));
      }),
      tap(() => {
        this.loadSchools(); // Update list
      }),
      catchError(error => {
        console.error('❌ Schoolify: [school-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete school'));
      })
    );
  }

  /**
   * Check if a CCT already exists
   * @param cct - Work Center Key
   * @param excludeId - ID to exclude in search (useful when editing)
   * @returns Observable<boolean>
   */
  cctExists(cct: string, excludeId?: string): Observable<boolean> {
    return this.getSchoolByCCT(cct).pipe(
      map(school => {
        if (!school) {
          return false;
        }
        // If there's an ID to exclude and it matches, then no duplicate exists
        if (excludeId && school.id === excludeId) {
          return false;
        }
        return true;
      })
    );
  }
}
