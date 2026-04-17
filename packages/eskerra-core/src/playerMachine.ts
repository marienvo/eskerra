import {assign, fromPromise, setup, type SnapshotFrom} from 'xstate';

import type {PlayerState} from './audioPlayerTypes';
import type {PlaylistEntry} from './playlist';
import {
  NEAR_END_MIN_DURATION_MS,
  NEAR_END_WINDOW_MS,
} from './playlist';

/** Minimal episode snapshot kept in machine context (apps map to/from full podcast rows). */
export type PlayerEpisodeSnapshot = {
  id: string;
  mp3Url: string;
  title: string;
  artist: string;
};

export type PodcastPlayerPersistResult =
  | {kind: 'saved'; entry: PlaylistEntry}
  | {kind: 'superseded'; entry: PlaylistEntry}
  | {kind: 'skipped'};

/** Side effects wired by each platform (R2 playlist + markdown). */
export type PodcastPlayerDeps = {
  /** Whether R2 playlist sync is configured for this vault (may change when settings load). */
  hasR2: () => boolean;
  persist: (entry: PlaylistEntry) => Promise<PodcastPlayerPersistResult>;
  clearRemotePlaylist: () => Promise<void>;
  /** `dismissNowPlaying` mirrors mobile mark-as-played option. */
  markEpisodeListened: (
    episodeId: string,
    dismissNowPlaying: boolean,
  ) => Promise<void>;
};

export type PodcastPlayerMachineInput = {
  deps: PodcastPlayerDeps;
};

const PERSIST_DEBOUNCE_MS = 500;

export type PodcastPlayerPlaybackState =
  | 'idle'
  | 'primed'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'markingNearEnd'
  | 'nearEndPlaying'
  | 'nearEndPaused'
  | 'ended'
  | 'error';

export type PodcastPlayerMachineEvent =
  | {type: 'RESET'}
  | {
      type: 'HYDRATE';
      episode: PlayerEpisodeSnapshot | null;
      entry: PlaylistEntry | null;
      baseline: PlaylistEntry | null;
    }
  | {type: 'NATIVE'; state: PlayerState}
  | {type: 'BUFFERING'; buffering: boolean}
  | {type: 'PROGRESS'; positionMs: number; durationMs: number | null}
  | {
      type: 'EPISODE_PLAY';
      episode: PlayerEpisodeSnapshot;
      baseline: PlaylistEntry | null;
    }
  | {type: 'SEEK_START'}
  | {type: 'SEEK_END'}
  | {type: 'QUEUE_PERSIST'; entry: PlaylistEntry}
  | {type: 'ERROR'; message: string}
  | {type: 'CLEAR_ERROR'};

type MachineContext = {
  deps: PodcastPlayerDeps;
  episode: PlayerEpisodeSnapshot | null;
  playlistBaseline: PlaylistEntry | null;
  positionMs: number;
  durationMs: number | null;
  native: PlayerState;
  seeking: boolean;
  /** Desktop: HTMLMediaElement buffering while native is still "playing". */
  buffering: boolean;
  inNearEndZone: boolean;
  /** Hook watches increments to persist position after leaving the near-end zone. */
  nearEndResyncNonce: number;
  pendingPersistEntry: PlaylistEntry | null;
  errorMessage: string | null;
};

function crossesNearEndThreshold(
  ctx: MachineContext,
  event?: PodcastPlayerMachineEvent,
): boolean {
  const pos = event?.type === 'PROGRESS' ? event.positionMs : ctx.positionMs;
  const dur = event?.type === 'PROGRESS' ? event.durationMs : ctx.durationMs;
  if (dur == null || dur <= NEAR_END_MIN_DURATION_MS) {
    return false;
  }
  if (ctx.inNearEndZone) {
    return false;
  }
  return pos >= dur - NEAR_END_WINDOW_MS;
}

function leftNearEndZone(
  ctx: MachineContext,
  event?: PodcastPlayerMachineEvent,
): boolean {
  if (!ctx.inNearEndZone) {
    return false;
  }
  const pos = event?.type === 'PROGRESS' ? event.positionMs : ctx.positionMs;
  const dur = event?.type === 'PROGRESS' ? event.durationMs : ctx.durationMs;
  if (dur == null || dur <= 0) {
    return false;
  }
  return pos < dur - NEAR_END_WINDOW_MS;
}

function patchProgress(_context: MachineContext, event: PodcastPlayerMachineEvent) {
  if (event.type !== 'PROGRESS') {
    return {};
  }
  return {
    positionMs: event.positionMs,
    durationMs: event.durationMs,
  };
}

export const podcastPlayerMachine = setup({
  types: {
    context: {} as MachineContext,
    events: {} as PodcastPlayerMachineEvent,
    input: {} as PodcastPlayerMachineInput,
  },
  actions: {
    resetPlayback: assign({
      episode: null,
      playlistBaseline: null,
      positionMs: 0,
      durationMs: null,
      native: 'idle' as PlayerState,
      seeking: false,
      buffering: false,
      inNearEndZone: false,
      nearEndResyncNonce: 0,
      errorMessage: null,
    }),
    /** Remote / disk re-hydrate for the same episode: baseline + position only (no native state change). */
    assignHydratePatchSameEpisode: assign(({event}) => {
      if (event.type !== 'HYDRATE' || !event.episode || !event.entry) {
        return {};
      }
      return {
        playlistBaseline: event.baseline ?? event.entry,
        positionMs: event.entry.positionMs,
        durationMs: event.entry.durationMs,
        buffering: false,
        errorMessage: null,
      };
    }),
    /** Full episode + playlist fields from HYDRATE while staying primed (new remote episode). */
    assignHydrateFullPrimed: assign(({event}) => {
      if (event.type !== 'HYDRATE' || !event.episode || !event.entry) {
        return {};
      }
      return {
        episode: event.episode,
        playlistBaseline: event.baseline ?? event.entry,
        positionMs: event.entry.positionMs,
        durationMs: event.entry.durationMs,
        native: 'paused' as const,
        buffering: false,
        inNearEndZone: false,
        errorMessage: null,
      };
    }),
  },
  actors: {
    flushPersist: fromPromise(
      async ({
        input,
      }: {
        input: {
          deps: PodcastPlayerDeps;
          entry: PlaylistEntry | null;
        };
      }) => {
        if (!input.deps.hasR2() || input.entry == null) {
          return {kind: 'skipped' as const, entry: null as PlaylistEntry | null};
        }
        return await input.deps.persist(input.entry);
      },
    ),
    nearEndEffects: fromPromise(
      async ({
        input,
      }: {
        input: {deps: PodcastPlayerDeps; episodeId: string};
      }) => {
        await input.deps.clearRemotePlaylist();
        await input.deps.markEpisodeListened(input.episodeId, false);
      },
    ),
    endedEffects: fromPromise(
      async ({
        input,
      }: {
        input: {deps: PodcastPlayerDeps; episodeId: string; inNearEndZone: boolean};
      }) => {
        if (!input.inNearEndZone) {
          await input.deps.clearRemotePlaylist();
        }
        await input.deps.markEpisodeListened(input.episodeId, true);
      },
    ),
  },
  guards: {
    crossesNearEnd: ({context, event}) => crossesNearEndThreshold(context, event),
    leftNearEnd: ({context, event}) => leftNearEndZone(context, event),
    nativeEnded: ({event}) => event.type === 'NATIVE' && event.state === 'ended',
    hydrateClearEpisode: ({event}) => event.type === 'HYDRATE' && event.episode == null,
    hydrateFullPayload: ({event}) =>
      event.type === 'HYDRATE' && event.episode != null && event.entry != null,
    hydrateSameEpisode: ({context, event}) =>
      event.type === 'HYDRATE' &&
      event.episode != null &&
      event.entry != null &&
      context.episode != null &&
      context.episode.id === event.episode.id,
  },
}).createMachine({
  id: 'podcastPlayer',
  type: 'parallel',
  context: ({input}) => ({
    deps: input.deps,
    episode: null,
    playlistBaseline: null,
    positionMs: 0,
    durationMs: null,
    native: 'idle' as PlayerState,
    seeking: false,
    buffering: false,
    inNearEndZone: false,
    nearEndResyncNonce: 0,
    pendingPersistEntry: null,
    errorMessage: null,
  }),
  on: {
    BUFFERING: {
      actions: assign(({event}) =>
        event.type === 'BUFFERING' ? {buffering: event.buffering} : {},
      ),
    },
  },
  states: {
    playback: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: [
              {
                guard: ({event}) =>
                  event.type === 'HYDRATE' && event.episode != null && event.entry != null,
                target: 'primed',
                actions: assign(({event}) => {
                  if (event.type !== 'HYDRATE' || !event.episode || !event.entry) {
                    return {};
                  }
                  return {
                    episode: event.episode,
                    playlistBaseline: event.baseline ?? event.entry,
                    positionMs: event.entry.positionMs,
                    durationMs: event.entry.durationMs,
                    native: 'paused' as const,
                    buffering: false,
                    inNearEndZone: false,
                    errorMessage: null,
                  };
                }),
              },
              {
                guard: ({event}) => event.type === 'HYDRATE' && event.episode == null,
                target: 'idle',
                actions: 'resetPlayback',
              },
              {
                target: 'idle',
                actions: 'resetPlayback',
              },
            ],
            EPISODE_PLAY: {
              target: 'loading',
              actions: assign(({event}) => {
                if (event.type !== 'EPISODE_PLAY') {
                  return {};
                }
                return {
                  episode: event.episode,
                  playlistBaseline: event.baseline,
                  positionMs: 0,
                  durationMs: null,
                  native: 'loading' as const,
                  buffering: false,
                  inNearEndZone: false,
                  errorMessage: null,
                };
              }),
            },
          },
        },
        primed: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: [
              {
                guard: 'hydrateClearEpisode',
                target: 'idle',
                actions: 'resetPlayback',
              },
              {
                guard: 'hydrateSameEpisode',
                actions: 'assignHydratePatchSameEpisode',
              },
              {
                guard: 'hydrateFullPayload',
                actions: 'assignHydrateFullPrimed',
              },
              {
                target: 'idle',
                actions: 'resetPlayback',
              },
            ],
            NATIVE: [
              {
                guard: 'nativeEnded',
                target: 'ended',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'playing',
                target: 'playing',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'loading',
                target: 'loading',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
            ],
            PROGRESS: [
              {
                guard: 'crossesNearEnd',
                target: 'markingNearEnd',
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
              {
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
            ],
            EPISODE_PLAY: {
              target: 'loading',
              actions: assign(({event}) => {
                if (event.type !== 'EPISODE_PLAY') {
                  return {};
                }
                return {
                  episode: event.episode,
                  playlistBaseline: event.baseline,
                  native: 'loading' as const,
                  buffering: false,
                  inNearEndZone: false,
                };
              }),
            },
          },
        },
        loading: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: {
              guard: 'hydrateSameEpisode',
              actions: 'assignHydratePatchSameEpisode',
            },
            NATIVE: [
              {
                guard: 'nativeEnded',
                target: 'ended',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'playing',
                target: 'playing',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'paused',
                target: 'paused',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
            ],
            PROGRESS: {
              actions: assign(({context, event}) => patchProgress(context, event)),
            },
            ERROR: {
              target: 'error',
              actions: assign({
                errorMessage: ({event}) =>
                  event.type === 'ERROR' ? event.message : 'Error',
              }),
            },
          },
        },
        playing: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: {
              guard: 'hydrateSameEpisode',
              actions: 'assignHydratePatchSameEpisode',
            },
            SEEK_START: {
              actions: assign({seeking: true}),
            },
            SEEK_END: {
              actions: assign({seeking: false}),
            },
            NATIVE: [
              {
                guard: 'nativeEnded',
                target: 'ended',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'paused',
                target: 'paused',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'loading',
                target: 'loading',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
            ],
            PROGRESS: [
              {
                guard: 'leftNearEnd',
                target: 'playing',
                reenter: true,
                actions: assign(({context, event}) => ({
                  ...patchProgress(context, event),
                  inNearEndZone: false,
                  nearEndResyncNonce: context.nearEndResyncNonce + 1,
                })),
              },
              {
                guard: 'crossesNearEnd',
                target: 'markingNearEnd',
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
              {
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
            ],
            ERROR: {
              target: 'error',
              actions: assign({
                errorMessage: ({event}) =>
                  event.type === 'ERROR' ? event.message : 'Error',
              }),
            },
          },
        },
        paused: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: {
              guard: 'hydrateSameEpisode',
              actions: 'assignHydratePatchSameEpisode',
            },
            SEEK_START: {
              actions: assign({seeking: true}),
            },
            SEEK_END: {
              actions: assign({seeking: false}),
            },
            NATIVE: [
              {
                guard: 'nativeEnded',
                target: 'ended',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'playing',
                target: 'playing',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'loading',
                target: 'loading',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
            ],
            PROGRESS: [
              {
                guard: 'leftNearEnd',
                target: 'paused',
                reenter: true,
                actions: assign(({context, event}) => ({
                  ...patchProgress(context, event),
                  inNearEndZone: false,
                  nearEndResyncNonce: context.nearEndResyncNonce + 1,
                })),
              },
              {
                guard: 'crossesNearEnd',
                target: 'markingNearEnd',
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
              {
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
            ],
            ERROR: {
              target: 'error',
              actions: assign({
                errorMessage: ({event}) =>
                  event.type === 'ERROR' ? event.message : 'Error',
              }),
            },
          },
        },
        markingNearEnd: {
          invoke: {
            id: 'nearEndInvoke',
            src: 'nearEndEffects',
            input: ({context}) => ({
              deps: context.deps,
              episodeId: context.episode!.id,
            }),
            onDone: [
              {
                guard: ({context}) => context.native === 'playing',
                target: 'nearEndPlaying',
                actions: assign({inNearEndZone: true, playlistBaseline: null}),
              },
              {
                target: 'nearEndPaused',
                actions: assign({inNearEndZone: true, playlistBaseline: null}),
              },
            ],
            onError: {
              target: 'error',
              actions: assign({
                errorMessage: ({event}) =>
                  event.error instanceof Error ? event.error.message : String(event.error),
              }),
            },
          },
          on: {
            HYDRATE: {
              guard: 'hydrateSameEpisode',
              actions: 'assignHydratePatchSameEpisode',
            },
            PROGRESS: {
              actions: assign(({context, event}) => patchProgress(context, event)),
            },
          },
        },
        nearEndPlaying: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: {
              guard: 'hydrateSameEpisode',
              actions: 'assignHydratePatchSameEpisode',
            },
            SEEK_START: {actions: assign({seeking: true})},
            SEEK_END: {actions: assign({seeking: false})},
            NATIVE: [
              {
                guard: 'nativeEnded',
                target: 'ended',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'paused',
                target: 'nearEndPaused',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
            ],
            PROGRESS: [
              {
                guard: 'leftNearEnd',
                target: 'playing',
                actions: assign(({context, event}) => ({
                  ...patchProgress(context, event),
                  inNearEndZone: false,
                  nearEndResyncNonce: context.nearEndResyncNonce + 1,
                })),
              },
              {
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
            ],
          },
        },
        nearEndPaused: {
          on: {
            RESET: {target: 'idle', actions: 'resetPlayback'},
            HYDRATE: {
              guard: 'hydrateSameEpisode',
              actions: 'assignHydratePatchSameEpisode',
            },
            SEEK_START: {actions: assign({seeking: true})},
            SEEK_END: {actions: assign({seeking: false})},
            NATIVE: [
              {
                guard: 'nativeEnded',
                target: 'ended',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                guard: ({event}) => event.type === 'NATIVE' && event.state === 'playing',
                target: 'nearEndPlaying',
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
              {
                actions: assign(({event}) =>
                  event.type === 'NATIVE' ? {native: event.state} : {},
                ),
              },
            ],
            PROGRESS: [
              {
                guard: 'leftNearEnd',
                target: 'paused',
                actions: assign(({context, event}) => ({
                  ...patchProgress(context, event),
                  inNearEndZone: false,
                  nearEndResyncNonce: context.nearEndResyncNonce + 1,
                })),
              },
              {
                actions: assign(({context, event}) => patchProgress(context, event)),
              },
            ],
          },
        },
        ended: {
          invoke: {
            id: 'endedInvoke',
            src: 'endedEffects',
            input: ({context}) => ({
              deps: context.deps,
              episodeId: context.episode!.id,
              inNearEndZone: context.inNearEndZone,
            }),
            onDone: {
              target: 'idle',
              actions: 'resetPlayback',
            },
            onError: {
              target: 'error',
              actions: assign({
                errorMessage: ({event}) =>
                  event.error instanceof Error ? event.error.message : String(event.error),
              }),
            },
          },
        },
        error: {
          on: {
            CLEAR_ERROR: {
              target: 'idle',
              actions: 'resetPlayback',
            },
            RESET: {target: 'idle', actions: 'resetPlayback'},
          },
        },
      },
    },
    persist: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            QUEUE_PERSIST: {
              target: 'debouncing',
              actions: assign({
                pendingPersistEntry: ({event}) =>
                  event.type === 'QUEUE_PERSIST' ? event.entry : null,
              }),
            },
          },
        },
        debouncing: {
          after: {
            [PERSIST_DEBOUNCE_MS]: {target: 'flushing'},
          },
          on: {
            QUEUE_PERSIST: {
              target: 'debouncing',
              reenter: true,
              actions: assign({
                pendingPersistEntry: ({event}) =>
                  event.type === 'QUEUE_PERSIST' ? event.entry : null,
              }),
            },
          },
        },
        flushing: {
          invoke: {
            src: 'flushPersist',
            input: ({context}) => ({
              deps: context.deps,
              entry: context.pendingPersistEntry,
            }),
            onDone: {
              target: 'idle',
              actions: assign(({event}) => {
                const out = event.output as PodcastPlayerPersistResult;
                if (out.kind === 'superseded' || out.kind === 'saved') {
                  return {playlistBaseline: out.entry, pendingPersistEntry: null};
                }
                return {pendingPersistEntry: null};
              }),
            },
            onError: {
              target: 'idle',
              actions: assign({pendingPersistEntry: null}),
            },
          },
        },
      },
    },
  },
});

export type PodcastPlayerSnapshot = SnapshotFrom<typeof podcastPlayerMachine>;

/** True when no playlist persist is debouncing or flushing (safe to quit after a pause-triggered persist). */
export function isPersistIdle(snapshot: PodcastPlayerSnapshot): boolean {
  return (
    snapshot.matches({persist: 'idle'}) &&
    snapshot.context.pendingPersistEntry == null
  );
}

/** Extract playback sub-state value from a parallel snapshot. */
export function getPlaybackSubstate(snapshot: {
  value: unknown;
}): PodcastPlayerPlaybackState {
  const v = snapshot.value as Record<string, string>;
  const p = v?.playback;
  if (typeof p === 'string') {
    return p as PodcastPlayerPlaybackState;
  }
  return 'idle';
}

/**
 * Transport “busy” (disable primary play / show spinner): native loading, but never while seeking.
 */
export function isPlaybackTransportBusy(context: {
  native: PlayerState;
  seeking: boolean;
}): boolean {
  return context.native === 'loading' && !context.seeking;
}

export type PlaybackTransportPlayControl = 'buffering' | 'loading' | 'paused' | 'playing';

export function isPlaybackTransportBuffering(control: PlaybackTransportPlayControl): boolean {
  return control === 'buffering';
}

/**
 * Map machine + native state to play button chrome (`PlaybackTransport` on desktop).
 */
export function getPlaybackTransportPlayControl(snapshot: {
  context: Pick<MachineContext, 'buffering' | 'native' | 'seeking'>;
  value: unknown;
}): PlaybackTransportPlayControl {
  if (isPlaybackTransportBusy(snapshot.context)) {
    return 'loading';
  }
  const sub = getPlaybackSubstate(snapshot);
  if (sub === 'ended' || sub === 'idle' || sub === 'error') {
    return 'paused';
  }
  if (sub === 'playing' || sub === 'nearEndPlaying' || sub === 'loading') {
    if (
      snapshot.context.buffering &&
      snapshot.context.native === 'playing' &&
      (sub === 'playing' || sub === 'nearEndPlaying')
    ) {
      return 'buffering';
    }
    return snapshot.context.native === 'playing' ? 'playing' : 'paused';
  }
  return 'paused';
}
