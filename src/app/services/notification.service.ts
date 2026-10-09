import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  arrayRemove,
  arrayUnion,
  doc,
  Firestore,
  serverTimestamp,
  setDoc
} from '@angular/fire/firestore';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { Platform } from '@ionic/angular/standalone';
import { environment } from '../../environments/environment';


/**
 * Plazo maximo para dar de baja el token. El cierre de sesion es una operacion
 * critica: nunca puede quedarse esperando a FCM, al service worker ni a Firestore.
 */
const TOKEN_REMOVAL_DEADLINE_MS = 1_000;

/**
 * Plazo maximo para obtener el token FCM. El login espera esta llamada, asi que no
 * puede quedarse colgado si FCM no responde; si vence, el usuario entra igual y se
 * queda sin push hasta el siguiente inicio de sesion.
 */
const TOKEN_REQUEST_DEADLINE_MS = 5_000;


@Injectable({providedIn: 'root'})
export class NotificationService {

  /** Token de ESTE dispositivo para esta sesion. Tras recargar la app queda en null. */
  protected currentToken: string | null = null;

  constructor(
    private messaging: Messaging,
    private platform: Platform,
    private firestore: Firestore,
    private auth: Auth
  ) {
    // Escuchar mensajes cuando la app está abierta
    this.listenToForegroundMessages();
  }

  /**
   * Verifica si las notificaciones están soportadas
   */
  isNotificationSupported(): boolean {
    return (
      'Notification' in window &&
      'serviceWorker' in navigator &&
      !this.platform.is('capacitor')
    );
  }

  /**
   * Obtiene el estado actual del permiso de notificaciones
   */
  getPermissionStatus(): NotificationPermission {
    if (!this.isNotificationSupported()) {
      return 'denied';
    }
    return Notification.permission;
  }

  /**
   * Solicita permiso y obtiene el token FCM.
   *
   * Se invoca ANTES de navegar tras el login, asi que no puede quedarse colgada:
   * ni esperando al service worker ni pidiendole el token a FCM.
   */
  async requestPermission(): Promise<string | null> {
    try {
      if (!this.isNotificationSupported()) {
        console.log('⚠️ Las notificaciones no están soportadas en este dispositivo.');
        return null;
      }

      // Esto espera la decision del usuario: no se puede acotar en el tiempo.
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        console.log('⚠️ Permiso de notificaciones denegado.');
        return null;
      }

      const registration = await this.getPushRegistration();

      if(!registration) {
        console.log('⚠️ No hay service worker registrado: no se pueden recibir notificaciones push.');
        return null;
      }

      const token = await this.withDeadline(
        this.registerDeviceToken(registration),
        TOKEN_REQUEST_DEADLINE_MS
      );

      if(!token) {
        console.log('⚠️ No se pudo obtener el token.');
      }

      return token;

    } catch (error) {
      console.error('❌ Schoolify: [notification.service.ts]', error);
      return null;
    }
  }

  /** Obtiene el token FCM para ese service worker y lo guarda en Firestore. */
  protected async registerDeviceToken(registration: ServiceWorkerRegistration): Promise<string | null> {
    const token = await getToken(this.messaging, {
      vapidKey: environment.vapidKey,
      serviceWorkerRegistration: registration
    });

    if(!token) {
      return null;
    }

    this.currentToken = token;
    await this.saveTokenToFirestore(token);

    return token;
  }

  /**
   * Guarda el token en Firestore asociado al usuario actual
   */
  private async saveTokenToFirestore(token: string): Promise<void> {
    try {
      const userId = this.auth.currentUser?.uid;

      if(!userId) {
        return;
      }

      const userRef = doc(this.firestore, `usuarios/${userId}`);

      await setDoc(userRef,
        {
          tokens: arrayUnion(token),
          lastTokenUpdate: serverTimestamp(),
          platform: this.getPlatformInfo(),
          userAgent: navigator.userAgent
        },
        {
          merge: true
        }
      );
    } catch (error) {
      console.error('❌ Schoolify: [notification.service.ts]', error);
    }
  }

  /**
   * Escucha mensajes en primer plano (app abierta)
   */
  private listenToForegroundMessages(): void {
    if (!this.isNotificationSupported()) {
      return;
    }

    onMessage(this.messaging, (payload) => {
      this.showForegroundNotification(payload);
    });
  }

  /**
   * Muestra una notificación cuando la app está activa
   */
  private showForegroundNotification(payload: any): void {
    const title = payload.notification?.title || 'Escuela';

    const options: NotificationOptions = {
      body: payload.notification?.body || '',
      icon: payload.notification?.icon || '/assets/icons/icon-192x192.png',
      badge: '/assets/icons/icon-72x72.png',
      tag: payload.data?.tag || 'notification-' + Date.now(),
      data: payload.data,
      requireInteraction: false
    };

    if (Notification.permission === 'granted') {
      const notification = new Notification(title, options);

      notification.onclick = (event) => {
        event.preventDefault();
        window.focus();
        notification.close();

        // Manejar navegación si hay una ruta en los datos
        if (payload.data?.route) {
          window.location.href = payload.data.route;
        }
      };
    }
  }

  /**
   * Da de baja de las notificaciones el token de ESTE dispositivo.
   * Se invoca al cerrar sesión: sin esto el equipo sigue recibiendo los avisos
   * de la cuenta que acaba de salir.
   *
   * Toda la operacion va acotada por un plazo, para que el logout no pueda
   * quedarse bloqueado por un tercero que no responde.
   */
  async deleteToken(): Promise<void> {
    try {
      await this.withDeadline(this.removeDeviceToken(), TOKEN_REMOVAL_DEADLINE_MS);
    } catch (error) {
      console.error('❌ Schoolify: [notification.service.ts]', error);
    }
  }

  private async removeDeviceToken(): Promise<void> {
    const user = this.auth.currentUser;

    if(!user || !this.isNotificationSupported()) {
      return;
    }

    const token = await this.resolveTokenForRemoval();

    if(!token) {
      return;
    }

    await this.persistTokenRemoval(user.uid, token);
    this.currentToken = null;
  }

  /** Resuelve con el resultado de `work`, o con null si vence el plazo antes. */
  private withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([
      work,
      new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
    ]);
  }

  /**
   * Obtiene información de la plataforma
   */
  private getPlatformInfo(): string {
    const platforms = this.platform.platforms();
    return platforms.join(', ');
  }

  /**
   * Obtiene el token actual sin solicitar permiso
   */
  getCurrentToken(): string | null {
    return this.currentToken;
  }

  /**
   * Verifica si el usuario ya tiene permiso concedido
   */
  hasPermission(): boolean {
    return this.getPermissionStatus() === 'granted';
  }

  /**
   * Payload que quita SOLO el token indicado. No usar `tokens: []`: reemplazaria
   * el array completo y dejaria sin avisos a los demas equipos del mismo usuario.
   */
  protected buildTokenRemovalPayload(token: string) {
    return {
      tokens: arrayRemove(token),
      lastTokenUpdate: serverTimestamp()
    };
  }

  protected async persistTokenRemoval(uid: string, token: string): Promise<void> {
    const userRef = doc(this.firestore, `usuarios/${uid}`);

    await setDoc(userRef, this.buildTokenRemovalPayload(token), {
      merge: true
    });
  }

  /**
   * Token de este dispositivo: el de la sesion en curso o, si la app se recargo,
   * el ya registrado en el navegador.
   */
  protected resolveTokenForRemoval(): Promise<string | null> {
    if(this.currentToken) {
      return Promise.resolve(this.currentToken);
    }

    return this.readRegisteredToken();
  }

  /**
   * Service worker listo para push, o null si no hay ninguno.
   *
   * OJO: no usar `navigator.serviceWorker.ready`. Esa promesa NUNCA se resuelve si
   * no hay un service worker activo (por ejemplo en desarrollo, donde el SW esta
   * deshabilitado), y colgaria tanto el login como el cierre de sesion.
   * `getRegistration()` resuelve siempre.
   */
  protected async getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
    if(!('serviceWorker' in navigator)) {
      return null;
    }

    return await navigator.serviceWorker.getRegistration() ?? null;
  }

  /**
   * Recupera el token ya registrado sin volver a pedir permiso.
   */
  protected async readRegisteredToken(): Promise<string | null> {
    if(!this.isNotificationSupported() || Notification.permission !== 'granted') {
      return null;
    }

    try {
      const registration = await this.getPushRegistration();

      if(!registration) {
        return null;
      }

      return await getToken(this.messaging, {
        vapidKey: environment.vapidKey,
        serviceWorkerRegistration: registration
      });
    } catch (error) {
      console.error('❌ Schoolify: [notification.service.ts]', error);
      return null;
    }
  }
}
