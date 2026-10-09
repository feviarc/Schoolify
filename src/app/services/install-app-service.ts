import { Injectable, inject } from '@angular/core';
import { LoadingService } from './loading-service';

@Injectable({ providedIn: 'root' })
export class InstallAppService {
  private loadingService = inject(LoadingService);


  private installPromptEvent: any;

  get promptStatus() {
    return this.installPromptEvent;
  }

  set promptStatus(event: any) {
    this.installPromptEvent = event;
  }

  constructor() {
    this.installPromptEvent = null;
  }

  showInstallAppBanner() {
    this.installPromptEvent.prompt();
    this.installPromptEvent.userChoice.then(
      (chosenButton: any) => {
        if (chosenButton.outcome === 'accepted') {
          this.installPromptEvent = null;
          this.loadingService.present('Instalando...', 15000);
        }
      }
    );
  }
}
