import { Injectable, inject } from '@angular/core';

import {
  collection,
  collectionData,
  CollectionReference,
  Firestore,
  orderBy,
  query,
} from '@angular/fire/firestore';

import { Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * Mensaje interno que recibe un administrador: el texto va en `body`.
 * Los escribe la Cloud Function `onNewUserRegistered`; el cliente solo los lee.
 */
export interface Notification {
  id?: string;
  body: string;
  status?: 'archived' | 'unread';
  createdAt: Date;
}

/**
 * Lectura de los mensajes internos del administrador.
 *
 * Viven en `usuarios/{uid}/mensajes`, separados de `usuarios/{uid}/notificaciones`
 * (que solo lleva avisos de alumnos). Antes compartian subcoleccion y cada lector
 * tenia que adivinar la forma del documento.
 */
@Injectable({
  providedIn: 'root'
})
export class AdminNotificationsCRUDService {
  private firestore = inject(Firestore);


  private readonly USERS_COLLECTION = 'usuarios';
  private readonly MESSAGES_SUBCOLLECTION = 'mensajes';

  /**
   * Mensajes de un administrador, del mas nuevo al mas viejo.
   * @param userId - UID del administrador
   */
  getNotifications(userId: string): Observable<Notification[]> {
    const messagesCollection = this.getMessagesCollection(userId);
    const q = query(messagesCollection, orderBy('createdAt', 'desc'));

    return collectionData(q, { idField: 'id' }).pipe(
      map(messages => {
        return messages.map(message => ({
          ...message,
          createdAt: (message as any)['createdAt']?.toDate?.() || message['createdAt']
        })) as Notification[];
      }),
      catchError(error => {
        console.error('❌ Schoolify: [admin-notifications-crud.service.ts]', error);
        throw new Error('Could not get messages');
      })
    );
  }

  private getMessagesCollection(userId: string): CollectionReference {
    return collection(
      this.firestore,
      this.USERS_COLLECTION,
      userId,
      this.MESSAGES_SUBCOLLECTION
    );
  }
}
