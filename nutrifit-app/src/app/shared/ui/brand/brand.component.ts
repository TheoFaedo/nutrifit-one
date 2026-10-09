import { Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-brand',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './brand.component.html',
  styleUrl: './brand.component.less',
})
export class BrandComponent {}
