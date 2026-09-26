import { Component } from '@angular/core';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <header class="header">
      <h1 class="header-title">grabby Demo</h1>
    </header>
  `,
  styles: [`
    .header {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      background: #1e293b;
      color: white;
    }
    .header-title { font-size: 1.25rem; font-weight: 600; margin: 0; }
  `],
})
export class HeaderComponent {}
