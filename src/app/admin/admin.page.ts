import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  IonIcon,
  IonTabBar,
  IonTabButton,
  IonTabs
} from '@ionic/angular/standalone';


@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    IonTabBar,
    IonTabButton,
    IonTabs
  ]
})

export class AdminPage implements OnInit {

  constructor() {}

  ngOnInit() {}
}
