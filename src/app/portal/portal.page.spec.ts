import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { IonInputOtp } from '@ionic/angular/standalone';


/**
 * Canario del contrato del PIN.
 *
 * `PortalPage.onContinue()` pasa `this.pin` a `validateCredentials(cct, pin: number)`,
 * que consulta `where('pin', '==', pin)`. La igualdad de Firestore distingue tipos
 * (`valueEquals` devuelve false si `typeOrder` difiere) y en `escuelas` el PIN esta
 * guardado como number, asi que el portal DEBE enviar un number.
 *
 * Ese number no lo produce nuestro codigo: lo produce el value accessor de
 * `@ionic/angular`, porque `ion-input-otp` usa `type="number"` por defecto y aplica
 * parseFloat (null cuando el campo esta vacio). Si una version futura de Ionic cambia
 * ese default, la validacion de escuela deja de funcionar EN SILENCIO: todo compila,
 * ningun test falla, y ninguna escuela valida. Este spec existe para que falle ruidosamente.
 */
@Component({
  standalone: true,
  imports: [FormsModule, IonInputOtp],
  template: '<ion-input-otp [(ngModel)]="pin"></ion-input-otp>',
})
class PinContractHostComponent {
  pin: number | null = null;
}


describe('Contrato del PIN con ion-input-otp', () => {

  let fixture: ComponentFixture<PinContractHostComponent>;
  let otp: HTMLElement & { value: string | number | null; type?: string };

  /** El accessor solo propaga si el valor cambio, asi que se simula el evento real. */
  function typePin(value: string) {
    otp.value = value;
    otp.dispatchEvent(new CustomEvent('ionInput'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    fixture = TestBed
      .configureTestingModule({ imports: [PinContractHostComponent] })
      .createComponent(PinContractHostComponent);

    // Imprescindible: el primer detectChanges inicializa ngModel
    // (registerOnChange + writeValue). Sin el, onChange sigue siendo el no-op
    // por defecto de ValueAccessor y el test no probaria nada.
    fixture.detectChanges();
    await fixture.whenStable();

    otp = fixture.nativeElement.querySelector('ion-input-otp');
    expect(otp).withContext('ion-input-otp no se renderizo').toBeTruthy();
  });

  it('expone type="number" por defecto (el invariante del que depende todo)', () => {
    expect(otp.type).toBe('number');
  });

  it('entrega un NUMBER al ngModel, no un string', () => {
    typePin('1234');

    expect(fixture.componentInstance.pin).toBe(1234);
    expect(typeof fixture.componentInstance.pin).toBe('number');
  });

  it('entrega null cuando el campo se vacia (lo que usa isInvalidForm)', () => {
    typePin('1234');
    expect(fixture.componentInstance.pin).toBe(1234);

    typePin('');

    expect(fixture.componentInstance.pin).toBeNull();
  });

});
