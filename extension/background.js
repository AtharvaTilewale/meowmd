// Open in MeowMD: toolbar button and context menu entries.
const VIEWER = 'https://atharvatilewale.github.io/meowmd/mdviewer.html?url=';

function openInMeowMD(url) {
  if (!url || !/^https?:/i.test(url)) return;
  chrome.tabs.create({ url: VIEWER + encodeURIComponent(url) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'meowmd-link', title: 'Open link in MeowMD', contexts: ['link'] });
  chrome.contextMenus.create({ id: 'meowmd-page', title: 'Open this page in MeowMD', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'meowmd-link') openInMeowMD(info.linkUrl);
  else openInMeowMD(info.pageUrl || (tab && tab.url));
});

chrome.action.onClicked.addListener((tab) => openInMeowMD(tab && tab.url));
