import { Injectable } from '@angular/core';

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

// Interface for Subject model
export interface Subject {
  id?: string;
  nombre: string;
  grado: string;
  selected?: boolean;
}

/**
 * Service to manage CRUD operations for Subjects (Materias)
 * Compatible with Ionic 7 and Angular with Observable support
 */
@Injectable({
  providedIn: 'root'
})

export class SubjectCRUDService {

  private readonly COLLECTION_NAME = 'materias';
  private subjectsCollection: CollectionReference;

  // BehaviorSubject to maintain subjects state
  private subjectsSubject = new BehaviorSubject<Subject[]>([]);
  public subjects$ = this.subjectsSubject.asObservable();

  constructor(private firestore: Firestore) {
    this.subjectsCollection = collection(this.firestore, this.COLLECTION_NAME);
    // Load subjects when service initializes
    this.loadSubjects();
  }

  /**
   * Load all subjects and update the BehaviorSubject
   * Private method that keeps the state updated
   */
  private loadSubjects(): void {
    this.getSubjects().subscribe({
      next: (subjects) => this.subjectsSubject.next(subjects),
      error: (error) => console.error('❌ Escuela-MX: [subject-crud.service.ts]', error)
    });
  }

  /**
   * Add a new subject
   * @param subject - Subject data (without id)
   * @returns Observable with the created document ID
   */
  addSubject(subject: Omit<Subject, 'id'>): Observable<string> {

    return from(addDoc(this.subjectsCollection, subject)).pipe(
      map(docRef => docRef.id),
      tap(id => {
        this.loadSubjects(); // Update list
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not add subject'));
      })
    );
  }

  /**
   * Get all subjects as Observable
   * Subscribes to real-time changes
   * Ordered alphabetically by name
   * @returns Observable with array of subjects
   */
  getSubjects(): Observable<Subject[]> {
    const q = query(this.subjectsCollection, orderBy('nombre', 'asc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(subjects => subjects as Subject[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not get subjects'));
      })
    );
  }

  /**
   * Get all subjects (one-time snapshot, not real-time)
   * @returns Observable with array of subjects
   */
  getSubjectsSnapshot(): Observable<Subject[]> {
    const q = query(this.subjectsCollection, orderBy('nombre', 'asc'));

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const subjects: Subject[] = [];
        querySnapshot.forEach(doc => {
          subjects.push({
            id: doc.id,
            ...doc.data()
          } as Subject);
        });
        return subjects;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not get subjects'));
      })
    );
  }

  /**
   * Get subjects by grade (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param grado - Grade level
   * @returns Observable with array of subjects for the specified grade
   */
  getSubjectsByGrade(grado: string): Observable<Subject[]> {
    const q = query(
      this.subjectsCollection,
      where('grado', '==', grado),
      orderBy('nombre', 'asc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(subjects => subjects as Subject[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not get subjects by grade'));
      })
    );
  }

  /**
   * Get subjects by grade (one-time snapshot, not real-time)
   * @param grado - Grade level
   * @returns Observable with array of subjects for the specified grade
   */
  getSubjectsByGradeSnapshot(grado: string): Observable<Subject[]> {
    const q = query(
      this.subjectsCollection,
      where('grado', '==', grado),
      orderBy('nombre', 'asc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const subjects: Subject[] = [];
        querySnapshot.forEach(doc => {
          subjects.push({
            id: doc.id,
            ...doc.data()
          } as Subject);
        });
        return subjects;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not get subjects by grade'));
      })
    );
  }

  /**
   * Search subject by name (exact match)
   * @param nombre - Subject name
   * @returns Observable with subject or null
   */
  getSubjectByName(nombre: string): Observable<Subject | null> {
    const q = query(
      this.subjectsCollection,
      where('nombre', '==', nombre)
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
        } as Subject;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Edit/update an existing subject
   * @param subjectId - Document ID
   * @param updatedData - Data to update (partial)
   * @returns Observable<void>
   */
  updateSubject(
    subjectId: string,
    updatedData: Partial<Omit<Subject, 'id' | 'createdAt'>>
  ): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, subjectId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Subject does not exist'));
        }

        const dataWithTimestamp = {
          ...updatedData,
          updatedAt: new Date()
        };

        return from(updateDoc(docRef, dataWithTimestamp));
      }),
      tap(() => {
        this.loadSubjects(); // Update list
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not update subject'));
      })
    );
  }

  /**
   * Delete a subject
   * @param subjectId - Document ID
   * @returns Observable<void>
   */
  deleteSubject(subjectId: string): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, subjectId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Subject does not exist'));
        }
        return from(deleteDoc(docRef));
      }),
      tap(() => {
        this.loadSubjects(); // Update list
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete subject'));
      })
    );
  }

  /**
   * Check if a subject with specific name already exists
   * @param nombre - Subject name
   * @param excludeId - ID to exclude in search (useful when editing)
   * @returns Observable<boolean>
   */
  subjectExists(nombre: string, excludeId?: string): Observable<boolean> {
    return this.getSubjectByName(nombre).pipe(
      map(subject => {
        if (!subject) {
          return false;
        }
        // If there's an ID to exclude and it matches, then no duplicate exists
        if (excludeId && subject.id === excludeId) {
          return false;
        }
        return true;
      })
    );
  }

  /**
   * Search subjects by name (partial search)
   * @param searchTerm - Search term
   * @returns Observable with array of matching subjects
   */
  searchSubjectsByName(searchTerm: string): Observable<Subject[]> {
    return this.getSubjectsSnapshot().pipe(
      map(subjects => {
        const termLowerCase = searchTerm.toLowerCase();
        return subjects.filter(subject =>
          subject.nombre.toLowerCase().includes(termLowerCase)
        );
      })
    );
  }

  /**
   * Count total registered subjects
   * @returns Observable<number>
   */
  countSubjects(): Observable<number> {
    return from(getDocs(this.subjectsCollection)).pipe(
      map(querySnapshot => querySnapshot.size),
      catchError(error => {
        console.error('❌ Escuela-MX: [subject-crud.service.ts]', error);
        return of(0);
      })
    );
  }

  /**
   * Manually refresh subjects list
   * Useful to force an update
   */
  refreshSubjects(): void {
    this.loadSubjects();
  }

  /**
   * Get current subjects value without subscription
   * @returns Current array of subjects
   */
  getCurrentSubjects(): Subject[] {
    return this.subjectsSubject.value;
  }
}
