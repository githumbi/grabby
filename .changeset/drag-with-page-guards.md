---
"@githumbi/grabby": patch
---

Dragging to select several elements, or an area, now works on pages that cancel `pointerdown` while Grabby is picking (to keep their own menus and dropdowns shut). Cancelling `pointerdown` stops the browser sending `mousemove` until the button is released, so Grabby never saw the drag and treated it as a click. Grabby now follows the drag with `pointermove` as well.
