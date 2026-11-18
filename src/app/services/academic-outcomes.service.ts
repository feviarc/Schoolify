import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

import { DesenlaceTipo, StudentDesenlace } from 'src/app/models/desenlace.model';

export interface AccreditationStudent {
  id: string;
  nombreCompleto: string;
}

export interface AccreditationsResponse {
  ciclo: string;
  subjectNombre: string;
  students: AccreditationStudent[];
  records: {[sid: string]: string};
}

export interface AccreditationEntry {
  sid: string;
  estatus: string;
}

export interface StudentAccreditationRecord {
  subjectId: string;
  subjectNombre: string;
  estatus: string;
}

export interface StudentAccreditationsResponse {
  ciclo: string;
  records: StudentAccreditationRecord[];
  desenlace: StudentDesenlace | null;
}

/** Acreditacion por materia y desenlaces del alumno (callables del servidor). */
@Injectable({
  providedIn: 'root'
})
export class AcademicOutcomesService {
  private functions = inject(Functions);

  async getAccreditations(
    gid: string,
    subjectId: string,
    ciclo: string
  ): Promise<AccreditationsResponse> {
    const callable = httpsCallable<
      {gid: string; subjectId: string; ciclo: string},
      AccreditationsResponse
    >(this.functions, 'getAccreditations');

    const {data} = await callable({gid, subjectId, ciclo});

    return data;
  }

  async saveAccreditations(
    gid: string,
    subjectId: string,
    ciclo: string,
    entries: AccreditationEntry[]
  ): Promise<{saved: number}> {
    const callable = httpsCallable<
      {gid: string; subjectId: string; ciclo: string; entries: AccreditationEntry[]},
      {saved: number}
    >(this.functions, 'saveAccreditations');

    const {data} = await callable({gid, subjectId, ciclo, entries});

    return data;
  }

  async getStudentAccreditations(
    sid: string,
    ciclo: string
  ): Promise<StudentAccreditationsResponse> {
    const callable = httpsCallable<
      {sid: string; ciclo: string},
      StudentAccreditationsResponse
    >(this.functions, 'getStudentAccreditations');

    const {data} = await callable({sid, ciclo});

    return data;
  }

  async saveDesenlace(
    sid: string,
    tipo: DesenlaceTipo,
    inicio: string | null,
    fin: string | null,
    ciclo: string
  ): Promise<{ok: boolean; desenlace: StudentDesenlace}> {
    const callable = httpsCallable<
      {sid: string; tipo: DesenlaceTipo; inicio: string | null; fin: string | null; ciclo: string},
      {ok: boolean; desenlace: StudentDesenlace}
    >(this.functions, 'saveDesenlace');

    const {data} = await callable({
      sid,
      tipo,
      inicio: inicio || null,
      fin: fin || null,
      ciclo,
    });

    return data;
  }
}
