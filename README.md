# Monday URL Status
This application is a webhook designed to work with a Monday board.

It checks if a URL is valid by performing a `GET` request to that URL. If the request is redirected, it populates a Monday column with the new URL. If it

It can run two kinds of checks - either on an individual URL or all URLs on the board. This depends on what is selected in the "Redirect" column.

## Location
This webhook (as of March 2025) runs on the USU Websites Monday board as an automation. It can be changed or edited through the Accessiblity Services Monday account, and is hosted on Coolify.

## File Structure
`actions.ts` - This is where the meat of the program lies. 
  - `getUrlStatus()`... checks the status of a provided URL.
  - `handleUpdate()` is what evaulates the HTTP response code, builds a JSON object, and populates the Monday board.
  - `getAllItems()` gets all items from a Monday board.

`index.ts` handles the endpoints that the webhook sends, using the functions from `actions.ts`.
  - the endpoint `check-url` checks just one URL, while `check-all-urls` checks... all of them. Self-explanatory.
  - Monday webhooks require a challenge response to verify the validity of the webhook, so that is what `app.use()` on line 31 handles.
