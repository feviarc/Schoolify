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

  private readonly COLLECTION_NAME = 'grupos';
  private groupsCollection: CollectionReference;

  // BehaviorSubject to maintain groups state
  private groupsSubject = new BehaviorSubject<Group[]>([]);
  public groups$ = this.groupsSubject.asObservable();

  constructor(private firestore: Firestore) {
    this.groupsCollection = collection(this.firestore, this.COLLECTION_NAME);
    // Load groups when service initializes
    this.loadGroups();
  }

  /**
   * Load all groups and update the BehaviorSubject
   * Private method that keeps the state updated
   */
  private loadGroups(): void {
    this.getGroups().subscribe({
      next: (groups) => this.groupsSubject.next(groups),
      error: (error) => console.error('❌ Escuela-MX: [group-crud.service.ts]', error)
    });
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
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
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
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return throwError(() => new Error('Could not get groups'));
      })
    );
  }

  /**
   * Get all groups (one-time snapshot, not real-time)
   * @returns Observable with array of groups
   */
  getGroupsSnapshot(): Observable<Group[]> {
    const q = query(
      this.groupsCollection,
      orderBy('grado', 'asc'),
      orderBy('letra', 'asc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const groups: Group[] = [];
        querySnapshot.forEach(doc => {
          groups.push({
            id: doc.id,
            ...doc.data()
          } as Group);
        });
        return groups;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return throwError(() => new Error('Could not get groups'));
      })
    );
  }

  /**
   * Get a group by ID as Observable
   * Subscribes to real-time changes
   * @param groupId - Document ID
   * @returns Observable with group data
   */
  getGroupById(groupId: string): Observable<Group | null> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, groupId) as DocumentReference;

    return docData(docRef, { idField: 'id' }).pipe(
      map(data => data ? data as Group : null),
      catchError(error => {
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Get a group by ID (one-time snapshot)
   * @param groupId - Document ID
   * @returns Observable with group data or null
   */
  getGroupByIdSnapshot(groupId: string): Observable<Group | null> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, groupId);

    return from(getDoc(docRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          return {
            id: docSnap.id,
            ...docSnap.data()
          } as Group;
        }
        return null;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Search groups by grade (grado)
   * @param grado - Grade (e.g., "1", "2", "3")
   * @returns Observable with array of groups
   */
  getGroupsByGrade(grado: string): Observable<Group[]> {
    const q = query(
      this.groupsCollection,
      where('grado', '==', grado),
      orderBy('letra', 'asc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const groups: Group[] = [];
        querySnapshot.forEach(doc => {
          groups.push({
            id: doc.id,
            ...doc.data()
          } as Group);
        });
        return groups;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return of([]);
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
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Edit/update an existing group
   * @param groupId - Document ID
   * @param updatedData - Data to update (partial)
   * @returns Observable<void>
   */
  updateGroup(
    groupId: string,
    updatedData: Partial<Omit<Group, 'id' | 'createdAt'>>
  ): Observable<void> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, groupId);

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Group does not exist'));
        }

        const dataWithTimestamp = {
          ...updatedData,
          updatedAt: new Date()
        };

        return from(updateDoc(docRef, dataWithTimestamp));
      }),
      tap(() => {
        this.loadGroups(); // Update list
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return throwError(() => new Error('Could not update group'));
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
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
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
   * Search groups by name (partial search)
   * @param searchTerm - Search term
   * @returns Observable with array of matching groups
   */
  searchGroupsByName(searchTerm: string): Observable<Group[]> {
    return this.getGroupsSnapshot().pipe(
      map(groups => {
        const termLowerCase = searchTerm.toLowerCase();
        return groups.filter(group =>
          group.nombre.toLowerCase().includes(termLowerCase)
        );
      })
    );
  }

  /**
   * Count total registered groups
   * @returns Observable<number>
   */
  countGroups(): Observable<number> {
    return from(getDocs(this.groupsCollection)).pipe(
      map(querySnapshot => querySnapshot.size),
      catchError(error => {
        console.error('❌ Escuela-MX: [group-crud.service.ts]', error);
        return of(0);
      })
    );
  }

  /**
   * Manually refresh groups list
   * Useful to force an update
   */
  refreshGroups(): void {
    this.loadGroups();
  }

  /**
   * Get current groups value without subscription
   * @returns Current array of groups
   */
  getCurrentGroups(): Group[] {
    return this.groupsSubject.value;
  }
}
