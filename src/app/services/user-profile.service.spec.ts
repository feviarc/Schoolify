import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Firestore as RawFirestore } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { UserProfile } from '../models/user-profile.model';
import { UserProfileService } from './user-profile.service';


/** Subclase de prueba: sustituye la lectura real a Firestore por un contador. */
class TestableUserProfileService extends UserProfileService {

  fetchCount = 0;
  nextProfile: UserProfile | null = null;

  protected override fetchProfile(uid: string): Observable<UserProfile | null> {
    this.fetchCount++;
    return of(this.nextProfile);
  }
}


/**
 * Stub minimo que satisface el `instanceof Firestore` interno de `doc()`.
 * Sin esto, `doc()` lanza antes de llegar al try/catch del mutador.
 */
function fakeFirestore(): Firestore {
  return Object.create(RawFirestore.prototype) as Firestore;
}


/** Las fuentes de prueba son sincronas, asi que se leen al suscribirse. */
function read<T>(source: Observable<T>): T | undefined {
  let value: T | undefined;
  source.subscribe(emitted => value = emitted);
  return value;
}


describe('UserProfileService: cache de perfil', () => {

  let service: TestableUserProfileService;
  let now: number;

  const PROFILE: UserProfile = { uid: 'u1', email: 'a@b.c', rol: 'tutor' };

  beforeEach(() => {
    now = 1_000_000;
    spyOn(Date, 'now').and.callFake(() => now);

    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: fakeFirestore() },
        { provide: UserProfileService, useClass: TestableUserProfileService },
      ],
    });

    service = TestBed.inject(UserProfileService) as TestableUserProfileService;
    service.nextProfile = { ...PROFILE };
  });

  it('reutiliza el perfil dentro del TTL con un solo fetch', () => {
    const first = read(service.getUserProfile('u1'));

    service.nextProfile = { ...PROFILE, rol: 'maestro' };
    const second = read(service.getUserProfile('u1'));

    expect(service.fetchCount).toBe(1);
    expect(first!.rol).toBe('tutor');
    expect(second!.rol).toBe('tutor');
  });

  it('vuelve a Firestore cuando expira el TTL', () => {
    read(service.getUserProfile('u1'));

    service.nextProfile = { ...PROFILE, rol: 'maestro' };
    now += 60_001;
    const second = read(service.getUserProfile('u1'));

    expect(service.fetchCount).toBe(2);
    expect(second!.rol).toBe('maestro');
  });

  it('justo antes de expirar el TTL todavia sirve del cache', () => {
    read(service.getUserProfile('u1'));

    now += 59_999;
    read(service.getUserProfile('u1'));

    expect(service.fetchCount).toBe(1);
  });

  it('forceRefresh ignora el cache aunque el TTL siga vigente', () => {
    read(service.getUserProfile('u1'));

    service.nextProfile = { ...PROFILE, rol: 'maestro' };
    const refreshed = read(service.getUserProfile('u1', true));

    expect(service.fetchCount).toBe(2);
    expect(refreshed!.rol).toBe('maestro');
  });

  it('cachea un perfil inexistente (null) y no refetchea dentro del TTL', () => {
    service.nextProfile = null;

    expect(read(service.getUserProfile('u1'))).toBeNull();
    expect(read(service.getUserProfile('u1'))).toBeNull();
    expect(service.fetchCount).toBe(1);
  });

  it('mantiene el cache separado por uid', () => {
    read(service.getUserProfile('u1'));
    read(service.getUserProfile('u2'));

    expect(service.fetchCount).toBe(2);
  });

  it('updateUserProfile invalida el perfil cacheado', async () => {
    read(service.getUserProfile('u1'));

    await service.updateUserProfile('u1', { nombre: 'Ana' });

    read(service.getUserProfile('u1'));
    expect(service.fetchCount).toBe(2);
  });

});
