# Role-based login setup

## Manager login (email + password)

- **Default credentials:** `manager@company.com` / `Manager@123`
- Stored in `data/manager.json` (password is hashed).
- Manager can **change password** anytime: click **Change password** in the navbar (Manager only).
- To change the default manager email or name, edit `data/manager.json` (and set a new password via the app).

## Employee login (Google / Gmail)

Employees sign in with **Google (Gmail)**. Their **name from their Google account** is shown automatically in the app.

### Enable Google Sign-In

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project or select one.
3. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
4. Application type: **Web application**.
5. Add **Authorized JavaScript origins**: e.g. `http://localhost:3000` (and your production URL).
6. Copy the **Client ID** (e.g. `123456789-xxxx.apps.googleusercontent.com`).
7. In **index.html**, find:
   ```html
   window.GOOGLE_CLIENT_ID = '';
   ```
   and set it to your Client ID:
   ```html
   window.GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
   ```

After that, the **Sign in with Google** button will work. Employees sign in with Gmail and their Google name is used in the app.
