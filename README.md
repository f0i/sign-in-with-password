# IC Password Auth

[![CI](https://github.com/f0i/sign-in-with-password/workflows/CI/badge.svg)](https://github.com/f0i/sign-in-with-password/actions)
[![Release](https://github.com/f0i/sign-in-with-password/workflows/Release/badge.svg)](https://github.com/f0i/sign-in-with-password/releases)

A standalone JavaScript library for password-based authentication on the Internet Computer. This library provides a simple API for implementing secure password authentication using delegation identities.

## Features

- 🔐 **Secure Key Derivation**: Uses Argon2id for password hashing
- 🎯 **Simple API**: Easy-to-use methods for sign up, sign in, and sign out
- 🌐 **Browser Ready**: Single JavaScript file (259KB) with all dependencies bundled
- 🔒 **Delegation Support**: Creates delegation identities for secure canister interactions
- 💾 **Session Management**: Automatic session persistence with localStorage
- ⏰ **Idle Detection**: Auto-logout after 10 minutes of inactivity (configurable)
- 🔄 **Session Restoration**: Automatically restores sessions on page reload
- 📦 **Latest ICP SDK**: Built with @icp-sdk/core for modern IC development

## Installation

### Option 1: Use IC-Hosted Version (Recommended for Simple Browser Apps)

Include the library directly from the Internet Computer - no build tools needed:

```html
<!-- IC Password Auth Library - hosted on Internet Computer -->
<script
  src="https://fs6xl-xiaaa-aaaah-aqzwa-cai.icp0.io/static/v0.2.0/ic-password-auth.js"
  integrity="sha256-kAwgPAUxbYaqMY6E2rMRn1zF3URjeSJbUYFkqPwYSUQ="
  crossorigin="anonymous">
</script>
```

**Hash (SHA-256):** `900c203c05316d86aa318e84dab3119f5cc5dd446379225b518164a8fc184944`

### Option 2: npm Package (Recommended for Modern Web Apps)

Install from npm for use in your JavaScript/TypeScript projects with bundlers:

```bash
npm install ic-password-auth
```

Then import in your code:

```javascript
import { ICPasswordAuth } from 'ic-password-auth';

const auth = new ICPasswordAuth();
await auth.signIn('username', 'password');
```

View on npm: [https://www.npmjs.com/package/ic-password-auth](https://www.npmjs.com/package/ic-password-auth)

### Option 3: Download from GitHub Releases

1. Download the latest `ic-password-auth.js` from [GitHub Releases](https://github.com/f0i/sign-in-with-password/releases)
2. Include it in your HTML:

```html
<!-- IC Password Auth Library - fully self-contained, no other dependencies needed! -->
<script src="path/to/ic-password-auth.js"></script>
```

### Option 4: Build from Source

```bash
# Clone the repository
git clone https://github.com/f0i/sign-in-with-password.git
cd sign-in-with-password

# Install dependencies
npm install

# Build the library
npm run build

# The built file will be in dist/ic-password-auth.js
```

## Quick Start

```html
<!DOCTYPE html>
<html>
<head>
    <title>IC Password Auth Example</title>
</head>
<body>
    <!-- IC Password Auth Library - fully self-contained! -->
    <script src="./dist/ic-password-auth.js"></script>

    <script>
        // Check if already authenticated (session restored from localStorage)
        if (window.icpassword.isAuthenticated()) {
            console.log('✅ Session restored!', window.icpassword.getPrincipal());
            showDashboard();
        } else {
            console.log('❌ Not authenticated');
            showLoginForm();
        }

        // Sign up a new user
        async function signUp(username, password) {
            try {
                const result = await window.icpassword.signUp(username, password);
                
                console.log('✅ New account created!');
                console.log('Principal:', result.principal);
                console.log('Session expires:', result.expiresAt);

                showDashboard();
                return result;
            } catch (error) {
                console.error('❌ Sign up failed:', error);
                throw error;
            }
        }

        // Sign in an existing user
        async function signIn(username, password) {
            try {
                const result = await window.icpassword.signIn(username, password);
                
                console.log('✅ Signed in!');
                console.log('Principal:', result.principal);
                console.log('Session expires:', result.expiresAt);

                showDashboard();
                return result;
            } catch (error) {
                console.error('❌ Sign in failed:', error);
                throw error;
            }
        }

        // Sign out
        function signOut() {
            window.icpassword.signOut();
            console.log('✅ Signed out');
            showLoginForm();
        }

        // Example UI functions
        function showLoginForm() {
            // Show your login form UI
        }

        function showDashboard() {
            // Show authenticated user dashboard
            const principal = window.icpassword.getPrincipal();
            console.log('Logged in as:', principal);
        }
    </script>
</body>
</html>
```

## API Reference

### `window.icpassword`

The library automatically creates a global `icpassword` object when included via script tag.

#### Methods

##### `signUp(username: string, password: string): Promise<AuthResult>`

Creates a new user account and returns an authentication result.

**Parameters:**
- `username` - The username for the new account
- `password` - The password for the new account

**Returns:** Promise that resolves to an `AuthResult` object

**Example:**
```javascript
const result = await window.icpassword.signUp('alice', 'secret123');
console.log(result.principal); // User's principal ID
console.log(result.isNewUser); // true if new account, false if already exists
console.log(result.expiresAt); // Delegation expiration date
```

---

##### `signIn(username: string, password: string): Promise<AuthResult>`

Authenticates an existing user and returns an authentication result.

**Parameters:**
- `username` - The username
- `password` - The password

**Returns:** Promise that resolves to an `AuthResult` object

**Example:**
```javascript
const result = await window.icpassword.signIn('alice', 'secret123');
console.log(result.principal);
```

---

##### `getIdentity(): DelegationIdentity | null`

Returns the current delegation identity if authenticated, or null if not.

**Returns:** `DelegationIdentity` or `null`

**Example:**
```javascript
const identity = window.icpassword.getIdentity();
if (identity) {
    // Use identity for canister calls
}
```

---

##### `getPrincipal(): string | null`

Returns the current principal as a string if authenticated, or null if not.

**Returns:** Principal string or `null`

**Example:**
```javascript
const principal = window.icpassword.getPrincipal();
console.log('Logged in as:', principal);
```

---

##### `getExpiresAt(): Date | null`

Returns the expiration date of the current session if authenticated, or null if not.

**Returns:** `Date` or `null`

**Example:**
```javascript
const expiresAt = window.icpassword.getExpiresAt();
if (expiresAt) {
    console.log('Session expires:', expiresAt.toLocaleString());
}
```

---

##### `signOut(): void`

Clears the current authentication session, removes stored session data, and stops the idle manager.

**Example:**
```javascript
window.icpassword.signOut();
```

---

##### `isAuthenticated(): boolean`

Checks if the user is currently authenticated.

**Returns:** `boolean`

**Example:**
```javascript
if (window.icpassword.isAuthenticated()) {
    console.log('User is logged in');
} else {
    console.log('User is not logged in');
}
```

---

##### `createAgent(): Promise<HttpAgent | null>`

Creates an HTTP agent configured with the current delegation identity.

**Returns:** Promise that resolves to an `HttpAgent` or `null` if not authenticated

**Example:**
```javascript
const agent = await window.icpassword.createAgent();
if (agent) {
    // Use agent to create actors
    const actor = Actor.createActor(idlFactory, {
        agent,
        canisterId: 'rrkah-fqaaa-aaaaa-aaaaq-cai'
    });
}
```

### Types

#### `AuthResult`

```typescript
interface AuthResult {
    delegationIdentity: DelegationIdentity;
    principal: string;
    expiresAt: Date;
    isNewUser: boolean;
}
```

## Advanced Configuration

You can create a custom instance with specific configuration:

```javascript
// For programmatic use (not via window.icpassword)
import { ICPasswordAuth } from 'ic-password-auth';

const auth = new ICPasswordAuth({
    // Delegation canister ID
    delegationCanisterId: 'your-canister-id',

    // IC host
    host: 'https://ic0.app',

    // Set to true for local development
    fetchRootKey: false,

    // Session management with idle detection
    idleManager: {
        idleTimeout: 10 * 60 * 1000, // 10 minutes (in milliseconds)
        onIdle: () => {
            console.log('User became idle');
            // Custom idle handler
        },
        captureScroll: false // Set to true to reset idle timer on scroll
    },

    // Progress callback for authentication steps
    onProgress: ({ message, step, total }) => {
        console.log(`${message} (${step}/${total})`);
        // Update your UI with progress
    },

    // Authentication state change callback
    onAuth: ({ authenticated, event, reason, principal, expiresAt, isNewUser }) => {
        console.log(`Auth: ${event} (${reason})`, { authenticated, principal });
        // Track auth state changes, analytics, etc.
    },

    // Error callback for authentication failures
    onError: (error) => {
        console.error('Auth error:', error);
        // Handle errors, show notifications, etc.
    },

    // Enable debug logging (default: false)
    debug: false,

    // Custom storage (defaults to localStorage)
    storage: {
        get: (key) => localStorage.getItem(key),
        set: (key, value) => localStorage.setItem(key, value),
        remove: (key) => localStorage.removeItem(key)
    }
});

await auth.signIn('username', 'password');
```

### Session Storage Example

Use sessionStorage instead of localStorage (session won't persist across browser restarts):

```javascript
const auth = new ICPasswordAuth({
    storage: {
        get: (key) => sessionStorage.getItem(key),
        set: (key, value) => sessionStorage.setItem(key, value),
        remove: (key) => sessionStorage.removeItem(key)
    }
});
```

### Event Callbacks

The library provides optional callbacks for tracking authentication events, progress, and errors:

#### Progress Tracking

The `onProgress` callback provides real-time feedback during authentication:

```javascript
const auth = new ICPasswordAuth({
    onProgress: ({ message, step, total }) => {
        // Update your UI - progress bar, status text, etc.
        document.getElementById('status').textContent = `${message} (${step}/${total})`;
    }
});
```

**Progress Steps:**
1. **"Hashing password..." (1/3)** - Argon2 password hashing (~250ms)
2. **"Preparing login session..." (2/3)** - Identity creation and delegation preparation
3. **"Requesting delegation..." (3/3)** - Final delegation request

#### Authentication Events

The `onAuth` callback fires on all authentication state changes:

```javascript
const auth = new ICPasswordAuth({
    onAuth: ({ authenticated, event, reason, principal, expiresAt, isNewUser }) => {
        console.log(`${event} (${reason})`, { authenticated, principal });

        // Examples:
        // - event: 'signIn', reason: 'manual' - User signed in
        // - event: 'signIn', reason: 'restore' - Session restored from storage
        // - event: 'signUp', reason: 'manual' - New user signed up
        // - event: 'signOut', reason: 'manual' - User signed out
        // - event: 'signOut', reason: 'idle' - Idle timeout
        // - event: 'signOut', reason: 'expired' - Session expired

        // Use for analytics, global UI state, logging, etc.
    }
});
```

#### Error Handling

The `onError` callback fires when authentication fails:

```javascript
const auth = new ICPasswordAuth({
    onError: (error) => {
        console.error('Authentication error:', error.message);
        // Show notification, track errors, etc.
    }
});
```

**Note:** All callbacks are optional and fire after promises resolve/reject. The promise-based API remains unchanged - use callbacks for side effects like analytics, logging, or global state management.

## How It Works

1. **Password Derivation**: The library uses Argon2id to derive a deterministic Ed25519 key pair from your username and password
2. **Delegation Request**: The derived identity requests a delegation from the authentication canister
3. **Session Identity**: A delegation identity is created for use in your session
4. **Session Persistence**: The delegation chain is stored in localStorage for automatic session restoration
5. **Idle Management**: Activity is monitored and the user is automatically logged out after inactivity
6. **Secure Operations**: All subsequent canister calls use the delegation identity, keeping your password-derived key secure

## Security Notes

- 🔐 Your password never leaves the browser
- 🔑 Keys are derived client-side using Argon2id
- 🛡️ Delegation identities prevent offline brute-force attacks
- ⏰ Session keys expire after 30 minutes (configurable)
- 💾 Sessions are automatically saved to localStorage and restored on page reload
- 🚪 Automatic logout after 10 minutes of inactivity (configurable)
- 🔒 Idle manager stops tracking after sign out for privacy

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Watch mode for development
npm run dev

# Serve example locally
npm run serve
# Then open http://localhost:8080/example.html
```

## Requirements

- Modern browser with Web Crypto API support
- Internet Computer canister with delegation support
- **No external dependencies** - Everything is bundled!

## Releases

This project uses automated releases via GitHub Actions. When a new version tag is pushed:
- The library is automatically built
- A GitHub Release is created
- Built files are uploaded as release assets

See [QUICK_RELEASE.md](QUICK_RELEASE.md) for instructions on creating releases.

## License

MIT

## Feedback

Have feedback or found a bug? Please share your thoughts using our [feedback form](https://feedback-g5y.caffeine.xyz/?app=password-demo).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Build and test (`npm run build`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Release Process

See [RELEASING.md](RELEASING.md) for detailed release instructions.
