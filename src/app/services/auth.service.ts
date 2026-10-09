import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  User
} from '@angular/fire/auth';
import {
  doc,
  Firestore,
  setDoc,
} from '@angular/fire/firestore';

import { NotificationService } from './notification.service';


@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private notificationService = inject(NotificationService);


  private user: Observable<User | null>;

  constructor() {
    this.user = new Observable(observer => {
      onAuthStateChanged(this.auth, user => {
        observer.next(user);
      });
    });
  }

  async register(email: string, password: string, role: string): Promise<User> {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;
    await this.saveUserProfile(user, role);
    await this.sendEmailVerification(user);
    return user;
  }

  async resendVerificationEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if(user) {
      await this.sendEmailVerification(user);
    }
  }

  private async sendEmailVerification(user: User): Promise<void> {
    if(user) {
      await sendEmailVerification(user);
    }
  }

  private async saveUserProfile(user: User, rol: string): Promise<void> {
    const userDocRef = doc(this.firestore, `usuarios/${user.uid}`);
    await setDoc(userDocRef, {
      uid: user.uid,
      email: user.email,
      rol: rol
    });
  }

  login(email: string, password: string): Observable<any> {
    return from(signInWithEmailAndPassword(this.auth, email, password));
  }

  logout(): Observable<void> {
    return from(this.unregisterNotificationsAndSignOut());
  }

  getCurrentUser(): Observable<User | null> {
    return this.user;
  }

  resetPassword(email: string): Observable<void> {
    return from(sendPasswordResetEmail(this.auth, email));
  }

  /**
   * La baja de las notificaciones va ANTES del signOut: la escritura en Firestore
   * debe ocurrir con el usuario todavia autenticado. `deleteToken()` no lanza
   * nunca, asi que el logout no puede fallar por culpa de las notificaciones.
   */
  private async unregisterNotificationsAndSignOut(): Promise<void> {
    await this.notificationService.deleteToken();
    await signOut(this.auth);
  }

}
