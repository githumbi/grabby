---
"@githumbi/grabby": minor
"@githumbi/grabby-server": minor
---

Comment on several elements, or on an area, at once.

- **Drag to select.** In comment mode, press and drag: a box follows the mouse and the elements it takes in are outlined in green as you go. Let go and one comment covers all of them ("3 elements: Button “Approve”, Button “Reject”, Text “Total”"). A drag that takes in a single element is an ordinary comment, and a plain click works as before.
- **⌘-click (Ctrl-click on Windows and Linux)** adds elements one at a time; release the key to comment on them together.
- **Areas.** A drag over empty space comments on that region ("Area in Card “Your plan”"), saved relative to the element around it.
- Group and area comments get a green square marker; hovering it outlines every element (or the area) again, and clicking it edits the comment. Their screenshot shows just the selected region.
- While picking, Grabby keeps presses from reaching the page, so dragging doesn't select text and pickers that open on pointer-down stay closed.
- Comments carry `members` (one short entry per element: kind, tag, component, source, selector, preview and a plain label) or `area` (fractions of the element's box); `target` is the element around them. The export, `pull`, MCP and the inbox list every element with its file and line. The collector stores both; an older collector accepts these comments as single-element ones.
