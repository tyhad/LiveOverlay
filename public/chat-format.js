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
  const F1_RADIO_STYLE_ID = 'f1-radio-styles'
  const F1_WAVE_HEIGHTS = [
    0.35, 0.55, 0.82, 0.45, 0.95, 0.65, 0.40, 0.88, 1.00, 0.58,
    0.76, 0.96, 0.50, 0.84, 0.68, 0.92, 0.48, 0.78, 0.52, 0.36,
  ]

  function ensureF1RadioStyles(doc) {
    if (!doc || doc.getElementById(F1_RADIO_STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = F1_RADIO_STYLE_ID
    style.textContent = `
      @keyframes f1RadioWave {
        0%, 100% { transform: scaleY(0.24); }
        50% { transform: scaleY(1); }
      }
      @keyframes f1RadioPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }
      .f1-radio-card {
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        overflow: hidden;
        padding: 0.5em 0.68em;
        gap: 0.34em;
        border-radius: 0.52em;
        background: linear-gradient(180deg, #131622 0%, #090b10 100%);
        border: 2px solid var(--f1-border, rgba(225, 6, 0, 0.72));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 0.65em var(--f1-glow, rgba(225, 6, 0, 0.28));
        font-family: 'Titillium Web', 'Manrope', system-ui, -apple-system, sans-serif;
        text-shadow: none;
      }
      .f1-radio-header {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.04em;
        min-width: 0;
      }
      .f1-radio-author-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.32em;
        max-width: 100%;
        min-width: 0;
      }
      .f1-radio-author {
        font-size: 1.06em;
        font-weight: 900;
        line-height: 1.05;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--f1-primary, #E10600);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .f1-radio-label-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.3em;
      }
      .f1-radio-dot {
        width: 0.38em;
        height: 0.38em;
        border-radius: 9999px;
        background: var(--f1-primary, #E10600);
        box-shadow: 0 0 0.35em var(--f1-primary, #E10600);
        animation: f1RadioPulse 1.4s ease-in-out infinite;
        flex-shrink: 0;
      }
      .f1-radio-label {
        font-size: 0.84em;
        font-weight: 900;
        line-height: 1;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffffff;
      }
      .f1-radio-strip {
        position: relative;
        flex-shrink: 0;
        width: 100%;
        height: 2.02em;
        border-radius: 0.26em;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 0.42em;
        background: linear-gradient(90deg, var(--f1-band-bg, rgba(225, 6, 0, 0.16)) 0%, rgba(255, 255, 255, 0.035) 50%, var(--f1-band-bg, rgba(225, 6, 0, 0.16)) 100%);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        border-bottom: 1px solid var(--f1-border, rgba(225, 6, 0, 0.65));
      }
      .f1-radio-wave {
        position: absolute;
        inset: 0.2em 0.32em;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.12em;
        pointer-events: none;
        opacity: 0.34;
      }
      .f1-radio-bar {
        flex: 1;
        border-radius: 9999px;
        background: var(--f1-primary, #E10600);
        transform-origin: center center;
        will-change: transform;
        animation: f1RadioWave 0.95s ease-in-out infinite;
      }
      .f1-radio-slot-left,
      .f1-radio-slot-right {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
      }
      .f1-radio-number {
        font-size: 1.56em;
        font-weight: 900;
        font-style: italic;
        line-height: 0.95;
        letter-spacing: -0.04em;
        color: var(--f1-primary, #E10600);
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.75);
      }
      .f1-radio-abbr {
        font-size: 1.08em;
        font-weight: 900;
        font-style: italic;
        line-height: 1;
        letter-spacing: 0.04em;
        color: var(--f1-primary, #E10600);
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.75);
      }
      .f1-radio-avatar {
        width: 1.54em;
        height: 1.54em;
        border-radius: 9999px;
        overflow: hidden;
        border: 2px solid var(--f1-primary, #E10600);
        background: #111827;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
        flex-shrink: 0;
      }
      .f1-radio-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .f1-radio-logo {
        height: 1.48em;
        width: auto;
        max-width: 3.2em;
        object-fit: contain;
        display: block;
        flex-shrink: 0;
        filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.65));
      }
      .f1-radio-logo-fallback {
        font-size: 0.74em;
        font-weight: 900;
        letter-spacing: 0.06em;
        padding: 0.14em 0.42em;
        border-radius: 0.25em;
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid var(--f1-border, rgba(225, 6, 0, 0.7));
        color: #ffffff;
      }
      .f1-radio-msg-wrap {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        align-items: flex-start;
        width: 100%;
      }
      .f1-radio-msg {
        width: 100%;
        font-size: 0.88em;
        font-weight: 700;
        line-height: 1.25;
        letter-spacing: 0.015em;
        text-transform: uppercase;
        color: var(--f1-text, #F8FAFC);
        display: -webkit-box;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
    `
    ;(doc.head || doc.documentElement || doc.body).appendChild(style)
  }

  function resolveThemeForItem(item, options) {
    const resolver = options?.themeResolver || global.F1RadioTheme?.resolveF1RadioTheme
    if (typeof resolver === 'function') {
      return resolver(item?.author || '', item?.message || '', {
        f1Logos: options?.f1Logos,
        f1Drivers: options?.f1Drivers,
        customKeywords: options?.f1RadioKeywords,
      })
    }
    return {
      teamId: 'f1',
      teamName: 'Formula 1',
      teamAbbr: 'F1',
      matched: false,
      matchedBy: 'none',
      matchedKeyword: '',
      driver: null,
      colors: {
        primary: '#E10600',
        text: '#F8FAFC',
        bandBg: 'rgba(225, 6, 0, 0.16)',
        border: 'rgba(225, 6, 0, 0.65)',
        glow: 'rgba(225, 6, 0, 0.28)',
      },
      logoUrl: options?.f1Logos?.f1 || '/f1-logos/f1.svg',
    }
  }

  /**
   * Render kartu Chat Notification bergaya F1 Team Radio:
   * - Warna, logo tim, dan nomor driver menyesuaikan username/isi chat.
   * - Proporsi mengikuti fontSize Editor (em) dan otomatis adaptif di kotak pendek.
   * - Pesan panjang terpotong rapi dengan `...` sesuai tinggi sisa kartu.
   */
  function renderF1RadioCard(target, item, options) {
    const doc = target.ownerDocument || document
    ensureF1RadioStyles(doc)

    const theme = resolveThemeForItem(item, options)
    const platform = item?.platform || ''
    const iconSrc = options?.icons?.[platform] || ''
    const tagText = (options?.tags || tags)[platform] || ''
    const rawFontSize = Math.max(10, Number(options?.fontSize) || 24)
    const boxHeight = Number(options?.boxHeight) || 0
    const padding = Math.max(0, Number(options?.padding) || 0)
    const innerHeight = boxHeight > 0 ? Math.max(60, boxHeight - padding * 2) : 0
    // Kalau kotak terlalu pendek dibanding fontSize (mis. banner 900x145 dengan font 32px),
    // turunkan skala dasar kartu secukupnya supaya header, waveform, dan minimal 1-2 baris pesan tetap tampil utuh.
    const cardFontSize = innerHeight > 0 ? Math.min(rawFontSize, Math.max(11, innerHeight / 6.9)) : rawFontSize

    const msgAlign = options?.textAlign === 'center' ? 'center' : (options?.textAlign === 'left' ? 'left' : 'right')
    const driverNumber = theme.driver?.number || ''
    const badges = Array.isArray(item?.badges) ? item.badges.slice(0, 3) : []
    const badgeSig = badges.map((b) => `${b?.type || ''}:${b?.label || ''}`).join(',')

    const sig = [
      stripMarker(item?.author || ''),
      stripMarker(item?.message || ''),
      platform,
      item?.avatar || '',
      badgeSig,
      theme.teamId,
      driverNumber,
      theme.logoUrl,
      msgAlign,
      Math.round(cardFontSize * 10),
      Math.round(innerHeight),
    ].join('|')

    const existing = target.firstElementChild
    if (existing && existing.classList?.contains('f1-radio-card') && existing.dataset?.f1RadioSig === sig) {
      return theme
    }

    const card = doc.createElement('div')
    card.className = `f1-radio-card f1-radio-card--${theme.teamId}`
    card.dataset.f1RadioSig = sig
    card.dataset.f1Team = theme.teamId
    if (driverNumber) card.dataset.f1DriverNumber = driverNumber
    card.style.fontSize = `${cardFontSize}px`
    card.style.setProperty('--f1-primary', theme.colors.primary)
    card.style.setProperty('--f1-text', theme.colors.text)
    card.style.setProperty('--f1-band-bg', theme.colors.bandBg)
    card.style.setProperty('--f1-border', theme.colors.border || theme.colors.primary)
    card.style.setProperty('--f1-glow', theme.colors.glow || theme.colors.bandBg)

    // 1. Header: Username (warna tim) + RADIO (putih) rata kanan
    const header = doc.createElement('div')
    header.className = 'f1-radio-header'

    const authorRow = doc.createElement('div')
    authorRow.className = 'f1-radio-author-row'

    for (const b of badges) {
      if (!b || !b.label) continue
      const style = BADGE_STYLES[b.type] || { bg: 'rgba(255,255,255,0.2)', color: '#ffffff' }
      const badgeEl = doc.createElement('span')
      badgeEl.className = `tt-chat-badge tt-chat-badge--${b.type || 'default'}`
      badgeEl.textContent = String(b.label)
      badgeEl.style.fontSize = '0.5em'
      badgeEl.style.fontWeight = '800'
      badgeEl.style.padding = '0.12em 0.42em'
      badgeEl.style.borderRadius = '9999px'
      badgeEl.style.lineHeight = '1.15'
      badgeEl.style.background = style.bg
      badgeEl.style.color = style.color
      badgeEl.style.flexShrink = '0'
      authorRow.appendChild(badgeEl)
    }

    const authorEl = doc.createElement('span')
    authorEl.className = 'f1-radio-author'
    authorEl.textContent = stripMarker(item?.author || 'VIEWER')
    authorRow.appendChild(authorEl)
    header.appendChild(authorRow)

    const labelRow = doc.createElement('div')
    labelRow.className = 'f1-radio-label-row'

    if (iconSrc) {
      const pImg = doc.createElement('img')
      pImg.className = 'f1-radio-platform-icon'
      pImg.src = iconSrc
      pImg.alt = tagText
      pImg.draggable = false
      pImg.style.height = '0.78em'
      pImg.style.width = '0.78em'
      pImg.style.objectFit = 'contain'
      pImg.style.flexShrink = '0'
      labelRow.appendChild(pImg)
    } else if (tagText) {
      const pTag = doc.createElement('span')
      pTag.className = 'f1-radio-platform-tag'
      pTag.textContent = tagText
      pTag.style.fontSize = '0.62em'
      pTag.style.fontWeight = '800'
      pTag.style.opacity = '0.75'
      labelRow.appendChild(pTag)
    }

    const dot = doc.createElement('span')
    dot.className = 'f1-radio-dot'
    labelRow.appendChild(dot)

    const radioLabel = doc.createElement('span')
    radioLabel.className = 'f1-radio-label'
    radioLabel.textContent = 'RADIO'
    labelRow.appendChild(radioLabel)

    header.appendChild(labelRow)
    card.appendChild(header)

    // 2. Waveform Strip: equalizer halus + slot kiri (nomor driver / avatar / kode tim) + logo tim kanan
    const strip = doc.createElement('div')
    strip.className = 'f1-radio-strip'

    const wave = doc.createElement('div')
    wave.className = 'f1-radio-wave'
    wave.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < F1_WAVE_HEIGHTS.length; i++) {
      const bar = doc.createElement('span')
      bar.className = 'f1-radio-bar'
      bar.style.height = `${Math.round(F1_WAVE_HEIGHTS[i] * 100)}%`
      bar.style.animationDelay = `${((i * 0.085) % 0.9).toFixed(2)}s`
      bar.style.animationDuration = `${(0.75 + (i % 4) * 0.14).toFixed(2)}s`
      wave.appendChild(bar)
    }
    strip.appendChild(wave)

    const leftSlot = doc.createElement('div')
    leftSlot.className = 'f1-radio-slot-left'

    const makeAbbrEl = () => {
      const abbrEl = doc.createElement('span')
      abbrEl.className = 'f1-radio-abbr'
      abbrEl.textContent = theme.teamAbbr || 'F1'
      return abbrEl
    }

    if (driverNumber) {
      const numEl = doc.createElement('span')
      numEl.className = 'f1-radio-number'
      numEl.textContent = driverNumber
      leftSlot.appendChild(numEl)
    } else if (item?.avatar) {
      const avatarBox = doc.createElement('div')
      avatarBox.className = 'f1-radio-avatar'
      const avatarImg = doc.createElement('img')
      avatarImg.src = item.avatar
      avatarImg.alt = ''
      avatarImg.draggable = false
      avatarImg.referrerPolicy = 'no-referrer'
      avatarImg.addEventListener('error', () => {
        avatarBox.replaceWith(makeAbbrEl())
      })
      avatarBox.appendChild(avatarImg)
      leftSlot.appendChild(avatarBox)
    } else {
      leftSlot.appendChild(makeAbbrEl())
    }
    strip.appendChild(leftSlot)

    const rightSlot = doc.createElement('div')
    rightSlot.className = 'f1-radio-slot-right'

    const makeLogoFallback = () => {
      const fb = doc.createElement('span')
      fb.className = 'f1-radio-logo-fallback'
      fb.textContent = theme.teamAbbr || 'F1'
      return fb
    }

    if (theme.logoUrl) {
      const logoImg = doc.createElement('img')
      logoImg.className = 'f1-radio-logo'
      logoImg.src = theme.logoUrl
      logoImg.alt = theme.teamName || theme.teamAbbr || 'F1'
      logoImg.draggable = false
      logoImg.addEventListener('error', () => {
        logoImg.replaceWith(makeLogoFallback())
      })
      rightSlot.appendChild(logoImg)
    } else {
      rightSlot.appendChild(makeLogoFallback())
    }
    strip.appendChild(rightSlot)
    card.appendChild(strip)

    // 3. Message: isi chat berkutip dengan warna tim + multi-line ellipsis clamp otomatis
    const msgWrap = doc.createElement('div')
    msgWrap.className = 'f1-radio-msg-wrap'

    const msgEl = doc.createElement('div')
    msgEl.className = 'f1-radio-msg'
    msgEl.style.textAlign = msgAlign
    const resolvedMsg = typeof theme.displayMessage === 'string'
      ? stripMarker(theme.displayMessage).trim()
      : stripMarker(item?.message || '').trim()
    msgEl.textContent = resolvedMsg ? `"${resolvedMsg}"` : ''

    // Hitung jumlah baris maksimum dari tinggi sisa kartu agar teks terpotong rapi dengan `...`.
    const chromeHeightPx = cardFontSize * 5.65 + 4
    const lineHeightPx = cardFontSize * 0.88 * 1.25
    const estimatedLines = innerHeight > 0
      ? Math.max(1, Math.floor((innerHeight - chromeHeightPx) / lineHeightPx))
      : 4
    msgEl.style.webkitLineClamp = String(estimatedLines)
    msgEl.style.lineClamp = String(estimatedLines)

    msgWrap.appendChild(msgEl)
    card.appendChild(msgWrap)
    target.replaceChildren(card)

    // Refine line-clamp berdasarkan tinggi aktual DOM di browser (sekali per ganti chat, nol polling).
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const avail = msgWrap.clientHeight
        if (avail > 0) {
          const computedLh = parseFloat(global.getComputedStyle?.(msgEl)?.lineHeight || '') || lineHeightPx
          const actualLines = Math.max(1, Math.floor((avail + 2) / computedLh))
          msgEl.style.webkitLineClamp = String(actualLines)
          msgEl.style.lineClamp = String(actualLines)
        }
      })
    }

    return theme
  }

  /** Render daftar pesan/viewer/follower bergaya TikTok Live (avatar bulat kiri, nama+ikon/badge atas, pesan/subtext bawah),
   *  atau F1 Team Radio khusus untuk mode `notif` dengan `displayStyle: 'f1Radio'`. */
  function renderChatList(target, items, options) {
    const rawMode = options?.mode || 'stack'
    const mode = rawMode === 'notif' ? 'single' : rawMode

    if (mode === 'single' && options?.displayStyle === 'f1Radio') {
      const first = Array.isArray(items) && items.length > 0 ? items[0] : null
      if (first) {
        renderF1RadioCard(target, first, options)
        return
      }
      target.replaceChildren()
      return
    }

    const list = document.createElement('div')
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

  global.ChatFormat = { formatChat, tags, stripIcons, renderText, renderChatList, renderF1RadioCard }
})(window)
