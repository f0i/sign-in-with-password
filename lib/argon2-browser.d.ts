declare module 'argon2-browser' {
    export interface ArgonType {
        Argon2d: number;
        Argon2i: number;
        Argon2id: number;
    }

    export interface HashOptions {
        pass: string | Uint8Array;
        salt: string | Uint8Array;
        time?: number;
        mem?: number;
        hashLen?: number;
        parallelism?: number;
        type?: number;
    }

    export interface HashResult {
        hash: Uint8Array;
        hashHex: string;
        encoded: string;
    }

    export function hash(options: HashOptions): Promise<HashResult>;
    export const ArgonType: ArgonType;
}
