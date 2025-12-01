/**
 * IC Password Authentication Library
 *
 * A standalone library for password-based authentication on the Internet Computer.
 * This library handles the complete authentication flow including key derivation,
 * delegation creation, and identity management.
 */

import { Ed25519KeyIdentity, DelegationChain, DelegationIdentity, Delegation } from '@icp-sdk/core/identity';
import { HttpAgent, Actor } from '@icp-sdk/core/agent';
import { Principal } from '@icp-sdk/core/principal';
import * as argon2Browser from 'argon2-browser';
import * as nacl from 'tweetnacl';

// Expose libraries on window object for compatibility
if (typeof window !== 'undefined') {
    window.argon2 = argon2Browser;
    window.nacl = nacl;
}

// Declare argon2 and nacl globals
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
        icpassword?: ICPasswordAuth;
    }
}

// Storage interface for session persistence
export interface AuthStorage {
    get(key: string): Promise<string | null> | string | null;
    set(key: string, value: string): Promise<void> | void;
    remove(key: string): Promise<void> | void;
}

// Idle manager configuration
export interface IdleManagerConfig {
    /**
     * Idle timeout in milliseconds (default: 10 minutes)
     */
    idleTimeout?: number;
    /**
     * Callback when user becomes idle
     */
    onIdle?: () => void;
    /**
     * Whether to capture scroll events (default: false)
     */
    captureScroll?: boolean;
}

// Configuration interface
export interface ICPasswordAuthConfig {
    delegationCanisterId?: string;
    host?: string;
    fetchRootKey?: boolean;
    /**
     * Storage for session persistence (default: localStorage)
     */
    storage?: AuthStorage;
    /**
     * Idle manager configuration for auto-logout
     */
    idleManager?: IdleManagerConfig;
}

// Authentication result
export interface AuthResult {
    delegationIdentity: DelegationIdentity;
    principal: string;
    expiresAt: Date;
    isNewUser: boolean;
}

// Stored session data
interface StoredSession {
    delegationChain: string; // JSON serialized
    expiresAt: number; // timestamp in milliseconds
    principal: string;
}

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
 * Default localStorage adapter
 */
class LocalStorageAdapter implements AuthStorage {
    get(key: string): string | null {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem(key);
    }

    set(key: string, value: string): void {
        if (typeof window === 'undefined') return;
        localStorage.setItem(key, value);
    }

    remove(key: string): void {
        if (typeof window === 'undefined') return;
        localStorage.removeItem(key);
    }
}

/**
 * Idle Manager for auto-logout on inactivity
 */
class IdleManager {
    private idleTimeout: number;
    private onIdle: () => void;
    private idleTimer: number | null = null;
    private events: string[];

    constructor(config: IdleManagerConfig) {
        this.idleTimeout = config.idleTimeout || 10 * 60 * 1000; // 10 minutes default
        this.onIdle = config.onIdle || (() => {});

        this.events = ['mousedown', 'mousemove', 'keypress', 'touchstart'];
        if (config.captureScroll) {
            this.events.push('scroll');
        }
    }

    /**
     * Start idle detection
     */
    start(): void {
        if (typeof window === 'undefined') return;

        this.resetTimer();
        this.events.forEach(event => {
            window.addEventListener(event, this.resetTimer.bind(this), true);
        });
    }

    /**
     * Stop idle detection
     */
    stop(): void {
        if (typeof window === 'undefined') return;

        if (this.idleTimer !== null) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }

        this.events.forEach(event => {
            window.removeEventListener(event, this.resetTimer.bind(this), true);
        });
    }

    /**
     * Reset the idle timer
     */
    private resetTimer(): void {
        if (this.idleTimer !== null) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = window.setTimeout(() => {
            this.onIdle();
        }, this.idleTimeout);
    }
}

/**
 * DER-encode an Ed25519 public key using Internet Identity's standard format.
 * Format: 0x302A300506032B6570032100 || pubkey
 */
function derEncodePublicKey(publicKey: Uint8Array): Uint8Array {
    const DER_PREFIX = new Uint8Array([
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
        0x70, 0x03, 0x21, 0x00
    ]);

    const derEncoded = new Uint8Array(DER_PREFIX.length + publicKey.length);
    derEncoded.set(DER_PREFIX, 0);
    derEncoded.set(publicKey, DER_PREFIX.length);

    return derEncoded;
}

/**
 * Main IC Password Authentication class
 */
export class ICPasswordAuth {
    private config: ICPasswordAuthConfig;
    private currentIdentity: DelegationIdentity | null = null;
    private storage: AuthStorage;
    private idleManager: IdleManager | null = null;
    private sessionKey = 'ic-password-auth-session';

    constructor(config: ICPasswordAuthConfig = {}) {
        this.config = {
            delegationCanisterId: config.delegationCanisterId || 'fhzgg-waaaa-aaaah-aqzvq-cai',
            host: config.host || window.location.origin,
            fetchRootKey: config.fetchRootKey ?? (process.env.NODE_ENV !== 'production'),
            storage: config.storage,
            idleManager: config.idleManager,
        };

        // Initialize storage
        this.storage = config.storage || new LocalStorageAdapter();

        // Initialize idle manager if configured
        if (config.idleManager) {
            this.idleManager = new IdleManager({
                ...config.idleManager,
                onIdle: () => {
                    this.handleIdle();
                    if (config.idleManager?.onIdle) {
                        config.idleManager.onIdle();
                    }
                },
            });
        }

        // Try to restore session on initialization
        this.restoreSession();
    }

    /**
     * Handle idle timeout
     */
    private handleIdle(): void {
        this.signOut();
    }

    /**
     * Sign up a new user with username and password
     */
    async signUp(username: string, password: string): Promise<AuthResult> {
        return this.authenticate(username, password, true);
    }

    /**
     * Sign in an existing user with username and password
     */
    async signIn(username: string, password: string): Promise<AuthResult> {
        return this.authenticate(username, password, false);
    }

    /**
     * Get the current delegation identity if authenticated
     */
    getIdentity(): DelegationIdentity | null {
        return this.currentIdentity;
    }

    /**
     * Get the current principal if authenticated
     */
    getPrincipal(): string | null {
        return this.currentIdentity?.getPrincipal().toString() || null;
    }

    /**
     * Sign out and clear the current identity
     */
    signOut(): void {
        this.currentIdentity = null;
        this.storage.remove(this.sessionKey);
        if (this.idleManager) {
            this.idleManager.stop();
        }
    }

    /**
     * Check if currently authenticated
     */
    isAuthenticated(): boolean {
        return this.currentIdentity !== null;
    }

    /**
     * Save the current session to storage
     */
    private async saveSession(delegationChain: DelegationChain, principal: string, expiresAt: Date): Promise<void> {
        const session: StoredSession = {
            delegationChain: JSON.stringify(delegationChain.toJSON()),
            expiresAt: expiresAt.getTime(),
            principal,
        };
        await this.storage.set(this.sessionKey, JSON.stringify(session));
    }

    /**
     * Restore session from storage
     */
    private async restoreSession(): Promise<void> {
        try {
            const sessionData = await this.storage.get(this.sessionKey);
            if (!sessionData) return;

            const session: StoredSession = JSON.parse(sessionData);

            // Check if session expired
            if (Date.now() >= session.expiresAt) {
                await this.storage.remove(this.sessionKey);
                return;
            }

            // Restore delegation chain
            const delegationChain = DelegationChain.fromJSON(JSON.parse(session.delegationChain));

            // Note: We cannot restore the ephemeral identity from storage
            // The session will work for read operations but not for creating new delegations
            // For full functionality, user should sign in again

            // Start idle manager if configured
            if (this.idleManager) {
                this.idleManager.start();
            }
        } catch (error) {
            console.error('Failed to restore session:', error);
            await this.storage.remove(this.sessionKey);
        }
    }

    /**
     * Internal authentication method
     */
    private async authenticate(username: string, password: string, register: boolean): Promise<AuthResult> {
        // Check if argon2 is loaded
        if (!window.argon2) {
            throw new Error('Argon2 library not loaded. Please include argon2-browser script.');
        }

        // Check if TweetNaCl is loaded
        if (!window.nacl) {
            throw new Error('TweetNaCl library not loaded. Please include tweetnacl script.');
        }

        const encoder = new TextEncoder();

        // Compute SHA-256 hash of username
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

        const seed = result.hash;

        // Generate Ed25519 key pair from the seed
        const keyPair = window.nacl.sign.keyPair.fromSeed(seed);
        const identity = Ed25519KeyIdentity.fromKeyPair(
            keyPair.publicKey,
            keyPair.secretKey
        );

        // Initialize HttpAgent with the identity
        const httpAgent = await HttpAgent.create({
            identity: identity,
            host: this.config.host,
        });

        if (this.config.fetchRootKey) {
            await httpAgent.fetchRootKey().catch(err => {
                console.warn('Unable to fetch root key:', err);
            });
        }

        // Generate ephemeral keypair for delegation
        const ephemeralKeyPair = window.nacl.sign.keyPair();
        const ephemeralIdentity = Ed25519KeyIdentity.fromKeyPair(
            ephemeralKeyPair.publicKey,
            ephemeralKeyPair.secretKey
        );

        // DER-encode the ephemeral public key
        const derEncodedEphemeralPublicKey = derEncodePublicKey(ephemeralKeyPair.publicKey);

        // Create agent for delegation canister
        const delegationAgent = await HttpAgent.create({
            identity: identity,
            host: this.config.host,
        });

        if (this.config.fetchRootKey) {
            await delegationAgent.fetchRootKey().catch(err => {
                console.warn('Unable to fetch root key:', err);
            });
        }

        // Create actor for delegation canister
        const delegationActor = Actor.createActor<DelegationCanisterInterface>(
            delegationIdlFactory,
            {
                agent: delegationAgent,
                canisterId: this.config.delegationCanisterId!,
            }
        );

        const origin = window.location.origin;
        const expireInNanoseconds = BigInt(30 * 60) * BigInt(1_000_000_000); // 30 minutes

        // Prepare delegation
        const prepResult = await delegationActor.prepareDelegationPassword(
            usernameHash,
            register,
            origin,
            derEncodedEphemeralPublicKey,
            expireInNanoseconds,
            []
        );

        if ('err' in prepResult) {
            throw new Error(`Delegation preparation failed: ${prepResult.err}`);
        }

        const { expireAt, isNew } = prepResult.ok;

        // Get delegation
        const delegationResult = await delegationActor.getDelegation(
            "password",
            origin,
            derEncodedEphemeralPublicKey,
            expireAt,
            []
        );

        if ('err' in delegationResult) {
            throw new Error(`Get delegation failed: ${delegationResult.err}`);
        }

        const authResponse = delegationResult.ok.auth;

        if (authResponse.delegations.length === 0) {
            throw new Error('No delegations returned from the canister');
        }

        // Build delegation chain
        const delegations = authResponse.delegations.map((signedDelegation) => {
            const targets = signedDelegation.delegation.targets.length > 0
                ? signedDelegation.delegation.targets[0]
                : undefined;

            const delegation = new Delegation(
                new Uint8Array(signedDelegation.delegation.pubkey),
                signedDelegation.delegation.expiration,
                targets
            );

            return {
                delegation,
                signature: new Uint8Array(signedDelegation.signature) as any,
            };
        });

        const delegationChain = DelegationChain.fromDelegations(
            delegations as any,
            new Uint8Array(authResponse.userPublicKey)
        );

        const delegationIdentity = DelegationIdentity.fromDelegation(
            ephemeralIdentity,
            delegationChain
        );

        this.currentIdentity = delegationIdentity;

        const principal = delegationIdentity.getPrincipal().toString();
        const expiresAt = new Date(Number(expireAt / BigInt(1_000_000)));

        // Save session to storage
        await this.saveSession(delegationChain, principal, expiresAt);

        // Start idle manager if configured
        if (this.idleManager) {
            this.idleManager.start();
        }

        return {
            delegationIdentity,
            principal,
            expiresAt,
            isNewUser: isNew,
        };
    }

    /**
     * Create an HTTP agent with the current delegation identity
     */
    async createAgent(): Promise<HttpAgent | null> {
        if (!this.currentIdentity) {
            return null;
        }

        const agent = await HttpAgent.create({
            identity: this.currentIdentity,
            host: this.config.host,
        });

        if (this.config.fetchRootKey) {
            await agent.fetchRootKey().catch(err => {
                console.warn('Unable to fetch root key:', err);
            });
        }

        return agent;
    }
}

// Export a factory function for easier use
export function createICPasswordAuth(config?: ICPasswordAuthConfig): ICPasswordAuth {
    return new ICPasswordAuth(config);
}

// Auto-attach to window if in browser environment
if (typeof window !== 'undefined') {
    (window as any).ICPasswordAuth = ICPasswordAuth;
    window.icpassword = new ICPasswordAuth();
}
