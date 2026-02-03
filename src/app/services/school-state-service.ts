import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { School } from '../services/school-crud.service';


@Injectable({ providedIn: 'root' })

export class SchoolStateService {

  private schoolSubject = new BehaviorSubject<School | null>(null);

  school$ = this.schoolSubject.asObservable();

  setSchool(value: School) {
    this.schoolSubject.next(value);
  }
}
