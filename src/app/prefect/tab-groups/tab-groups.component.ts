import { Component, OnDestroy, OnInit, QueryList, ViewChildren, inject } from '@angular/core';

import { Router } from '@angular/router';

import {
  IonActionSheet,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonPicker,
  IonPickerColumn,
  IonPickerColumnOption,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from "@ionic/angular/standalone";

  import { ActionSheetButton, OverlayEventDetail } from '@ionic/core/components';
  import { Subscription, firstValueFrom } from 'rxjs';
  import { AuthService } from 'src/app/services/auth.service';
  import { GroupCRUDService, Group } from 'src/app/services/group-crud.service';
  import { LocalStorageService } from 'src/app/services/local-storage.service';
  import { School } from 'src/app/services/school-crud.service';
  import { SchoolStateService } from 'src/app/services/school-state-service';
  import { StudentCRUDService, Student } from 'src/app/services/student-crud.service';
  import { StudentGroupCRUDService, StudentGroup } from 'src/app/services/student-group-crud.service';
  import { UserProfileService } from 'src/app/services/user-profile.service';


@Component({
  selector: 'app-teacher-tab-groups',
  templateUrl: './tab-groups.component.html',
  styleUrls: ['./tab-groups.component.scss'],
  standalone: true,
  imports: [
    IonActionSheet,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonFab,
    IonFabButton,
    IonFooter,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonPicker,
    IonPickerColumn,
    IonPickerColumnOption,
    IonProgressBar,
    IonRadio,
    IonRadioGroup,
    IonSearchbar,
    IonSpinner,
    IonTitle,
    IonToast,
    IonToolbar,
  ]
})

export class TabGroupsComponent  implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private groupCRUDService = inject(GroupCRUDService);
  private localStorageService = inject(LocalStorageService);
  private schoolStateService = inject(SchoolStateService);
  private studentCRUDService = inject(StudentCRUDService);
  private studentGroupCRUDService = inject(StudentGroupCRUDService);
  private userProfileService = inject(UserProfileService);


  @ViewChildren(IonModal) modals!: QueryList<IonModal>;

  pickerValue!: string;
  selectedStudent!: any;
  studentsCounterByGroup: any;

  schoolInfo: School | null = null;
  breakpoints = [0, 1];
  initialBreakpoint = 1;

  isFirstEmission = true;
  isLoading = true;
  isSpinnerActive = false;
  isToastOpen = false;

  spinnerText = '';
  tabMessage = 'No hay alumnos por registrar';
  toastMessage = '🛑';

  filteredStudentsWithGroup: Student[] = [];
  filteredStudentsWithoutGroup: Student[] = [];
  groupsInfo: Group[] = [];
  /** Grupos de la escuela completa; `studentGroups` es lo que se pinta. */
  private allStudentGroups: StudentGroup[] = [];
  studentGroups: StudentGroup[] = [];
  studentsListByGroup: Student[] = [];
  studentsWithGroup: Student[] = [];
  studentsWithoutGroup: Student[] = [];

  /** Perfil del usuario: el `maestro` solo ve sus grupos; el `prefecto` los administra. */
  rol = '';
  uid = '';
  /** `gid` de los grupos que este maestro decidio seguir. */
  misGrupos: string[] = [];

  private subscriptions: Subscription[] = [];

  private readonly CCT_KEY = this.localStorageService.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorageService.SHIFT_KEY;

  public actionSheetButtons: ActionSheetButton[] = [
    {
      text: 'Eliminar',
      role: 'destructive',
      data: {
        action: 'delete',
      }
    },
    {
      text: 'Cancelar',
      role: 'cancel',
      data: {
        action: 'cancel',
      },
    },
  ];

  /** Botones del action sheet con el que el maestro vincula un grupo. */
  public linkGroupButtons: ActionSheetButton[] = [];

  public logoutActionSheetButtons = [
    {
      text: 'Aceptar',
      role: 'accept',
      data: {
        action: 'accept',
      }
    },
    {
      text: 'Cancelar',
      role: 'cancel',
      data: {
        action: 'cancel',
      },
    },
  ];

  get isMaestro(): boolean {
    return this.rol === 'maestro';
  }

  get deleteGroupHeader(): string {
    return this.isMaestro
      ? 'Presiona "Quitar de mi lista" para dejar de ver este grupo'
      : 'Presiona el botón Eliminar para borrar';
  }

  ngOnInit() {
    const cct = this.localStorageService.getKey(this.CCT_KEY);
    const shift = this.localStorageService.getKey(this.SHIFT_KEY);
    const cctShift = `${cct}${shift}`;

    this.loadSchoolInfo();
    this.loadCurrentUser();
    this.loadStudentsGroups(cctShift);
    this.loadStudents(cctShift);
  }

  ngOnDestroy() {
     this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  closeModal(triggerId: string) {
    if(!triggerId) {
      return;
    }

    const modal = this.modals.find(m => m.trigger === triggerId);

    if(!modal) {
      return;
    }

    modal.dismiss();
  }

  generateGroupId(group: Group | undefined) {
    return `${this.schoolInfo?.cct}_${group?.grado}-${group?.letra}`;
  }

  handleInputAddModalSearchbar(event: CustomEvent) {
    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toUpperCase() || '';

    this.filteredStudentsWithoutGroup = this.studentsWithoutGroup.filter(
      (student) => student.nombreCompleto.includes(query)
    );

    if(this.filteredStudentsWithoutGroup.length === 0) {
      this.tabMessage = `No se encontraron alumnos con la frase "${query}". Puedes intentar buscar colocando o quitando acentos en tu búsqueda.`;
    }
  }

  handleInputDeleteModalSearchbar(event: CustomEvent, group: StudentGroup) {
    if(!event.detail.event || !event.detail.value) {
      this.loadStudentsListByGroup(group);
      return;
    }

    const target = event.target as HTMLIonSearchbarElement;
    const query = target.value?.toUpperCase() || '';

    this.studentsListByGroup = this.studentsWithGroup.filter(
      (student) => student.nombreCompleto.includes(query)
    );

    if(this.studentsListByGroup.length === 0) {
      this.tabMessage = `No se encontraron alumnos con la frase "${query}". Puedes intentar buscar colocando o quitando acentos en tu búsqueda.`;
    }
  }

  loadGroupsInfo() {
    const sub = this.groupCRUDService.getGroups().subscribe({
      next: groups => {
        this.groupsInfo = groups;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-groups.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  loadStudents(cct: string) {
    if(!cct) {
      return;
    }

    const sub1 = this.studentCRUDService.getStudentsWithoutGroupByCCT(cct).subscribe({
      next: (students) => {
          students.sort(
            (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)
          );
          this.studentsWithoutGroup = students;
          this.filteredStudentsWithoutGroup = [...students];
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-groups.component.ts]', error);
      }
    });

    const sub2 = this.studentCRUDService.getStudentsWithGroupByCCT(cct).subscribe({
      next: (students) => {
        students.sort(
          (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto)
        );

        this.studentsWithGroup = students;
        this.filteredStudentsWithGroup = [...students];

        this.studentsCounterByGroup = this.studentsWithGroup.reduce(
          (acc: { [key: string]: number }, student) => {
            const gid = student.gid || '';
            acc[gid] = (acc[gid] || 0) + 1;
            return acc;
          },{}
        );
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-groups.component.ts]', error);
      }
    });

    this.subscriptions.push(sub1);
    this.subscriptions.push(sub2);
  }

  loadStudentsGroups(cct: string) {
    if(!cct) {
      return;
    }

    const sub = this.studentGroupCRUDService.getStudentGroupsByCCT(cct).subscribe({
      next: groups => {
        this.allStudentGroups = groups;
        this.applyGroupFilter();
        this.isLoading = false;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-groups.component.ts]', error);
      }
    });

    this.subscriptions.push(sub);
  }

  loadStudentsListByGroup(group: StudentGroup) {
    this.studentsListByGroup = this.studentsWithGroup.filter(
      (student) => student.gid === group.gid
    );
  }

  loadSchoolInfo() {
    const sub = this.schoolStateService.school$.subscribe(
      school => {
        this.schoolInfo = school;
      }
    );

    this.subscriptions.push(sub);
  }

  async onDeleteGroup(event: CustomEvent<OverlayEventDetail>, group: StudentGroup) {

    if(!event.detail.data) {
      return;
    }

    const action = event.detail.data.action;

    if(action === 'cancel') {
      return;
    }

    // El maestro no borra el grupo de la escuela: solo lo saca de su lista.
    if(this.isMaestro) {
      await this.saveGroups(
        this.misGrupos.filter(gid => gid !== group.gid),
        `✅ Se quitó el Grupo ${group.grado}° "${group.letra}" de tu lista.`
      );
      return;
    }

    this.spinnerText = 'Eliminando...';
    this.isSpinnerActive = true;

    const sub = this.studentGroupCRUDService.deleteStudentGroup(group.gid).subscribe({
      next: () => {
        this.showToast(`🗑️ Se eliminó Grupo ${group.grado}° "${group.letra}"`);
        this.isSpinnerActive = false;
      },
      error: (error) => {
        console.log('❌ Schoolify: [tab-groups.component.ts]', error);
        // La funcion explica por que no se puede (por ejemplo, si tiene alumnos).
        this.showToast(`🛑 ${error.message}`);
        this.isSpinnerActive = false;
      }
    });

    this.subscriptions.push(sub);
  }

  /** Vincula al maestro con el grupo que eligio en el action sheet. */
  async onLinkGroup(event: CustomEvent<OverlayEventDetail>) {
    const gid = event.detail.data?.gid;

    if(!gid || this.misGrupos.includes(gid)) {
      return;
    }

    const group = this.allStudentGroups.find(g => g.gid === gid);
    const nombre = group ? `Grupo ${group.grado}° "${group.letra}"` : 'el grupo';

    await this.saveGroups(
      [...this.misGrupos, gid],
      `✅ Se agregó el ${nombre} a tus grupos.`
    );
  }

  onDidDismiss(event: CustomEvent) {
    if(!event.detail.data) {
      return;
    }

    const selectedGroup = this.groupsInfo.find(g => g.id === this.pickerValue);
    const gid = this.generateGroupId(selectedGroup) ?? '';
    const groupExists = this.studentGroups.some(g => g.gid === gid);

    if(groupExists) {
      this.showToast(`🛑 El ${selectedGroup?.nombre} ya existe.` );
      return;
    }

    const newGroup: StudentGroup = {
      gid,
      cct: this.schoolInfo?.cct ?? '',
      grado: selectedGroup?.grado ?? '',
      letra: selectedGroup?.letra ?? '',
      alumnos: []
    };

    const sub = this.studentGroupCRUDService.addStudentGroup(newGroup).subscribe({
      next: () => {
        this.showToast(`✅ Se agregó el ${selectedGroup?.nombre ?? 'grupo'}.`);
      },
      error: (error) => {
        // Antes fallaba en silencio: si la regla o la red lo impedian, el usuario
        // solo veia que "no pasaba nada".
        console.error('❌ Schoolify: [tab-groups.component.ts]', error);
        this.showToast(`🛑 ${error.message}`);
      }
    });
    this.subscriptions.push(sub);
  }

  onDidDismissAddStudentModal() {
    this.selectedStudent = '';
    this.filteredStudentsWithoutGroup = [...this.studentsWithoutGroup];
  }

  onDidDismissRemoveStudentModal() {
    this.selectedStudent = '';
  }

  onIonChange(event: CustomEvent) {
    this.pickerValue = event.detail.value;
  }

  onLogout(event: CustomEvent<OverlayEventDetail>) {
    const eventButton = event.detail.data;

    if(!eventButton || eventButton.action === 'cancel') {
      return;
    }

    this.authService.logout().subscribe({
      next: () => {
        this.router.navigateByUrl('/auth');
      },
      error: error => {
        console.log('❌ Schoolify: [tab-groups.component.ts]', error);
      }
    });
  }

  selectStudentCompareWith(s1: Student, s2: Student): boolean {
    return s1.id === s2.id;
  }

  selectStudentHandleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.selectedStudent = target.value;
  }

  async onAddStudent(group: StudentGroup, searchbar: IonSearchbar) {
    searchbar.value = '';
    await this.studentCRUDService.assignGroup(this.selectedStudent.id, group.gid);
    this.selectedStudent = null;
  }

  async onDeleteStudent(group: StudentGroup, searchbar: IonSearchbar) {
    searchbar.value = '';
    await this.studentCRUDService.removeGroup(this.selectedStudent.id);
    this.loadStudentsListByGroup(group);
    this.selectedStudent = null;
  }

  /**
   * Perfil del docente. El `maestro` ve solo los grupos que vinculo; el `prefecto`
   * sigue administrando todos los de la escuela. El catalogo de grupos se carga
   * solo para el prefecto: el maestro no da de alta grupos.
   */
  private async loadCurrentUser() {
    try {
      const user = await firstValueFrom(this.authService.getCurrentUser());
      this.uid = user?.uid ?? '';

      if(!this.uid) {
        return;
      }

      const profile = await firstValueFrom(this.userProfileService.getUserProfile(this.uid));
      this.rol = profile?.rol ?? '';
      this.misGrupos = profile?.grupos ?? [];

      this.actionSheetButtons = [
        {
          text: this.isMaestro ? 'Quitar de mi lista' : 'Eliminar',
          role: 'destructive',
          data: {
            action: 'delete',
          }
        },
        {
          text: 'Cancelar',
          role: 'cancel',
          data: {
            action: 'cancel',
          },
        },
      ];

      this.applyGroupFilter();

      if(!this.isMaestro) {
        this.loadGroupsInfo();
      }
    } catch(error) {
      console.log('❌ Schoolify: [tab-groups.component.ts]', error);
    }
  }

  /** Aplica la lista del maestro sobre los grupos de la escuela. */
  private applyGroupFilter() {
    this.studentGroups = this.isMaestro
      ? this.allStudentGroups.filter(group => this.misGrupos.includes(group.gid))
      : [...this.allStudentGroups];

    this.buildLinkButtons();
  }

  /** Botones para vincular: solo los grupos que el maestro aun no sigue. */
  private buildLinkButtons() {
    if(!this.isMaestro) {
      this.linkGroupButtons = [];
      return;
    }

    const available = this.allStudentGroups.filter(
      group => !this.misGrupos.includes(group.gid)
    );

    this.linkGroupButtons = available.length > 0
      ? [
          ...available.map(group => ({
            text: `Grupo ${group.grado}° "${group.letra}"`,
            data: {
              gid: group.gid,
            }
          })),
          {
            text: 'Cancelar',
            role: 'cancel',
            data: {
              action: 'cancel',
            },
          },
        ]
      : [
          {
            text: 'No hay grupos por vincular',
            role: 'cancel',
            disabled: true,
          },
          {
            text: 'Cancelar',
            role: 'cancel',
            data: {
              action: 'cancel',
            },
          },
        ];
  }

  /** Guarda la lista de grupos del maestro y avisa el resultado. */
  private async saveGroups(grupos: string[], successMessage: string) {
    if(!this.uid) {
      return;
    }

    const saved = await this.userProfileService.updateUserProfile(this.uid, { grupos });

    if(!saved) {
      this.showToast('🛑 No se pudieron guardar tus grupos. Intenta de nuevo.');
      return;
    }

    this.misGrupos = grupos;
    this.applyGroupFilter();
    this.showToast(successMessage);
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
