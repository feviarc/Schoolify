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
  writeBatch,
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

  private readonly USERS_COLLECTION = 'usuarios';
  private readonly NOTIFICATIONS_SUBCOLLECTION = 'notificaciones';

  // BehaviorSubject to maintain notifications state
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  // Current user ID (debe ser establecido al iniciar sesión)
  private currentUserId: string | null = null;

  constructor(private firestore: Firestore) {}

  /**
   * Set the current user ID
   * DEBE llamarse al iniciar sesión o al inicializar el servicio
   * @param userId - User ID
   */
  setCurrentUser(userId: string): void {
    this.currentUserId = userId;
    this.loadNotifications();
  }

  /**
   * Get current user ID
   * @returns Current user ID or null
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
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
      error: (error) => console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error)
    });
  }

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
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
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
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not get notifications'));
      })
    );
  }

  /**
   * Get all notifications (snapshot)
   * @param userId - User ID
   * @returns Observable with array of notifications
   */
  getNotificationsSnapshot(userId: string): Observable<Notification[]> {
    const notificationsCol = this.getNotificationsCollection(userId);
    const q = query(notificationsCol, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const notifications: Notification[] = [];
        querySnapshot.forEach(doc => {
          const data = doc.data();
          notifications.push({
            id: doc.id,
            ...data,
            createdAt: data['createdAt']?.toDate?.() || data['createdAt']
          } as Notification);
        });
        return notifications;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not get notifications'));
      })
    );
  }

  /**
   * Get unread notifications only (status: 'unread')
   * @param userId - User ID
   * @returns Observable with array of unread notifications
   */
  getUnreadNotifications(userId: string): Observable<Notification[]> {
    const notificationsCol = this.getNotificationsCollection(userId);
    const q = query(
      notificationsCol,
      where('status', '==', 'unread'),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const notifications: Notification[] = [];
        querySnapshot.forEach(doc => {
          const data = doc.data();
          notifications.push({
            id: doc.id,
            ...data,
            createdAt: data['createdAt']?.toDate?.() || data['createdAt']
          } as Notification);
        });
        return notifications;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return of([]);
      })
    );
  }

  /**
   * Get archived notifications only (status: 'archived')
   * @param userId - User ID
   * @returns Observable with array of archived notifications
   */
  getArchivedNotifications(userId: string): Observable<Notification[]> {
    const notificationsCol = this.getNotificationsCollection(userId);
    const q = query(
      notificationsCol,
      where('status', '==', 'archived'),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const notifications: Notification[] = [];
        querySnapshot.forEach(doc => {
          const data = doc.data();
          notifications.push({
            id: doc.id,
            ...data,
            createdAt: data['createdAt']?.toDate?.() || data['createdAt']
          } as Notification);
        });
        return notifications;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return of([]);
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
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
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
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not update notification'));
      })
    );
  }

  /**
   * Mark a notification as archived
   * @param userId - User ID
   * @param notificationId - Notification ID
   * @returns Observable<void>
   */
  markAsArchived(userId: string, notificationId: string): Observable<void> {
    return this.updateNotification(userId, notificationId, { status: 'archived' });
  }

  /**
   * Mark a notification as unarchived (unread)
   * @param userId - User ID
   * @param notificationId - Notification ID
   * @returns Observable<void>
   */
  markAsUnarchived(userId: string, notificationId: string): Observable<void> {
    return this.updateNotification(userId, notificationId, { status: 'unread' });
  }

  /**
   * Mark all notifications as archived
   * Uses batch write for efficiency
   * @param userId - User ID
   * @returns Observable<void>
   */
  markAllAsArchived(userId: string): Observable<void> {
    return this.getUnreadNotifications(userId).pipe(
      switchMap(notifications => {
        if (notifications.length === 0) {
          return of(void 0);
        }

        const batch = writeBatch(this.firestore);

        notifications.forEach(notification => {
          const docRef = doc(
            this.firestore,
            this.USERS_COLLECTION,
            userId,
            this.NOTIFICATIONS_SUBCOLLECTION,
            notification.id!
          );
          batch.update(docRef, { status: 'archived' });
        });

        return from(batch.commit());
      }),
      tap(() => {
        if (userId === this.currentUserId) {
          this.loadNotifications();
        }
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not mark all as archived'));
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
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete notification'));
      })
    );
  }

  /**
   * Delete all archived notifications
   * Uses batch delete for efficiency
   * @param userId - User ID
   * @returns Observable<void>
   */
  deleteArchivedNotifications(userId: string): Observable<void> {
    return this.getArchivedNotifications(userId).pipe(
      switchMap(notifications => {
        if (notifications.length === 0) {
          return of(void 0);
        }

        const batch = writeBatch(this.firestore);

        notifications.forEach(notification => {
          const docRef = doc(
            this.firestore,
            this.USERS_COLLECTION,
            userId,
            this.NOTIFICATIONS_SUBCOLLECTION,
            notification.id!
          );
          batch.delete(docRef);
        });

        return from(batch.commit());
      }),
      tap(() => {
        if (userId === this.currentUserId) {
          this.loadNotifications();
        }
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not delete archived notifications'));
      })
    );
  }

  /**
   * Clear all notifications (delete entire collection)
   * Uses batch delete for efficiency (max 500 per batch)
   * @param userId - User ID
   * @returns Observable<void>
   */
  clearAllNotifications(userId: string): Observable<void> {
    return this.getNotificationsSnapshot(userId).pipe(
      switchMap(notifications => {
        if (notifications.length === 0) {
          return of(void 0);
        }

        // Firestore batch limit is 500 operations
        const batchSize = 500;
        const batches: Promise<void>[] = [];

        for (let i = 0; i < notifications.length; i += batchSize) {
          const batch = writeBatch(this.firestore);
          const batchNotifications = notifications.slice(i, i + batchSize);

          batchNotifications.forEach(notification => {
            const docRef = doc(
              this.firestore,
              this.USERS_COLLECTION,
              userId,
              this.NOTIFICATIONS_SUBCOLLECTION,
              notification.id!
            );
            batch.delete(docRef);
          });

          batches.push(batch.commit());
        }

        return from(Promise.all(batches)).pipe(map(() => void 0));
      }),
      tap(() => {
        if (userId === this.currentUserId) {
          this.loadNotifications();
        }
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return throwError(() => new Error('Could not clear all notifications'));
      })
    );
  }

  /**
   * Count unread notifications
   * @param userId - User ID
   * @returns Observable<number>
   */
  countUnread(userId: string): Observable<number> {
    return this.getUnreadNotifications(userId).pipe(
      map(notifications => notifications.length),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return of(0);
      })
    );
  }

  /**
   * Count all notifications
   * @param userId - User ID
   * @returns Observable<number>
   */
  countAll(userId: string): Observable<number> {
    const notificationsCol = this.getNotificationsCollection(userId);

    return from(getDocs(notificationsCol)).pipe(
      map(querySnapshot => querySnapshot.size),
      catchError(error => {
        console.error('❌ Escuela-MX: [admin-notifications-crud.service.ts]', error);
        return of(0);
      })
    );
  }

  /**
   * Get current notifications value without subscription
   * @returns Current array of notifications
   */
  getCurrentNotifications(): Notification[] {
    return this.notificationsSubject.value;
  }

  /**
   * Manually refresh notifications list
   */
  refreshNotifications(): void {
    this.loadNotifications();
  }
}
