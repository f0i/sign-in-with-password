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
// @ts-ignore - WASM import handled by webpack
import wasmBinary from 'argon2-browser/dist/argon2.wasm';

// Provide custom WASM loader that strips data URL prefix
if (typeof window !== 'undefined') {
    (window as any).loadArgon2WasmBinary = () => {
        return Promise.resolve().then(() => {
            // Strip data URL prefix if webpack inlined it as data URL
            let base64 = wasmBinary;
            if (base64.startsWith('data:')) {
                const base64Index = base64.indexOf('base64,');
                if (base64Index !== -1) {
                    base64 = base64.substring(base64Index + 7);
                }
            }

            // Decode base64 to binary
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        });
    };
}

// Expose libraries on window object for compatibility
if (typeof window !== 'undefined') {
    window.argon2 = argon2Browser;
    window.nacl = nacl;
}

// Import argon2 library code as raw strings (webpack will inline via asset/source)
// @ts-ignore
import argon2LibraryCode from 'argon2-browser/lib/argon2.js';
// @ts-ignore
import argon2WasmWrapperCode from 'argon2-browser/dist/argon2.js';

// Worker class to handle argon2 calculations in a separate thread
class Argon2Worker {
    private worker: Worker | null = null;
    private messageId = 0;
    private pendingMessages = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();
    private debug: boolean;

    constructor(debug: boolean = false) {
        this.debug = debug;
    }

    private createWorker(): Worker {
        const debug = this.debug;
        // Create worker code as a string with argon2 library and WASM loader inlined
        const workerCode = `
            const DEBUG = ${debug};
            const log = (...args) => { if (DEBUG) console.log('[Worker]', ...args); };
            const error = (...args) => { console.error('[Worker]', ...args); };

            log('Starting argon2 worker initialization');

            // WASM binary data
            const wasmBinary = ${JSON.stringify(wasmBinary)};

            // Custom WASM binary loader
            self.loadArgon2WasmBinary = () => {
                log('loadArgon2WasmBinary called');
                return Promise.resolve().then(() => {
                    let base64 = wasmBinary;
                    if (base64.startsWith('data:')) {
                        const base64Index = base64.indexOf('base64,');
                        if (base64Index !== -1) {
                            base64 = base64.substring(base64Index + 7);
                        }
                    }

                    const binaryString = atob(base64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    log('WASM binary loaded, size:', bytes.length);
                    return bytes.buffer;
                });
            };

            // Custom WASM module loader - provides the compiled WASM wrapper
            // This is called by argon2's initWasm() after it sets up Module config
            self.loadArgon2WasmModule = () => {
                log('loadArgon2WasmModule called');
                return Promise.resolve().then(() => {
                    // Execute the WASM wrapper code
                    // The wrapper will use the Module config that was already set up by initWasm
                    try {
                        ${argon2WasmWrapperCode}
                        log('WASM wrapper code executed');
                        // Return the Module that the wrapper set up
                        return self.Module;
                    } catch (e) {
                        error('Error executing WASM wrapper:', e);
                        throw e;
                    }
                });
            };

            // Load argon2 library (UMD module that attaches to self.argon2)
            try {
                ${argon2LibraryCode}
                log('Argon2 library loaded, self.argon2 =', typeof self.argon2);
            } catch (e) {
                error('Error loading argon2 library:', e);
                throw e;
            }

            // Message handler
            self.onmessage = async (e) => {
                log('Received message:', e.data);
                try {
                    const { id, params } = e.data;
                    log('Calling argon2.hash with params:', params);
                    const result = await self.argon2.hash(params);
                    log('Hash complete, sending result');
                    self.postMessage({ id, result });
                } catch (error) {
                    error('Error during hash:', error);
                    self.postMessage({ id: e.data.id, error: error.message });
                }
            };

            log('Worker initialization complete');
        `;

        // Create worker from Blob URL
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);

        worker.onmessage = (e) => {
            const { id, result, error } = e.data;
            const pending = this.pendingMessages.get(id);
            if (pending) {
                this.pendingMessages.delete(id);
                if (error) {
                    pending.reject(new Error(error));
                } else {
                    pending.resolve(result);
                }
            }
        };

        worker.onerror = (error) => {
            console.error('Worker error:', error);
            // Reject all pending messages
            for (const [id, pending] of this.pendingMessages.entries()) {
                pending.reject(new Error('Worker error: ' + error.message));
                this.pendingMessages.delete(id);
            }
        };

        // Add message error logging
        worker.addEventListener('messageerror', (e) => {
            console.error('Worker message error:', e);
        });

        return worker;
    }

    public async hash(params: any): Promise<any> {
        if (!this.worker) {
            this.worker = this.createWorker();
        }

        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingMessages.set(id, { resolve, reject });
            this.worker!.postMessage({ id, params });
        });
    }

    public terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.pendingMessages.clear();
    }
}

// Global worker instance
let argon2Worker: Argon2Worker | null = null;

function getArgon2Worker(): Argon2Worker {
    if (!argon2Worker) {
        argon2Worker = new Argon2Worker();
    }
    return argon2Worker;
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

// Authentication event data
export interface AuthEventData {
    authenticated: boolean;
    event: 'signIn' | 'signOut' | 'signUp';
    reason: 'manual' | 'restore' | 'idle' | 'expired';
    principal?: string;
    expiresAt?: Date;
    isNewUser?: boolean;
}

// Progress event data
export interface ProgressEventData {
    message: string;
    step: number;
    total: number;
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
    /**
     * Enable debug logging (default: false)
     */
    debug?: boolean;
    /**
     * Progress callback for authentication steps
     */
    onProgress?: (data: ProgressEventData) => void;
    /**
     * Authentication state change callback
     */
    onAuth?: (data: AuthEventData) => void;
    /**
     * Error callback for authentication failures
     */
    onError?: (error: Error) => void;
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
    private currentExpiresAt: Date | null = null;
    private storage: AuthStorage;
    private idleManager: IdleManager | null = null;
    private sessionKey = 'ic-password-auth-session';
    private expirationTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(config: ICPasswordAuthConfig = {}) {
        this.config = {
            delegationCanisterId: config.delegationCanisterId || 'fhzgg-waaaa-aaaah-aqzvq-cai',
            host: config.host || 'https://ic0.app',
            fetchRootKey: config.fetchRootKey ?? false,
            storage: config.storage,
            idleManager: config.idleManager,
            debug: config.debug ?? false,
            onProgress: config.onProgress,
            onAuth: config.onAuth,
            onError: config.onError,
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
        this.signOut('idle');
    }

    /**
     * Set timer to check session expiration
     */
    private setExpirationTimer(expiresAt: Date): void {
        // Clear any existing timer
        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }

        const msUntilExpiration = expiresAt.getTime() - Date.now();

        if (msUntilExpiration <= 0) {
            // Already expired
            this.signOut('expired');
            return;
        }

        // Clamp timeout between 5 seconds and 12 hours
        const MIN_TIMEOUT = 5 * 1000;           // 5 seconds
        const MAX_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
        const timeout = Math.max(MIN_TIMEOUT, Math.min(msUntilExpiration, MAX_TIMEOUT));

        this.expirationTimer = setTimeout(() => {
            // Check if session is actually expired
            if (this.currentExpiresAt && Date.now() >= this.currentExpiresAt.getTime()) {
                this.signOut('expired');
            } else if (this.currentExpiresAt) {
                // Still valid, reschedule (handles early firing, clock changes, renewals)
                this.setExpirationTimer(this.currentExpiresAt);
            }
        }, timeout);
    }

    /**
     * Sign up a new user with username and password
     */
    async signUp(username: string, password: string): Promise<AuthResult> {
        try {
            const result = await this.authenticate(username, password, true);
            this.config.onAuth?.({
                authenticated: true,
                event: 'signUp',
                reason: 'manual',
                principal: result.principal,
                expiresAt: result.expiresAt,
                isNewUser: result.isNewUser,
            });
            return result;
        } catch (error) {
            this.config.onError?.(error as Error);
            throw error;
        }
    }

    /**
     * Sign in an existing user with username and password
     */
    async signIn(username: string, password: string): Promise<AuthResult> {
        try {
            const result = await this.authenticate(username, password, false);
            this.config.onAuth?.({
                authenticated: true,
                event: 'signIn',
                reason: 'manual',
                principal: result.principal,
                expiresAt: result.expiresAt,
            });
            return result;
        } catch (error) {
            this.config.onError?.(error as Error);
            throw error;
        }
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
     * Get the expiration date of the current session
     */
    getExpiresAt(): Date | null {
        return this.currentExpiresAt;
    }

    /**
     * Sign out and clear the current identity
     */
    signOut(reason: 'manual' | 'idle' | 'expired' = 'manual'): void {
        this.currentIdentity = null;
        this.currentExpiresAt = null;
        this.storage.remove(this.sessionKey);
        if (this.idleManager) {
            this.idleManager.stop();
        }
        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }
        this.config.onAuth?.({
            authenticated: false,
            event: 'signOut',
            reason: reason,
        });
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
                this.config.onAuth?.({
                    authenticated: false,
                    event: 'signOut',
                    reason: 'expired',
                });
                return;
            }

            // Restore delegation chain
            const delegationChain = DelegationChain.fromJSON(JSON.parse(session.delegationChain));

            // Create a temporary ephemeral identity for the restored session
            // Note: This is a placeholder identity - the actual ephemeral key is not stored
            // The restored session will work for authenticated requests
            const tempKeyPair = window.nacl.sign.keyPair();
            const tempIdentity = Ed25519KeyIdentity.fromKeyPair(
                tempKeyPair.publicKey,
                tempKeyPair.secretKey
            );

            // Create delegation identity from the restored chain
            this.currentIdentity = DelegationIdentity.fromDelegation(
                tempIdentity,
                delegationChain
            );
            this.currentExpiresAt = new Date(session.expiresAt);

            // Start idle manager if configured
            if (this.idleManager) {
                this.idleManager.start();
            }

            // Set expiration timer
            this.setExpirationTimer(this.currentExpiresAt);

            // Notify that session was restored
            this.config.onAuth?.({
                authenticated: true,
                event: 'signIn',
                reason: 'restore',
                principal: session.principal,
                expiresAt: this.currentExpiresAt,
            });
        } catch (error) {
            console.error('Failed to restore session:', error);
            await this.storage.remove(this.sessionKey);
        }
    }

    /**
     * Internal authentication method
     */
    private async authenticate(username: string, password: string, register: boolean): Promise<AuthResult> {
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

        // Report progress: Step 1 - Hashing password
        this.config.onProgress?.({ message: "Hashing password...", step: 1, total: 3 });

        // Derive 32-byte seed using Argon2id in a Web Worker (non-blocking)
        const worker = getArgon2Worker();
        const result = await worker.hash({
            pass: passwordBytes,
            salt: salt,
            time: 3,
            mem: 65536,
            hashLen: 32,
            parallelism: 1,
            type: 2, // Argon2id
        });

        const seed = result.hash;

        // Report progress: Step 2 - Preparing login session
        this.config.onProgress?.({ message: "Preparing login session...", step: 2, total: 3 });

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

        // Prepare delegation (still part of creating identity step)
        const prepResult = await delegationActor.prepareDelegationPassword(
            usernameHash,
            register,
            origin,
            derEncodedEphemeralPublicKey,
            expireInNanoseconds,
            []
        );

        if ('err' in prepResult) {
            throw new Error(prepResult.err);
        }

        const { expireAt, isNew } = prepResult.ok;

        // Report progress: Step 3 - Requesting delegation
        this.config.onProgress?.({ message: "Requesting delegation...", step: 3, total: 3 });

        // Get delegation
        const delegationResult = await delegationActor.getDelegation(
            "password",
            origin,
            derEncodedEphemeralPublicKey,
            expireAt,
            []
        );

        if ('err' in delegationResult) {
            throw new Error(delegationResult.err);
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
        const expiresAt = new Date(Number(expireAt / BigInt(1_000_000)));
        this.currentExpiresAt = expiresAt;

        const principal = delegationIdentity.getPrincipal().toString();

        // Save session to storage
        await this.saveSession(delegationChain, principal, expiresAt);

        // Start idle manager if configured
        if (this.idleManager) {
            this.idleManager.start();
        }

        // Set expiration timer
        this.setExpirationTimer(expiresAt);

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
