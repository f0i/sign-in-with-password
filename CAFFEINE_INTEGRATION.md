# IC Password Auth Integration for Caffeine.ai

## Overview

IC Password Auth is a password-based authentication library for the Internet Computer. Use this library to add username/password login to your IC application without requiring users to have a wallet or Internet Identity.

## Integration Instructions

### 1. Add the Script to Your HTML

Include the IC-hosted library in your HTML `<head>` or before the closing `</body>` tag:

```html
<!-- IC Password Auth Library - hosted on Internet Computer -->
<script
  src="https://fs6xl-xiaaa-aaaah-aqzwa-cai.icp0.io/static/v0.1.1/ic-password-auth.js"
  integrity="sha256-PQHVAuIGK2Sc6GGCU2Ihacf8anFUIc7dKJeV0x3+32o="
  crossorigin="anonymous">
</script>
```

**Hash (SHA-256):** `3d01d502e2062b649ce8618253622169c7fc6a715421cedd289795d31dfedf6a`

### 2. Initialize the Library

After the script loads, initialize the authentication:

```javascript
// The library creates a global `window.icpassword` instance automatically
// Optionally customize with configuration:
window.icpassword = new window.ICPasswordAuth({
  idleManager: {
    idleTimeout: 10 * 60 * 1000, // 10 minutes auto-logout
    onIdle: () => {
      console.log('User became idle, logging out...');
      window.icpassword.signOut();
    }
  }
});
```

### 3. Implement Sign Up

```javascript
async function handleSignUp(username, password) {
  try {
    const result = await window.icpassword.signUp(username, password);
    console.log('✅ Sign up successful!');
    console.log('Principal:', result.principal);
    console.log('Expires at:', result.expiresAt);
    console.log('Is new user:', result.isNewUser);

    // Store the principal or redirect to dashboard
    return result;
  } catch (error) {
    console.error('❌ Sign up failed:', error);
    throw error;
  }
}
```

### 4. Implement Sign In

```javascript
async function handleSignIn(username, password) {
  try {
    const result = await window.icpassword.signIn(username, password);
    console.log('✅ Sign in successful!');
    console.log('Principal:', result.principal);

    // Redirect to dashboard or update UI
    return result;
  } catch (error) {
    console.error('❌ Sign in failed:', error);
    throw error;
  }
}
```

### 5. Check Authentication Status

```javascript
// On page load, check if user has an active session
function checkAuthStatus() {
  if (window.icpassword.isAuthenticated()) {
    const principal = window.icpassword.getPrincipal();
    console.log('✅ User is logged in as:', principal);
    // Show authenticated UI
    return true;
  } else {
    console.log('❌ User is not logged in');
    // Show login form
    return false;
  }
}

// Call on page load
window.addEventListener('DOMContentLoaded', checkAuthStatus);
```

### 6. Get Identity for Canister Calls

```javascript
async function callBackendCanister() {
  // Get the delegation identity
  const identity = window.icpassword.getIdentity();

  if (!identity) {
    throw new Error('User not authenticated');
  }

  // Create an agent with the identity
  const agent = await window.icpassword.createAgent();

  // Use the agent to create an actor for your backend canister
  const actor = Actor.createActor(yourIdlFactory, {
    agent,
    canisterId: 'your-canister-id'
  });

  // Make authenticated calls
  const result = await actor.yourMethod();
  return result;
}
```

### 7. Implement Sign Out

```javascript
function handleSignOut() {
  window.icpassword.signOut();
  console.log('✅ Signed out successfully');
  // Redirect to login page or update UI
}
```

## Complete Example UI

```html
<!DOCTYPE html>
<html>
<head>
  <title>My IC App</title>
  <script
    src="https://fs6xl-xiaaa-aaaah-aqzwa-cai.icp0.io/static/v0.1.1/ic-password-auth.js"
    integrity="sha256-PQHVAuIGK2Sc6GGCU2Ihacf8anFUIc7dKJeV0x3+32o="
    crossorigin="anonymous">
  </script>
</head>
<body>
  <!-- Login Form -->
  <div id="loginForm">
    <h2>Login</h2>
    <input type="text" id="username" placeholder="Username">
    <input type="password" id="password" placeholder="Password">
    <button onclick="login()">Sign In</button>
    <button onclick="signup()">Sign Up</button>
  </div>

  <!-- Dashboard (hidden by default) -->
  <div id="dashboard" style="display:none;">
    <h2>Welcome!</h2>
    <p>Principal: <span id="userPrincipal"></span></p>
    <button onclick="logout()">Sign Out</button>
  </div>

  <script>
    // Initialize on page load
    window.addEventListener('DOMContentLoaded', () => {
      if (window.icpassword.isAuthenticated()) {
        showDashboard();
      }
    });

    async function signup() {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        await window.icpassword.signUp(username, password);
        showDashboard();
      } catch (error) {
        alert('Sign up failed: ' + error.message);
      }
    }

    async function login() {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      try {
        await window.icpassword.signIn(username, password);
        showDashboard();
      } catch (error) {
        alert('Login failed: ' + error.message);
      }
    }

    function logout() {
      window.icpassword.signOut();
      showLogin();
    }

    function showDashboard() {
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('dashboard').style.display = 'block';
      document.getElementById('userPrincipal').textContent =
        window.icpassword.getPrincipal();
    }

    function showLogin() {
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('dashboard').style.display = 'none';
    }
  </script>
</body>
</html>
```

## Key Features

- 🔐 **Secure**: Uses Argon2id for password hashing
- 💾 **Automatic Session Persistence**: Sessions are saved to localStorage and restored on page reload
- ⏰ **Idle Detection**: Automatically logs out users after 10 minutes of inactivity (configurable)
- 🔄 **Session Restoration**: No need to log in again after page refresh
- 📦 **Zero Dependencies**: Fully self-contained script, no other libraries needed

## API Reference

### Main Methods

- `signUp(username, password)` - Create new account and sign in
- `signIn(username, password)` - Sign in with existing account
- `signOut()` - Clear session and log out
- `isAuthenticated()` - Check if user is logged in
- `getPrincipal()` - Get user's principal as string
- `getExpiresAt()` - Get session expiration date
- `getIdentity()` - Get DelegationIdentity for canister calls
- `createAgent()` - Create HTTP agent configured with user's identity

### Configuration Options

```javascript
new ICPasswordAuth({
  delegationCanisterId: 'your-canister-id', // Default: auto-detected
  host: 'https://ic0.app',                   // IC host
  fetchRootKey: false,                       // Only true for local dev
  idleManager: {
    idleTimeout: 10 * 60 * 1000,             // Milliseconds until auto-logout
    onIdle: () => { /* custom handler */ },
    captureScroll: false                     // Track scroll as activity
  },
  onProgress: (msg, step, total) => {        // Optional progress callback
    console.log(`${msg} (${step}/${total})`);
  },
  debug: false                               // Enable debug logging
})
```

## Documentation

Full documentation: https://github.com/f0i/sign-in-with-password

## Support

- Feedback form: https://feedback-g5y.caffeine.xyz/?app=password-demo
- Issues: https://github.com/f0i/sign-in-with-password/issues
