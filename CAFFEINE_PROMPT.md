# Caffeine.ai Integration Prompt

Add password-based authentication to my Internet Computer application using IC Password Auth.

**Add this script to the HTML head:**

```html
<script
  src="https://fs6xl-xiaaa-aaaah-aqzwa-cai.icp0.io/static/v0.1.1/ic-password-auth.js"
  integrity="sha256-PQHVAuIGK2Sc6GGCU2Ihacf8anFUIc7dKJeV0x3+32o="
  crossorigin="anonymous">
</script>
```

**Implementation:**

Create a login page with username and password input fields. The library automatically creates a `window.icpassword` global object.

**Authentication flow:**

```javascript
// On page load - check if user is already logged in
if (window.icpassword.isAuthenticated()) {
  const principal = window.icpassword.getPrincipal();
  // Show authenticated UI
}

// Handle login/signup - signUp() works for both new and existing users
async function authenticate(username, password) {
  const result = await window.icpassword.signUp(username, password);

  if (result.isNewUser) {
    // New account created
  } else {
    // Existing user signed in
  }

  // Show dashboard, store principal, etc.
}

// Handle logout
function logout() {
  window.icpassword.signOut();
  // Redirect to login page
}
```

**For authenticated backend calls:**

```javascript
const identity = window.icpassword.getIdentity();
const agent = await window.icpassword.createAgent();

// Use the agent with the backend canister
const actor = Actor.createActor(idlFactory, {
  agent,
  canisterId: backendCanisterId
});

// Make authenticated calls
const data = await actor.getData();
```

**Features automatically included:**
- Sessions persist across page reloads (localStorage)
- Auto-logout after 10 minutes of inactivity
- No wallet or Internet Identity required

Create a complete authentication flow with login page, protected routes, and integrate with the backend canister for authenticated API calls.
