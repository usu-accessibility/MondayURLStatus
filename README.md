# Monday URL Status
This application is a webhook designed to work with a Monday board.

It checks if a URL is valid based on their HTTP response code. If the URL redirects, it populates a different Monday column with the new URL.

It can run two kinds of checks - either on an individual URL or all URLs on the board. The kind of check run depends on the status of the "Redirect" column.

## Location
This webhook (as of March 2025) runs on the USU Websites Monday board as an automation. It can be changed or edited through the Accessiblity Services Monday account.

## File Structure
`actions.ts` - This is where the meat of the program lies. 
  - `getUrlStatus()`... checks the status of a provided URL.
  - `handleUpdate()` is what evaulates the HTTP response code, builds a JSON object, and populates the Monday board.
  - `getAllItems()` gets all items from a Monday board.

`index.ts` handles the different endpoints that the webhook sends, using the functions from `actions.ts`.
  - the endpoint `check-url` checks just one URL, while `check-all-urls` checks... all of them. Self-explanatory.
  - Monday webhooks require a challenge response to verify the validity of the webhook, so that is what the `app.use` on line 31 is.
