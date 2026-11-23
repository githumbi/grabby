---
"@githumbi/grabby": minor
---

Numbered markers. Each comment now leaves a numbered pin exactly where the reviewer clicked, so it's clear at a glance what was commented on. Hover a pin to see the comment and highlight its element; click it to edit the comment, with Save, Cancel and Delete buttons. Pins belong to the page they were made on: they hide when you move to another page (including client-side and `#/` routes) and come back when you return. They follow their element through scrolling and layout changes, hide while the element isn't rendered, and hide while the toolbar is collapsed. The click position is kept in the browser only; it is never sent to the collector, a webhook or an export.
