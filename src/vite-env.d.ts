/// <reference types="vite/client" />

interface ExportRequest {
  format: 'pdf' | 'chatlab' | 'chatlab-jsonl' | 'json' | 'arkme-json' | 'html' | 'markdown' | 'txt' | 'excel' | 'weclone'
  contentType?: 'text' | 'voice' | 'image' | 'video' | 'emoji' | 'file'
  dateRange?: { start: number; end: number } | null
  senderUsername?: string
  fileNameSuffix?: string
  fileNamingMode?: 'classic' | 'date-range'
  exportConflictStrategy?: 'incremental' | 'overwrite' | 'rename'
  exportMedia?: boolean
  exportAvatars?: boolean
  exportImages?: boolean
  exportVoices?: boolean
  exportVideos?: boolean
  exportEmojis?: boolean
  exportFiles?: boolean
  maxFileSizeMb?: number
  exportVoiceAsText?: boolean
  exportPathStyle?: 'auto' | 'posix' | 'windows'
  excelCompactColumns?: boolean
  txtColumns?: string[]
  sessionLayout?: 'shared' | 'per-session'
  exportWriteLayout?: 'A' | 'B' | 'C'
  sessionNameWithTypePrefix?: boolean
  displayNamePreference?: 'group-nickname' | 'remark' | 'nickname'
  exportConcurrency?: number
  sessionIds?: string[]
}

interface ChatSessionRecord {
  username: string
  type: number
  unreadCount: number
  summary: string
  sortTimestamp: number
  lastTimestamp: number
  sort_timestamp?: number
  last_timestamp?: number
  lastMsgType: number
  messageCountHint?: number
  displayName?: string
  avatarUrl?: string
  lastMsgSender?: string
  lastSenderDisplayName?: string
  selfWxid?: string
  isFolded?: boolean
  isMuted?: boolean
}

type WechatContactType = 'friend' | 'group' | 'official' | 'former_friend' | 'blocked' | 'other'

interface WechatContactInfo {
  username: string
  displayName: string
  remark?: string
  nickname?: string
  alias?: string
  labels?: string[]
  description?: string
  detailDescription?: string
  region?: string
  gender?: 'male' | 'female' | 'unknown'
  avatarUrl?: string
  type: WechatContactType
  officialAccountKind?: 'subscription' | 'service' | 'enterprise' | 'unknown'
  officialAccountType?: number
}

interface ContactExportFields {
  displayName: boolean
  remark: boolean
  nickname: boolean
  alias: boolean
  labels: boolean
  description: boolean
  detailDescription: boolean
  region: boolean
}

interface ContactExportRequest {
  format: 'json' | 'csv' | 'vcf'
  fields?: Partial<ContactExportFields>
  contactTypes?: {
    friends?: boolean
    groups?: boolean
    officials?: boolean
    formerFriends?: boolean
    blocked?: boolean
    other?: boolean
  }
  selectedUsernames?: string[]
}

interface ChatRecordItem {
  datatype: number
  sourcename: string
  sourcetime: string
  sourceheadurl?: string
  datadesc?: string
  datatitle?: string
  fileext?: string
  datasize?: number
  dataurl?: string
}

interface ChatMessageRecord {
  messageKey: string
  localId: number
  serverId: number
  serverIdRaw?: string
  localType: number
  createTime: number
  sortSeq: number
  isSend: number | null
  senderUsername: string | null
  senderDisplayName?: string
  senderAvatarUrl?: string
  parsedContent: string
  rawContent: string
  content?: string
  sessionId?: string
  emojiCdnUrl?: string
  emojiMd5?: string
  emojiLocalPath?: string
  emojiThumbUrl?: string
  emojiEncryptUrl?: string
  emojiAesKey?: string
  quotedContent?: string
  quotedSender?: string
  imageMd5?: string
  imageDatName?: string
  videoMd5?: string
  aesKey?: string
  encrypVer?: number
  cdnThumbUrl?: string
  voiceDurationSeconds?: number
  linkTitle?: string
  linkUrl?: string
  linkThumb?: string
  fileName?: string
  fileSize?: number
  fileExt?: string
  fileMd5?: string
  xmlType?: string
  appMsgKind?: string
  appMsgDesc?: string
  appMsgAppName?: string
  appMsgSourceName?: string
  appMsgSourceUsername?: string
  appMsgThumbUrl?: string
  appMsgMusicUrl?: string
  appMsgDataUrl?: string
  appMsgLocationLabel?: string
  finderNickname?: string
  finderUsername?: string
  finderCoverUrl?: string
  finderAvatar?: string
  finderDuration?: number
  locationLat?: number
  locationLng?: number
  locationPoiname?: string
  locationLabel?: string
  musicAlbumUrl?: string
  musicUrl?: string
  giftImageUrl?: string
  giftWish?: string
  giftPrice?: string
  cardUsername?: string
  cardNickname?: string
  cardAvatarUrl?: string
  transferPayerUsername?: string
  transferReceiverUsername?: string
  chatRecordTitle?: string
  chatRecordList?: ChatRecordItem[]
}

interface ChatSessionDetailFast {
  wxid: string
  displayName: string
  remark?: string
  nickName?: string
  alias?: string
  avatarUrl?: string
  messageCount: number
}

interface ChatSessionDetailExtra {
  firstMessageTime?: number
  latestMessageTime?: number
  messageTables: Array<{ dbName: string; tableName: string; count: number }>
}

interface ElectronApi {
  config: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<{ success: boolean }>
    clear: () => Promise<{ success: boolean }>
    updateWxidEntry: (wxid: string, patch: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  }
  notification: {
    show: (data: any) => Promise<void>
    close: () => Promise<void>
    click: (payload: any) => void
    ready: () => void
    resize: (width: number, height: number) => void
    glassRect: (payload: any) => void
    glassHide: () => void
    showTest: () => Promise<{ success: boolean }>
    onLuma: (callback: (bands: any) => void) => () => void
    onShow: (callback: (event: any, data: any) => void) => () => void
  }
  dialog: {
    openDirectory: (options?: any) => Promise<string | null>
    openFile: (options?: any) => Promise<string | null>
  }
  shell: {
    openPath: (path: string) => Promise<string>
    openExternal: (url: string) => Promise<void>
  }
  app: {
    getVersion: () => Promise<string>
    getLaunchAtStartupStatus: () => Promise<{ enabled: boolean; supported: boolean; reason?: string }>
    setLaunchAtStartup: (enabled: boolean) => Promise<any>
    checkForUpdates: () => Promise<{ hasUpdate: boolean; version?: string; releaseNotes?: string; error?: string }>
    downloadAndInstall: () => Promise<{ success: boolean; restarting?: boolean; error?: string }>
    ignoreUpdate: (version: string) => Promise<{ success: boolean }>
    onDownloadProgress: (callback: (progress: any) => void) => () => void
    onUpdateDownloaded: (callback: () => void) => () => void
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string }) => void) => () => void
  }
  backup: {
    create: (payload: { outputPath: string; options?: { includeImages?: boolean; includeVideos?: boolean; includeFiles?: boolean } }) => Promise<{ success: boolean; filePath?: string; error?: string }>
    inspect: (archivePath: string) => Promise<{ success: boolean; meta?: any; error?: string }>
    restore: (archivePath: string) => Promise<{ success: boolean; error?: string }>
  }
  http: {
    start: () => Promise<{ success: boolean; port?: number; error?: string }>
    stop: () => Promise<void>
    getStatus: () => Promise<{ running: boolean; port: number; host: string }>
  }
  auth: {
    verifyHello: (message?: string) => Promise<{ success: boolean; error?: string }>
  }
  dbPath: {
    autoDetect: () => Promise<{ success: boolean; path?: string; error?: string }>
    scanWxids: (rootPath: string) => Promise<Array<{ wxid: string; modifiedTime: number; nickname?: string; avatarUrl?: string }>>
    getDefault: () => Promise<string>
  }
  key: {
    autoGetDbKey: () => Promise<{ success: boolean; key?: string; error?: string; logs?: string[] }>
    onDbKeyStatus: (callback: (payload: { message: string; level: number }) => void) => () => void
    autoGetImageKey: (manualDir?: string, wxid?: string) => Promise<{ success: boolean; xorKey?: number; aesKey?: string; verified?: boolean; error?: string }>
    scanImageKeyFromMemory: (userDir: string) => Promise<{ success: boolean; xorKey?: number; aesKey?: string; error?: string }>
    onImageKeyStatus: (callback: (payload: { message: string }) => void) => () => void
  }
  wcdb: {
    testConnection: (dbPath: string, hexKey: string, wxid: string) => Promise<{ success: boolean; error?: string; sessionCount?: number }>
  }
  chat: {
    connect: () => Promise<{ success: boolean; error?: string }>
    close: () => Promise<{ success: boolean }>
    getSessions: () => Promise<{ success: boolean; sessions?: ChatSessionRecord[]; error?: string }>
    getContacts: (options?: { lite?: boolean }) => Promise<{ success: boolean; contacts?: WechatContactInfo[]; error?: string }>
    markAllSessionsRead: () => Promise<{ success: boolean; error?: string }>
    getContactAvatar: (username: string, chatroomId?: string) => Promise<{ avatarUrl?: string; displayName?: string } | null>
    enrichSessionsContactInfo: (usernames: string[], options?: any) => Promise<any>
    getSessionStatuses: (usernames: string[]) => Promise<{ map?: Record<string, { isFolded: boolean; isMuted: boolean }> }>
    getMessages: (sessionId: string, offset?: number, limit?: number, startTime?: number, endTime?: number, ascending?: boolean) => Promise<{ success: boolean; messages?: ChatMessageRecord[]; hasMore?: boolean; nextOffset?: number; error?: string }>
    getLatestMessages: (sessionId: string, limit?: number) => Promise<{ success: boolean; messages?: ChatMessageRecord[]; hasMore?: boolean; nextOffset?: number; error?: string }>
    getMessagesAround: (sessionId: string, target: { localId?: number; createTime: number; messageKey?: string }, totalContextCount?: number) => Promise<{ success: boolean; before: ChatMessageRecord[]; after: ChatMessageRecord[]; requested: number; error?: string }>
    getNewMessages: (sessionId: string, minTime: number, limit?: number, cursor?: { createTime?: number; sortSeq?: number; localId?: number; serverId?: number | string; serverIdRaw?: string }) => Promise<{ success: boolean; messages?: ChatMessageRecord[]; error?: string }>
    getMessageDates: (sessionId: string) => Promise<{ success: boolean; dates?: string[]; error?: string }>
    getMessageDateCounts: (sessionId: string) => Promise<{ success: boolean; counts?: Record<string, number>; error?: string }>
    searchMessages: (keyword: string, sessionId?: string, limit?: number, offset?: number, beginTimestamp?: number, endTimestamp?: number) => Promise<{ success: boolean; messages?: ChatMessageRecord[]; error?: string }>
    getSessionDetailFast: (sessionId: string) => Promise<{ success: boolean; detail?: ChatSessionDetailFast; error?: string }>
    getSessionDetailExtra: (sessionId: string) => Promise<{ success: boolean; detail?: ChatSessionDetailExtra; error?: string }>
    getMyAvatarUrl: () => Promise<{ success: boolean; avatarUrl?: string; error?: string }>
    getImageData: (sessionId: string, msgId: string, hint?: { imageMd5?: string; imageDatName?: string; createTime?: number; rawContent?: string }) => Promise<{ success: boolean; data?: string; error?: string }>
    getVoiceData: (sessionId: string, msgId: string, createTime?: number, serverId?: string | number, senderWxid?: string) => Promise<{ success: boolean; data?: string; error?: string }>
    resolveVoiceCache: (sessionId: string, msgId: string) => Promise<{ success: boolean; hasCache: boolean; data?: string }>
    getVoiceTranscript: (sessionId: string, msgId: string, createTime?: number, serverId?: string | number, senderWxid?: string) => Promise<{ success: boolean; transcript?: string; error?: string }>
    onVoiceTranscriptPartial: (callback: (payload: { sessionId: string; msgId: string; createTime?: number; text: string }) => void) => () => void
    preloadSessionVoices: (sessionId: string) => Promise<{ success: boolean; total?: number; prepared?: number; error?: string }>
    preloadSessionImages: (sessionId: string) => Promise<{ success: boolean; total?: number; prepared?: number; failed?: number; error?: string }>
    getAntiRevokeSessions: () => Promise<{ success: boolean; sessions?: any[]; error?: string }>
    checkAntiRevokeTriggers: (sessionIds: string[]) => Promise<{ success: boolean; rows?: Array<{ sessionId: string; success: boolean; installed?: boolean; error?: string }>; error?: string }>
    installAntiRevokeTriggers: (sessionIds: string[]) => Promise<{ success: boolean; rows?: Array<{ sessionId: string; success: boolean; alreadyInstalled?: boolean; error?: string }>; error?: string }>
    uninstallAntiRevokeTriggers: (sessionIds: string[]) => Promise<{ success: boolean; rows?: Array<{ sessionId: string; success: boolean; error?: string }>; error?: string }>
  }
  video: {
    getVideoInfo: (videoMd5: string, options?: { includePoster?: boolean; posterFormat?: 'dataUrl' | 'fileUrl' }) => Promise<{
      success: boolean
      exists: boolean
      videoUrl?: string
      coverUrl?: string
      thumbUrl?: string
      error?: string
    }>
    parseVideoMd5: (content: string) => Promise<{ success: boolean; md5?: string; error?: string }>
  }
  whisper: {
    downloadModel: () => Promise<{ success: boolean; modelDir?: string; switchedFromChinesePath?: boolean; originalModelDir?: string; modelPath?: string; tokensPath?: string; error?: string }>
    cancelDownloadModel: () => Promise<{ success: boolean }>
    getModelStatus: () => Promise<{ success: boolean; exists?: boolean; valid?: boolean; modelDir?: string; switchedFromChinesePath?: boolean; originalModelDir?: string; modelPath?: string; tokensPath?: string; sizeBytes?: number; error?: string }>
    onDownloadProgress: (callback: (payload: { modelName: string; downloadedBytes: number; totalBytes?: number; percent?: number; speed?: number }) => void) => () => void
  }
  export: {
    getExportStats: (sessionIds: string[], options?: ExportRequest) => Promise<{
      totalMessages: number
      voiceMessages: number
      cachedVoiceCount: number
      needTranscribeCount: number
      mediaMessages: number
      estimatedSeconds: number
      sessions: Array<{ sessionId: string; displayName: string; totalCount: number; voiceCount: number }>
    }>
    prepareVoiceTranscripts: (sessionIds: string[], options?: ExportRequest) => Promise<{
      success: boolean
      total: number
      processed: number
      converted: number
      failed: number
      cancelled?: boolean
      taskId?: string
      error?: string
    }>
    exportSessions: (outputRoot: string, options?: ExportRequest) => Promise<any>
    exportContacts: (outputDir: string, options: ContactExportRequest) => Promise<{
      success: boolean
      successCount?: number
      outputPath?: string
      outputDirectory?: string
      error?: string
    }>
    cancelTask: (taskId: string) => Promise<{ success: boolean }>
    getExportLog: (outputRoot: string) => Promise<{ path: string; txt: string | null; json: string | null; exists: boolean }>
    clearLibrary: (outputRoot: string) => Promise<{ success: boolean; removed: string[]; error?: string }>
    onProgress: (callback: (payload: any) => void) => () => void
  }
  ai: {
    getSetup: () => Promise<{
      hasApiKey: boolean
      baseUrl: string
      baseUrlError?: string
      model: string
      reasoningEffort: string
      customPrompt: string
      workspaceRoot: string
      exportPath: string
      dbReady: boolean
      disabledTools: string[]
      activeProfileId: string
      profiles: Array<{
        id: string
        name: string
        displayName: string
        providerId: string
        protocol: string
        baseUrl: string
        model: string
        hasApiKey: boolean
        apiKeyHint: string
        updatedAt: number
        discovery?: { models: string[]; fetchedAt: number; error?: string }
      }>
      catalog: Array<{
        id: string
        name: string
        description: string
        protocol: string
        baseUrl: string
        defaultModel: string
        models: string[]
        allowCustomBaseUrl?: boolean
        protocolOptions?: string[]
        apiKeyOptional?: boolean
      }>
    }>
    setSetup: (patch: any) => Promise<{ success: boolean }>
    listProviders: () => Promise<{ providers: any[] }>
    fetchModels: (input: { providerId: string; protocol?: string; baseUrl?: string; apiKey?: string }) => Promise<{ success: boolean; models?: string[]; status?: number; error?: string }>
    saveProfile: (input: any) => Promise<{ success: boolean; profile?: any; error?: string }>
    activateProfile: (id: string) => Promise<{ success: boolean; error?: string }>
    deleteProfile: (id: string) => Promise<{ success: boolean; error?: string }>
    testProfile: (input: { providerId: string; protocol?: string; baseUrl?: string; apiKey?: string }) => Promise<{ success: boolean; models?: string[]; status?: number; error?: string }>
    listChats: () => Promise<{ chats: Array<{ id: string; title: string; createdAt: number; updatedAt: number }> }>
    createChat: (title?: string) => Promise<{ chat: { id: string; title: string; createdAt: number; updatedAt: number } }>
    renameChat: (chatId: string, title: string) => Promise<{ success: boolean }>
    reorderChats: (orderedIds: string[]) => Promise<{ success: boolean }>
    deleteChat: (chatId: string) => Promise<{ success: boolean }>
    getChat: (chatId: string) => Promise<{
      chat: { id: string; title: string; createdAt: number; updatedAt: number }
      workspaceDir: string
      memoryDir: string
      messages: Array<{
        id: string
        role: 'user' | 'assistant' | 'tool'
        content: string
        reasoning?: string
        toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown>; friendly: string; ok: boolean; result?: string }>
        createdAt: number
      }>
      lastRun?: {
        usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; reasoningTokens?: number; promptCacheHitTokens?: number }
        context?: { promptTokens?: number; cacheHitTokens?: number; lastRequestTokens?: number; recentRate?: number; contextWindow?: number }
      }
    } | null>
    listNotes: (chatId: string) => Promise<{ notes: Array<{ path: string; bytes: number; mtime: number; scope: 'memory' | 'notes' }> }>
    readNoteFile: (chatId: string, path: string) => Promise<{ content: string | null }>
    deleteNoteFile: (chatId: string, path: string) => Promise<{ success: boolean }>
    clearMemory: () => Promise<{ success: boolean; removed: number; error?: string }>
    getDebugLog: (limit?: number) => Promise<{ lines: string[] }>
    clearDebugLog: () => Promise<{ success: boolean }>
    listActions: () => Promise<{ actions: Array<{ id: string; name: string; prompt: string }> }>
    saveActions: (actions: Array<{ id: string; name: string; prompt: string }>) => Promise<{ success: boolean }>
    send: (chatId: string, text: string) => Promise<{ success: boolean; error?: string }>
    abort: (chatId: string) => Promise<{ success: boolean }>
    onEvent: (callback: (event: any) => void) => () => void
  }
  sns: {
    getTimeline: (limit: number, offset: number, usernames?: string[], keyword?: string, startTime?: number, endTime?: number) => Promise<{ success: boolean; timeline?: any[]; error?: string }>
    getSnsUsernames: () => Promise<{ success: boolean; usernames?: string[]; error?: string }>
    getUserPostCounts: (options?: { preferCache?: boolean; forceRefresh?: boolean }) => Promise<{ success: boolean; counts?: Record<string, number>; error?: string }>
    getExportStats: (options?: { allowTimelineFallback?: boolean; preferCache?: boolean; forceRefresh?: boolean }) => Promise<{ success: boolean; data?: { totalPosts: number; totalFriends: number; myPosts: number | null }; error?: string }>
    getExportStatsFast: () => Promise<{ success: boolean; data?: { totalPosts: number; totalFriends: number; myPosts: number | null }; error?: string }>
    getUserPostStats: (username: string) => Promise<{ success: boolean; data?: { username: string; totalPosts: number }; error?: string }>
    debugResource: (url: string) => Promise<{ success: boolean; status?: number; headers?: any; error?: string }>
    proxyImage: (payload: string | { url: string; key?: string | number; skipFailedCache?: boolean }) => Promise<{ success: boolean; dataUrl?: string; videoPath?: string; cachePath?: string; status?: number; error?: string }>
    warmupTimeline: () => Promise<void>
    peekNewestTimeline: () => Promise<{ success: boolean; newestId?: string; newestTime?: number; error?: string }>
    downloadImage: (payload: { url: string; key?: string | number }) => Promise<{ success: boolean; filePath?: string; error?: string }>
    exportTimeline: (options: any) => Promise<{ success: boolean; filePath?: string; postCount?: number; mediaCount?: number; paused?: boolean; stopped?: boolean; error?: string }>
    selectExportDir: () => Promise<{ canceled: boolean; filePath?: string }>
    installBlockDeleteTrigger: () => Promise<{ success: boolean; alreadyInstalled?: boolean; error?: string }>
    uninstallBlockDeleteTrigger: () => Promise<{ success: boolean; error?: string }>
    checkBlockDeleteTrigger: () => Promise<{ success: boolean; installed?: boolean; error?: string }>
    deleteSnsPost: (postId: string) => Promise<{ success: boolean; error?: string }>
    downloadEmoji: (params: { url: string; encryptUrl?: string; aesKey?: string }) => Promise<{ success: boolean; localPath?: string; error?: string }>
    getCacheMigrationStatus: () => Promise<{ success: boolean; needed: boolean; inProgress: boolean; totalFiles: number; items?: Array<{ label: string; fileCount: number }>; error?: string }>
    startCacheMigration: () => Promise<{ success: boolean; copied?: number; skipped?: number; totalFiles?: number; error?: string }>
    onExportProgress: (callback: (payload: any) => void) => () => void
    onCacheMigrationProgress: (callback: (payload: any) => void) => () => void
  }
  analytics: {
    getOverallStatistics: (force?: boolean) => Promise<{ success: boolean; data?: any; error?: string }>
    getContactRankings: (limit?: number, beginTimestamp?: number, endTimestamp?: number, options?: { includeGroupChats?: boolean }) => Promise<{ success: boolean; data?: any[]; error?: string }>
    getTimeDistribution: () => Promise<{ success: boolean; data?: any; error?: string }>
    getSelfSentDailyDistribution: (beginTimestamp?: number, endTimestamp?: number, force?: boolean) => Promise<{ success: boolean; data?: any; error?: string }>
    getExcludedUsernames: () => Promise<{ success: boolean; data?: string[]; error?: string }>
    setExcludedUsernames: (usernames: string[]) => Promise<{ success: boolean; data?: string[]; error?: string }>
    getExcludeCandidates: (options?: { includeGroupChats?: boolean }) => Promise<{ success: boolean; data?: Array<{ username: string; displayName: string; avatarUrl?: string }>; error?: string }>
    getDailyActivity: (force?: boolean) => Promise<{ success: boolean; data?: { daily: Record<string, number>; sentDaily: Record<string, number> }; error?: string }>
    getWordFrequency: (limit?: number, force?: boolean) => Promise<{ success: boolean; data?: { items: Array<{ word: string; count: number }>; scannedMessages: number; textMessages: number }; error?: string }>
    clearCache: () => Promise<{ success: boolean; error?: string }>
  }
  groupAnalytics: {
    getGroupChats: () => Promise<{ success: boolean; data?: Array<{ username: string; displayName: string; memberCount: number; messageCount: number; avatarUrl?: string }>; error?: string }>
    getGroupMembers: (chatroomId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
    getGroupMembersPanelData: (chatroomId: string, options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>
    getGroupMessageRanking: (chatroomId: string, limit?: number, startTime?: number, endTime?: number) => Promise<{ success: boolean; data?: any[]; error?: string }>
    getGroupActiveHours: (chatroomId: string, startTime?: number, endTime?: number) => Promise<{ success: boolean; data?: { hourlyDistribution: Record<number, number> }; error?: string }>
    getGroupMediaStats: (chatroomId: string, startTime?: number, endTime?: number) => Promise<{ success: boolean; data?: any; error?: string }>
    getGroupActivityHeatmap: (chatroomId: string, startTime?: number, endTime?: number) => Promise<{ success: boolean; data?: { data: number[][]; total: number }; error?: string }>
    getGroupMemberAnalytics: (chatroomId: string, memberUsername: string, startTime?: number, endTime?: number) => Promise<{ success: boolean; data?: any; error?: string }>
    getGroupMemberMessages: (chatroomId: string, memberUsername: string, options?: any) => Promise<{ success: boolean; data?: { messages: any[]; hasMore: boolean; nextCursor: number }; error?: string }>
    exportGroupMembers: (chatroomId: string, outputPath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
    exportGroupMemberMessages: (chatroomId: string, memberUsername: string, outputPath: string, startTime?: number, endTime?: number) => Promise<{ success: boolean; filePath?: string; error?: string }>
  }
  annualReport: {
    getAvailableYears: () => Promise<{ success: boolean; data?: number[]; error?: string; meta?: any }>
    startAvailableYearsLoad: () => Promise<{ success: boolean; taskId?: string; reused?: boolean; snapshot?: any; error?: string }>
    cancelAvailableYearsLoad: (taskId: string) => Promise<{ success: boolean; error?: string }>
    generateReport: (year: number) => Promise<{ success: boolean; data?: any; error?: string }>
    exportImages: (payload: { baseDir: string; folderName: string; images: Array<{ name: string; dataUrl: string }> }) => Promise<{ success: boolean; dir?: string; error?: string }>
    captureCurrentWindow: () => Promise<{ success: boolean; dataUrl?: string; size?: number[]; error?: string }>
    onProgress: (callback: (payload: any) => void) => () => void
    onAvailableYearsProgress: (callback: (payload: any) => void) => () => void
  }
  dualReport: {
    generateReport: (friendUsername: string, year: number) => Promise<{ success: boolean; data?: any; error?: string }>
    onProgress: (callback: (payload: any) => void) => () => void
  }
  process: {
    platform: string
    arch: string
  }
}

interface Window {
  electronAPI: ElectronApi
}
