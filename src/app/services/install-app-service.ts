import { Injectable } from '@angular/core';
import { LoadingService } from './loading-service';

@Injectable({ providedIn: 'root' })
export class InstallAppService {

  private installPromptEvent: any;

  constructor(private loadingService: LoadingService) {
    this.installPromptEvent = null;
  }

  get promptStatus() {
    return this.installPromptEvent;
  }

  set promptStatus(event: any) {
    this.installPromptEvent = event;
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
