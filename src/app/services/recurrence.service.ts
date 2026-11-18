import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

/** Conteos de avisos de un alumno en un mes. */
export interface RecurrenceCounts {
  inasistencias: number;
  incumplimientos: number;
  indisciplinas: number;
  leves: number;
  medias: number;
  graves: number;
  total: number;
}

export interface RecurrenceResponse {
  periodo: string;
  counts: {[sid: string]: RecurrenceCounts};
}

/**
 * Reincidencia mensual por alumno. La funcion filtra por rol en el servidor
 * (prefecto: escuela; maestro: sus grupos; tutor: sus hijos).
 */
@Injectable({
  providedIn: 'root'
})
export class RecurrenceService {
  private functions = inject(Functions);

  /** Cache corto: las tres pantallas comparten el mismo mes. */
  private cache = new Map<string, {response: RecurrenceResponse; expiresAt: number}>();
  private readonly TTL_MS = 60_000;

  async getMonth(periodo?: string): Promise<RecurrenceResponse> {
    const key = periodo ?? 'actual';
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.response;
    }

    const callable = httpsCallable<{periodo?: string}, RecurrenceResponse>(
      this.functions,
      'getMonthlyRecurrence'
    );

    const {data} = await callable(periodo ? {periodo} : {});
    const response: RecurrenceResponse = data ?? {
      periodo: periodo ?? this.currentPeriodo(),
      counts: {},
    };

    this.cache.set(key, {response, expiresAt: Date.now() + this.TTL_MS});

    return response;
  }

  /** Invalida el cache: tras enviar un aviso el resumen del mes cambia. */
  clear(): void {
    this.cache.clear();
  }

  /** Mes actual en formato `YYYY-MM`. */
  currentPeriodo(): string {
    const now = new Date();
    return this.formatPeriodo(now.getFullYear(), now.getMonth() + 1);
  }

  /** Mes anterior (`delta = -1`) o siguiente (`delta = 1`). */
  shiftPeriodo(periodo: string, delta: number): string {
    const [year, month] = periodo.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return this.formatPeriodo(date.getFullYear(), date.getMonth() + 1);
  }

  /** "Noviembre 2026" para el encabezado del detalle. */
  monthLabel(periodo: string): string {
    if(!periodo) {
      return '';
    }

    const [year, month] = periodo.split('-').map(Number);
    const label = new Intl.DateTimeFormat('es-MX', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month - 1, 1));

    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private formatPeriodo(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}
