---
"@githumbi/grabby": patch
---

The element you clicked stays selected while you write its comment. Moving the mouse used to move the highlight onto whatever was underneath, so it was unclear which element the comment would go to (and a click elsewhere quietly switched it). Now the highlight stays on the chosen element, the crosshair lines hide and the normal cursor returns until you save or cancel, and clicks on the page are ignored. Pages that guard their own pointer handlers with `body.grabby-crosshair-active` stay guarded: the class remains, and `body.grabby-crosshair-held` is added while a comment is open.
