import { Component, OnDestroy, OnInit, inject } from '@angular/core';

import {
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonProgressBar,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { Subject, SubjectCRUDService } from 'src/app/services/subject-crud.service';
import { UserProfileService } from 'src/app/services/user-profile.service';


interface GradeGroup {
  grado: string;
  materias: Subject[];
}


@Component({
  selector: 'app-tab-materias',
  templateUrl: './tab-materias.component.html',
  styleUrls: ['./tab-materias.component.scss'],
  standalone: true,
  imports: [
    IonCheckbox,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonProgressBar,
    IonTitle,
    IonToast,
    IonToolbar,
  ],
})

export class TabMateriasComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private subjectCRUDService = inject(SubjectCRUDService);
  private userProfileService = inject(UserProfileService);


  uid = '';
  /** Nombres del catalogo que el maestro eligio (asi viaja en el aviso). */
  misMaterias: string[] = [];
  catalogo: Subject[] = [];
  /** El catalogo agrupado por grado, para pintarlo ordenado. */
  gruposCatalogo: GradeGroup[] = [];

  isLoading = true;
  isSaving = false;
  isToastOpen = false;

  toastMessage = '🛑';

  private subscriptions: Subscription[] = [];

  ngOnInit() {
    const sub = this.subjectCRUDService.subjects$.subscribe(subjects => {
      this.catalogo = [...subjects];
      this.pruneMaterias();
      this.buildGruposCatalogo();
    });

    this.subscriptions.push(sub);
    this.loadProfile();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  gradoLabel(grado: string): string {
    return grado ? `${grado}°` : 'General';
  }

  isSelected(nombre: string): boolean {
    return this.misMaterias.includes(nombre);
  }

  async onToggleMateria(nombre: string, checked: boolean) {
    const anterior = [...this.misMaterias];

    this.misMaterias = checked
      ? [...this.misMaterias, nombre]
      : this.misMaterias.filter(materia => materia !== nombre);

    const saved = await this.save(this.misMaterias);

    if(!saved) {
      this.misMaterias = anterior;
    }
  }

  private async loadProfile() {
    try {
      const user = await firstValueFrom(this.authService.getCurrentUser());
      this.uid = user?.uid ?? '';

      if(!this.uid) {
        return;
      }

      const profile = await firstValueFrom(this.userProfileService.getUserProfile(this.uid));
      this.misMaterias = profile?.materias ?? [];
      this.pruneMaterias();
    } catch(error) {
      console.log('❌ Schoolify: [tab-materias.component.ts]', error);
    } finally {
      this.isLoading = false;
    }
  }

  /** Deja solo nombres que existen en el catalogo (limpia texto libre viejo). */
  private pruneMaterias() {
    if(this.catalogo.length === 0 || this.misMaterias.length === 0) {
      return;
    }

    const disponibles = new Set(this.catalogo.map(materia => materia.nombre));
    this.misMaterias = this.misMaterias.filter(nombre => disponibles.has(nombre));
  }

  private buildGruposCatalogo() {
    const porGrado = new Map<string, Subject[]>();

    for(const materia of this.catalogo) {
      const grado = materia.grado ?? '';
      porGrado.set(grado, [...(porGrado.get(grado) ?? []), materia]);
    }

    this.gruposCatalogo = [...porGrado.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
      .map(([grado, materias]) => ({ grado, materias }));
  }

  /** `true` cuando la escritura se aplico; aca se avisa cuando falla. */
  private async save(materias: string[]): Promise<boolean> {
    if(!this.uid) {
      return false;
    }

    this.isSaving = true;

    const saved = await this.userProfileService.updateUserProfile(this.uid, { materias });

    this.isSaving = false;

    if(!saved) {
      this.showToast('🛑 No se pudieron guardar tus materias. Intenta de nuevo.');
    }

    return saved;
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
