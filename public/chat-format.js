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

  global.ChatFormat = { formatChat, tags, stripIcons, renderText }
})(window)
