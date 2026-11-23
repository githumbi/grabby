---
"@githumbi/grabby": patch
---

Comment markers no longer trail behind the page while it scrolls. Markers for page content now sit in page coordinates, so the browser moves them with the page itself instead of Grabby repositioning them a frame later. Markers in fixed or sticky panels stay on screen coordinates (those don't move with the page), and markers inside their own scrolling box are moved on every scroll event. A marker at the right edge is kept inside the window so it can't add a horizontal scrollbar.
