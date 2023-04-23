import { Buffer } from 'node:buffer';
import { ReadStream } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import EventEmitter from 'node:events';

declare namespace node_zmq_raft {
    declare namespace api {
        class PersistenceBase extends common.ReadyEmitter {
            constructor(initial: Object);
            close(): Promise;
            update(properties: Object): Promise;
        }
        class StateMachineBase extends common.ReadyEmitter {
            constructor();
            close(): Promise;
            applyEntries(
                entries: Array,
                nextIndex: number,
                currentTerm: number,
                snapshot?: SnapshotBase
            ): Promise;
        }
    }
    declare namespace client {}
    declare namespace common {
        class ReadyEmitter extends EventEmitter {
            error(err: Error): void;
            [Symbol.for('setReady')](): void;
            get getError(): null | Error;
            get isReady(): boolean;
            ready(): Promise;
            [Symbol.for('ready')]: boolean;
            [Symbol.for('error')]: null | Error;
            [Symbol.for('readyPromse')]: Promise<Awaited<this>>;
        }
        class FilePersistence extends api.PersistenceBase {
            filename: string;
            [Symbol.for('byteSize')]: number;
            [Symbol.for('encoder')]: Encoder;
            [Symbol.for('fd')]: number;
            [Symbol.for('writeStream')]: WriteStream;
            defaultData: Object;
            [Symbol.for('data')]: Object;
            constructor(filename: string, initial: Object);
            [Symbol.for('init')](): void;
            close(): Promise;
            [Symbol.for('close')](): Promise;
            rotate(properties: Object): Promise;
            [Symbol.for('rotate')](properties: Object): Promise;
            update(properties: Object): Promise;
            [Symbol.for('update')](data: Object): Promise;
            [Symbol.for('apply')](properties: Object): void;
            [Symbol.for('validate')](
                properties: Object,
                withAllProperties: boolean
            ): Object;
        }
        class SnapshotFile extends ReadyEmitter {
            constructor(
                filename: string,
                index?: number,
                term?: number,
                dataSize?: number | Readable
            );
            toString(): string;
            get filename(): string;
            get dataOffset(): number;
            close(): Promise;
            get isClosed(): boolean;
            read(
                position: number,
                length: number,
                buffer?: Buffer,
                offset?: number
            ): Promise;
            write(
                buffer: Buffer,
                position: number,
                length: number,
                offset?: number
            ): Promise;
            sync(): Promise;
            replace(destname: string): Promise;
            createDataReadStream(position?: number): ReadStream;
            makeTokenFile(): utils.TokenFile;
        }
    }
    declare namespace protocol {}
    declare namespace utils {
        class TokenFile {
            constructor(fd: number, position: number);
            ensureBuffer(size: number): Buffer;
            ready(): Promise;
            appendToken(
                token: string | number,
                dataLength: number,
                inputBuffer?: Buffer,
                inputStart?: number,
                inputLength?: number
            ): Promise;
            findToken(
                token: string | number,
                position: number,
                stop?: number
            ): Promise;
            readTokenData(
                token: number | string,
                position?: number,
                stop?: number
            ): Promise;
            close(): Promise;
        }
    }
    declare namespace server {
        class RaftPersistence extends common.FilePersistence {
            currentTerm: number;
            votedFor: string;
            peers: { old: Array; new: Array };
            peersUpdateRequest: string;
            peersIndex: number;
            constructor(filename: string, initPeers: Array);
            [Symbol.for('apply')](properties: {
                currentTerm: number;
                votedFor: string;
                peers: { old: Array; new: Array };
                peersUpdateRequest: string;
                peersIndex: number;
            }): void;
            [Symbol.for('validate')](
                properties: {
                    currentTerm: number;
                    votedFor: string;
                    peers: { old: Array; new: Array };
                    peersUpdateRequest: string;
                    peersIndex: number;
                },
                withAllProperties: boolean
            ): Object;
        }
        class LogWriter extends Writable {
            constructor(log: FileLog);
            commit(): Promise;
        }
        class LogStream extends Readable {
            constructor(
                log: FileLog,
                firstIndex: number,
                lastIndex: number,
                options: Object
            );
            cancel(): void;
        }
        class FileLog extends common.ReadyEmitter {
            constructor(
                logdir: string,
                snapshot: string,
                options?: Object | boolean
            );
            close(): Promise;
            getFirstFreshIndex(): number | undefined;
            getRid(requestId: string | Buffer): number | undefined;
            appendCheckpoint(term: number): Promise;
            appendState(
                requestId: string | Buffer,
                term: number,
                data: Buffer
            ): Promise;
            appendConfig(
                requestId: string | Buffer,
                term: number,
                data: Buffer
            ): Promise;
            appendEntry(
                requestId: string | Buffer,
                type: number,
                term: number,
                data: Buffer
            ): Promise;
            appendEntries(entries: Array, index?: number): Promise;
            createLogEntryWriteStream(): LogWriter;
            getEntry(index: number, buffer?: Buffer): Promise;
            getEntries(firstIndex: number, lastIndex: number): Promise;
            readEntries(
                fristIndex: number,
                lastIndex: number,
                buffer: Buffer
            ): Promise;
            createEntriesReadStream(
                firstIndex: number,
                lastIndex: number,
                options?: Object
            ): LogStream;
            termAt(index: number): Promise;
            createTmpSnapshot(
                index: number,
                term: number,
                dataSize: number | Readable
            ): Promise;
            installSnapshot(
                snapshot: SnapshotFile,
                compactOnly?: boolean
            ): Promise;
            watchInstallSnapshot(filename: string): Promise;
            feedStateMachine(
                stateMachine: api.StateMachineBase,
                lastIndex?: number,
                currentTerm?: number
            ): Promise;
            findIndexFilePathOf(index: number): Promise;
        }
        class ZmqRaft extends common.ReadyEmitter {
            constructor(
                peerId: string,
                persistence: RaftPersistence,
                log: FileLog,
                stateMachine: api.StateMachineBase,
                options: Object
            );
            close(): Promise;
            get url(): string | undefined;
            get peersAry(): Array;
            get isLeader(): boolean;
            get pruneIndex(): number;
        }
        function build(options: {
            id: string;
            secret: string;
            peers: {
                id: string;
                url: string;
            }[];
            data: {
                path: string;
                raft: string;
                log: string;
                snapshot: string;
                state: string;
                compact?: {
                    install: string;
                    watch: boolean;
                    state: {
                        path: string;
                        options: {
                            compressionLevel: number;
                            unzipSnapshot: boolean;
                        };
                    };
                };
                appendIdToPath?: boolean;
            };
            router?: {
                bind: string;
            };
            broadcast: {
                url: string;
                bind?: string;
                broadcastHeartbeatInterval?: number;
            };
            listeners: {
                error: (err: Error) => void;
                config: () => void;
                state: (state, currentTerm) => void;
                close: () => void;
            };
            factory: {
                persistence: (options) => api.PersistenceBase;
                log: (options) => FileLog;
                state: (options) => api.StateMachineBase;
            };
            webmonitor: {
                enable: boolean;
                host: string;
                port: number;
                proto?: string;
                bind: {
                    proto: string;
                    host?: string;
                    port?: number;
                    ca?: string;
                    cert?: string;
                    key?: string;
                    pfx?: string;
                };
            };
            console: {
                client: {
                    highwatermark?: number;
                    timeout?: number;
                    serverElectionGraceDelay?: number;
                    heartbeat: number;
                };
                subscriber: {
                    broadcastTimeout?: number;
                    highwatermark?: number;
                    timeout?: number;
                    serverElectionGraceDelay?: number;
                };
            };
            preventSpiralElections: boolean;
            label?: string;
            electionTimeoutMin?: number;
            electionTimeoutMax?: number;
            rpcTimeout?: number;
            appendEntriesHeartbeatInterval?: number;
            appendEntriesRpcTimeoutMin?: number;
            appendEntriesRpcTimeoutMax?: number;
            maxLogEntryDataSize?: number;
            peerMsgDataSize?: number;
            requestEntriesHighWatermak?: number;
            requestEntriesTtl?: number;
            requestEntriesPipelines?: number;
            requestEntriesEntrySizeLimitPipeline?: number;
            requestEntriesSnapshotPipelines?: number;
            requestIdTtlAcceptMargin?: number;
            requestIdTtl?: number;
            indexFileCapacity?: number;
            requestIdCacheMax?: number;
        }): Promise<ZmqRaft>;
    }
}

export = node_zmq_raft;
