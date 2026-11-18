import { Component, Input, inject } from '@angular/core';

import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonToolbar,
} from '@ionic/angular/standalone';

import { RecurrenceCounts, RecurrenceService } from 'src/app/services/recurrence.service';

/**
 * Chip "N este mes" y, al tocarlo, el desglose mensual del alumno con
 * navegacion a meses anteriores (sin linea de tiempo).
 */
@Component({
  selector: 'app-recurrence-chip',
  templateUrl: './recurrence-chip.component.html',
  styleUrls: ['./recurrence-chip.component.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonModal,
    IonNote,
    IonToolbar,
  ]
})
export class RecurrenceChipComponent {
  @Input() sid = '';
  @Input() nombre = '';
  @Input() counts?: RecurrenceCounts | null;

  private recurrenceService = inject(RecurrenceService);

  detailOpen = false;
  detailPeriodo = '';
  detailCounts: RecurrenceCounts | null = null;

  get monthLabel(): string {
    return this.recurrenceService.monthLabel(this.detailPeriodo);
  }

  get isCurrentMonth(): boolean {
    return this.detailPeriodo === this.recurrenceService.currentPeriodo();
  }

  openDetail() {
    if(!this.counts || this.counts.total === 0) {
      return;
    }

    this.detailPeriodo = this.recurrenceService.currentPeriodo();
    this.detailCounts = this.counts;
    this.detailOpen = true;
  }

  async changeMonth(delta: number) {
    const next = this.recurrenceService.shiftPeriodo(this.detailPeriodo, delta);

    // No se navega al futuro: el resumen aun no existe.
    if(next > this.recurrenceService.currentPeriodo()) {
      return;
    }

    this.detailPeriodo = next;
    this.detailCounts = null;

    try {
      const {counts} = await this.recurrenceService.getMonth(next);
      this.detailCounts = counts[this.sid] ?? null;
    } catch(error) {
      console.log('❌ Schoolify: [recurrence-chip]', error);
    }
  }
}
