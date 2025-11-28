# Quick Usage Guide

## Using the Library in Your Project

### Step 1: Copy the Built File

Copy `dist/ic-password-auth.js` to your project's assets folder.

### Step 2: Include Required Scripts

Add these scripts to your HTML file:

```html
<!-- Required dependencies (from CDN) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/argon2-browser/1.18.0/argon2-bundled.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js"></script>

<!-- IC Password Auth Library -->
<script src="path/to/ic-password-auth.js"></script>
```

### Step 3: Use the API

The library is now available globally as `window.icpassword`:

```javascript
// Sign up a new user
async function handleSignUp() {
    try {
        const result = await window.icpassword.signUp('username', 'password');
        console.log('Signed up successfully!');
        console.log('Principal:', result.principal);
        console.log('Expires:', result.expiresAt);
    } catch (error) {
        console.error('Sign up failed:', error.message);
    }
}

// Sign in an existing user
async function handleSignIn() {
    try {
        const result = await window.icpassword.signIn('username', 'password');
        console.log('Signed in successfully!');
        console.log('Principal:', result.principal);
    } catch (error) {
        console.error('Sign in failed:', error.message);
    }
}

// Check if user is authenticated
function checkAuth() {
    const principal = window.icpassword.getPrincipal();
    if (principal) {
        console.log('User is authenticated as:', principal);
    } else {
        console.log('User is not authenticated');
    }
}

// Sign out
function handleSignOut() {
    window.icpassword.signOut();
    console.log('Signed out');
}
```

### Step 4: Using with Canister Calls

```javascript
// After successful sign in, use the identity for canister calls
async function callCanister() {
    // Get the agent with the authenticated identity
    const agent = await window.icpassword.createAgent();

    if (!agent) {
        console.error('Not authenticated');
        return;
    }

    // Create an actor (you'll need to import your canister's IDL)
    const actor = Actor.createActor(yourIdlFactory, {
        agent,
        canisterId: 'your-canister-id'
    });

    // Call canister methods
    const result = await actor.yourMethod();
    console.log('Result:', result);
}
```

## Complete Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My IC App</title>
</head>
<body>
    <h1>My IC App</h1>

    <div id="login-form">
        <input type="text" id="username" placeholder="Username">
        <input type="password" id="password" placeholder="Password">
        <button onclick="signIn()">Sign In</button>
        <button onclick="signUp()">Sign Up</button>
    </div>

    <div id="user-info" style="display:none;">
        <p>Logged in as: <span id="principal"></span></p>
        <button onclick="signOut()">Sign Out</button>
    </div>

    <!-- Dependencies -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/argon2-browser/1.18.0/argon2-bundled.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js"></script>
    <script src="./ic-password-auth.js"></script>

    <script>
        async function signUp() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const result = await window.icpassword.signUp(username, password);
                showUserInfo(result.principal);
            } catch (error) {
                alert('Sign up failed: ' + error.message);
            }
        }

        async function signIn() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const result = await window.icpassword.signIn(username, password);
                showUserInfo(result.principal);
            } catch (error) {
                alert('Sign in failed: ' + error.message);
            }
        }

        function signOut() {
            window.icpassword.signOut();
            document.getElementById('login-form').style.display = 'block';
            document.getElementById('user-info').style.display = 'none';
        }

        function showUserInfo(principal) {
            document.getElementById('login-form').style.display = 'none';
            document.getElementById('user-info').style.display = 'block';
            document.getElementById('principal').textContent = principal;
        }
    </script>
</body>
</html>
```

## API Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `signUp(username, password)` | Create a new account | `Promise<AuthResult>` |
| `signIn(username, password)` | Sign in to existing account | `Promise<AuthResult>` |
| `getIdentity()` | Get current delegation identity | `DelegationIdentity \| null` |
| `getPrincipal()` | Get current principal as string | `string \| null` |
| `signOut()` | Clear authentication session | `void` |
| `createAgent()` | Create HTTP agent with current identity | `Promise<HttpAgent \| null>` |

## AuthResult Object

```typescript
{
    delegationIdentity: DelegationIdentity,  // The delegation identity
    principal: string,                        // User's principal ID
    expiresAt: Date,                         // When the delegation expires
    isNewUser: boolean                       // true if new account, false if existing
}
```

## Configuration

By default, the library uses:
- Delegation Canister: `fhzgg-waaaa-aaaah-aqzvq-cai`
- Host: `window.location.origin`
- Session Duration: 30 minutes

These can be customized if needed (see README.md for advanced configuration).
