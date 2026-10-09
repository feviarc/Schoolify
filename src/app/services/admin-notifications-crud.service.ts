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
  orderBy,
  query,
  updateDoc,
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

// Interface for Notification model
export interface Notification {
  id?: string;
  body: string;
  status: 'archived' | 'unread';
  createdAt: Date;
}

/**
 * Service to manage CRUD operations for User Notifications
 * Structure: usuarios/{userId}/notificaciones/{notificationId}
 * Compatible with Ionic 7 and Angular with Observable support
 */
@Injectable({
  providedIn: 'root'
})
export class AdminNotificationsCRUDService {
  private firestore = inject(Firestore);


  private readonly USERS_COLLECTION = 'usuarios';
  private readonly NOTIFICATIONS_SUBCOLLECTION = 'notificaciones';

  // BehaviorSubject to maintain notifications state
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  // Current user ID (debe ser establecido al iniciar sesión)
  private currentUserId: string | null = null;

  /**
   * Add a new notification
   * @param userId - User ID
   * @param body - Notification message
   * @returns Observable with the created document ID
   */
  addNotification(userId: string, body: string): Observable<string> {
    const notificationsCol = this.getNotificationsCollection(userId);

    const notification = {
      body,
      status: 'unread',
      createdAt: new Date()
    };

    return from(addDoc(notificationsCol, notification)).pipe(
      map(docRef => docRef.id),
      tap(id => {
        if (userId === this.currentUserId) {
          this.loadNotifications();
        }
      }),
      catchError(error => {
        console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not add notification'));
      })
    );
  }

  /**
   * Get all notifications for a user (real-time)
   * Ordered by createdAt descending (newest first)
   * @param userId - User ID
   * @returns Observable with array of notifications
   */
  getNotifications(userId: string): Observable<Notification[]> {
    const notificationsCol = this.getNotificationsCollection(userId);
    const q = query(notificationsCol, orderBy('createdAt', 'desc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(notifications => {
        // Convert Firestore Timestamps to JavaScript Dates
        return notifications.map(notif => ({
          ...notif,
          createdAt: (notif as any)['createdAt']?.toDate?.() || notif['createdAt']
        })) as Notification[];
      }),
      catchError(error => {
        console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not get notifications'));
      })
    );
  }

  /**
   * Get a notification by ID
   * @param userId - User ID
   * @param notificationId - Notification ID
   * @returns Observable with notification data or null
   */
  getNotificationById(userId: string, notificationId: string): Observable<Notification | null> {
    const docRef = doc(
      this.firestore,
      this.USERS_COLLECTION,
      userId,
      this.NOTIFICATIONS_SUBCOLLECTION,
      notificationId
    );

    return from(getDoc(docRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: data['createdAt']?.toDate?.() || data['createdAt']
          } as Notification;
        }
        return null;
      }),
      catchError(error => {
        console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Update a notification
   * @param userId - User ID
   * @param notificationId - Notification ID
   * @param updatedData - Data to update (partial)
   * @returns Observable<void>
   */
  updateNotification(
    userId: string,
    notificationId: string,
    updatedData: Partial<Omit<Notification, 'id' | 'createdAt'>>
  ): Observable<void> {
    const docRef = doc(
      this.firestore,
      this.USERS_COLLECTION,
      userId,
      this.NOTIFICATIONS_SUBCOLLECTION,
      notificationId
    );

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Notification does not exist'));
        }

        return from(updateDoc(docRef, updatedData));
      }),
      tap(() => {
        if (userId === this.currentUserId) {
          this.loadNotifications();
        }
      }),
      catchError(error => {
        console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not update notification'));
      })
    );
  }

  /**
   * Delete a single notification
   * @param userId - User ID
   * @param notificationId - Notification ID
   * @returns Observable<void>
   */
  deleteNotification(userId: string, notificationId: string): Observable<void> {
    const docRef = doc(
      this.firestore,
      this.USERS_COLLECTION,
      userId,
      this.NOTIFICATIONS_SUBCOLLECTION,
      notificationId
    );

    return from(getDoc(docRef)).pipe(
      switchMap(docSnap => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Notification does not exist'));
        }
        return from(deleteDoc(docRef));
      }),
      tap(() => {
        if (userId === this.currentUserId) {
          this.loadNotifications();
        }
      }),
      catchError(error => {
        console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete notification'));
      })
    );
  }

  /**
   * Get notifications collection reference for a user
   * @param userId - User ID
   * @returns CollectionReference
   */
  private getNotificationsCollection(userId: string): CollectionReference {
    return collection(
      this.firestore,
      this.USERS_COLLECTION,
      userId,
      this.NOTIFICATIONS_SUBCOLLECTION
    );
  }


  /**
   * Load all notifications and update the BehaviorSubject
   */
  private loadNotifications(): void {
    if (!this.currentUserId) {
      return;
    }

    this.getNotifications(this.currentUserId).subscribe({
      next: (notifications) => this.notificationsSubject.next(notifications),
      error: (error) => console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error)
    });
  }

}
