import { Injectable } from '@angular/core';
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
  collection,
  doc,
  Firestore,
  getDocs,
  setDoc,
} from '@angular/fire/firestore';


@Injectable({ providedIn: 'root' })
export class AuthService {

  private user: Observable<User | null>;

  constructor(private auth: Auth, private firestore: Firestore) {
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

  private async getInitialUserRol(): Promise<'administrador' | 'maestro' | 'tutor'> {
    const usuariosCollection = collection(this.firestore, 'usuarios');
    const querySnapshot = await getDocs(usuariosCollection);

    if(querySnapshot.empty) {
      return 'administrador'
    } else {
      return 'maestro'
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
    return from(signOut(this.auth));
  }

  getCurrentUser(): Observable<User | null> {
    return this.user;
  }

  resetPassword(email: string): Observable<void> {
    return from(sendPasswordResetEmail(this.auth, email));
  }

}
