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
  writeBatch,
} from '@angular/fire/firestore';

import {
  from,
  of,
  Observable,
} from 'rxjs';

import {
  catchError,
  map,
} from 'rxjs/operators';

// ==================== INTERFACES ====================

/**
 * Caregiver Notification model (Notificación del tutor)
 * Subcollection dentro de cada usuario tutor
 */
export interface CaregiverNotification {
  id?: string; // Autogenerado por Firestore
  sid: string;
  tipo: 'Inasistencia' | 'Incumplimiento' | 'Indisciplina'; // Tipos permitidos
  observaciones?: string; // Opcional
  materias?: string[]; // Opcional
  fecha?: string; // Obligatorio para tipo Inasistencia (formato ISO: '2025-12-12T11:21:55')
  nombreCompleto: string; // Nombre del estudiante (requerido)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Input for creating a notification (without auto-generated fields)
 */
export interface NotificationInput {
  sid: string;
  fecha?: string;
  materias?: string[];
  nombreCompleto: string;
  observaciones?: string;
  tipo: 'Inasistencia' | 'Incumplimiento' | 'Indisciplina';
}

// ==================== SERVICE ====================

/**
 * Service to manage CRUD operations for Caregiver Notifications
 * Structure: usuarios/{tid}/notificaciones/{notificationId}
 * Uses Promise for write operations and Observable for reads
 */
@Injectable({
  providedIn: 'root'
})

export class CaregiverNotificationsCRUDService {

  private readonly USERS_COLLECTION = 'usuarios';
  private readonly NOTIFICATIONS_SUBCOLLECTION = 'notificaciones';

  constructor(private firestore: Firestore) {}

  /**
   * Get notifications subcollection reference for a caregiver/tutor
   * @param tid - Tutor/Caregiver ID
   */
  private getNotificationsCollection(tid: string): CollectionReference {
    return collection(
      this.firestore,
      this.USERS_COLLECTION,
      tid,
      this.NOTIFICATIONS_SUBCOLLECTION
    );
  }

  /**
   * Validate notification data before saving
   * @param notification - Notification data to validate
   * @throws Error if validation fails
   */
  private validateNotification(notification: NotificationInput): void {
    // Validar que fecha sea obligatoria para tipo Inasistencia
    if (notification.tipo === 'Inasistencia' && !notification.fecha) {
      throw new Error('El campo "fecha" es obligatorio para el tipo "Inasistencia"');
    }

    // Validar que nombreCompleto no esté vacío
    if (!notification.nombreCompleto || notification.nombreCompleto.trim() === '') {
      throw new Error('El campo "nombreCompleto" es obligatorio');
    }
  }

  // ==================== NOTIFICATIONS CRUD (CREATE) ====================

  /**
   * Add a notification to a caregiver/tutor
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @param notification - Notification data
   * @returns Promise with the created notification ID
   */
  async addNotification(tid: string, notification: NotificationInput): Promise<string> {
    try {
      // Validar datos antes de guardar
      this.validateNotification(notification);

      const notificationsCol = this.getNotificationsCollection(tid);

      const notificationData = {
        ...notification,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(notificationsCol, notificationData);
      return docRef.id;
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      throw error;
    }
  }

  // ==================== NOTIFICATIONS CRUD (READ) ====================

  /**
   * Get all notifications for a caregiver/tutor (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param tid - Tutor/Caregiver ID
   * @returns Observable with array of notifications ordered by creation date (newest first)
   */
  getNotificationsByTid(tid: string): Observable<CaregiverNotification[]> {
    const notificationsCol = this.getNotificationsCollection(tid);
    const q = query(notificationsCol, orderBy('createdAt', 'desc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(notifications => notifications as CaregiverNotification[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get all notifications for a caregiver/tutor (snapshot - one-time read)
   * ⚠️ NO REQUIERE UNSUBSCRIBE (se completa automáticamente)
   * @param tid - Tutor/Caregiver ID
   * @returns Observable with array of notifications
   */
  getNotificationsByTidSnapshot(tid: string): Observable<CaregiverNotification[]> {
    const notificationsCol = this.getNotificationsCollection(tid);
    const q = query(notificationsCol, orderBy('createdAt', 'desc'));

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const notifications: CaregiverNotification[] = [];
        querySnapshot.forEach(doc => {
          notifications.push({
            id: doc.id,
            ...doc.data()
          } as CaregiverNotification);
        });
        return notifications;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        return of([]);
      })
    );
  }

  /**
   * Get notifications by student ID (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param tid - Tutor/Caregiver ID
   * @param sid - Student ID
   * @returns Observable with array of filtered notifications
   */
  getNotificationsByStudentId(tid: string, sid: string): Observable<CaregiverNotification[]> {
    const notificationsCol = this.getNotificationsCollection(tid);
    const q = query(
      notificationsCol,
      where('sid', '==', sid),
      orderBy('createdAt', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(notifications => notifications as CaregiverNotification[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get notifications by student ID (snapshot - one-time read)
   * ⚠️ NO REQUIERE UNSUBSCRIBE (se completa automáticamente)
   * @param tid - Tutor/Caregiver ID
   * @param sid - Student ID
   * @returns Observable with array of filtered notifications
   */
  getNotificationsByStudentIdSnapshot(tid: string, sid: string): Observable<CaregiverNotification[]> {
    const notificationsCol = this.getNotificationsCollection(tid);
    const q = query(
      notificationsCol,
      where('sid', '==', sid),
      orderBy('createdAt', 'desc')
    );

    return from(getDocs(q)).pipe(
      map(querySnapshot => {
        const notifications: CaregiverNotification[] = [];
        querySnapshot.forEach(doc => {
          notifications.push({
            id: doc.id,
            ...doc.data()
          } as CaregiverNotification);
        });
        return notifications;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        return of([]);
      })
    );
  }

  /**
   * Get a notification by ID (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param tid - Tutor/Caregiver ID
   * @param notificationId - Notification ID
   * @returns Observable with notification data
   */
  getNotificationById(tid: string, notificationId: string): Observable<CaregiverNotification | null> {
    const docRef = doc(
      this.firestore,
      this.USERS_COLLECTION,
      tid,
      this.NOTIFICATIONS_SUBCOLLECTION,
      notificationId
    ) as DocumentReference;

    return docData(docRef, { idField: 'id' }).pipe(
      map(data => data ? data as CaregiverNotification : null),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get a notification by ID (snapshot - one-time read)
   * ⚠️ NO REQUIERE UNSUBSCRIBE (se completa automáticamente)
   * @param tid - Tutor/Caregiver ID
   * @param notificationId - Notification ID
   * @returns Observable with notification data or null
   */
  getNotificationByIdSnapshot(tid: string, notificationId: string): Observable<CaregiverNotification | null> {
    const docRef = doc(
      this.firestore,
      this.USERS_COLLECTION,
      tid,
      this.NOTIFICATIONS_SUBCOLLECTION,
      notificationId
    );

    return from(getDoc(docRef)).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          return {
            id: docSnap.id,
            ...docSnap.data()
          } as CaregiverNotification;
        }
        return null;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        return of(null);
      })
    );
  }

  /**
   * Get notifications by type (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param tid - Tutor/Caregiver ID
   * @param tipo - Notification type
   * @returns Observable with array of filtered notifications
   */
  getNotificationsByType(
    tid: string,
    tipo: 'Inasistencia' | 'Incumplimiento' | 'Indisciplina'
  ): Observable<CaregiverNotification[]> {
    const notificationsCol = this.getNotificationsCollection(tid);
    const q = query(
      notificationsCol,
      where('tipo', '==', tipo),
      orderBy('createdAt', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(notifications => notifications as CaregiverNotification[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        throw error;
      })
    );
  }

  /**
   * Get notifications by student name (real-time)
   * ⚠️ REQUIERE UNSUBSCRIBE: Usa async pipe o unsubscribe en ngOnDestroy
   * @param tid - Tutor/Caregiver ID
   * @param nombreCompleto - Student full name
   * @returns Observable with array of filtered notifications
   */
  getNotificationsByStudent(tid: string, nombreCompleto: string): Observable<CaregiverNotification[]> {
    const notificationsCol = this.getNotificationsCollection(tid);
    const q = query(
      notificationsCol,
      where('nombreCompleto', '==', nombreCompleto),
      orderBy('createdAt', 'desc')
    );

    return collectionData(q, { idField: 'id' }).pipe(
      map(notifications => notifications as CaregiverNotification[]),
      catchError(error => {
        console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
        throw error;
      })
    );
  }

  // ==================== NOTIFICATIONS CRUD (UPDATE) ====================

  /**
   * Update a notification
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @param notificationId - Notification ID
   * @param data - Partial data to update
   * @returns Promise<void>
   */
  async updateNotification(
    tid: string,
    notificationId: string,
    data: Partial<Omit<CaregiverNotification, 'id' | 'createdAt'>>
  ): Promise<void> {
    try {
      const docRef = doc(
        this.firestore,
        this.USERS_COLLECTION,
        tid,
        this.NOTIFICATIONS_SUBCOLLECTION,
        notificationId
      );

      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new Error('Notification does not exist');
      }

      // Si se está actualizando el tipo a Inasistencia, validar fecha
      if (data.tipo === 'Inasistencia' && !data.fecha) {
        const currentData = docSnap.data() as CaregiverNotification;
        if (!currentData.fecha) {
          throw new Error('El campo "fecha" es obligatorio para el tipo "Inasistencia"');
        }
      }

      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      await updateDoc(docRef, updateData);
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      throw error;
    }
  }

  // ==================== NOTIFICATIONS CRUD (DELETE) ====================

  /**
   * Delete a notification
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @param notificationId - Notification ID
   * @returns Promise<void>
   */
  async deleteNotification(tid: string, notificationId: string): Promise<void> {
    try {
      const docRef = doc(
        this.firestore,
        this.USERS_COLLECTION,
        tid,
        this.NOTIFICATIONS_SUBCOLLECTION,
        notificationId
      );

      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new Error('Notification does not exist');
      }

      await deleteDoc(docRef);
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      throw error;
    }
  }

  /**
   * Delete all notifications for a caregiver/tutor (batch delete)
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @returns Promise<void>
   */
  async deleteNotificationsByTid(tid: string): Promise<void> {
    try {
      const notificationsCol = this.getNotificationsCollection(tid);
      const querySnapshot = await getDocs(notificationsCol);

      if (querySnapshot.empty) {
        return;
      }

      const batch = writeBatch(this.firestore);

      querySnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      throw error;
    }
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if a notification exists
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @param notificationId - Notification ID
   * @returns Promise<boolean>
   */
  async notificationExists(tid: string, notificationId: string): Promise<boolean> {
    try {
      const docRef = doc(
        this.firestore,
        this.USERS_COLLECTION,
        tid,
        this.NOTIFICATIONS_SUBCOLLECTION,
        notificationId
      );
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      return false;
    }
  }

  /**
   * Count total notifications for a caregiver/tutor
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @returns Promise<number>
   */
  async countNotifications(tid: string): Promise<number> {
    try {
      const notificationsCol = this.getNotificationsCollection(tid);
      const querySnapshot = await getDocs(notificationsCol);
      return querySnapshot.size;
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      return 0;
    }
  }

  /**
   * Count notifications by type for a caregiver/tutor
   * ⚠️ NO REQUIERE UNSUBSCRIBE (Promise-based)
   * @param tid - Tutor/Caregiver ID
   * @param tipo - Notification type
   * @returns Promise<number>
   */
  async countNotificationsByType(
    tid: string,
    tipo: 'Inasistencia' | 'Incumplimiento' | 'Indisciplina'
  ): Promise<number> {
    try {
      const notificationsCol = this.getNotificationsCollection(tid);
      const q = query(notificationsCol, where('tipo', '==', tipo));
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error('❌ Escuela-MX: [caregiver-notifications-crud.service.ts]', error);
      return 0;
    }
  }
}
