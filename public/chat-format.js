;(function (global) {
  const tags = { tiktok: '[TT]', youtube: '[YT]' }
  const MARKER = /\uE000(tiktok|youtube)\uE001/g
  const stripMarker = (value) => String(value || '').replace(/[\uE000\uE001]/g, '')

  /** Placeholder {platformTag} jadi marker privat; renderText() yang mengubahnya jadi
   *  <img> kalau ikon platform tersedia, atau teks tag biasa kalau tidak. */
  function formatChat(event, template, options) {
    const platform = event.platform || ''
    const icon = options?.icons?.[platform]
    const values = {
      platformTag: icon ? `\uE000${platform}\uE001` : (options?.tags?.[platform] || tags[platform] || ''),
      platform, author: stripMarker(event.author), message: stripMarker(event.message),
    }
    return String(template || '{author}: {message}')
      .replace(/\\n/g, '\n')
      .replace(/\{(platformTag|platform|author|message)\}/g, (_, key) => values[key])
  }

  function stripIcons(text, options) {
    const custom = options?.tags || tags
    return String(text ?? '').replace(MARKER, (_, platform) => custom[platform] || '')
  }

  /** Render teks chat ke elemen: marker platform jadi <img> inline, sisanya text node. */
  function renderText(target, text, options) {
    const raw = String(text ?? '')
    if (!raw.includes('\uE000')) { target.textContent = raw; return }
    const icon = (platform) => options?.icons?.[platform] || ''
    const tag = (platform) => (options?.tags || tags)[platform] || ''
    const line = document.createElement('span')
    line.style.whiteSpace = 'pre-wrap'
    target.replaceChildren(line)
    let last = 0
    let match
    MARKER.lastIndex = 0
    while ((match = MARKER.exec(raw)) !== null) {
      if (match.index > last) line.appendChild(document.createTextNode(raw.slice(last, match.index)))
      const platform = match[1]
      const src = icon(platform)
      if (src) {
        const img = document.createElement('img')
        img.src = src
        img.alt = tag(platform)
        img.draggable = false
        img.style.height = '1em'
        img.style.width = '1em'
        img.style.objectFit = 'contain'
        img.style.verticalAlign = '-0.15em'
        img.style.marginRight = '0.3em'
        img.style.display = 'inline-block'
        line.appendChild(img)
      } else {
        line.appendChild(document.createTextNode(tag(platform)))
      }
      last = MARKER.lastIndex
    }
    if (last < raw.length) line.appendChild(document.createTextNode(raw.slice(last)))
  }

  const AVATAR_COLORS = ['#fe2c55', '#25f4ee', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
  const BADGE_STYLES = {
    owner: { bg: '#fe2c55', color: '#ffffff' },
    mod: { bg: '#3b82f6', color: '#ffffff' },
    sub: { bg: '#10b981', color: '#ffffff' },
    gifter: { bg: 'rgba(245, 158, 11, 0.92)', color: '#111827' },
    fan: { bg: 'rgba(236, 72, 153, 0.92)', color: '#ffffff' },
    verified: { bg: '#20d5ec', color: '#0f172a' },
  }

  function pickAvatarColor(name) {
    const str = String(name || 'v')
    let hash = 0
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  }

  const RANK_COLORS = { 1: '#facc15', 2: '#e2e8f0', 3: '#fb923c' }

  /** Render daftar pesan/viewer/follower bergaya TikTok Live (avatar bulat kiri, nama+ikon/badge atas, pesan/subtext bawah). */
  function renderChatList(target, items, options) {
    const list = document.createElement('div')
    const rawMode = options?.mode || 'stack'
    const mode = rawMode === 'notif' ? 'single' : rawMode
    list.className = `tt-chat-list tt-chat-list--${mode}`
    list.style.width = '100%'
    list.style.display = 'flex'
    list.style.flexDirection = 'column'
    list.style.gap = '0.5em'

    const icon = (platform) => options?.icons?.[platform] || ''
    const tag = (platform) => (options?.tags || tags)[platform] || ''
    const alignRight = options?.textAlign === 'right'

    for (const item of items || []) {
      const row = document.createElement('div')
      row.className = 'tt-chat-item'
      row.style.display = 'flex'
      row.style.alignItems = mode === 'topViewers' ? 'center' : 'flex-start'
      row.style.gap = '0.55em'
      row.style.width = '100%'
      row.style.minWidth = '0'
      if (alignRight) row.style.flexDirection = 'row-reverse'

      if (mode === 'topViewers') {
        const rank = Number(item.rank) || 1
        const rankEl = document.createElement('span')
        rankEl.className = 'tt-chat-rank'
        rankEl.textContent = `#${rank}`
        rankEl.style.fontSize = '0.85em'
        rankEl.style.fontWeight = '800'
        rankEl.style.minWidth = '1.9em'
        rankEl.style.textAlign = 'center'
        rankEl.style.flexShrink = '0'
        rankEl.style.color = RANK_COLORS[rank] || 'rgba(255, 255, 255, 0.65)'
        row.appendChild(rankEl)
      }

      const avatarWrap = document.createElement('div')
      avatarWrap.className = 'tt-chat-avatar'
      avatarWrap.style.width = '2.15em'
      avatarWrap.style.height = '2.15em'
      avatarWrap.style.flexShrink = '0'
      avatarWrap.style.borderRadius = '9999px'
      avatarWrap.style.overflow = 'hidden'
      avatarWrap.style.display = 'flex'
      avatarWrap.style.alignItems = 'center'
      avatarWrap.style.justifyContent = 'center'
      avatarWrap.style.marginTop = '0.1em'
      avatarWrap.style.background = pickAvatarColor(item.author)
      avatarWrap.style.color = '#ffffff'
      avatarWrap.style.fontWeight = '800'
      avatarWrap.style.fontSize = '1em'

      const fallbackSpan = document.createElement('span')
      fallbackSpan.className = 'tt-chat-avatar-fallback'
      fallbackSpan.textContent = (String(item.author || '?').trim()[0] || '?').toUpperCase()
      fallbackSpan.style.fontSize = '0.85em'
      fallbackSpan.style.lineHeight = '1'
      avatarWrap.appendChild(fallbackSpan)

      if (item.avatar) {
        const avatarImg = document.createElement('img')
        avatarImg.src = item.avatar
        avatarImg.alt = ''
        avatarImg.draggable = false
        avatarImg.referrerPolicy = 'no-referrer'
        avatarImg.style.width = '100%'
        avatarImg.style.height = '100%'
        avatarImg.style.objectFit = 'cover'
        avatarImg.style.display = 'block'
        fallbackSpan.style.display = 'none'
        avatarImg.addEventListener('error', () => {
          avatarImg.remove()
          fallbackSpan.style.display = ''
        })
        avatarWrap.appendChild(avatarImg)
      }

      const body = document.createElement('div')
      body.className = 'tt-chat-body'
      body.style.display = 'flex'
      body.style.flexDirection = 'column'
      body.style.minWidth = '0'
      body.style.flex = '1'
      body.style.gap = '0.12em'
      if (alignRight) body.style.alignItems = 'flex-end'

      const meta = document.createElement('div')
      meta.className = 'tt-chat-meta'
      meta.style.display = 'flex'
      meta.style.alignItems = 'center'
      meta.style.flexWrap = 'wrap'
      meta.style.gap = '0.32em'
      meta.style.lineHeight = '1.2'
      if (alignRight) meta.style.justifyContent = 'flex-end'

      const platform = item.platform || ''
      const iconSrc = icon(platform)
      if (iconSrc) {
        const pImg = document.createElement('img')
        pImg.className = 'tt-chat-platform-icon'
        pImg.src = iconSrc
        pImg.alt = tag(platform)
        pImg.draggable = false
        pImg.style.height = '0.9em'
        pImg.style.width = '0.9em'
        pImg.style.objectFit = 'contain'
        pImg.style.flexShrink = '0'
        meta.appendChild(pImg)
      } else if (tag(platform)) {
        const pTag = document.createElement('span')
        pTag.className = 'tt-chat-platform-tag'
        pTag.textContent = tag(platform)
        pTag.style.fontSize = '0.72em'
        pTag.style.fontWeight = '700'
        pTag.style.opacity = '0.8'
        meta.appendChild(pTag)
      }

      const badges = Array.isArray(item.badges) ? item.badges.slice(0, 4) : []
      for (const b of badges) {
        if (!b || !b.label) continue
        const style = BADGE_STYLES[b.type] || { bg: 'rgba(255,255,255,0.2)', color: '#ffffff' }
        const badgeEl = document.createElement('span')
        badgeEl.className = `tt-chat-badge tt-chat-badge--${b.type || 'default'}`
        badgeEl.textContent = String(b.label)
        badgeEl.style.fontSize = '0.62em'
        badgeEl.style.fontWeight = '800'
        badgeEl.style.padding = '0.12em 0.42em'
        badgeEl.style.borderRadius = '9999px'
        badgeEl.style.lineHeight = '1.15'
        badgeEl.style.letterSpacing = '0.02em'
        badgeEl.style.background = style.bg
        badgeEl.style.color = style.color
        badgeEl.style.flexShrink = '0'
        meta.appendChild(badgeEl)
      }

      const authorEl = document.createElement('span')
      authorEl.className = 'tt-chat-author'
      authorEl.textContent = stripMarker(item.author || 'viewer')
      authorEl.style.fontSize = '0.82em'
      authorEl.style.fontWeight = '700'
      authorEl.style.color = 'rgba(255, 255, 255, 0.72)'
      authorEl.style.whiteSpace = 'nowrap'
      authorEl.style.overflow = 'hidden'
      authorEl.style.textOverflow = 'ellipsis'
      authorEl.style.maxWidth = '100%'
      meta.appendChild(authorEl)

      const msgEl = document.createElement('div')
      msgEl.className = 'tt-chat-msg'
      if (mode === 'topViewers') {
        msgEl.textContent = `${Number(item.score || 0).toLocaleString()} pts`
        msgEl.style.fontSize = '0.82em'
        msgEl.style.opacity = '0.85'
      } else if (mode === 'followers') {
        msgEl.textContent = 'Followed'
        msgEl.style.fontSize = '0.85em'
        msgEl.style.fontWeight = '600'
        msgEl.style.color = '#34d399'
      } else {
        msgEl.textContent = stripMarker(item.message || '')
        msgEl.style.fontSize = '1em'
      }
      msgEl.style.lineHeight = '1.3'
      msgEl.style.whiteSpace = 'pre-wrap'
      msgEl.style.wordBreak = 'break-word'

      body.appendChild(meta)
      body.appendChild(msgEl)
      row.appendChild(avatarWrap)
      row.appendChild(body)
      list.appendChild(row)
    }

    target.replaceChildren(list)
  }

  global.ChatFormat = { formatChat, tags, stripIcons, renderText, renderChatList }
})(window)
