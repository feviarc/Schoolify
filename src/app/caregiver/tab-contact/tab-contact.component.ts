/* eslint-disable @angular-eslint/prefer-inject */

import { Component, OnInit, inject } from '@angular/core';

import {
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonProgressBar,
  IonTitle,
  IonToolbar,
  IonMenuButton,
} from "@ionic/angular/standalone";

import { LocalStorageService } from 'src/app/services/local-storage.service';
import { SchoolCRUDService } from 'src/app/services/school-crud.service';


@Component({
  selector: 'app-tab-contact',
  templateUrl: './tab-contact.component.html',
  styleUrls: ['./tab-contact.component.scss'],
  standalone: true,
  imports: [
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonProgressBar,
    IonTitle,
    IonToolbar,
    IonMenuButton,
  ]
})

export class TabContactComponent implements OnInit {
  private localStorage = inject(LocalStorageService);
  private schoolCRUDService = inject(SchoolCRUDService);


  cctShift = '';
  telefono = '';

  isLoading = true;

  private readonly CCT_KEY = this.localStorage.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorage.SHIFT_KEY;

  /** Telefono en formato (000) 000-0000; si no son 10 digitos, se deja tal cual. */
  get telefonoFormateado(): string {
    const digitos = this.telefonoDigitos;

    if(digitos.length !== 10) {
      return this.telefono;
    }

    return `(${digitos.slice(0, 3)}) ${digitos.slice(3, 6)}-${digitos.slice(6)}`;
  }

  /** Solo digitos, para el enlace `tel:` (marcar con parentesis y guiones falla). */
  get telefonoDigitos(): string {
    return this.telefono.replace(/\D/g, '');
  }

  ngOnInit() {
    const cct = this.localStorage.getKey(this.CCT_KEY);
    const shift = this.localStorage.getKey(this.SHIFT_KEY);
    this.cctShift = `${cct}${shift}`;

    this.loadSchoolContact();
  }

  /**
   * Los datos de contacto salen del documento de la escuela, no del perfil de un
   * maestro: el telefono es un dato de la escuela y antes dependia de que existiera
   * un usuario con rol maestro que ademas lo hubiera llenado.
   */
  private async loadSchoolContact() {
    const school = await this.schoolCRUDService.getMySchool(this.cctShift);

    this.telefono = school?.telefono ?? '';
    this.isLoading = false;
  }
}
