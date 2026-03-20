import {
  Component,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';

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
  IonModal,
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
  IonToolbar, IonListHeader } from "@ionic/angular/standalone";

  import { OverlayEventDetail } from '@ionic/core/components';
  import { Subscription } from 'rxjs';
  import { AuthService } from 'src/app/services/auth.service';
  import { GroupCRUDService, Group } from 'src/app/services/group-crud.service';
  import { LocalStorageService } from 'src/app/services/local-storage.service';
  import { School } from 'src/app/services/school-crud.service';
  import { SchoolStateService } from 'src/app/services/school-state-service';
  import { StudentCRUDService, Student } from 'src/app/services/student-crud.service';
  import { StudentGroupCRUDService, StudentGroup } from 'src/app/services/student-group-crud.service';


@Component({
  selector: 'app-teacher-tab-groups',
  templateUrl: './tab-groups.component.html',
  styleUrls: ['./tab-groups.component.scss'],
  standalone: true,
  imports: [IonListHeader,
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
    IonModal,
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
  tabMessage = '';
  toastMessage = '🛑';

  filteredStudentsWithGroup: Student[] = [];
  filteredStudentsWithoutGroup: Student[] = [];
  groupsInfo: Group[] = [];
  studentGroups: StudentGroup[] = [];
  studentsListByGroup: Student[] = [];
  studentsWithGroup: Student[] = [];
  studentsWithoutGroup: Student[] = [];

  private subscriptions: Subscription[] = [];

  private readonly CCT_KEY = this.localStorageService.CCT_KEY;
  private readonly SHIFT_KEY = this.localStorageService.SHIFT_KEY;

  public actionSheetButtons = [
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

  constructor(
    private router: Router,
    private authService: AuthService,
    private groupCRUDService: GroupCRUDService,
    private localStorageService: LocalStorageService,
    private schoolStateService: SchoolStateService,
    private studentCRUDService: StudentCRUDService,
    private studentGroupCRUDService: StudentGroupCRUDService,
  ) { }

  ngOnInit() {
    const cct = this.localStorageService.getKey(this.CCT_KEY);
    const shift = this.localStorageService.getKey(this.SHIFT_KEY);
    const cctShift = `${cct}${shift}`;

    this.loadSchoolInfo();
    this.loadGroupsInfo();
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
    return `${this.schoolInfo?.cct}-${group?.grado}${group?.letra}`;
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
        this.studentGroups = groups;
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

  onDeleteGroup(
   event: CustomEvent<OverlayEventDetail>,
   slidingItem: IonItemSliding,
   group: StudentGroup
  ) {
    slidingItem.close();

    if(!event.detail.data) {
      return;
    }

    const action = event.detail.data.action;

    if(action === 'cancel') {
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
      }
    });

    this.subscriptions.push(sub);
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

    const sub = this.studentGroupCRUDService.addStudentGroup(newGroup).subscribe();
    this.subscriptions.push(sub);
  }

  onDidDismissAddStudentModal() {
    this.selectedStudent='';
    this.filteredStudentsWithoutGroup = [...this.studentsWithoutGroup];
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

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }
}
