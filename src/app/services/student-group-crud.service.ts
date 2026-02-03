import { Injectable } from '@angular/core';

import {
  addDoc,
  collection,
  collectionData,
  CollectionReference,
  deleteDoc,
  doc,
  docData,
  DocumentReference,
  Firestore,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
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

  private readonly COLLECTION_NAME = 'grupos_de_alumnos';
  private studentGroupsCollection: CollectionReference;

  // BehaviorSubject to maintain student groups state
  private studentGroupsSubject = new BehaviorSubject<StudentGroup[]>([]);
  public studentGroups$ = this.studentGroupsSubject.asObservable();

  constructor(private firestore: Firestore) {
    this.studentGroupsCollection = collection(this.firestore, this.COLLECTION_NAME);
    // Load student groups when service initializes
    this.loadStudentGroups();
  }

  /**
   * Load all student groups and update the BehaviorSubject
   */
  private loadStudentGroups(): void {
    this.getStudentGroups().subscribe({
      next: (groups) => this.studentGroupsSubject.next(groups),
      error: (error) => console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error)
    });
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
      tap(() => {
        this.loadStudentGroups();
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error(error.message || 'Could not add student group'));
      })
    );
  }

  /**
   * Add a student to a group
   * @param gid - Group ID
   * @param student - Student data with existing ID from usuarios collection
   * @returns Observable<void>
   */
  addStudentToGroup(gid: string, student: StudentInput): Observable<void> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      switchMap(group => {
        if (!group) {
          return throwError(() => new Error('Student group does not exist'));
        }

        // Verificar si el alumno ya está en el grupo
        const studentExists = group.alumnos.some(s => s.id === student.id);
        if (studentExists) {
          return throwError(() => new Error('Student already exists in this group'));
        }

        // Agregar alumno con su ID existente al array
        const newStudent: Student = {
          id: student.id, // ✅ Usar ID existente de usuarios
          nombre: student.nombre,
          tid: student.tid
        };

        const updatedAlumnos = [...group.alumnos, newStudent];

        return this.updateStudentGroup(gid, { alumnos: updatedAlumnos });
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error(error.message || 'Could not add student to group'));
      })
    );
  }

  /**
   * Add multiple students to a group (batch operation)
   * @param gid - Group ID
   * @param students - Array of students with existing IDs
   * @returns Observable<void>
   */
  addMultipleStudentsToGroup(gid: string, students: StudentInput[]): Observable<void> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      switchMap(group => {
        if (!group) {
          return throwError(() => new Error('Student group does not exist'));
        }

        // Filtrar alumnos que ya existen en el grupo
        const existingIds = new Set(group.alumnos.map(s => s.id));
        const newStudents: Student[] = students
          .filter(s => !existingIds.has(s.id))
          .map(s => ({
            id: s.id,
            nombre: s.nombre,
            tid: s.tid
          }));

        if (newStudents.length === 0) {
          return throwError(() => new Error('All students already exist in the group'));
        }

        const updatedAlumnos = [...group.alumnos, ...newStudents];

        return this.updateStudentGroup(gid, { alumnos: updatedAlumnos });
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not add students to group'));
      })
    );
  }

  // ==================== READ ====================

  /**
   * Get all student groups (real-time)
   * Ordered by grado and letra
   * @returns Observable with array of student groups
   */
  getStudentGroups(): Observable<StudentGroup[]> {
    const q = query(
      this.studentGroupsCollection,
      orderBy('grado', 'asc'),
      orderBy('letra', 'asc')
    );

    return collectionData(q, { idField: 'gid' }).pipe(
      map(groups => groups as StudentGroup[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not get student groups'));
      })
    );
  }

  /**
   * Get all student groups (snapshot)
   * @returns Observable with array of student groups
   */
  getStudentGroupsSnapshot(): Observable<StudentGroup[]> {
    const q = query(
      this.studentGroupsCollection,
      orderBy('grado', 'asc'),
      orderBy('letra', 'asc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const groups: StudentGroup[] = [];
        querySnapshot.forEach(doc => {
          groups.push({
            gid: doc.id,
            ...doc.data()
          } as StudentGroup);
        });
        return groups;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not get student groups'));
      })
    );
  }

  /**
   * Get a student group by ID (real-time)
   * @param gid - Group ID
   * @returns Observable with student group data (includes alumnos array)
   */
  getStudentGroupById(gid: string): Observable<StudentGroup | null> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, gid) as DocumentReference;

    return docData(docRef, { idField: 'gid' }).pipe(
      map(data => data ? data as StudentGroup : null),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Get a student group by ID (snapshot)
   * @param gid - Group ID
   * @returns Observable with student group data or null
   */
  getStudentGroupByIdSnapshot(gid: string): Observable<StudentGroup | null> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, gid);

    return from(getDoc(docRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          return {
            gid: docSnap.id,
            ...docSnap.data()
          } as StudentGroup;
        }
        return null;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return of(null);
      })
    );
  }

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
          console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
          observer.next([]); // Emitir array vacío en caso de error
        }
      );

      // Cleanup: se ejecuta cuando el componente se destruye
      return () => unsubscribe();
    });
  }

  /**
   * Get student groups by CCT (snapshot)
   * @param cct - Clave del Centro de Trabajo
   * @returns Observable with array of student groups
   */
  getStudentGroupsByCCTSnapshot(cct: string): Observable<StudentGroup[]> {
    const q = query(
      this.studentGroupsCollection,
      where('cct', '==', cct),
      orderBy('grado', 'asc'),
      orderBy('letra', 'asc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const groups: StudentGroup[] = [];
        querySnapshot.forEach(doc => {
          groups.push({
            gid: doc.id,
            ...doc.data()
          } as StudentGroup);
        });
        return groups;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return of([]);
      })
    );
  }

  /**
   * Get a specific student group by gid and cct
   * @param gid - Group ID
   * @param cct - CCT
   * @returns Observable with student group or null
   */
  getStudentGroupByGidAndCCT(gid: string, cct: string): Observable<StudentGroup | null> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      map(group => {
        if (!group) return null;
        return group.cct === cct ? group : null;
      })
    );
  }

  /**
   * Check if a student group exists by gid
   * @param gid - Group ID to check
   * @returns Observable<boolean>
   */
  studentGroupExists(gid: string): Observable<boolean> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, gid);

    return from(getDoc(docRef)).pipe(
      map(docSnap => docSnap.exists()),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return of(false);
      })
    );
  }

  /**
   * Get a student from a group by student ID
   * @param gid - Group ID
   * @param studentId - Student ID (from usuarios collection)
   * @returns Observable with student or null
   */
  getStudentFromGroup(gid: string, studentId: string): Observable<Student | null> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      map(group => {
        if (!group) return null;
        const student = group.alumnos.find(s => s.id === studentId);
        return student || null;
      })
    );
  }

  /**
   * Check if a student is in a group
   * @param gid - Group ID
   * @param studentId - Student ID from usuarios collection
   * @returns Observable<boolean>
   */
  isStudentInGroup(gid: string, studentId: string): Observable<boolean> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      map(group => {
        if (!group) return false;
        return group.alumnos.some(s => s.id === studentId);
      })
    );
  }

  // ==================== UPDATE ====================

  /**
   * Update a student group
   * @param gid - Group ID
   * @param updatedData - Data to update (partial)
   * @returns Observable<void>
   */
  updateStudentGroup(
    gid: string,
    updatedData: Partial<Omit<StudentGroup, 'gid' | 'createdAt'>>
  ): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, gid);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Student group does not exist'));
        }

        const dataWithTimestamp = {
          ...updatedData,
          updatedAt: new Date()
        };

        return from(updateDoc(docRef, dataWithTimestamp));
      }),
      tap(() => {
        this.loadStudentGroups();
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not update student group'));
      })
    );
  }

  /**
   * Update a student within a group (in the array)
   * @param gid - Group ID
   * @param studentId - Student ID
   * @param updatedData - Student data to update
   * @returns Observable<void>
   */
  updateStudentInGroup(
    gid: string,
    studentId: string,
    updatedData: Partial<Omit<Student, 'id'>>
  ): Observable<void> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      switchMap(group => {
        if (!group) {
          return throwError(() => new Error('Student group does not exist'));
        }

        const studentIndex = group.alumnos.findIndex(s => s.id === studentId);
        if (studentIndex === -1) {
          return throwError(() => new Error('Student not found in group'));
        }

        const updatedAlumnos = [...group.alumnos];
        updatedAlumnos[studentIndex] = {
          ...updatedAlumnos[studentIndex],
          ...updatedData
        };

        return this.updateStudentGroup(gid, { alumnos: updatedAlumnos });
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not update student in group'));
      })
    );
  }

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
      tap(() => {
        this.loadStudentGroups();
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete student group'));
      })
    );
  }

  /**
   * Remove a student from a group (from the array)
   * @param gid - Group ID
   * @param studentId - Student ID
   * @returns Observable<void>
   */
  removeStudentFromGroup(gid: string, studentId: string): Observable<void> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      switchMap(group => {
        if (!group) {
          return throwError(() => new Error('Student group does not exist'));
        }

        const updatedAlumnos = group.alumnos.filter(s => s.id !== studentId);

        if (updatedAlumnos.length === group.alumnos.length) {
          return throwError(() => new Error('Student not found in group'));
        }

        return this.updateStudentGroup(gid, { alumnos: updatedAlumnos });
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return throwError(() => new Error('Could not remove student from group'));
      })
    );
  }

  /**
   * Remove all students from a group (clear array)
   * @param gid - Group ID
   * @returns Observable<void>
   */
  clearStudentsFromGroup(gid: string): Observable<void> {
    return this.updateStudentGroup(gid, { alumnos: [] });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Count students in a group
   * @param gid - Group ID
   * @returns Observable<number>
   */
  countStudentsInGroup(gid: string): Observable<number> {
    return this.getStudentGroupByIdSnapshot(gid).pipe(
      map(group => group ? group.alumnos.length : 0)
    );
  }

  /**
   * Count total student groups
   * @returns Observable<number>
   */
  countStudentGroups(): Observable<number> {
    return from(getDocs(this.studentGroupsCollection)).pipe(
      map(querySnapshot => querySnapshot.size),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return of(0);
      })
    );
  }

  /**
   * Search student groups by grade (grado)
   * @param grado - Grade
   * @returns Observable with array of student groups
   */
  getStudentGroupsByGrade(grado: string): Observable<StudentGroup[]> {
    const q = query(
      this.studentGroupsCollection,
      where('grado', '==', grado),
      orderBy('letra', 'asc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const groups: StudentGroup[] = [];
        querySnapshot.forEach(doc => {
          groups.push({
            gid: doc.id,
            ...doc.data()
          } as StudentGroup);
        });
        return groups;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-group-crud.service.ts]', error);
        return of([]);
      })
    );
  }

  /**
   * Get current student groups value without subscription
   * @returns Current array of student groups
   */
  getCurrentStudentGroups(): StudentGroup[] {
    return this.studentGroupsSubject.value;
  }

  /**
   * Manually refresh student groups list
   */
  refreshStudentGroups(): void {
    this.loadStudentGroups();
  }
}

