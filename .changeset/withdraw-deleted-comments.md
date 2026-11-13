---
"@githumbi/grabby": patch
"@githumbi/grabby-server": patch
---

Deleting a comment that was already sent now deletes it on the feedback server too, so `pull`, the inbox and MCP no longer return it. The delete waits out the 8-second Undo window (Undo cancels it), is retried like any send, and goes out at once if the reviewer leaves the page. The collector accepts it only from the browser session that wrote the comment, with the project key and an allowed site, as for screenshots. Finish review's Done and `clearComments()` still only tidy the reviewer's browser.
