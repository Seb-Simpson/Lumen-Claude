// Static content pages and the 404 view.

import { h, mount } from '../utils.js';
import { pageTitle } from '../components/ui.js';
import { openShortcuts } from '../components/shell.js';
import { icon } from '../components/icons.js';
import { REMOTE } from '../backend/remote.js';

const P = (...t) => h('p', {}, ...t);
const H2 = (t) => h('h2', {}, t);

const PAGES = {
  about: {
    title: 'About Lumen',
    desc: 'What Lumen is and how it works.',
    body: () => [
      P('Lumen is a lightweight video sharing site built with nothing but HTML, CSS and JavaScript. There is no framework and no build step, and the site is hosted for free on GitHub Pages.'),
      H2('How it works'),
      REMOTE
        ? P('Sample videos are short clips generated for this project and hosted alongside the site. Accounts, uploads, comments, likes, subscriptions and playlists are stored in a Supabase database, so they are shared and work on any device. Your watch history, Watch later list and settings stay in your own browser.')
        : P('Sample videos are short clips generated for this project and hosted alongside the site. Everything you do — accounts, likes, comments, subscriptions and uploads — is saved in your own browser using localStorage and IndexedDB. Nothing is sent to a server.'),
      H2('Open source'),
      P('Lumen is MIT licensed. Read the README in the repository to learn how to run it, publish it, or connect it to a real backend.'),
    ],
  },
  privacy: {
    title: 'Privacy',
    desc: 'How Lumen handles your data.',
    body: () => [
      P('Last updated: November 2026.'),
      ...(REMOTE ? [
        H2('What we store'),
        P('When you create an account, Lumen stores your email address, username, display name, bio and avatar choices, plus the videos you upload and your comments, likes, subscriptions, playlists and reports. Your email address is never shown to other people. Your username, display name, bio, public videos and comments are visible to everyone.'),
        P('Your watch history, Watch later list, playback positions and settings are stored only in this browser.'),
        H2('Where it is stored'),
        P('Account and site data is stored with Supabase (supabase.com), a database service, in the region chosen by the site owner. The site itself is hosted by GitHub Pages, which receives standard request information such as your IP address. Lumen uses no analytics, advertising or tracking cookies.'),
        H2('Deleting your data'),
        P('You can delete your uploads in Studio and your comments on each video. To delete your whole account, contact the site owner, who can remove it and everything you posted. Clearing this site\'s data in your browser removes your local history and settings.'),
      ] : [
        H2('What we store'),
        P('Lumen stores your account, preferences, history, likes, comments and uploaded videos only in this browser (localStorage and IndexedDB). We do not run a server and cannot see this data.'),
        H2('Third parties'),
        P('Lumen makes no requests to third-party servers: sample videos are hosted with the site, and there are no cookies, analytics or trackers.'),
        H2('Deleting your data'),
        P('Clear your history from Settings, delete uploads in Studio, or clear this site\'s data in your browser settings to remove everything.'),
      ]),
    ],
  },
  terms: {
    title: 'Terms of use',
    desc: 'Terms for using the Lumen demo.',
    body: () => [
      P('Lumen is a hobby project provided “as is”, without warranty of any kind.'),
      H2('Accounts'),
      REMOTE
        ? P('Keep your password private and don\'t reuse one from another site. The site owner may remove accounts that break these terms.')
        : P('Accounts are for demonstration only. They live in your browser, are not protected by a server, and should never use a password you use anywhere else.'),
      H2('Content'),
      REMOTE
        ? P('Only upload videos you own or have permission to share. Don\'t post anything illegal, hateful, violent, sexual or harassing. Public and unlisted videos can be seen by other people. Use the Report button to flag a problem, and the site owner may remove content without notice.')
        : P('Only upload videos you own or have permission to use. Uploaded videos stay in your browser and are not shared with other people.'),
      H2('Sample media'),
      P('Sample videos are generated test patterns created for this project and are covered by the same MIT license.'),
    ],
  },
  help: {
    title: 'Help',
    desc: 'Answers to common Lumen questions.',
    body: () => [
      H2('A video won\'t play'),
      P('If a video can\'t be decoded or its file is missing, the player shows a friendly message. Try another video, or upload your own MP4/WebM file.'),
      ...(REMOTE ? [
        H2('Who can see my videos?'),
        P('Public videos appear on the home page and in search. Unlisted videos don\'t appear anywhere, but anyone with the link can watch them. Private videos can only be seen by you while you\'re signed in. Uploads can be up to 50 MB each.'),
        H2('I forgot my password'),
        P('Password reset emails aren\'t set up yet. Contact the site owner, who can reset your account.'),
        H2('Why do my history and settings differ between devices?'),
        P('Watch history, Watch later and settings are kept in each browser. Your account, uploads, likes, subscriptions and playlists follow you everywhere.'),
      ] : [
        H2('Where did my uploads go?'),
        P('Uploads are saved in this browser only. Private windows, clearing site data, or switching browsers or devices will not show them.'),
        H2('I forgot my password'),
        P('Because there is no server, passwords can\'t be reset. Clear this site\'s data in your browser and create a new demo account.'),
      ]),
      H2('Keyboard shortcuts'),
      P('Press ', h('kbd', {}, '?'), ' anywhere or ', h('button', { type: 'button', class: 'link-btn', onClick: openShortcuts }, 'open the shortcuts list'), '.'),
    ],
  },
};

export function renderPage(name) {
  return (ctx) => {
    const p = PAGES[name];
    ctx.setMeta(p.title, p.desc);
    mount(ctx.outlet, h('article', { class: 'page narrow prose' }, pageTitle(p.title), p.body()));
  };
}

export function renderNotFound(ctx) {
  ctx.setMeta('Page not found', 'The page you were looking for does not exist.');
  mount(ctx.outlet, h('div', { class: 'page not-found' },
    h('div', { class: 'nf-art', aria: { hidden: 'true' } }, '404'),
    h('h1', { tabindex: '-1' }, 'This page isn\'t available'),
    P('The link may be broken, or the page may have been removed.'),
    h('div', { class: 'nf-actions' },
      h('a', { class: 'btn btn-primary', href: '#/' }, icon('home', { size: 20 }), h('span', {}, 'Go to home')),
      h('a', { class: 'btn btn-secondary', href: '#/help' }, 'Get help'))));
}
