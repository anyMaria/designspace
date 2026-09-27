/**
 * All UI text lives here (CLAUDE.md "Strings in one place"). A French version means
 * translating this one file. Keep keys grouped by feature area; nest as needed.
 */
export const en = {
  app: {
    title: 'Designspace',
    titleWithLibrary: (library: string) => `Designspace — ${library}`,
  },
  spaceSwitcher: {
    library: 'Library',
    newBoard: '+ New board',
    allBoards: 'All boards…',
  },
  inbox: {
    chip: (count: number) => `Inbox ${count}`,
    zero: 'Inbox zero ✦',
    backToMap: 'Back to map',
  },
  rediscover: 'Rediscover',
  dock: {
    add: 'Add',
    search: 'Search',
    connections: 'Connections',
    selectTool: 'Select tool',
    handTool: 'Hand tool',
  },
  settings: {
    title: 'Settings',
    nav: {
      library: 'Library',
      canvas: 'Canvas',
      contentNetwork: 'Content & network',
      vocabularies: 'Vocabularies',
      ai: 'AI',
      about: 'About',
    },
    about: {
      version: 'Version',
      itemCounts: 'Items',
      diskUsage: 'Disk usage',
      openLogs: 'Open logs folder',
      diagnostics: 'Diagnostics',
    },
    diagnostics: {
      title: 'Diagnostics',
      dropInspector: 'Drop inspector',
      dropInspectorHint: 'Drag something from your browser or File Explorer onto the box below.',
      dropHere: 'Drop here',
      noDropYet: 'Nothing dropped yet.',
    },
  },
  onboarding: {
    welcomeTitle: 'Designspace, your private inspiration space.',
    welcomeBody: 'Everything stays on this computer.',
    libraryLocationTitle: 'Where should your library live?',
    libraryLocationDefault: 'Documents\\Designspace Library',
    browse: 'Browse…',
    cloudWarning:
      'Cloud-synced folders can damage the library database. Keep the library on this computer; ' +
      'you can send backups to the cloud instead (Settings → Library).',
    bringInTitle: 'Bring in existing inspiration?',
    skip: 'Skip',
    continue: 'Continue',
    createLibrary: 'Create library',
  },
  emptyStates: {
    libraryMap: 'Drop images anywhere, paste with Ctrl+V, or press + Add.',
    board: 'Pull inspiration in: search your library (Ctrl+K) or drag from the List panel.',
    noResults: 'Nothing matches. Try fewer filters.',
  },
  panel: {
    list: 'List',
    details: 'Details',
  },
  toasts: {
    undo: 'Undo',
  },
} as const;
