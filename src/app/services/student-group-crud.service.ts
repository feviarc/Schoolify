import { Injectable, inject } from '@angular/core';

import {
  collection,
  collectionData,
  CollectionReference,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from '@angular/fire/firestore';

import {
  from,
  Observable,
  throwError,
} from 'rxjs';

import {
  catchError,
  map,
  switchMap,
} from 'rxjs/operators';

// ==================== INTERFACES ====================

/**
 * Student model (alumno)
 * El ID viene de otra colección (ej: usuarios)
 */
export interface Student {
  id: string; // ID del alumno desde colección usuarios (OBLIGATORIO)
  nombre: string;
  tid: string; // ID del tutor
}

/**
 * Student Group model (grupo de alumnos)
 * alumnos es un ARRAY dentro del documento
 */
export interface StudentGroup {
  gid: string; // ✅ Ahora es OBLIGATORIO (ID del documento en Firestore)
  cct: string; // Clave del centro de trabajo
  grado: string;
  letra: string;
  alumnos: Student[]; // ✅ ARRAY de alumnos
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Student input for adding to a group
 * El ID debe venir de la colección de usuarios existente
 */
export interface StudentInput {
  id: string; // ID existente del alumno (OBLIGATORIO)
  nombre: string;
  tid: string;
}

// ==================== SERVICE ====================

/**
 * Service to manage CRUD operations for Student Groups (Grupos de Alumnos)
 * Structure: grupos_de_alumnos/{gid} with alumnos as ARRAY
 * Compatible with Ionic 7 and Angular with Observable support
 */
@Injectable({
  providedIn: 'root'
})
export class StudentGroupCRUDService {
  private firestore = inject(Firestore);


  private readonly COLLECTION_NAME = 'grupos_de_alumnos';
  private studentGroupsCollection: CollectionReference;

  constructor() {
    this.studentGroupsCollection = collection(this.firestore, this.COLLECTION_NAME);
  }

  // ==================== CREATE ====================

  /**
   * Add a new student group with specific gid
   * @param group - Student group data WITH gid
   * @returns Observable<void>
   */
  addStudentGroup(group: StudentGroup): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, group.gid);

    // ✅ Verificar primero si ya existe
    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (docSnap.exists()) {
          return throwError(() => new Error(`Group with gid "${group.gid}" already exists`));
        }

        const groupWithTimestamps = {
          ...group,
          alumnos: group.alumnos || [],
          createdAt: new Date(),
          updatedAt: new Date()
        };

        return from(setDoc(docRef, groupWithTimestamps));
      }),
      catchError(error => {
        console.error('❌ Schoolify: [student-group-crud.service.ts]', error);
        return throwError(() => new Error(error.message || 'Could not add student group'));
      })
    );
  }

  // ==================== READ ====================

  /**
   * Get student groups by CCT (real-time)
   * @param cct - Clave del Centro de Trabajo
   * @returns Observable with array of student groups that updates automatically
   */
  getStudentGroupsByCCT(cct: string): Observable<StudentGroup[]> {
    const q = query(
      this.studentGroupsCollection,
      where('cct', '==', cct),
      orderBy('grado', 'asc'),
      orderBy('letra', 'asc')
    );

    return new Observable<StudentGroup[]>(observer => {
      const unsubscribe = onSnapshot(q,
        (querySnapshot) => {
          const groups: StudentGroup[] = [];
          querySnapshot.forEach(doc => {
            groups.push({
              gid: doc.id,
              ...doc.data()
            } as StudentGroup);
          });
          observer.next(groups);
        },
        (error) => {
          console.error('❌ Schoolify: [student-group-crud.service.ts]', error);
          observer.next([]); // Emitir array vacío en caso de error
        }
      );

      // Cleanup: se ejecuta cuando el componente se destruye
      return () => unsubscribe();
    });
  }

  // ==================== UPDATE ====================

  // ==================== DELETE ====================

  /**
   * Delete a student group
   * @param gid - Group ID
   * @returns Observable<void>
   */
  deleteStudentGroup(gid: string): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, gid);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Student group does not exist'));
        }
        return from(deleteDoc(docRef));
      }),
      catchError(error => {
        console.error('❌ Schoolify: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete student group'));
      })
    );
  }

  // ==================== UTILITY METHODS ====================

}

