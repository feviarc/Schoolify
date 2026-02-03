import { CommonModule } from '@angular/common';

import {
  Component,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';

import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import {
  IonActionSheet,
  IonButton,
  IonButtons,
  IonChip,
  IonCol,
  IonContent,
  IonFab,
  IonFabButton,
  IonGrid,
  IonHeader,
  IonIcon,
  IonInput,
  IonInputOtp,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonModal,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonRow,
  IonSpinner,
  IonText,
  IonTitle,
  IonToast,
  IonToolbar,
} from "@ionic/angular/standalone";

import type { OverlayEventDetail } from '@ionic/core/components';
import { Observable, of ,Subscription } from 'rxjs';
import { catchError , map } from 'rxjs/operators';
import { Group, GroupCRUDService } from 'src/app/services/group-crud.service';
import { School, SchoolCRUDService } from 'src/app/services/school-crud.service';
import { Subject, SubjectCRUDService } from 'src/app/services/subject-crud.service';

@Component({
  selector: 'app-tab-schools',
  templateUrl: './tab-schools.component.html',
  styleUrls: ['./tab-schools.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonActionSheet,
    IonButton,
    IonButtons,
    IonChip,
    IonCol,
    IonContent,
    IonFab,
    IonFabButton,
    IonGrid,
    IonHeader,
    IonIcon,
    IonInput,
    IonInputOtp,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonModal,
    IonProgressBar,
    IonRadio,
    IonRadioGroup,
    IonRow,
    IonSpinner,
    IonText,
    IonTitle,
    IonToast,
    IonToolbar,
    ReactiveFormsModule,
  ]
})

export class TabSchoolsComponent implements OnInit, OnDestroy {

  @ViewChildren(IonModal) modals!: QueryList<IonModal>;

  breakpoints = [0, 0.20, 0.40, 0.60, 0.80, 1];
  classGrade = '';
  classLetter = '';
  groups: Group[] = [];
  initialBreakpoint = 1;
  isLoadingData = true;
  isSaveButtonDisabled = false;
  isSpinnerActive = false;
  isToastOpen = false;
  pin = 1111;
  schoolForm!: FormGroup;
  schools: School[] = [];
  selectedGrade = '1';
  spinnerText = '';
  subjectName = '';
  subjects: Subject[] = [];
  toastMessage = '';
  private subscriptions: Subscription[] = [];

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

  constructor(
    private formBuilder: FormBuilder,
    private groupCRUDService: GroupCRUDService,
    private schoolCRUDService: SchoolCRUDService,
    private subjectCRUDService: SubjectCRUDService
  ) {}

  ngOnInit() {
    const sub1 = this.schoolCRUDService.schools$.subscribe({
      next: schools => {
        this.schools = schools;
        if(schools.length !== 0){
          this.isLoadingData = false;
        }
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });

    const sub2 = this.groupCRUDService.groups$.subscribe({
      next: groups => {
        this.groups = groups;
      },
      error: (e) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', e);
      }
    });

    const sub3 = this.subjectCRUDService.subjects$.subscribe({
      next: subjects => {
        subjects.sort(
          (a, b) => `${a.nombre}${a.grado}`.localeCompare(`${b.nombre}${b.grado}`)
        );

        this.subjects = subjects;
      },
      error: (e) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', e);
      }
    });

    this.initForm();

    this.subscriptions.push(sub1);
    this.subscriptions.push(sub2);
    this.subscriptions.push(sub3);
  }

  ngOnDestroy(){
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get cct() {
    return this.schoolForm.get('cct')!;
  }

  private cctExistsValidator(control: AbstractControl): Observable<ValidationErrors | null> {
    if (!control.value || control.value.length !== 10) {
      return of(null);
    }

    return this.schoolCRUDService.cctExists(control.value).pipe(
      map(exists => {
        return exists ? { cctExists: true } : null;
      }),
      catchError(error => {
        console.error('❌ Escuela-MX: [tab-schools.component.ts]', error);
        return of(null);
      })
    );
  }

  closeModal(triggerId: string | undefined) {
    if(!triggerId) {
      return;
    };

    const modal = this.modals.find(m => m.trigger === triggerId);

    if(!modal) {
      return;
    }

    modal.dismiss();
    this.pin = this.generatePin();
    this.schoolForm.reset({cct: '', nombre: '', pin: this.pin});
  }

  private generatePin() {
    const min = 1111;
    const max = 9999;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  initForm() {
    this.pin = this.generatePin();

    this.schoolForm = this.formBuilder.group({
      nombre: ['', [
        Validators.required,
        Validators.minLength(15),
        Validators.maxLength(100)
      ]],
      cct: ['', [
          Validators.required,
          Validators.minLength(10),
          Validators.maxLength(10),
        ],
        [this.cctExistsValidator.bind(this)]
      ],
      pin: [this.pin]
    });

    this.schoolForm.get('cct')?.valueChanges.subscribe(value => {
      if (value) {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.schoolForm.get('cct')?.setValue(upperValue, { emitEvent: false });
        }
      }
    });

    this.schoolForm.get('nombre')?.valueChanges.subscribe(value => {
      if (value) {
        const upperValue = value.toUpperCase();
        if (value !== upperValue) {
          this.schoolForm.get('nombre')?.setValue(upperValue, { emitEvent: false });
        }
      }
    });
  }

  isNotDataChanged(school: any, updateNameInput: any, updatePinInput: any) {

    if(+updatePinInput.value < 1111) {
      return true;
    }

    const isSameSchoolName = school.nombre === updateNameInput.value ? true : false;
    const isSameSchoolPin = school.pin === +updatePinInput.value ? true : false;
    return (isSameSchoolName && isSameSchoolPin);
  }

  isValidClass() {
    return (this.classGrade && this.classLetter ? true : false);
  }

  isValidSubject() {
    return (this.subjectName !== '' ? true : false);
  }

  onAddClass() {
    const group = {
      grado: this.classGrade,
      letra: this.classLetter.toLocaleUpperCase(),
      nombre: `Grupo ${this.classGrade}° "${this.classLetter.toUpperCase()}"`
    };

    this.classGrade = '';
    this.classLetter = '';

    this.groupCRUDService.addGroup(group).subscribe({
      next: () => {},
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });
  }

  onAddSubject() {
    const subject = {
      nombre: this.subjectName.toUpperCase(),
      grado: this.selectedGrade
    };

    this.subjectCRUDService.addSubject(subject).subscribe({
      next: () => {},
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });

    this.subjectName = '';
  }

  onAddSchool() {
    if(!this.schoolForm) {
      return;
    }

    this.isSaveButtonDisabled = true;
    const school = this.schoolForm.value;

    this.schoolCRUDService.addSchool(school).subscribe({
      next: () => {
        this.closeModal('new-school-btn');
        this.isSaveButtonDisabled = false;
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });
  }

  onDeleteGroup(group: Group) {
    this.groupCRUDService.deleteGroup(group.id!).subscribe({
      next: () => {},
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });
  }

  onDeleteSchool(event: CustomEvent<OverlayEventDetail>, slidingItem: IonItemSliding, school: School) {
    slidingItem.close();

    if(!school.id || !event.detail.data) {
      return;
    }

    const action = event.detail.data.action;

    if(action === 'cancel') {
      return;
    }

    this.spinnerText = 'Eliminando...';
    this.isSpinnerActive = true;

    this.schoolCRUDService.deleteSchool(school.id).subscribe({
      next: () => {
        this.showToast(`🗑️ Se eliminó ${school.nombre}`);
        this.isSpinnerActive = false;
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      },
    });
  }

  onDeleteSubject(subject: Subject) {
    this.subjectCRUDService.deleteSubject(subject.id!).subscribe({
      next: () => {},
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });
  }

  async onModalDismiss(slidingItem: IonItemSliding) {
    await slidingItem.close();
  }


  onUpdateSchool(school: any, nameInput: any, pinInput: any) {
    const updatedData = {
      nombre: nameInput.value.toUpperCase(),
      pin: +pinInput.value
    };

    this.isSaveButtonDisabled = true;

    this.schoolCRUDService.updateSchool(school.id, updatedData).subscribe({
      next: () => {
        this.isSaveButtonDisabled = false;
      },
      error: (error) => {
        console.log('❌ Escuela-MX: [tab-schools.component.ts]', error);
      }
    });

    this.closeModal('edit-' + school.id);
  }

  setOpenToast(isOpen: boolean) {
    this.isToastOpen = isOpen;
  }

  private showToast(message: string) {
    this.toastMessage = message;
    this.isToastOpen = true;
  }

  compareWith(g1: number, g2: number) {
    return g1 === g2;
  }

  gradeHandleChange(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.selectedGrade = target.value;
  }
}
