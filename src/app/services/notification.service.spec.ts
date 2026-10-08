import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';
import { arrayRemove, arrayUnion, Firestore } from '@angular/fire/firestore';
import { Messaging } from '@angular/fire/messaging';
import { Platform } from '@ionic/angular/standalone';
import { NotificationService } from './notification.service';


/** Subclase de prueba: sustituye la escritura en Firestore y la lectura del token registrado. */
class TestableNotificationService extends NotificationService {

  persisted: { uid: string; token: string }[] = [];
  registeredToken: string | null = null;
  stuckTokenLookup = false;
  failPersist = false;

  setSessionToken(token: string | null): void {
    this.currentToken = token;
  }

  sessionToken(): string | null {
    return this.currentToken;
  }

  payloadFor(token: string) {
    return this.buildTokenRemovalPayload(token);
  }

  protected override async persistTokenRemoval(uid: string, token: string): Promise<void> {
    if(this.failPersist) {
      throw new Error('fallo simulado de escritura');
    }

    this.persisted.push({ uid, token });
  }

  protected override readRegisteredToken(): Promise<string | null> {
    if(this.stuckTokenLookup) {
      // Simula `navigator.serviceWorker.ready` sin service worker: nunca resuelve.
      return new Promise<string | null>(() => undefined);
    }

    return Promise.resolve(this.registeredToken);
  }
}


describe('NotificationService: baja del token al cerrar sesion', () => {

  let service: TestableNotificationService;
  let currentUser: { uid: string } | null;
  let notificationsSupported: boolean;

  beforeEach(() => {
    currentUser = { uid: 'tutor-1' };
    // false durante la construccion, para que el constructor no toque Messaging
    notificationsSupported = false;

    TestBed.configureTestingModule({
      providers: [
        { provide: Messaging, useValue: {} },
        { provide: Firestore, useValue: {} },
        { provide: Auth, useValue: { get currentUser() { return currentUser; } } },
        { provide: Platform, useValue: { is: () => !notificationsSupported, platforms: () => [] } },
        { provide: NotificationService, useClass: TestableNotificationService },
      ],
    });

    service = TestBed.inject(NotificationService) as TestableNotificationService;
    notificationsSupported = true;
  });

  it('quita SOLO el token de este dispositivo, no todos', async () => {
    service.setSessionToken('tok-device-A');

    await service.deleteToken();

    expect(service.persisted).toEqual([{ uid: 'tutor-1', token: 'tok-device-A' }]);
    expect(service.sessionToken()).toBeNull();
  });

  it('recupera el token registrado cuando la app se recargo (currentToken vacio)', async () => {
    service.setSessionToken(null);
    service.registeredToken = 'tok-device-B';

    await service.deleteToken();

    expect(service.persisted).toEqual([{ uid: 'tutor-1', token: 'tok-device-B' }]);
  });

  it('no escribe nada si no hay token que quitar', async () => {
    service.setSessionToken(null);
    service.registeredToken = null;

    await service.deleteToken();

    expect(service.persisted).toEqual([]);
  });

  it('no escribe nada si no hay usuario autenticado', async () => {
    currentUser = null;
    service.setSessionToken('tok-device-A');

    await service.deleteToken();

    expect(service.persisted).toEqual([]);
  });

  it('no lanza si la escritura falla: el logout no se puede romper', async () => {
    service.setSessionToken('tok-device-A');
    service.failPersist = true;

    await expectAsync(service.deleteToken()).toBeResolved();
  });

  it('REGRESION: no se cuelga si el service worker o FCM nunca responden', async () => {
    service.setSessionToken(null);
    service.stuckTokenLookup = true;

    // Sin el plazo, `deleteToken()` no resolveria nunca y el logout quedaria mudo.
    const outcome = await Promise.race([
      service.deleteToken().then(() => 'resuelto'),
      new Promise(resolve => setTimeout(() => resolve('colgado'), 3_000)),
    ]);

    expect(outcome).toBe('resuelto');
    expect(service.persisted).toEqual([]);
  });

  it('REGRESION: el payload usa arrayRemove y no reemplaza el array completo', () => {
    const payload = service.payloadFor('tok-device-A');

    // `tokens: []` (el bug) seria un array; un sentinel no lo es.
    expect(Array.isArray(payload.tokens)).toBeFalse();

    // Se compara con la API publica `isEqual`: los campos internos del sentinel
    // estan minificados y cambian entre el build de Node y el del navegador.
    expect(payload.tokens.isEqual(arrayRemove('tok-device-A'))).toBeTrue();
    expect(payload.tokens.isEqual(arrayRemove('tok-device-B'))).toBeFalse();
    expect(payload.tokens.isEqual(arrayUnion('tok-device-A'))).toBeFalse();
  });

});
