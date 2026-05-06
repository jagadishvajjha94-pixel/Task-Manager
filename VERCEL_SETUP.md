# Vercel deployment note

The application now uses **file-based storage only**.

On serverless platforms (including Vercel), file storage is not shared between all function instances.  
This means data such as employee logins may not be consistent across requests.

You can check the current backend at:

- `https://your-app.vercel.app/api/store-status`

Expected response:

- `backend: "file"`

For stable production behavior across instances, use a shared persistent database layer in a future update.
