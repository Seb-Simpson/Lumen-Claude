// Sample catalog: channels, videos and comments.
//
// Playback uses short, original clips generated with ffmpeg and stored in
// assets/videos/ (same origin, so they work offline and on GitHub Pages).
// Google's public sample bucket (commondatastorage.googleapis.com/gtv-videos-bucket)
// was the original plan, but it now answers 403 AccessDenied (checked 2026-11-06).
// To use remote files instead, put full https:// URLs here and add the host to
// the media-src directive of the Content-Security-Policy in index.html.

import { seededRandom } from '../utils.js';

export const SAMPLE_SOURCES = [
  { src: 'assets/videos/mandelbrot.mp4', duration: 20 },
  { src: 'assets/videos/life.mp4', duration: 20 },
  { src: 'assets/videos/testsrc.mp4', duration: 15 },
  { src: 'assets/videos/gradients.mp4', duration: 20 },
  { src: 'assets/videos/cellauto.mp4', duration: 20 },
  { src: 'assets/videos/bars.mp4', duration: 10 },
];

export const CATEGORIES = ['Music', 'Gaming', 'Science', 'Coding', 'Sports'];

export const CHANNELS = [
  { id: 'northwind', name: 'Northwind Sound', handle: '@northwindsound', color: '#7c3aed', subscribers: 1_240_000, joined: '2019-03-14', about: 'Live sessions, studio breakdowns and the occasional synth rabbit hole. New music every Friday.' },
  { id: 'pixelforge', name: 'Pixel Forge', handle: '@pixelforge', color: '#1d4ed8', subscribers: 862_000, joined: '2018-07-02', about: 'Indie game deep dives, speedrun history and design teardowns.' },
  { id: 'quantumkitchen', name: 'Quantum Kitchen', handle: '@quantumkitchen', color: '#0f766e', subscribers: 2_100_000, joined: '2016-11-20', about: 'Physics and chemistry explained with things you already have in your kitchen.' },
  { id: 'bytesized', name: 'Byte Sized', handle: '@bytesized', color: '#4338ca', subscribers: 534_000, joined: '2020-01-09', about: 'Short, practical programming lessons. No fluff, just code.' },
  { id: 'fieldline', name: 'Fieldline Sports', handle: '@fieldline', color: '#c2410c', subscribers: 1_780_000, joined: '2015-05-30', about: 'Tactics boards, match analysis and training drills for every level.' },
  { id: 'lofilighthouse', name: 'Lofi Lighthouse', handle: '@lofilighthouse', color: '#be185d', subscribers: 3_400_000, joined: '2017-09-12', about: 'Beats to study, code and relax to. Streaming 24/7.' },
  { id: 'orbitlab', name: 'Orbit Lab', handle: '@orbitlab', color: '#0e7490', subscribers: 948_000, joined: '2019-10-04', about: 'Space missions, rocket engines and the math that gets us to orbit.' },
  { id: 'terminalvelocity', name: 'Terminal Velocity', handle: '@terminalvelocity', color: '#15803d', subscribers: 311_000, joined: '2021-04-18', about: 'Command-line tools, dev workflows and live coding streams.' },
  { id: 'trailpeak', name: 'Trail & Peak', handle: '@trailpeak', color: '#a16207', subscribers: 402_000, joined: '2018-02-26', about: 'Trail running, climbing and the gear that survives both.' },
];

// [id, channelId, category, title, tags, live?]
const RAW = [
  ['v-aurora', 'northwind', 'Music', 'Aurora — Live at the Glasshouse', ['live session', 'synth', 'ambient']],
  ['v-basslines', 'northwind', 'Music', 'Why These 5 Basslines Changed Pop Forever', ['bass', 'music theory', 'pop']],
  ['v-modular', 'northwind', 'Music', 'Building a Modular Synth From Scratch', ['synth', 'diy', 'modular']],
  ['v-lofi-radio', 'lofilighthouse', 'Music', 'Lofi Radio — Beats to Study and Code To', ['lofi', 'study', 'chill'], true],
  ['v-rainy-jazz', 'lofilighthouse', 'Music', 'Rainy Night Jazz Café Mix', ['jazz', 'rain', 'mix']],
  ['v-sunrise', 'lofilighthouse', 'Music', 'Sunrise Chillhop Session', ['chillhop', 'morning']],
  ['v-speedrun', 'pixelforge', 'Gaming', 'The Speedrun That Broke a 10-Year Record', ['speedrun', 'history', 'record']],
  ['v-pixelart', 'pixelforge', 'Gaming', 'How Pixel Art Tricks Your Brain', ['pixel art', 'design', 'indie']],
  ['v-levels', 'pixelforge', 'Gaming', 'Great Level Design in 12 Minutes', ['level design', 'game design']],
  ['v-devstream', 'terminalvelocity', 'Gaming', 'Building a Roguelike Live — Day 3', ['gamedev', 'roguelike', 'live coding'], true],
  ['v-boiling', 'quantumkitchen', 'Science', 'Why Water Boils Faster at Altitude (It Doesn\'t)', ['physics', 'cooking', 'myths']],
  ['v-maillard', 'quantumkitchen', 'Science', 'The Maillard Reaction, Explained With Toast', ['chemistry', 'food']],
  ['v-nonnewton', 'quantumkitchen', 'Science', 'Non-Newtonian Fluids You Can Make Tonight', ['physics', 'experiment', 'diy']],
  ['v-rocket', 'orbitlab', 'Science', 'How Rocket Engines Actually Work', ['rockets', 'engineering', 'space']],
  ['v-orbits', 'orbitlab', 'Science', 'Orbital Mechanics Without the Scary Math', ['space', 'orbits', 'physics']],
  ['v-launch', 'orbitlab', 'Science', 'Launch Watch: Live Mission Coverage', ['launch', 'space', 'live'], true],
  ['v-js-modules', 'bytesized', 'Coding', 'JavaScript Modules in 10 Minutes', ['javascript', 'es modules', 'web']],
  ['v-css-grid', 'bytesized', 'Coding', 'CSS Grid: The Only Guide You Need', ['css', 'grid', 'layout']],
  ['v-a11y', 'bytesized', 'Coding', 'Accessible Buttons, Links and Focus States', ['accessibility', 'a11y', 'html']],
  ['v-git', 'terminalvelocity', 'Coding', 'Git Rebase Without Fear', ['git', 'workflow', 'cli']],
  ['v-shell', 'terminalvelocity', 'Coding', '20 Shell Tricks I Use Every Day', ['bash', 'terminal', 'productivity']],
  ['v-pressing', 'fieldline', 'Sports', 'The High Press, Explained on a Tactics Board', ['football', 'tactics', 'analysis']],
  ['v-sprint', 'fieldline', 'Sports', 'Sprint Mechanics: Run Faster in 4 Weeks', ['training', 'sprint', 'athletics']],
  ['v-matchday', 'fieldline', 'Sports', 'Matchday Live: Pre-Game Analysis', ['football', 'live', 'analysis'], true],
  ['v-ultra', 'trailpeak', 'Sports', 'My First 100K Ultra — What Went Wrong', ['running', 'ultra', 'trail']],
  ['v-bouldering', 'trailpeak', 'Sports', 'Bouldering Technique: Footwork Basics', ['climbing', 'bouldering', 'technique']],
  ['v-gear', 'trailpeak', 'Sports', 'Trail Gear That Survived 1,000 Miles', ['gear', 'review', 'running']],
];

const DESCRIPTIONS = {
  Music: 'Recorded in one take with no overdubs. Headphones recommended.\n\nTracklist and gear list are in the pinned comment. If you enjoyed this, consider subscribing for a new session every Friday.',
  Gaming: 'In this video we break down the design decisions behind the moments players remember.\n\nChapters:\n0:00 Intro\n1:30 The setup\n5:10 Why it works\n9:00 What we can learn',
  Science: 'Everything in this video can be tried safely at home with adult supervision.\n\nSources and further reading are linked in the community tab. Corrections welcome in the comments!',
  Coding: 'Follow along: all code from this lesson is plain HTML, CSS and JavaScript, no build step required.\n\n0:00 Why it matters\n2:00 The basics\n6:30 Common mistakes\n9:15 Recap',
  Sports: 'Drills, analysis and real examples from the pitch, track and trail.\n\nShare this with a teammate who needs it, and let us know what to break down next.',
};

const NOW = Date.parse('2026-11-01T12:00:00Z');

export const SEED_VIDEOS = RAW.map(([id, channelId, category, title, tags, live = false], i) => {
  const rnd = seededRandom(id);
  const sample = SAMPLE_SOURCES[i % SAMPLE_SOURCES.length];
  const daysAgo = Math.floor(rnd() * 700) + (live ? 0 : 1);
  return {
    id,
    channelId,
    category,
    title,
    tags,
    live,
    description: DESCRIPTIONS[category],
    src: sample.src,
    duration: sample.duration,
    views: Math.floor(1500 + rnd() * rnd() * 4_800_000),
    likes: Math.floor(200 + rnd() * 90_000),
    createdAt: new Date(NOW - daysAgo * 86400000 - Math.floor(rnd() * 86400000)).toISOString(),
    visibility: 'public',
  };
});

const COMMENTERS = [
  ['Maya R.', '#be185d'], ['devon_k', '#1d4ed8'], ['Priya S.', '#0f766e'], ['Tomás', '#c2410c'],
  ['Ada L.', '#7c3aed'], ['Ken W.', '#15803d'], ['Lina', '#a16207'], ['Oli B.', '#b91c1c'],
];
const LINES = [
  'This is exactly the explanation I needed. Thank you!',
  'The editing on this keeps getting better.',
  'Watched this three times and noticed something new each time.',
  'Can you do a follow-up on this? I have so many questions.',
  'Came here from a recommendation and instantly subscribed.',
  'The part around the middle was brilliant.',
  'Saving this for later, so useful.',
  'Underrated channel honestly.',
];
const REPLIES = ['Totally agree!', 'Same here 😄', 'Great point.', 'This needs to be pinned.'];

/** Deterministic seed comments for a video. */
export function seedComments(videoId) {
  const rnd = seededRandom(`c-${videoId}`);
  const n = 2 + Math.floor(rnd() * 4);
  const video = SEED_VIDEOS.find((v) => v.id === videoId);
  const base = video ? Date.parse(video.createdAt) : NOW;
  return Array.from({ length: n }, (_, i) => {
    const [author, color] = COMMENTERS[Math.floor(rnd() * COMMENTERS.length)];
    const replies = rnd() > 0.6 ? [{
      id: `${videoId}-c${i}-r0`,
      author: COMMENTERS[(i + 3) % COMMENTERS.length][0],
      color: COMMENTERS[(i + 3) % COMMENTERS.length][1],
      text: REPLIES[Math.floor(rnd() * REPLIES.length)],
      likes: Math.floor(rnd() * 40),
      createdAt: new Date(base + (i + 2) * 3600000).toISOString(),
    }] : [];
    return {
      id: `${videoId}-c${i}`,
      author,
      color,
      text: LINES[Math.floor(rnd() * LINES.length)],
      likes: Math.floor(rnd() * 900),
      createdAt: new Date(base + (i + 1) * 3600000).toISOString(),
      replies,
    };
  });
}
