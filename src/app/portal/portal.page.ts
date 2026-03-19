import { CommonModule } from '@angular/common';

import {
  Component,
  HostListener,
  OnInit,
  ViewChild,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonInput,
  IonInputOtp,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonRadio,
  IonRadioGroup,
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LocalStorageService } from '../services/local-storage.service';
import { InstallAppService } from '../services/install-app-service';
import { SchoolValidationService } from '../services/school-validation.service';
import { UserProfileService } from '../services/user-profile.service';


@Component({
  selector: 'app-portal',
  templateUrl: './portal.page.html',
  styleUrls: ['./portal.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonButton,
    IonButtons,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonContent,
    IonHeader,
    IonIcon,
    IonImg,
    IonInput,
    IonInputOtp,
    IonItem,
    IonLabel,
    IonLabel,
    IonList,
    IonModal,
    IonRadio,
    IonRadioGroup,
    IonSpinner,
    IonTitle,
    IonToast,
    IonToolbar,
  ]
})

export class PortalPage implements OnInit {

  @ViewChild(IonModal) modal!: IonModal;

  cct = '';
  detectedOS = '';
  pin = '';

  selectedShift = 'TM';
  toastMessage = '🛑 Los datos de validación son incorrectos.';

  isIOS = false;
  isLoading = true;
  isToastOpen = false;

  private readonly CCT_KEY = 'schoolify_clave_centro_trabajo';
  private readonly SHIFT_KEY = 'schoolify_turno';

  get isStandalone() {
    const androidMatchMedia = window.matchMedia('(display-mode: standalone)').matches;
    const iOSMatchMedia = (window.navigator as any).standalone;
    return ( androidMatchMedia || iOSMatchMedia  === true);
  }

  constructor(
    private authService: AuthService,
    private localStorageService: LocalStorageService,
    private router: Router,
    private schoolValidationService: SchoolValidationService,
    private userProfileService: UserProfileService,
    public installAppService: InstallAppService,
  ) {}

  async ngOnInit() {
    const storedCCT = this.localStorageService.getKey(this.CCT_KEY);
    const storedShift = this.localStorageService.getKey(this.SHIFT_KEY);

    if(storedCCT) {
      this.cct = storedCCT;
    }

    if(storedShift) {
      this.selectedShift = storedShift;
    }

    await this.checkUserProfile();

    this.detectedOS = this.getOperatingSystem();
    this.isIOS = this.detectedOS === 'logo-apple' ? true : false;

    setTimeout(() => {
      this.isLoading = false;
    }, 3000);
  }

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: Event) {
    event.preventDefault();
    this.installAppService.promptStatus = event;
  }

  compareWith(g1: number, g2: number) {
    return g1 === g2;
  }

  isInvalidForm() {
    if(this.pin === null) {
      return true;
    }

    const isCctInvalid = this.cct.length !== 10;
    const isPinInvalid = String(this.pin).length !== 4;
    return isCctInvalid || isPinInvalid;
  }

  setOpenToast(openStatus: boolean) {
    this.isToastOpen = openStatus;
  }

  shiftHandleChange(event: CustomEvent) {
    const target = event.target as HTMLInputElement;
    this.selectedShift = target.value;
  }

  showInstallAppBanner() {
    this.installAppService.showInstallAppBanner();
  }

  async onContinue() {
    const cct = this.cct.toUpperCase();
    const cctShift = `${cct}${this.selectedShift}`;
    const areValidCredentials = await this.schoolValidationService.validateCredentials(cctShift, this.pin);
    const isCctSaved = this.localStorageService.saveKey(this.CCT_KEY, cct);
    const isShiftSaved = this.localStorageService.saveKey(this.SHIFT_KEY, this.selectedShift);

    if(areValidCredentials && isCctSaved && isShiftSaved) {
      this.router.navigateByUrl('/auth');
    } else {
      this.setOpenToast(true);
    }

    this.cct = '';
    this.pin = '';
    this.selectedShift = 'TM';
  }

  private getOperatingSystem() {
    const userAgent = navigator.userAgent;

    if (/iPhone|iPad/i.test(userAgent)) return 'logo-apple';
    if (/Android/i.test(userAgent)) return 'logo-android';

    return 'laptop-outline';
  }

  private async checkUserProfile() {
    try {
      const user = await firstValueFrom(this.authService.getCurrentUser());

      if(user) {
        const profile = await firstValueFrom(this.userProfileService.getUserProfile(user.uid));

        if(profile){
          switch(profile.rol) {
            case 'administrador':
              this.router.navigateByUrl('/admin-dashboard');
              break;
            case 'maestro':
              this.router.navigateByUrl('/teacher-dashboard');
              break;
            case 'tutor':
              this.router.navigateByUrl('/caregiver-dashboard');
              break;
            default:
              this.router.navigateByUrl('/portal');
          }
        }
      }
    } catch(error) {
      console.log('❌ Schoolify: [portal.page.ts]', error);
    }
  }
}
