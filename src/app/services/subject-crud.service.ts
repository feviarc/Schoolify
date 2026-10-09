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
} from '@angular/fire/firestore';

import {
  BehaviorSubject,
  from,
  Observable,
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
  private firestore = inject(Firestore);


  private readonly COLLECTION_NAME = 'materias';
  private subjectsCollection: CollectionReference;

  // BehaviorSubject to maintain subjects state
  private subjectsSubject = new BehaviorSubject<Subject[]>([]);
  public subjects$ = this.subjectsSubject.asObservable();

  constructor() {
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
      error: (error) => console.error('❌ Schoolify: [subject-crud.service.ts]', error)
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
        console.error('❌ Schoolify: [subject-crud.service.ts]', error);
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
        console.error('❌ Schoolify: [subject-crud.service.ts]', error);
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
        console.error('❌ Schoolify: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not get subjects'));
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
        console.error('❌ Schoolify: [subject-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete subject'));
      })
    );
  }
}
