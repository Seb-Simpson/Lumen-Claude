// Static content pages and the 404 view.

import { h, mount } from '../utils.js';
import { pageTitle } from '../components/ui.js';
import { openShortcuts } from '../components/shell.js';
import { icon } from '../components/icons.js';

const P = (...t) => h('p', {}, ...t);
const H2 = (t) => h('h2', {}, t);

const PAGES = {
  about: {
    title: 'About Lumen',
    desc: 'What Lumen is and how it works.',
    body: () => [
      P('Lumen is a lightweight video sharing site built with nothing but HTML, CSS and JavaScript. There is no server, no framework and no build step — the whole app runs in your browser and is hosted for free on GitHub Pages.'),
      H2('How it works'),
      P('Sample videos are short clips generated for this project and hosted alongside the site. Everything you do — accounts, likes, comments, subscriptions and uploads — is saved in your own browser using localStorage and IndexedDB. Nothing is sent to a server.'),
      H2('Open source'),
      P('Lumen is MIT licensed. Read the README in the repository to learn how to run it, publish it, or connect it to a real backend.'),
    ],
  },
  privacy: {
    title: 'Privacy',
    desc: 'How Lumen handles your data.',
    body: () => [
      P('Last updated: November 2026.'),
      H2('What we store'),
      P('Lumen stores your account, preferences, history, likes, comments and uploaded videos only in this browser (localStorage and IndexedDB). We do not run a server and cannot see this data.'),
      H2('Third parties'),
      P('Lumen makes no requests to third-party servers: sample videos are hosted with the site, and there are no cookies, analytics or trackers.'),
      H2('Deleting your data'),
      P('Clear your history from Settings, delete uploads in Studio, or clear this site\'s data in your browser settings to remove everything.'),
    ],
  },
  terms: {
    title: 'Terms of use',
    desc: 'Terms for using the Lumen demo.',
    body: () => [
      P('Lumen is a demonstration project provided “as is”, without warranty of any kind.'),
      H2('Accounts'),
      P('Accounts are for demonstration only. They live in your browser, are not protected by a server, and should never use a password you use anywhere else.'),
      H2('Content'),
      P('Only upload videos you own or have permission to use. Uploaded videos stay in your browser and are not shared with other people.'),
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
      H2('Where did my uploads go?'),
      P('Uploads are saved in this browser only. Private windows, clearing site data, or switching browsers or devices will not show them.'),
      H2('I forgot my password'),
      P('Because there is no server, passwords can\'t be reset. Clear this site\'s data in your browser and create a new demo account.'),
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
