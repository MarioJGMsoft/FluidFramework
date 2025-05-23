## Alpha API Report File for "@fluidframework/id-compressor"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

// @alpha @legacy
export function createIdCompressor(logger?: ITelemetryBaseLogger): IIdCompressor & IIdCompressorCore;

// @alpha @legacy
export function createIdCompressor(sessionId: SessionId, logger?: ITelemetryBaseLogger): IIdCompressor & IIdCompressorCore;

// @alpha @legacy
export function createSessionId(): SessionId;

// @alpha @legacy
export function deserializeIdCompressor(serialized: SerializedIdCompressorWithOngoingSession, logger?: ITelemetryLoggerExt): IIdCompressor & IIdCompressorCore;

// @alpha @legacy
export function deserializeIdCompressor(serialized: SerializedIdCompressorWithNoSession, newSessionId: SessionId, logger?: ITelemetryLoggerExt): IIdCompressor & IIdCompressorCore;

// @alpha @legacy
export interface IdCreationRange {
    // (undocumented)
    readonly ids?: {
        readonly firstGenCount: number;
        readonly count: number;
        readonly requestedClusterSize: number;
        readonly localIdRanges: [genCount: number, count: number][];
    };
    // (undocumented)
    readonly sessionId: SessionId;
}

// @public
export interface IIdCompressor {
    decompress(id: SessionSpaceCompressedId): StableId;
    generateCompressedId(): SessionSpaceCompressedId;
    generateDocumentUniqueId(): (SessionSpaceCompressedId & OpSpaceCompressedId) | StableId;
    localSessionId: SessionId;
    normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId;
    normalizeToSessionSpace(id: OpSpaceCompressedId, originSessionId: SessionId): SessionSpaceCompressedId;
    recompress(uncompressed: StableId): SessionSpaceCompressedId;
    tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined;
}

// @alpha @legacy
export interface IIdCompressorCore {
    beginGhostSession(ghostSessionId: SessionId, ghostSessionCallback: () => void): void;
    finalizeCreationRange(range: IdCreationRange): void;
    serialize(withSession: true): SerializedIdCompressorWithOngoingSession;
    serialize(withSession: false): SerializedIdCompressorWithNoSession;
    takeNextCreationRange(): IdCreationRange;
    takeUnfinalizedCreationRange(): IdCreationRange;
}

// @public
export type OpSpaceCompressedId = number & {
    readonly OpNormalized: "9209432d-a959-4df7-b2ad-767ead4dbcae";
};

// @alpha @legacy
export type SerializedIdCompressor = string & {
    readonly _serializedIdCompressor: "8c73c57c-1cf4-4278-8915-6444cb4f6af5";
};

// @alpha @legacy
export type SerializedIdCompressorWithNoSession = SerializedIdCompressor & {
    readonly _noLocalState: "3aa2e1e8-cc28-4ea7-bc1a-a11dc3f26dfb";
};

// @alpha @legacy
export type SerializedIdCompressorWithOngoingSession = SerializedIdCompressor & {
    readonly _hasLocalState: "1281acae-6d14-47e7-bc92-71c8ee0819cb";
};

// @public
export type SessionId = StableId & {
    readonly SessionId: "4498f850-e14e-4be9-8db0-89ec00997e58";
};

// @public
export type SessionSpaceCompressedId = number & {
    readonly SessionUnique: "cea55054-6b82-4cbf-ad19-1fa645ea3b3e";
};

// @public
export type StableId = string & {
    readonly StableId: "53172b0d-a3d5-41ea-bd75-b43839c97f5a";
};

// (No @packageDocumentation comment for this package)

```
