# IC Password Auth

[![CI](https://github.com/YOUR_USERNAME/ic-password-auth/workflows/CI/badge.svg)](https://github.com/YOUR_USERNAME/ic-password-auth/actions)
[![Release](https://github.com/YOUR_USERNAME/ic-password-auth/workflows/Release/badge.svg)](https://github.com/YOUR_USERNAME/ic-password-auth/releases)

A standalone JavaScript library for password-based authentication on the Internet Computer. This library provides a simple API for implementing secure password authentication using delegation identities.

## Features

- 🔐 **Secure Key Derivation**: Uses Argon2id for password hashing
- 🎯 **Simple API**: Easy-to-use methods for sign up, sign in, and sign out
- 🌐 **Browser Ready**: Single JavaScript file (184KB) that works in any browser
- 🔒 **Delegation Support**: Creates delegation identities for secure canister interactions
- 💾 **Session Management**: Automatic session persistence with localStorage
- ⏰ **Idle Detection**: Auto-logout after 10 minutes of inactivity (configurable)
- 🔄 **Session Restoration**: Automatically restores sessions on page reload
- 📦 **Latest ICP SDK**: Built with @icp-sdk/core for modern IC development

## Installation

### Option 1: Download from GitHub Releases (Recommended)

1. Download the latest `ic-password-auth.js` from [GitHub Releases](https://github.com/YOUR_USERNAME/ic-password-auth/releases)
2. Include it in your HTML along with required dependencies:

### Option 2: Build from Source

```html
<!-- Required dependencies -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/argon2-browser/1.18.0/argon2-bundled.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js"></script>

<!-- IC Password Auth Library -->
<script src="path/to/ic-password-auth.js"></script>
```

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/ic-password-auth.git
cd ic-password-auth

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
    <!-- Required dependencies -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/argon2-browser/1.18.0/argon2-bundled.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js"></script>

    <!-- IC Password Auth Library -->
    <script src="./dist/ic-password-auth.js"></script>

    <script>
        // Initialize with session management (optional - default instance is auto-created)
        window.icpassword = new window.ICPasswordAuth({
            idleManager: {
                idleTimeout: 10 * 60 * 1000, // 10 minutes
                onIdle: () => console.log('User became idle')
            }
        });

        // Check if already authenticated (session restored from localStorage)
        if (window.icpassword.isAuthenticated()) {
            console.log('Session restored!', window.icpassword.getPrincipal());
        }

        // Sign up a new user
        async function signUp() {
            try {
                const result = await window.icpassword.signUp('myusername', 'mypassword');
                console.log('Sign up successful!');
                console.log('Principal:', result.principal);
                console.log('Expires:', result.expiresAt);
            } catch (error) {
                console.error('Sign up failed:', error);
            }
        }

        // Sign in an existing user
        async function signIn() {
            try {
                const result = await window.icpassword.signIn('myusername', 'mypassword');
                console.log('Sign in successful!');
                console.log('Principal:', result.principal);
            } catch (error) {
                console.error('Sign in failed:', error);
            }
        }

        // Get current identity
        function getCurrentIdentity() {
            const identity = window.icpassword.getIdentity();
            if (identity) {
                console.log('Current principal:', window.icpassword.getPrincipal());
            } else {
                console.log('Not authenticated');
            }
        }

        // Sign out
        function signOut() {
            window.icpassword.signOut();
            console.log('Signed out');
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
- Argon2-browser library (loaded via CDN)
- TweetNaCl library (loaded via CDN)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
