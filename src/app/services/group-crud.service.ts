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

// Interface for Group model
export interface Group {
  id?: string;
  grado: string;
  letra: string;
  nombre: string;
  createdAt?: Date;
  updatedAt?: Date;
}


@Injectable({ providedIn: 'root' })

export class GroupCRUDService {
  private firestore = inject(Firestore);


  private readonly COLLECTION_NAME = 'grupos';
  private groupsCollection: CollectionReference;

  // BehaviorSubject to maintain groups state
  private groupsSubject = new BehaviorSubject<Group[]>([]);
  public groups$ = this.groupsSubject.asObservable();

  constructor() {
    this.groupsCollection = collection(this.firestore, this.COLLECTION_NAME);
    // Load groups when service initializes
    this.loadGroups();
  }

  /**
   * Add a new group
   * @param group - Group data (without id)
   * @returns Observable with the created document ID
   */
  addGroup(group: Omit<Group, 'id'>): Observable<string> {
    const groupWithTimestamps = {
      ...group,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return from(addDoc(this.groupsCollection, groupWithTimestamps)).pipe(
      map(docRef => docRef.id),
      tap(id => {
        this.loadGroups(); // Update list
      }),
      catchError(error => {
        console.error('❌ Schoolify: [group-crud.service.ts]', error);
        return throwError(() => new Error('Could not add group'));
      })
    );
  }

  /**
   * Get all groups as Observable
   * Subscribes to real-time changes
   * Ordered by grado and letra
   * @returns Observable with array of groups
   */
  getGroups(): Observable<Group[]> {
    const q = query(
      this.groupsCollection,
      orderBy('grado', 'asc'),
      orderBy('letra', 'asc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(groups => groups as Group[]),
      catchError(error => {
        console.error('❌ Schoolify: [group-crud.service.ts]', error);
        return throwError(() => new Error('Could not get groups'));
      })
    );
  }

  /**
   * Search group by grade and letter
   * @param grado - Grade (e.g., "1", "2", "3")
   * @param letra - Letter (e.g., "A", "B", "C")
   * @returns Observable with group or null
   */
  getGroupByGradeAndLetter(grado: string, letra: string): Observable<Group | null> {
    const q = query(
      this.groupsCollection,
      where('grado', '==', grado),
      where('letra', '==', letra)
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
        } as Group;
      }),
      catchError(error => {
        console.error('❌ Schoolify: [group-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Delete a group
   * @param groupId - Document ID
   * @returns Observable<void>
   */
  deleteGroup(groupId: string): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, groupId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Group does not exist'));
        }
        return from(deleteDoc(docRef));
      }),
      tap(() => {
        this.loadGroups(); // Update list
      }),
      catchError(error => {
        console.error('❌ Schoolify: [group-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete group'));
      })
    );
  }

  /**
   * Check if a group with specific grade and letter already exists
   * @param grado - Grade
   * @param letra - Letter
   * @param excludeId - ID to exclude in search (useful when editing)
   * @returns Observable<boolean>
   */
  groupExists(grado: string, letra: string, excludeId?: string): Observable<boolean> {
    return this.getGroupByGradeAndLetter(grado, letra).pipe(
      map(group => {
        if (!group) {
          return false;
        }
        // If there's an ID to exclude and it matches, then no duplicate exists
        if (excludeId && group.id === excludeId) {
          return false;
        }
        return true;
      })
    );
  }

  /**
   * Load all groups and update the BehaviorSubject
   * Private method that keeps the state updated
   */
  private loadGroups(): void {
    this.getGroups().subscribe({
      next: (groups) => this.groupsSubject.next(groups),
      error: (error) => console.error('❌ Schoolify: [group-crud.service.ts]', error)
    });
  }

}
