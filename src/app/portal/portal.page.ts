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
  IonSpinner,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';

import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { CctStorageService } from '../services/cct-storage.service';
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
    IonSpinner,
    IonTitle,
    IonToast,
    IonToolbar,
  ]
})

export class PortalPage implements OnInit {

  @ViewChild(IonModal) modal!: IonModal;

  cct = '';
  pin = '';
  detectedOS = '';
  isIOS = false;
  isLoading = true;
  isToastOpen = false;
  toastMessage = '🛑 La clave o el PIN son incorrectos.';


  constructor(
    private authService: AuthService,
    private cctStorageService: CctStorageService,
    private router: Router,
    private schoolValidationService: SchoolValidationService,
    private userProfileService: UserProfileService,
    public installAppService: InstallAppService,
  ) {}

  async ngOnInit() {
    const cct = this.cctStorageService.getCCT();

    if(cct) {
      this.cct = cct;
    }

    await this.checkUserProfile();

    this.detectedOS = this.getOperatingSystem();
    this.isIOS = this.detectedOS === 'logo-apple' ? true : false;

    setTimeout(() => {
      this.isLoading = false;
    }, 3000);
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

  get isStandalone() {
    const androidMatchMedia = window.matchMedia('(display-mode: standalone)').matches;
    const iOSMatchMedia = (window.navigator as any).standalone;
    return ( androidMatchMedia || iOSMatchMedia  === true);
  }

  onCloseModal() {
    this.modal.dismiss(null, 'cancel');
  }

  getOperatingSystem() {
    const userAgent = navigator.userAgent;

    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'logo-apple';
    if (/Android/i.test(userAgent)) return 'logo-android';

    return 'laptop-outline';
  }

  isInvalidForm() {
    if(this.pin === null) {
      return true;
    }

    const isCctInvalid = this.cct.length !== 10;
    const isPinInvalid = String(this.pin).length !== 4;
    return isCctInvalid || isPinInvalid;
  }

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: Event) {
    event.preventDefault();
    this.installAppService.promptStatus = event;
  }

  async onContinue() {
    const areValidCredentials = await this.schoolValidationService.validateCredentials(this.cct.toUpperCase(), this.pin);
    const isCctSaved = this.cctStorageService.saveCCT(this.cct.toLocaleUpperCase());

    if(areValidCredentials && isCctSaved) {
      this.router.navigateByUrl('/auth');
    } else {
      this.setOpenToast(true);
    }

    this.cct = '';
    this.pin = '';
  }

  setOpenToast(openStatus: boolean) {
    this.isToastOpen = openStatus;
  }

  showInstallAppBanner() {
    this.installAppService.showInstallAppBanner();
  }
}
