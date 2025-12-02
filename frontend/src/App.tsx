import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LogIn, Key, Loader2, Shield, CheckCircle2, UserPlus, Clock, AlertCircle, FileKey, Lock, Send, LogOut, User, Info } from 'lucide-react';
import { Ed25519KeyIdentity, DelegationChain, DelegationIdentity, Delegation } from '@dfinity/identity';
import { HttpAgent, Actor } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { createActorWithConfig } from './config';
import type { backendInterface } from './backend';

// Declare argon2 and nacl globals from the CDN scripts
declare global {
    interface Window {
        argon2: {
            hash: (options: {
                pass: string | Uint8Array;
                salt: string | Uint8Array;
                time?: number;
                mem?: number;
                hashLen?: number;
                parallelism?: number;
                type?: number;
            }) => Promise<{
                hash: Uint8Array;
                hashHex: string;
                encoded: string;
            }>;
            ArgonType: {
                Argon2d: number;
                Argon2i: number;
                Argon2id: number;
            };
        };
        nacl: {
            sign: {
                keyPair: {
                    fromSeed: (seed: Uint8Array) => {
                        publicKey: Uint8Array;
                        secretKey: Uint8Array;
                    };
                    (): {
                        publicKey: Uint8Array;
                        secretKey: Uint8Array;
                    };
                };
            };
        };
    }
}

interface DerivedValues {
    usernameHash: string;
    ephemeralPublicKey: string;
    derEncodedEphemeralPublicKey: string;
    expireAt: bigint;
    isNew: boolean;
    delegationPubKey: string;
    delegationSuccess: boolean;
    signInPrincipal: string;
    delegationPrincipal: string;
    authResponse?: {
        kind: string;
        authnMethod: string;
        delegations: Array<{
            pubkey: string;
            expiration: bigint;
            targets?: string[];
        }>;
        userPublicKey: string;
    };
}

// External delegation canister interface
const DELEGATION_CANISTER_ID = 'fhzgg-waaaa-aaaah-aqzvq-cai';

// PrepRes response type
type PrepRes = 
    | { ok: { expireAt: bigint; isNew: boolean; pubKey: Uint8Array } }
    | { err: string };

// AuthResponse type from the delegation canister
interface AuthResponse {
    kind: string;
    authnMethod: string;
    delegations: Array<{
        delegation: {
            pubkey: Uint8Array;
            expiration: bigint;
            targets: [] | [Principal[]];
        };
        signature: Uint8Array;
    }>;
    userPublicKey: Uint8Array;
}

// GetDelegation result type
type GetDelegationResult = 
    | { ok: { auth: AuthResponse } }
    | { err: string };

interface DelegationCanisterInterface {
    prepareDelegationPassword: (
        userId: string,
        register: boolean,
        origin: string,
        sessionKey: Uint8Array,
        expireIn: bigint,
        targets: [] | [Principal[]]
    ) => Promise<PrepRes>;
    getDelegation: (
        provider: string,
        origin: string,
        sessionKey: Uint8Array,
        expireAt: bigint,
        targets: [] | [Principal[]]
    ) => Promise<GetDelegationResult>;
}

const delegationIdlFactory = ({ IDL }: any) => {
    const ProviderKey = IDL.Text;
    const Time = IDL.Int;
    const PrepRes = IDL.Variant({
        ok: IDL.Record({
            expireAt: Time,
            isNew: IDL.Bool,
            pubKey: IDL.Vec(IDL.Nat8),
        }),
        err: IDL.Text,
    });

    const SignedDelegation = IDL.Record({
        delegation: IDL.Record({
            pubkey: IDL.Vec(IDL.Nat8),
            expiration: Time,
            targets: IDL.Opt(IDL.Vec(IDL.Principal)),
        }),
        signature: IDL.Vec(IDL.Nat8),
    });

    const AuthResponse = IDL.Record({
        kind: IDL.Text,
        authnMethod: IDL.Text,
        delegations: IDL.Vec(SignedDelegation),
        userPublicKey: IDL.Vec(IDL.Nat8),
    });

    const GetDelegationResult = IDL.Variant({
        ok: IDL.Record({
            auth: AuthResponse,
        }),
        err: IDL.Text,
    });

    return IDL.Service({
        prepareDelegationPassword: IDL.Func(
            [
                IDL.Text,                           // userId
                IDL.Bool,                           // register
                IDL.Text,                           // origin
                IDL.Vec(IDL.Nat8),                  // sessionKey
                IDL.Nat,                            // expireIn
                IDL.Opt(IDL.Vec(IDL.Principal)),    // targets
            ],
            [PrepRes],
            []
        ),
        getDelegation: IDL.Func(
            [
                ProviderKey,                        // provider
                IDL.Text,                           // origin
                IDL.Vec(IDL.Nat8),                  // sessionKey
                Time,                               // expireAt
                IDL.Opt(IDL.Vec(IDL.Principal)),    // targets
            ],
            [GetDelegationResult],
            ['query']
        ),
    });
};

/**
 * DER-encode an Ed25519 public key using Internet Identity's standard format.
 * Format: 0x302A300506032B6570032100 || pubkey
 * 
 * @param publicKey - The 32-byte Ed25519 public key
 * @returns The DER-encoded public key
 */
function derEncodePublicKey(publicKey: Uint8Array): Uint8Array {
    // Internet Identity's standard DER prefix for Ed25519 public keys
    const DER_PREFIX = new Uint8Array([
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
        0x70, 0x03, 0x21, 0x00
    ]);
    
    // Concatenate prefix and public key
    const derEncoded = new Uint8Array(DER_PREFIX.length + publicKey.length);
    derEncoded.set(DER_PREFIX, 0);
    derEncoded.set(publicKey, DER_PREFIX.length);
    
    return derEncoded;
}

function App() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [derivedValues, setDerivedValues] = useState<DerivedValues | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [message, setMessage] = useState('');
    const [messageResponse, setMessageResponse] = useState<string>('');
    const [delegationIdentity, setDelegationIdentity] = useState<DelegationIdentity | null>(null);
    const [isSendingMessage, setIsSendingMessage] = useState(false);

    const isAuthenticated = !!delegationIdentity && !!derivedValues;

    const handleAuth = async (e: FormEvent<HTMLFormElement>, action: 'signUp' | 'signIn') => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setDerivedValues(null);
        setMessageResponse('');

        try {
            // Check if argon2 is loaded
            if (!window.argon2) {
                throw new Error('Argon2 library not loaded. Please refresh the page.');
            }

            // Check if TweetNaCl is loaded
            if (!window.nacl) {
                throw new Error('TweetNaCl library not loaded. Please refresh the page.');
            }
            
            const encoder = new TextEncoder();
            
            // Compute SHA-256 hash of username for external canister authentication
            const usernameBytes = encoder.encode(username);
            const usernameHashBuffer = await crypto.subtle.digest('SHA-256', usernameBytes);
            const usernameHashArray = Array.from(new Uint8Array(usernameHashBuffer));
            const usernameHash = usernameHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            // Use salt based on prefixed username
            const salt = encoder.encode("icpasswordlogin" + username);
            const passwordBytes = encoder.encode(password);

            // Derive 32-byte seed using Argon2id
            const result = await window.argon2.hash({
                pass: passwordBytes,
                salt: salt,
                time: 3,
                mem: 65536,
                hashLen: 32,
                parallelism: 1,
                type: window.argon2.ArgonType.Argon2id,
            });

            // The derived 32-byte seed
            const seed = result.hash;

            // Generate Ed25519 key pair from the seed using TweetNaCl
            const keyPair = window.nacl.sign.keyPair.fromSeed(seed);
            const publicKeyBytes = keyPair.publicKey;
            const secretKeyBytes = keyPair.secretKey;

            // Create Internet Computer identity from the Ed25519 keypair
            const identity = Ed25519KeyIdentity.fromKeyPair(publicKeyBytes, secretKeyBytes);

            // Get sign-in identity principal
            const signInPrincipal = identity.getPrincipal().toString();

            // Initialize HttpAgent with the identity
            const httpAgent = await HttpAgent.create({
                identity: identity,
                host: window.location.origin,
            });

            // In development, fetch root key for local replica
            if (process.env.NODE_ENV !== 'production') {
                await httpAgent.fetchRootKey().catch(err => {
                    console.warn('Unable to fetch root key. Check if local replica is running:', err);
                });
            }

            // Generate ephemeral keypair for delegation
            const ephemeralKeyPair = window.nacl.sign.keyPair();
            const ephemeralPublicKey = ephemeralKeyPair.publicKey;
            const ephemeralSecretKey = ephemeralKeyPair.secretKey;

            // Convert ephemeral public key to hex for display
            const ephemeralPublicKeyHex = Array.from(ephemeralPublicKey)
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('');

            // DER-encode the ephemeral public key using Internet Identity's standard format
            const derEncodedEphemeralPublicKey = derEncodePublicKey(ephemeralPublicKey);

            // Convert DER-encoded key to hex for display
            const derEncodedEphemeralPublicKeyHex = Array.from(derEncodedEphemeralPublicKey)
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('');

            // Create ephemeral identity
            const ephemeralIdentity = Ed25519KeyIdentity.fromKeyPair(
                ephemeralPublicKey,
                ephemeralSecretKey
            );

            // Create agent for delegation canister
            const delegationAgent = await HttpAgent.create({
                identity: identity,
                host: window.location.origin,
            });

            if (process.env.NODE_ENV !== 'production') {
                await delegationAgent.fetchRootKey().catch(err => {
                    console.warn('Unable to fetch root key:', err);
                });
            }

            // Create actor for delegation canister
            const delegationActor = Actor.createActor<DelegationCanisterInterface>(
                delegationIdlFactory,
                {
                    agent: delegationAgent,
                    canisterId: DELEGATION_CANISTER_ID,
                }
            );

            // Get origin for delegation
            const origin = window.location.origin;

            // Set expiration duration to 30 minutes in nanoseconds
            // 30 minutes = 30 * 60 seconds = 1800 seconds
            // 1 second = 1_000_000_000 nanoseconds
            const expireInNanoseconds = BigInt(30 * 60) * BigInt(1_000_000_000);

            // Call prepareDelegationPassword with DER-encoded ephemeral public key
            // Argument order: (userId: text, register: bool, origin: text, sessionKey: vec nat8, expireIn: nat, targets: opt vec principal)
            const prepResult = await delegationActor.prepareDelegationPassword(
                usernameHash,                   // userId (hashed username)
                action === 'signUp',            // register (true for sign up, false for sign in)
                origin,                         // origin
                derEncodedEphemeralPublicKey,   // sessionKey (DER-encoded ephemeral public key as vec nat8)
                expireInNanoseconds,            // expireIn (duration in nanoseconds as Nat)
                []                              // targets (null/empty for now)
            );

            // Parse PrepRes response
            if ('err' in prepResult) {
                throw new Error(`Delegation preparation failed: ${prepResult.err}`);
            }

            const { expireAt, isNew, pubKey } = prepResult.ok;

            // Convert delegation public key to hex for display
            const delegationPubKeyHex = Array.from(pubKey)
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('');

            // Call getDelegation with DER-encoded ephemeral public key
            // Argument order: (provider: ProviderKey, origin: text, sessionKey: vec nat8, expireAt: Time, targets: opt vec principal)
            // ProviderKey is now IDL.Text, so pass "password" as a string
            // expireAt is already in nanoseconds from the backend response
            const delegationResult = await delegationActor.getDelegation(
                "password",                     // provider (ProviderKey as text)
                origin,                         // origin
                derEncodedEphemeralPublicKey,   // sessionKey (DER-encoded ephemeral public key)
                expireAt,                       // expireAt (in nanoseconds from prep response)
                []                              // targets (null/empty for now)
            );

            // Check if the response contains { ok: { auth } } or { err }
            if ('err' in delegationResult) {
                throw new Error(`Get delegation failed: ${delegationResult.err}`);
            }

            // Extract AuthResponse from the ok variant
            const authResponse = delegationResult.ok.auth;

            // Validate that we have delegations
            if (authResponse.delegations.length === 0) {
                throw new Error('No delegations returned from the canister');
            }

            // Map over authResponse.delegations to create a list of { delegation: Delegation, signature } objects
            const delegations = authResponse.delegations.map((signedDelegation) => {
                // Extract targets - unwrap to get the first element if present, otherwise undefined
                const targets = signedDelegation.delegation.targets.length > 0 
                    ? signedDelegation.delegation.targets[0] 
                    : undefined;

                // Create Delegation with parameters (pubkey, expiration, targets)
                const delegation = new Delegation(
                    new Uint8Array(signedDelegation.delegation.pubkey),
                    signedDelegation.delegation.expiration,
                    targets
                );

                // Convert signature to Uint8Array
                const signature = new Uint8Array(signedDelegation.signature);

                return {
                    delegation,
                    signature: signature.buffer as any,
                };
            });

            // Build the DelegationChain with DelegationChain.fromDelegations(delegations, userPublicKey)
            // Use userPublicKey from authResponse as the root of the chain
            const delegationChain = DelegationChain.fromDelegations(
                delegations,
                new Uint8Array(authResponse.userPublicKey)
            );

            // Construct the final DelegationIdentity using DelegationIdentity.fromDelegation(ephemeralIdentity, delegationChain)
            const createdDelegationIdentity = DelegationIdentity.fromDelegation(
                ephemeralIdentity,
                delegationChain
            );

            // Get delegation identity principal
            const delegationPrincipal = createdDelegationIdentity.getPrincipal().toString();

            // Store delegation identity for later use
            setDelegationIdentity(createdDelegationIdentity);

            // Format AuthResponse for display
            const formattedAuthResponse = {
                kind: authResponse.kind,
                authnMethod: authResponse.authnMethod,
                delegations: authResponse.delegations.map(sd => ({
                    pubkey: Array.from(sd.delegation.pubkey)
                        .map((b: number) => b.toString(16).padStart(2, '0'))
                        .join(''),
                    expiration: sd.delegation.expiration,
                    targets: sd.delegation.targets.length > 0 && sd.delegation.targets[0]
                        ? sd.delegation.targets[0].map(p => p.toString())
                        : undefined,
                })),
                userPublicKey: Array.from(authResponse.userPublicKey)
                    .map((b: number) => b.toString(16).padStart(2, '0'))
                    .join(''),
            };

            setDerivedValues({
                usernameHash: usernameHash,
                ephemeralPublicKey: ephemeralPublicKeyHex,
                derEncodedEphemeralPublicKey: derEncodedEphemeralPublicKeyHex,
                expireAt: expireAt,
                isNew: isNew,
                delegationPubKey: delegationPubKeyHex,
                delegationSuccess: true,
                signInPrincipal: signInPrincipal,
                delegationPrincipal: delegationPrincipal,
                authResponse: formattedAuthResponse,
            });
        } catch (err) {
            console.error('Key derivation or delegation error:', err);
            setError(err instanceof Error ? err.message : 'Failed to derive key pair or create delegation. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!message.trim()) {
            setError('Please enter a message');
            return;
        }

        if (!delegationIdentity) {
            setError('Delegation identity not available. Please sign in first.');
            return;
        }

        setError('');
        setMessageResponse('');
        setIsSendingMessage(true);

        try {
            // Create backend actor with delegation identity
            const backendActor = await createActorWithConfig({
                agentOptions: {
                    identity: delegationIdentity,
                },
            }) as backendInterface;

            // Call sendMessage
            const response = await backendActor.sendMessage(message);
            setMessageResponse(response);
            setMessage('');
        } catch (err) {
            console.error('Send message error:', err);
            setError(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handleSignOut = () => {
        setUsername('');
        setPassword('');
        setDerivedValues(null);
        setError('');
        setMessage('');
        setMessageResponse('');
        setDelegationIdentity(null);
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20">
            <header className="border-b border-border/40 backdrop-blur-sm bg-background/80 sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                            <span className="text-primary-foreground font-bold text-sm">PA</span>
                        </div>
                        <h1 className="text-xl font-semibold tracking-tight">Password Auth</h1>
                    </div>
                    {isAuthenticated && (
                        <Button onClick={handleSignOut} variant="outline" size="sm" className="gap-2">
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
                    )}
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 py-12 flex items-center justify-center">
                <Card className="w-full max-w-2xl shadow-lg border-border/50">
                    <CardHeader className="text-center space-y-2">
                        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-2">
                            <LogIn className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-2xl">Authentication</CardTitle>
                        <CardDescription>
                            {isAuthenticated 
                                ? 'You are authenticated. Send messages to the backend using your delegation identity.'
                                : 'Enter your credentials to derive your Internet Computer identity with delegation'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Top Section: Login Form and Message Input */}
                        <div className="space-y-4">
                            {/* Login Form - Hidden when authenticated */}
                            {!isAuthenticated && (
                                <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="username">Username</Label>
                                        <Input
                                            id="username"
                                            type="text"
                                            placeholder="Enter your username"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="password">Password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            placeholder="Enter your password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            disabled={isLoading}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <Button 
                                            type="button"
                                            onClick={(e) => handleAuth(e as any, 'signUp')}
                                            className="gap-2 h-11" 
                                            size="lg"
                                            disabled={isLoading}
                                            variant="default"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <UserPlus className="w-4 h-4" />
                                                    Sign Up
                                                </>
                                            )}
                                        </Button>
                                        <Button 
                                            type="button"
                                            onClick={(e) => handleAuth(e as any, 'signIn')}
                                            className="gap-2 h-11" 
                                            size="lg"
                                            disabled={isLoading}
                                            variant="secondary"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : (
                                                <>
                                                    <LogIn className="w-4 h-4" />
                                                    Sign In
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </form>
                            )}

                            {/* Message Input - Always visible, aligned with login fields */}
                            {isAuthenticated && (
                                <div className="space-y-2">
                                    <Label htmlFor="message">Send Message</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="message"
                                            type="text"
                                            placeholder="Enter your message"
                                            value={message}
                                            onChange={(e) => setMessage(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            disabled={isSendingMessage}
                                        />
                                        <Button 
                                            onClick={handleSendMessage}
                                            disabled={isSendingMessage || !message.trim()}
                                            className="gap-2"
                                        >
                                            {isSendingMessage ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Sending...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-4 h-4" />
                                                    Send
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Message Response Display */}
                        {messageResponse && (
                            <div className="p-4 rounded-lg bg-accent/10 border border-accent/30 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Backend Response
                                </div>
                                <div className="p-3 rounded-lg bg-background border border-border/50">
                                    <div className="text-sm font-mono break-all">{messageResponse}</div>
                                </div>
                            </div>
                        )}

                        {derivedValues && (
                            <div className="mt-6 space-y-4">
                                {/* Delegation Success Display */}
                                {derivedValues.delegationSuccess && (
                                    <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                                            <span className="text-green-700 dark:text-green-300">
                                                Delegation Identity Created Successfully
                                            </span>
                                        </div>
                                        <div className="text-sm text-green-800 dark:text-green-200">
                                            {derivedValues.isNew 
                                                ? 'New account created! Your delegation identity has been successfully registered.'
                                                : 'Welcome back! Your delegation identity has been successfully authenticated.'}
                                        </div>
                                    </div>
                                )}

                                {/* Enhanced Principal Display with Explanatory Text */}
                                <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300">
                                        <User className="w-4 h-4" />
                                        Identity Principals
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="text-xs font-medium text-purple-600 dark:text-purple-400">Sign-In Identity Principal:</div>
                                            <div className="font-mono text-xs break-all bg-background p-2 rounded border border-border/30 leading-relaxed">
                                                {derivedValues.signInPrincipal}
                                            </div>
                                            <div className="flex items-start gap-2 p-2 rounded bg-purple-100/50 dark:bg-purple-900/20">
                                                <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-xs text-purple-700 dark:text-purple-300">
                                                    This identity is derived deterministically from your password using Argon2id key derivation. 
                                                    It is used only during the sign-in process to authenticate with the delegation canister and is never exposed to the backend.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="text-xs font-medium text-purple-600 dark:text-purple-400">Delegation Identity Principal:</div>
                                            <div className="font-mono text-xs break-all bg-background p-2 rounded border border-border/30 leading-relaxed">
                                                {derivedValues.delegationPrincipal}
                                            </div>
                                            <div className="flex items-start gap-2 p-2 rounded bg-purple-100/50 dark:bg-purple-900/20">
                                                <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                                <p className="text-xs text-purple-700 dark:text-purple-300">
                                                    This identity is issued by the sign-in canister and is cryptographically separate from your password-derived key. 
                                                    It prevents offline brute-force attacks because an attacker cannot derive this identity from your password alone—they would need access to the delegation canister's signatures.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Enhanced How it Works / Privacy Section */}
                                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                                        <Shield className="w-4 h-4" />
                                        How it Works / Privacy
                                    </div>
                                    
                                    <div className="space-y-3 text-xs text-blue-800 dark:text-blue-200">
                                        <div className="space-y-1">
                                            <p className="font-medium">🔐 Password-Derived Key Stays in Browser:</p>
                                            <p>
                                                Your password is hashed using Argon2id entirely within your browser to derive an Ed25519 key pair. 
                                                This password-derived key never leaves your device and is used only to sign a message during the authentication process.
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <p className="font-medium">👁️ Canister Only Sees Public Information:</p>
                                            <p>
                                                The delegation canister only receives your username hash (SHA-256) and a signed message. 
                                                It never sees your password or the private key derived from it. The canister verifies the signature using your public key.
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <p className="font-medium">🛡️ Delegation Identity Prevents Offline Attacks:</p>
                                            <p>
                                                After authentication, the canister issues a delegation identity that is cryptographically separate from your password-derived key. 
                                                This delegation identity is what you use for all subsequent operations. Even if someone intercepts your delegation identity, 
                                                they cannot derive your password from it, and they cannot create new delegations without access to the canister's signing authority.
                                            </p>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <p className="font-medium">🔒 Session Isolation:</p>
                                            <p>
                                                The delegation mechanism isolates your session usage from your password-based keys. Your password-derived key is used once 
                                                during sign-in, and then the delegation identity takes over for all backend interactions. This prevents password exposure 
                                                during normal operations and limits the attack surface.
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* AuthResponse Display */}
                                {derivedValues.authResponse && (
                                    <div className="p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                            <FileKey className="w-4 h-4" />
                                            Authentication Response
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground">Kind:</div>
                                                <div className="font-mono text-xs bg-background p-2 rounded border border-border/30">
                                                    {derivedValues.authResponse.kind}
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground">Authentication Method:</div>
                                                <div className="font-mono text-xs bg-background p-2 rounded border border-border/30">
                                                    {derivedValues.authResponse.authnMethod}
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="text-xs font-medium text-muted-foreground">User Public Key:</div>
                                                <div className="font-mono text-xs break-all bg-background p-2 rounded border border-border/30 leading-relaxed">
                                                    {derivedValues.authResponse.userPublicKey}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    <strong>Length:</strong> {derivedValues.authResponse.userPublicKey.length / 2} bytes
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="text-xs font-medium text-muted-foreground">
                                                    Delegations ({derivedValues.authResponse.delegations.length}):
                                                </div>
                                                {derivedValues.authResponse.delegations.map((del, idx) => (
                                                    <div key={idx} className="p-3 bg-background rounded border border-border/30 space-y-2">
                                                        <div className="text-xs font-medium text-muted-foreground">Delegation #{idx + 1}</div>
                                                        <div className="space-y-1">
                                                            <div className="text-xs text-muted-foreground">Public Key:</div>
                                                            <div className="font-mono text-xs break-all leading-relaxed">
                                                                {del.pubkey}
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <div className="text-xs text-muted-foreground">Expiration:</div>
                                                            <div className="font-mono text-xs">
                                                                {del.expiration.toString()} ({new Date(Number(del.expiration / BigInt(1_000_000))).toLocaleString()})
                                                            </div>
                                                        </div>
                                                        {del.targets && (
                                                            <div className="space-y-1">
                                                                <div className="text-xs text-muted-foreground">Targets:</div>
                                                                <div className="font-mono text-xs break-all">
                                                                    {del.targets.join(', ')}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Hashed Username Display */}
                                <div className="p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Key className="w-4 h-4" />
                                        Hashed Username (SHA-256)
                                    </div>
                                    <div className="font-mono text-xs break-all bg-background p-3 rounded border border-border/30 leading-relaxed">
                                        {derivedValues.usernameHash}
                                    </div>
                                </div>

                                {/* Ephemeral Public Key Display */}
                                <div className="p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Shield className="w-4 h-4" />
                                        Ephemeral Public Key (Raw)
                                    </div>
                                    <div className="font-mono text-xs break-all bg-background p-3 rounded border border-border/30 leading-relaxed">
                                        {derivedValues.ephemeralPublicKey}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        <strong>Length:</strong> {derivedValues.ephemeralPublicKey.length / 2} bytes
                                    </div>
                                </div>

                                {/* DER-Encoded Ephemeral Public Key Display */}
                                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                                        <Shield className="w-4 h-4" />
                                        DER-Encoded Ephemeral Public Key (Session Key)
                                    </div>
                                    <div className="font-mono text-xs break-all bg-background p-3 rounded border border-border/30 leading-relaxed">
                                        {derivedValues.derEncodedEphemeralPublicKey}
                                    </div>
                                    <div className="text-xs text-muted-foreground space-y-1">
                                        <div><strong>Length:</strong> {derivedValues.derEncodedEphemeralPublicKey.length / 2} bytes</div>
                                        <div><strong>Format:</strong> Internet Identity standard (0x302A300506032B6570032100 || pubkey)</div>
                                        <div className="text-amber-700 dark:text-amber-300">
                                            ℹ️ This DER-encoded key is sent to the delegation canister
                                        </div>
                                    </div>
                                </div>

                                {/* Delegation Public Key Display */}
                                <div className="p-4 rounded-lg bg-muted/50 border border-border/50 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                        <Lock className="w-4 h-4" />
                                        Delegation Public Key (from prepareDelegationPassword)
                                    </div>
                                    <div className="font-mono text-xs break-all bg-background p-3 rounded border border-border/30 leading-relaxed">
                                        {derivedValues.delegationPubKey}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        <strong>Length:</strong> {derivedValues.delegationPubKey.length / 2} bytes
                                    </div>
                                </div>

                                {/* Expiration Timestamp Display */}
                                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 space-y-3">
                                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                                        <Clock className="w-4 h-4" />
                                        Delegation Expiration
                                    </div>
                                    <div className="space-y-2">
                                        <div className="font-mono text-xs break-all bg-background p-3 rounded border border-border/30 leading-relaxed">
                                            {derivedValues.expireAt.toString()}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            <strong>Expires at:</strong> {new Date(Number(derivedValues.expireAt / BigInt(1_000_000))).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!isAuthenticated && !derivedValues && (
                            <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
                                <p className="text-xs text-primary/90 dark:text-primary/80">
                                    <strong>ℹ️ How it works:</strong> Your password is hashed using Argon2id with your username as the salt, 
                                    producing a 32-byte seed. This seed generates an Ed25519 key pair, which is then used to create an 
                                    Internet Computer identity. An ephemeral keypair is generated, DER-encoded using Internet Identity's standard format, 
                                    and used to obtain a delegation from the external canister, creating a DelegationIdentity for secure operations.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </main>

            <footer className="border-t border-border/40 backdrop-blur-sm bg-background/80 py-6">
                <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                    <p>
                        © 2025. Built with{' '}
                        <span className="text-destructive inline-block animate-pulse">♥</span> using{' '}
                        <a
                            href="https://caffeine.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                        >
                            caffeine.ai
                        </a>
                    </p>
                </div>
            </footer>
        </div>
    );
}

export default App;
