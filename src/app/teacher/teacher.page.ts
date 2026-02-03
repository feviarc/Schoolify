import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Router } from  '@angular/router';

import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonListHeader,
  IonNote,
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonText,
  IonTitle,
  IonToolbar, IonSpinner } from '@ionic/angular/standalone';

  import { User } from 'firebase/auth';
  import { firstValueFrom } from 'rxjs';

  import { UserProfile } from '../models/user-profile.model'
  import { AuthService } from '../services/auth.service';
  import { CctStorageService } from '../services/cct-storage.service';
  import { SchoolCRUDService, School } from '../services/school-crud.service';
  import { SchoolStateService } from '../services/school-state-service';
  import { UserProfileService } from './../services/user-profile.service';


  @Component({
  selector: 'app-maestro',
  templateUrl: './teacher.page.html',
  styleUrls: ['./teacher.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonListHeader,
    IonNote,
    IonTabBar,
    IonTabButton,
    IonTabs,
    IonText,
    IonTitle,
    IonToolbar,
    ReactiveFormsModule,
  ]
})

export class TeacherPage implements OnInit {

  cct = '';
  isLoading = true;
  isSavingData = false;
  isUserActive = false;
  user: User | null = null;
  profile: UserProfile | null = null ;
  uid?: string;

  form = this.formBuilder.group({
    celular: ['',[
        Validators.required,
        Validators.pattern('^[0-9]{10}$')
    ]],
    nombre: ['',[
      Validators.required,
      Validators.pattern('^[A-Za-zÑñÁÉÍÓÚáéíóú ]+$')
    ]],
    escuela: [''],
    telefono: ['',[
        Validators.required,
        Validators.pattern('^[0-9]{10}$')
    ]]
  });

  constructor(
    private authService: AuthService,
    private cctStorageService: CctStorageService,
    private formBuilder: FormBuilder,
    private router: Router,
    private schoolStateService: SchoolStateService,
    private schoolCRUDService: SchoolCRUDService,
    private userProfileService: UserProfileService,
  ) {}

  async ngOnInit() {
    this.getSchoolName();
    await this.getCurrentUser();
    await this.getUserProfile();

    setTimeout(()=>{
      this.isLoading = false;
    }, 300);
  }

  get celular() {
    return this.form.get('celular')!;
  }

  get escuela() {
    return this.form.get('escuela');
  }

  get nombre() {
    return this.form.get('nombre')!;
  }

  get telefono() {
    return this.form.get('telefono')!;
  }

  async getCurrentUser() {
    try {
      this.user = await firstValueFrom(this.authService.getCurrentUser());
      this.uid = this.user?.uid;
    } catch(error) {
      console.log('❌ Escuela-MX: [teacher.page.ts]', error);
    }
  }

  async getUserProfile() {
    if (!this.user) {
      return;
    }
    try {
      this.profile = await firstValueFrom(this.userProfileService.getUserProfile(this.uid!));
      this.isUserActive = this.profile?.activo ?? false;
    } catch(error) {
      console.log('❌ Escuela-MX: [teacher.page.ts]', error);
    }
  }

  getSchoolName() {
    const cct = this.cctStorageService.getCCT();
    this.cct = (cct !== null ? cct : '');

    this.schoolCRUDService.getSchoolByCCT(this.cct).subscribe({
      next: school => {
        if(!school) {
          return;
        }
        this.schoolStateService.setSchool(school);
        this.form.get('escuela')?.setValue(school?.nombre);
      }
    });
  }

  onLogout() {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigateByUrl('/auth');
      },
      error: error => {
        console.log('❌ Escuela-MX: [teacher.page.ts]', error);
      }
    });
  }

  async onUpdateUserProfile() {
    if(!this.uid) {
      return;
    }

    this.isSavingData = true;

    const fields: Partial<UserProfile> = {};
    fields.celular = this.celular?.value ?? '';
    fields.nombre = this.nombre?.value ?? '';
    fields.telefono = this.telefono?.value ?? '';
    fields.escuela = this.escuela?.value ?? '';
    fields.cct = this.cct;
    fields.activo = true;

    await this.userProfileService.updateUserProfile(this.uid, fields);
    this.isUserActive = true;
    this.form.reset();
  }
}
