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
  orderBy,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

import {
  BehaviorSubject,
  Observable,
} from 'rxjs';

import {
  catchError,
  map,
} from 'rxjs/operators';


// ==================== INTERFACES ====================

/**
 * Student model (Alumno)
 */
export interface Student {
  id?: string; // Autogenerado por Firestore
  gid?: string; // ID del grupo (opcional, se asigna después)
  tid?: string; // ID del tutor (opcional, se asigna después)
  validado?: boolean;
  nombre: string; // Requerido en creación
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombreCompleto: string;
  nombreTutor?: string;
  createdAt?: Date;
  updatedAt?: Date;
}


// ==================== SERVICE ====================

/**
 * Service to manage CRUD operations for Students (Alumnos)
 */
@Injectable({
  providedIn: 'root'
})

export class StudentCRUDService {

  private readonly STUDENTS_COLLECTION = 'alumnos';
  private studentsCollection: CollectionReference;

  // BehaviorSubject to maintain students state
  private studentsSubject = new BehaviorSubject<Student[]>([]);

  /**
   * Observable stream of all students (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   */
  public students$ = this.studentsSubject.asObservable();

  constructor(private firestore: Firestore) {
    this.studentsCollection = collection(this.firestore, this.STUDENTS_COLLECTION);
    this.loadStudents();
  }

  /**
   * Load all students and update BehaviorSubject
   */
  private loadStudents(): void {
    this.getStudents().subscribe({
      next: (students) => this.studentsSubject.next(students),
      error: (error) => console.error('❌ Escuela-MX: [student-crud.service.ts]', error)
    });
  }

  // ==================== STUDENTS CRUD (CREATE) ====================

  /**
   * Add a new student (only nombre is required)
   * @param nombre - Student name
   * @returns Promise with the created student ID
   */
  async addStudent(student: Student): Promise<string> {
    try {
      const timeStamp = {
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const studentData = {...timeStamp, ...student};
      const docRef = await addDoc(this.studentsCollection, studentData);
      this.loadStudents(); // Refresh list

      return docRef.id;

    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      throw new Error('Could not add student');
    }
  }

  // ==================== STUDENTS CRUD (READ) ====================

  /**
   * Get all students (real-time)
   * Ordered by nombre
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @returns Observable with array of students
   */
  getStudents(): Observable<Student[]> {
    const q = query(this.studentsCollection, orderBy('nombre', 'asc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(students => students as Student[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get all students (snapshot - one-time read)
   * @returns Promise with array of students
   */
  async getStudentsSnapshot(): Promise<Student[]> {
    try {
      const q = query(this.studentsCollection, orderBy('nombre', 'asc'));
      const querySnapshot = await getDocs(q);

      const students: Student[] = [];
      querySnapshot.forEach(doc => {
        students.push({
          id: doc.id,
          ...doc.data()
        } as Student);
      });

      return students;
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      throw new Error('Could not get students');
    }
  }

  /**
   * Get a student by ID (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param id - Student ID
   * @returns Observable with student data
   */
  getStudentById(id: string): Observable<Student | null> {
    const docRef = doc(this.firestore, this.STUDENTS_COLLECTION, id) as DocumentReference;

    return docData(docRef, { idField: 'id' }).pipe(
      map(data => data ? data as Student : null),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get a student by ID (snapshot - one-time read)
   * @param id - Student ID
   * @returns Promise with student data or null
   */
  async getStudentByIdSnapshot(id: string): Promise<Student | null> {
    try {
      const docRef = doc(this.firestore, this.STUDENTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as Student;
      }
      return null;
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      throw error;
    }
  }

  /**
   * Get students by tutor ID
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param tid - Tutor ID
   * @returns Observable with array of students
   */
  getStudentsByTutor(tid: string): Observable<Student[]> {
    const q = query(
      this.studentsCollection,
      where('tid', '==', tid),
      orderBy('nombre', 'asc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(students => students as Student[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get students by group ID
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param gid - Group ID
   * @returns Observable with array of students
   */
  getStudentsByGroup(gid: string): Observable<Student[]> {
    const q = query(
      this.studentsCollection,
      where('gid', '==', gid),
      orderBy('nombre', 'asc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(students => students as Student[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get students by group ID
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param cct - School CCT
   * @returns Observable with array of students
   */
  getStudentsByCCT(cct: string): Observable<Student[]> {
    const q = query(
      this.studentsCollection,
      where('cct', '==', cct),
      orderBy('nombre', 'asc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(students => students as Student[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get students with group assigned filtered by CCT (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param cct - School CCT
   * @returns Observable with array of students that have gid
   */
  getStudentsWithGroupByCCT(cct: string): Observable<Student[]> {
    return this.getStudentsByCCT(cct).pipe(
      map(students => students.filter(s => s.gid))
    );
  }

  /**
   * Get students without group assigned filtered by CCT (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param cct - School CCT
   * @returns Observable with array of students that don't have gid
   */
  getStudentsWithoutGroupByCCT(cct: string): Observable<Student[]> {
    return this.getStudentsByCCT(cct).pipe(
      map(students => students.filter(s => !s.gid))
    );
  }

  /**
   * Get students without tutor assigned filtered by CCT (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param cct - School CCT
   * @returns Observable with array of students without tid
   */
  getStudentsWithoutTutorByCCT(cct: string): Observable<Student[]> {
    return this.getStudentsByCCT(cct).pipe(
      map(students => students.filter(s => !s.tid))
    );
  }

  /**
   * Get students without tutor assigned filtered by CCT (snapshot - one-time read)
   * ⚠️ NO REQUIERE UNSUBSCRIBE (se completa automáticamente)
   * @param cct - School CCT
   * @returns Promise with array of students without tid
   */
  async getStudentsWithoutTutorByCCTSnapshot(cct: string): Promise<Student[]> {
    try {
      const q = query(
        this.studentsCollection,
        where('cct', '==', cct),
        orderBy('nombre', 'asc')
      );
      const querySnapshot = await getDocs(q);

      const students: Student[] = [];
      querySnapshot.forEach(doc => {
        const student = {
          id: doc.id,
          ...doc.data()
        } as Student;

        // Filtrar solo estudiantes sin tutor
        if (!student.tid) {
          students.push(student);
        }
      });

      return students;
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      throw new Error('Could not get students without tutor');
    }
  }

  /**
   * Get students without tutor assigned
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @returns Observable with array of students without tid
   */
  getStudentsWithoutTutor(): Observable<Student[]> {
    return this.getStudents().pipe(
      map(students => students.filter(s => !s.tid))
    );
  }

  /**
   * Get students without group assigned
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @returns Observable with array of students without gid
   */
  getStudentsWithoutGroup(): Observable<Student[]> {
    return this.getStudents().pipe(
      map(students => students.filter(s => !s.gid))
    );
  }

  /**
   * Check if a student exists
   * @param id - Student ID
   * @returns Promise<boolean>
   */
  async studentExists(id: string): Promise<boolean> {
    try {
      const docRef = doc(this.firestore, this.STUDENTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      return false;
    }
  }

  // ==================== STUDENTS CRUD (UPDATE) ====================

  /**
   * Update a student
   * @param id - Student ID
   * @param data - Partial data to update
   * @returns Promise<void>
   */
  async updateStudent(id: string, data: Partial<Omit<Student, 'id' | 'createdAt'>>): Promise<void> {
    try {
      const docRef = doc(this.firestore, this.STUDENTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Student does not exist');
      }

      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      await updateDoc(docRef, updateData);
      this.loadStudents(); // Refresh list
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      throw new Error('Could not update student');
    }
  }

  /**
   * Assign a tutor to a student
   * @param studentId - Student ID
   * @param tutorId - Tutor ID
   * @param tutorName - Tutor Name
   * @returns Promise<void>
   */
  async assignTutor(studentId: string, tutorId: string, tutorName: string): Promise<void> {
    await this.updateStudent(studentId, { tid: tutorId, nombreTutor: tutorName });
  }

  /**
   * Validate notifications for a specific student
   * @param studentId - Student ID
   * @param validation - Validation Request
   * @returns Promise<void>
   */
  async validateStudentNotifications(studentId: string, validation: boolean): Promise<void> {
    await this.updateStudent(studentId, { validado: validation });
  }

  /**
   * Assign a group to a student
   * @param studentId - Student ID
   * @param groupId - Group ID
   * @returns Promise<void>
   */
  async assignGroup(studentId: string, groupId: string): Promise<void> {
    await this.updateStudent(studentId, { gid: groupId });
  }

  /**
   * Remove tutor from student
   * @param studentId - Student ID
   * @returns Promise<void>
   */
  async removeTutor(studentId: string): Promise<void> {
    await this.updateStudent(studentId, { tid: '', nombreTutor: '' });
  }

  /**
   * Remove group from student
   * @param studentId - Student ID
   * @returns Promise<void>
   */
  async removeGroup(studentId: string): Promise<void> {
    await this.updateStudent(studentId, { gid: '' });
  }

  // ==================== STUDENTS CRUD (DELETE) ====================

  /**
   * Delete a student
   * @param id - Student ID
   * @returns Promise<void>
   */
  async deleteStudent(id: string): Promise<void> {
    try {
      const docRef = doc(this.firestore, this.STUDENTS_COLLECTION, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('Student does not exist');
      }

      // Delete student
      await deleteDoc(docRef);
      this.loadStudents(); // Refresh list
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      throw new Error('Could not delete student');
    }
  }


  // ==================== UTILITY METHODS ====================

  /**
   * Count total students
   * @returns Promise<number>
   */
  async countStudents(): Promise<number> {
    try {
      const querySnapshot = await getDocs(this.studentsCollection);
      return querySnapshot.size;
    } catch (error) {
      console.error('❌ Escuela-MX: [student-crud.service.ts]', error);
      return 0;
    }
  }

  /**
   * Get current students value without subscription
   * @returns Current array of students
   */
  getCurrentStudents(): Student[] {
    return this.studentsSubject.value;
  }

  /**
   * Manually refresh students list
   */
  refreshStudents(): void {
    this.loadStudents();
  }
}
