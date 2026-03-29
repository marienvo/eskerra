import {NoteboxLocalSettings, NoteboxSettings} from '../types';

export type MockNoteSeed = {
  content: string;
  name: string;
};

export type MockPodcastFileSeed = {
  content: string;
  name: string;
};

export const DEV_MOCK_VAULT_URI = '__dev_mock_vault__';

export const MOCK_SETTINGS: NoteboxSettings = {
  displayName: 'Dev Notebox',
  r2: {
    endpoint: 'https://00000000000000000000000000000000.r2.cloudflarestorage.com',
    bucket: 'mock-bucket',
    accessKeyId: 'mock_access_key_id',
    secretAccessKey: 'mock_secret_access_key',
  },
};

export const MOCK_LOCAL_SETTINGS: NoteboxLocalSettings = {
  deviceName: 'Dev device',
};

/** Kept in sync with `mock-vault/Inbox/` in the repo (dev seed only; not read from disk at runtime). */
export const MOCK_NOTES: MockNoteSeed[] = [
  {
    name: 'note.md',
    content: `Note
`,
  },
  {
    name: 'note2.md',
    content: `Note 2
`,
  },
];

export const MOCK_PODCAST_FILES: MockPodcastFileSeed[] = [
  {
    name: 'General/2026 Demo - podcasts.md',
    content: `# 2026 Demo - podcasts

- [ ] 2026-03-20; #52 - Flitspalen, een gereedschapskist en een bosje tulpen (S10) [▶️](https://podcast.npo.nl/file/de-stemming-van-vullings-en-van-der-wulp/138643/flitspalen-een-gereedschapskist-en-een-bosje-tulpen.mp3?awCollectionid=feed-102-de-stemming-van-vullings-en-van-der-wulp&awEpisodeid=feed-102-de-stemming-van-vullings-en-van-der-wulp_episode-138643-WO_AT_20329055) (De Stemming van Vullings en De Rooy ●)
- [x] 2026-03-20; [🌐](https://omny.fm/shows/schaduwoorlog/van-iran-tot-oekra-ne-hackers-storten-zich-op-beveiligingscamera-s) Van Iran tot Oekraïne: hackers storten zich op beveiligingscamera’s [▶️](https://traffic.omny.fm/d/clips/33dbd2dc-d464-471d-9feb-abae00330078/ddeac7f9-d9e2-4e05-aa8d-b2ae00ecc051/da40b3e3-4b74-43de-83d1-b41000ef9ead/audio.mp3?utm_source=Podcast&in_playlist=be278983-9ebf-4671-8f6b-b2ae00ecc486) (Schaduwoorlog)
`,
  },
  {
    name: 'General/📻 De Stemming van Vullings en De Rooy ●.md',
    content: `---
rssFetchedAt: "2026-03-22T11:53:25.401Z"
rssFeedUrl: https://podcast.npo.nl/feed/de-stemming-van-vullings-en-van-der-wulp.xml
daysAgo: 7
minFetchIntervalMinutes: 120
timeoutMs: 8000
---

# De Stemming van Vullings en De Rooy ●

## Friday, March 20th, 2026

- #52 - Flitspalen, een gereedschapskist en een bosje tulpen (S10) [▶️](https://podcast.npo.nl/file/de-stemming-van-vullings-en-van-der-wulp/138643/flitspalen-een-gereedschapskist-en-een-bosje-tulpen.mp3?awCollectionid=feed-102-de-stemming-van-vullings-en-van-der-wulp&awEpisodeid=feed-102-de-stemming-van-vullings-en-van-der-wulp_episode-138643-WO_AT_20329055)
`,
  },
  {
    name: 'General/📻 Schaduwoorlog •.md',
    content: `---
rssFetchedAt: "2026-03-22T09:27:36.130Z"
rssFeedUrl: https://www.omnycontent.com/d/playlist/33dbd2dc-d464-471d-9feb-abae00330078/ddeac7f9-d9e2-4e05-aa8d-b2ae00ecc051/be278983-9ebf-4671-8f6b-b2ae00ecc486/podcast.rss
daysAgo: 7
minFetchIntervalMinutes: 360
timeoutMs: 8000
---

# Schaduwoorlog •

## Tuesday, March 17th, 2026

- [🌐](https://omny.fm/shows/schaduwoorlog/van-iran-tot-oekra-ne-hackers-storten-zich-op-beveiligingscamera-s) Van Iran tot Oekraïne: hackers storten zich op beveiligingscamera’s [▶️](https://traffic.omny.fm/d/clips/33dbd2dc-d464-471d-9feb-abae00330078/ddeac7f9-d9e2-4e05-aa8d-b2ae00ecc051/da40b3e3-4b74-43de-83d1-b41000ef9ead/audio.mp3?utm_source=Podcast&in_playlist=be278983-9ebf-4671-8f6b-b2ae00ecc486)
`,
  },
];
