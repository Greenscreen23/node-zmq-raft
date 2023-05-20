import { Buffer } from 'node:buffer';
import { ReadStream } from 'node:fs';
import { Readable, Writable, Duplex } from 'node:stream';
import EventEmitter from 'node:events';
import { Socket } from 'zeromq';

declare namespace node_zmq_raft {
    namespace api {
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
    namespace client {
        class ZmqBaseSocket {
            constructor(urls: Array, options: Object);
            get connected(): boolean;
            addUrls(urls: string | Array): utils.ZmqDealerSocket;
            removeUrls(urls: string | Array): utils.ZmqDealerSocket;
            setUrls(urls: string | Array): utils.ZmqDealerSocket;
            destroy(): void;
            close(): utils.ZmqDealerSocket;
            getsockopt(opt: string): any;
            setsockopt(opt: string, value: any): utils.ZmqDealerSocket;
        }
        class ZmqProtocolSocket extends ZmqBaseSocket {
            constructor(urls?: string | Array, options: number | Object);
            request(msg: string | Array, options?: Object): Promise;
            close(): ZmqProtocolSocket;
            connect(): ZmqProtocolSocket;
            get pendingRequests(): number;
            get pendingQueues(): number;
            waitForQueues(timeout: number): Promise;
            [Symbol.for('send')](requestKey, payload, sendLater): void;
            [Symbol.for('flush')](): void;
            [Symbol.for('nextRequestId')](id?: number | Buffer | string): {
                buf: Buffer;
                key: number | string;
            };
        }
        class ZmqRaftPeerClient extends ZmqProtocolSocket {
            constructor(
                urls?: string | Array<string>,
                options?: Partial<{
                    url: string;
                    urls: Array<string>;
                    secret: string | Buffer;
                    timeout: number;
                    lazy: boolean;
                    sockopts: Object;
                    highwatermark: number;
                }>
            );
            close(): ZmqRaftPeerClient;
            delay(ms: number, result?: any): Promise;
            requestConfig(timeout?: number): Promise<{
                leaderId: string | null;
                isLeader: boolean;
                peers: Array<[id: string, url: string]>;
            }>;
            requestLogInfo(timeout?: number): Promise<{
                isLeader: boolean;
                leaderId: string | null;
                currentTerm: number;
                firstIndex: number;
                lastApplied: number;
                commitIndex: number;
                lastIndex: number;
                snapshotSize: number;
                pruneIndex: number;
            }>;
            configUpdate(
                id: string | Buffer,
                peers: Array | Buffer,
                timeout?: number
            ): Promise<number>;
            requestUpdate(
                id: string | Buffer,
                data: Buffer,
                timeout?: number
            ): Promise<number>;
            requestEntries(
                lastIndex: number,
                count?: number,
                receiver: (
                    status: number,
                    entries_or_snapshot_chunk: Array | Buffer,
                    lastIndex: number,
                    byteOffset?: number,
                    snapshotSize?: number,
                    isLastChunk?: boolean,
                    snapshotTerm?: number
                ) => false | any,
                timeout?: number,
                snapshotOffset?: number
            ): Promise<boolean>;
            requestEntriesStream(
                lastIndex: number,
                options?:
                    | number
                    | {
                          count: number;
                          timeout: number;
                          snapshotOffset: number;
                      }
            ): RequestEntriesStream;
        }
        class RequestEntriesStream extends Readable {
            constructor(client, prevIndex, options);
        }
        class ZmqRaftClient extends ZmqRaftPeerClient {
            constructor(
                urls?: string | Array<string>,
                options?: Partial<{
                    url: string;
                    urls: Array<string>;
                    peers: Array;
                    secret: string | Buffer;
                    timeout: number;
                    serverElectionGraceDelay: number;
                    lazy: boolean;
                    heartbeat: nuber;
                    sockopts: Object;
                    highwatermark: number;
                }>
            );
            close(): ZmqRaftClient;
            setLeader(leaderId?: string | null, forceSetUrls?: boolean): this;
            setPeers(peers?: Array, leaderId?: string): this;
            requestConfig(rpctimeout?: number): Promise<{
                leaderId: string;
                isLeader: boolean;
                peers: Array<[id: string, url: string]>;
            }>;
            requestLogInfo(
                anyPeer: boolean,
                rpctimeout?: number
            ): Promise<{
                isLeader: boolean;
                leaderId: string;
                currentTerm: number;
                firstIndex: number;
                lastApplied: number;
                commitIndex: number;
                lastIndex: number;
                snapshotSize: number;
                pruneIndex: number;
            }>;
            configUpdate(
                id: string | Buffer,
                peers: Array,
                rpctimeout: number
            ): Promise<number>;
            requestUpdate(
                id: string | Buffer,
                data: Buffer,
                rpctimeout: number
            ): Promise<number>;
            requestEntries(
                lastIndex: number,
                count?: number,
                receiver: (
                    status: number,
                    entries_or_snapshot_chunk: Array | Buffer,
                    lastIndex: number,
                    byteOffset?: number,
                    snapshotSize?: number,
                    isLastChunk?: boolean,
                    snapshotTerm?: number
                ) => false | any,
                rpctimeout?: number,
                snapshotOffset?: number
            ): Promise<boolean>;
            requestEntriesStream(
                lastIndex: number,
                options?: number | Object
            ): RequestEntriesStream;
        }
        class ZmqRaftPeerSub extends ZmqRaftPeerClient {
            constructor(
                urls?: string | Array<string>,
                options: Partial<{
                    url: string;
                    urls: Array<string>;
                    secret: string | Buffer;
                    timeout: number;
                    broadcastTimeout: number;
                    lazy: boolean;
                    sockopts: Object;
                    highwatermark: number;
                }>
            );

            url: string | null;
            lastLogIndex: number;
            currentTerm: number;
            isLeader: boolean;
            toString(): string;
            close(): ZmqRaftPeerSub;
            requestBroadcastStateUrl(timeout?: number): Promise;
            unsubscribe(): void;
            subscribe(timeout?: number): Promise;
            refreshPulseTimeout(): void;
            foreverEntriesStream(
                lastIndex: number,
                options: Object
            ): ForeverEntriesStream;
        }
        class ForeverEntriesStream extends Readable {
            constructor(client, lastIndex, options);
        }
        class ZmqRaftSubscriber extends Duplex {
            constructor(
                urls?: string | Array,
                options?: Partial<{
                    url: string;
                    urls: Array;
                    peers: Array;
                    secret: string | Buffer;
                    timeout: number;
                    sockopts: Object;
                    highwatermark: number;
                    serverElectionGraceDelay: number;
                    duplex: Object;
                    readable: Object;
                    lastIndex: number;
                    broadcastTimeout: number;
                }>
            );
            close(): this;
            toString(): string;
            connect(url: string);
        }
    }
    namespace common {
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
        namespace LogEntry {
            class UpdateRequest extends Buffer {
                constructor(buffer: Buffer, requestId: string | Buffer)
                requestId: string | Buffer;
                static isUpdateRequest(buffer: Buffer): buffer is UpdateRequest;
                static bufferToUpdateRequest(buffer: Buffer, requestId: string | Buffer): UpdateRequest;
            }
            const LOG_ENTRY_TYPE_STATE: number,
            const LOG_ENTRY_TYPE_CONFIG: number,
            const LOG_ENTRY_TYPE_CHECKPOINT: number,
        }
    }
    namespace protocol {}
    namespace utils {
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
        class ZmqSocket extends Socket {}
        class ZmqDealerSocket extends ZmqSocket {
            constructor();
            cancelSend(): ZmqSocket;
            send(msg: string | Buffer | Array): boolean;
        }
        namespace id {
            function genIdent(encoding?: string, offset?: number): string | Buffer;
        }
    }
    namespace server {
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
        namespace builder {
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
}

export = node_zmq_raft;
